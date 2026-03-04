import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getDatabase } from '@/services/database';
import { calculateLocalCompliance, getVehicleHistory } from '@/services/complianceService';
import StatusHeader from '@/components/StatusHeader';

const { width } = Dimensions.get('window');

export default function VehicleDetailsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  const plateNumber = params.plate as string;

  const [vehicleInfo, setVehicleInfo] = useState<any>(null);
  const [complianceResults, setComplianceResults] = useState<any[]>([]);
  const [observations, setObservations] = useState<any[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [zones, setZones] = useState<any[]>([]);

  useEffect(() => {
    loadVehicleData();
  }, []);

  const loadVehicleData = async () => {
    try {
      const db = getDatabase();

      // Load zones
      const zoneList = await db.getAllAsync<any>(
        'SELECT id, name FROM zones WHERE is_active = 1'
      );
      setZones(zoneList);
      
      if (zoneList.length > 0 && !selectedZone) {
        setSelectedZone(zoneList[0].id);
      }

      // Load vehicle observations
      const obs = await db.getAllAsync<any>(
        `SELECT * FROM recent_observations 
         WHERE plate_number = ? 
         ORDER BY recorded_at DESC 
         LIMIT 50`,
        [plateNumber.toUpperCase()]
      );
      setObservations(obs);

      // Load photos
      const photoRecords = await db.getAllAsync<any>(
        `SELECT local_path FROM local_photos 
         WHERE plate_number = ? 
         ORDER BY captured_at DESC`,
        [plateNumber.toUpperCase()]
      );
      setPhotos(photoRecords.map((p: any) => p.local_path));

      // Get compliance for each zone
      const complianceByZone: any[] = [];
      for (const zone of zoneList) {
        const compliance = await calculateLocalCompliance(
          plateNumber.toUpperCase(),
          zone.id
        );
        complianceByZone.push({
          zoneId: zone.id,
          zoneName: zone.name,
          ...compliance,
        });
      }
      setComplianceResults(complianceByZone);

      // Set vehicle info from most recent observation
      if (obs.length > 0) {
        setVehicleInfo({
          plateNumber: plateNumber.toUpperCase(),
          firstSeen: obs[obs.length - 1].recorded_at,
          lastSeen: obs[0].recorded_at,
          totalObservations: obs.length,
        });
      }
    } catch (error) {
      console.error('Error loading vehicle data:', error);
    }
  };

  const selectedCompliance = complianceResults.find((c) => c.zoneId === selectedZone);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Status Header */}
      <StatusHeader currentZone={selectedCompliance?.zoneName} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{plateNumber.toUpperCase()}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Vehicle Overview */}
        <View style={styles.overviewCard}>
          <View style={styles.plateDisplay}>
            <Text style={styles.plateText}>{plateNumber.toUpperCase()}</Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{observations.length}</Text>
              <Text style={styles.statLabel}>Observations</Text>
            </View>

            <View style={styles.statItem}>
              <Text style={styles.statValue}>{photos.length}</Text>
              <Text style={styles.statLabel}>Photos</Text>
            </View>

            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {vehicleInfo ? new Date(vehicleInfo.firstSeen).toLocaleDateString() : '-'}
              </Text>
              <Text style={styles.statLabel}>First Seen</Text>
            </View>
          </View>
        </View>

        {/* Zone Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Compliance by Zone</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.zoneScroll}>
            {zones.map((zone) => (
              <TouchableOpacity
                key={zone.id}
                style={[
                  styles.zoneChip,
                  selectedZone === zone.id && styles.zoneChipActive,
                ]}
                onPress={() => setSelectedZone(zone.id)}
              >
                <Text
                  style={[
                    styles.zoneChipText,
                    selectedZone === zone.id && styles.zoneChipTextActive,
                  ]}
                >
                  {zone.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Compliance Card */}
        {selectedCompliance && (
          <View
            style={[
              styles.complianceCard,
              selectedCompliance.isBreach ? styles.complianceBreach : styles.complianceGood,
            ]}
          >
            <View style={styles.complianceHeader}>
              <MaterialIcons
                name={selectedCompliance.isBreach ? 'warning' : 'check-circle'}
                size={48}
                color={selectedCompliance.isBreach ? '#f44336' : '#4caf50'}
              />
              <Text style={styles.complianceStatus}>
                {selectedCompliance.isBreach ? 'BREACH' : 'COMPLIANT'}
              </Text>
            </View>

            <View style={styles.metricsRow}>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>
                  {selectedCompliance.consecutiveNights}/{selectedCompliance.maxConsecutiveAllowed}
                </Text>
                <Text style={styles.metricLabel}>Consecutive Nights</Text>
              </View>

              <View style={styles.metric}>
                <Text style={styles.metricValue}>
                  {selectedCompliance.monthlyNights}/{selectedCompliance.maxMonthlyAllowed}
                </Text>
                <Text style={styles.metricLabel}>Monthly Nights</Text>
              </View>
            </View>

            {selectedCompliance.violationReasons.length > 0 && (
              <View style={styles.violationsSection}>
                <Text style={styles.violationsTitle}>Violations:</Text>
                {selectedCompliance.violationReasons.map((reason: string, index: number) => (
                  <Text key={index} style={styles.violationItem}>
                    • {reason}
                  </Text>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Photos Gallery */}
        {photos.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Photos ({photos.length})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoGallery}>
              {photos.map((photoPath, index) => (
                <View key={index} style={styles.photoCard}>
                  <Image source={{ uri: photoPath }} style={styles.photo} />
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Observation History */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Observation History ({observations.length})</Text>
          {observations.map((obs, index) => (
            <TouchableOpacity
              key={index}
              style={styles.observationCard}
              onPress={() => router.push({ pathname: '/observation-edit', params: { id: obs.observation_id } })}
            >
              <View style={styles.obsHeader}>
                <View>
                  <Text style={styles.obsDate}>
                    {new Date(obs.recorded_at).toLocaleDateString()}
                  </Text>
                  <Text style={styles.obsTime}>
                    {new Date(obs.recorded_at).toLocaleTimeString()}
                  </Text>
                </View>
                <View style={[styles.badge, obs.is_compliant ? styles.badgeGood : styles.badgeBad]}>
                  <Text style={styles.badgeText}>
                    {obs.is_compliant ? 'Compliant' : 'Breach'}
                  </Text>
                </View>
              </View>

              <View style={styles.obsDetails}>
                <View style={styles.obsItem}>
                  <MaterialIcons name="location-on" size={16} color="#00b4d8" />
                  <Text style={styles.obsText}>
                    {zones.find((z) => z.id === obs.zone_id)?.name || 'Unknown Zone'}
                  </Text>
                </View>

                {obs.self_contained && (
                  <View style={styles.obsItem}>
                    <MaterialIcons name="check-circle" size={16} color="#4caf50" />
                    <Text style={styles.obsText}>Self-Contained</Text>
                  </View>
                )}
              </View>
              
              <View style={styles.obsFooter}>
                <MaterialIcons name="edit" size={16} color="#00b4d8" />
                <Text style={styles.obsEditText}>Tap to edit</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  overviewCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  plateDisplay: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignSelf: 'center',
    marginBottom: 16,
  },
  plateText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#000',
    letterSpacing: 2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statItem: {
    flex: 1,
    backgroundColor: '#121212',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#00b4d8',
  },
  statLabel: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
    textAlign: 'center',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  zoneScroll: {
    marginBottom: 8,
  },
  zoneChip: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  zoneChipActive: {
    backgroundColor: '#00b4d8',
    borderColor: '#00b4d8',
  },
  zoneChipText: {
    color: '#999',
    fontSize: 14,
    fontWeight: '600',
  },
  zoneChipTextActive: {
    color: '#fff',
  },
  complianceCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
  },
  complianceGood: {
    borderColor: '#4caf50',
  },
  complianceBreach: {
    borderColor: '#f44336',
  },
  complianceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  complianceStatus: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  metric: {
    flex: 1,
    backgroundColor: '#121212',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#00b4d8',
  },
  metricLabel: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
    textAlign: 'center',
  },
  violationsSection: {
    backgroundColor: '#121212',
    borderRadius: 8,
    padding: 12,
  },
  violationsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f44336',
    marginBottom: 8,
  },
  violationItem: {
    fontSize: 13,
    color: '#fff',
    marginBottom: 4,
  },
  photoGallery: {
    marginBottom: 8,
  },
  photoCard: {
    marginRight: 12,
  },
  photo: {
    width: width * 0.4,
    height: width * 0.4,
    borderRadius: 8,
    backgroundColor: '#333',
  },
  observationCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  obsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  obsDate: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  obsTime: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  badgeGood: {
    backgroundColor: '#4caf50',
  },
  badgeBad: {
    backgroundColor: '#f44336',
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  obsDetails: {
    gap: 8,
  },
  obsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  obsText: {
    fontSize: 14,
    color: '#999',
  },
  obsFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  obsEditText: {
    fontSize: 12,
    color: '#00b4d8',
    fontWeight: '600',
  },
});
