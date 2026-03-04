import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getCurrentLocation } from '@/services/gpsService';
import { getDatabase } from '@/services/database';
import { addToUploadQueue } from '@/services/uploadQueue';
import AsyncStorage from '@react-native-async-storage/async-storage';
import StatusHeader from '@/components/StatusHeader';

export default function ZoneCreateScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const [zoneName, setZoneName] = useState('');
  const [description, setDescription] = useState('');
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadCurrentLocation();
  }, []);

  const loadCurrentLocation = async () => {
    const location = await getCurrentLocation();
    if (location) {
      setGpsLocation({
        lat: location.latitude,
        lng: location.longitude,
      });
    }
  };

  const handleCreateZone = async () => {
    if (!zoneName.trim()) {
      Alert.alert('Error', 'Please enter a zone name');
      return;
    }

    if (!gpsLocation) {
      Alert.alert('Error', 'GPS location not available');
      return;
    }

    Alert.alert(
      'Create New Zone',
      `Create "${zoneName}" at current GPS location?\n\nThis will be submitted to admin for approval.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create',
          onPress: async () => {
            setLoading(true);
            try {
              const profileStr = await AsyncStorage.getItem('user_profile');
              const profile = profileStr ? JSON.parse(profileStr) : null;

              if (!profile) {
                throw new Error('User profile not found');
              }

              const db = getDatabase();
              const suggestionId = Date.now().toString();

              // Create zone suggestion locally
              await db.runAsync(
                `INSERT INTO zone_creation_suggestions (
                  id, organization_id, suggested_name, suggested_description,
                  center_lat, center_lng, location_type, status,
                  created_by, created_at, synced
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                suggestionId,
                profile.organization_id,
                zoneName,
                description,
                gpsLocation.lat,
                gpsLocation.lng,
                'point',
                'pending',
                profile.id,
                Date.now(),
                0
              );

              // Add to upload queue for admin notification
              await addToUploadQueue('zone_suggestion', {
                suggestion_id: suggestionId,
                suggested_name: zoneName,
                suggested_description: description,
                center_lat: gpsLocation.lat,
                center_lng: gpsLocation.lng,
                location_type: 'point',
                created_by: profile.id,
                created_by_name: `${profile.first_name} ${profile.last_name}`,
                organization_id: profile.organization_id,
              });

              Alert.alert(
                'Zone Suggestion Created',
                `Your zone "${zoneName}" has been submitted to admin for approval.\n\nYou can now use "Other Location" for this observation.`,
                [{ text: 'OK', onPress: () => router.back() }]
              );
            } catch (error: any) {
              Alert.alert('Error', error.message);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Status Header */}
      <StatusHeader currentZone={null} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create New Zone</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* GPS Location */}
        <View style={styles.infoCard}>
          <MaterialIcons name="location-on" size={32} color="#00b4d8" />
          <View style={styles.infoText}>
            <Text style={styles.infoTitle}>GPS Location</Text>
            {gpsLocation ? (
              <>
                <Text style={styles.infoValue}>
                  Lat: {gpsLocation.lat.toFixed(6)}
                </Text>
                <Text style={styles.infoValue}>
                  Lng: {gpsLocation.lng.toFixed(6)}
                </Text>
              </>
            ) : (
              <Text style={styles.infoValue}>Getting location...</Text>
            )}
          </View>
        </View>

        {/* Zone Name */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Zone Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Main Beach Parking"
            placeholderTextColor="#666"
            value={zoneName}
            onChangeText={setZoneName}
            maxLength={100}
          />
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description (Optional)</Text>
          <TextInput
            style={styles.textArea}
            placeholder="Brief description of the location..."
            placeholderTextColor="#666"
            multiline
            numberOfLines={4}
            value={description}
            onChangeText={setDescription}
            maxLength={500}
          />
        </View>

        {/* Info Notice */}
        <View style={styles.noticeCard}>
          <MaterialIcons name="info" size={24} color="#00b4d8" />
          <Text style={styles.noticeText}>
            This zone will be created as a point geofence at your current GPS location.
            Admin will review and either approve with full zone configuration or delete it.
          </Text>
        </View>

        {/* Create Button */}
        <TouchableOpacity
          style={[styles.createButton, loading && styles.createButtonDisabled]}
          onPress={handleCreateZone}
          disabled={loading}
        >
          <MaterialIcons name="add-location" size={24} color="#fff" />
          <Text style={styles.createButtonText}>
            {loading ? 'Creating...' : 'Create Zone Suggestion'}
          </Text>
        </TouchableOpacity>

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
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#00b4d8',
  },
  infoText: {
    flex: 1,
    marginLeft: 12,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    color: '#fff',
    marginTop: 2,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: '#fff',
  },
  textArea: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: '#fff',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  noticeCard: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
    gap: 12,
  },
  noticeText: {
    flex: 1,
    fontSize: 14,
    color: '#999',
    lineHeight: 20,
  },
  createButton: {
    flexDirection: 'row',
    backgroundColor: '#00b4d8',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
