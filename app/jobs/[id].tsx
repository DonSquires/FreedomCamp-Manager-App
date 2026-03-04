import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getDatabase } from '@/services/database';
import { getCurrentLocation } from '@/services/trackingService';
import { capturePhoto } from '@/services/cameraService';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function JobDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams();
  
  const [job, setJob] = useState<any>(null);
  const [status, setStatus] = useState('pending');
  const [findings, setFindings] = useState({
    visitDate: new Date(),
    arrivedAt: '',
    departedAt: '',
    findingsSummary: '',
    structuresFound: '',
    vehiclesFound: '',
    personsContacted: [] as any[],
    evidencePhotos: [] as string[],
    recommendations: '',
    followUpRequired: false,
    officerNotes: '',
  });

  useEffect(() => {
    loadJob();
  }, [id]);

  const loadJob = async () => {
    try {
      const db = getDatabase();
      const result = await db.getFirstAsync<any>(
        'SELECT * FROM investigation_jobs WHERE id = ?',
        id
      );
      
      if (result) {
        setJob(result);
        setStatus(result.status);
      }
    } catch (error) {
      console.error('Load job error:', error);
    }
  };

  const handleStartInvestigation = async () => {
    Alert.alert(
      'Start Investigation',
      'Begin this investigation job?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start',
          onPress: async () => {
            try {
              const db = getDatabase();
              const now = Date.now();
              
              await db.runAsync(
                'UPDATE investigation_jobs SET status = ?, synced = 0 WHERE id = ?',
                'in-progress',
                id
              );

              setStatus('in-progress');
              setFindings(prev => ({
                ...prev,
                arrivedAt: new Date(now).toISOString(),
              }));

              Alert.alert('Success', 'Investigation started');
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          },
        },
      ]
    );
  };

  const handleTakePhoto = async () => {
    try {
      const location = await getCurrentLocation();
      const photoPath = await capturePhoto({
        latitude: location?.coords.latitude || 0,
        longitude: location?.coords.longitude || 0,
      });

      if (photoPath) {
        setFindings(prev => ({
          ...prev,
          evidencePhotos: [...prev.evidencePhotos, photoPath],
        }));
      }
    } catch (error: any) {
      Alert.alert('Photo Error', error.message);
    }
  };

  const handleAddPerson = () => {
    Alert.prompt(
      'Add Person',
      'Enter person name:',
      (name) => {
        if (name) {
          setFindings(prev => ({
            ...prev,
            personsContacted: [
              ...prev.personsContacted,
              { name, role: 'contact', notes: '' },
            ],
          }));
        }
      }
    );
  };

  const handleCompleteInvestigation = async () => {
    if (!findings.findingsSummary) {
      Alert.alert('Error', 'Findings summary is required');
      return;
    }

    Alert.alert(
      'Complete Investigation',
      'Submit findings and complete this investigation?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          onPress: async () => {
            try {
              const db = getDatabase();
              const profileStr = await AsyncStorage.getItem('user_profile');
              const profile = profileStr ? JSON.parse(profileStr) : null;

              // Update job status
              await db.runAsync(
                'UPDATE investigation_jobs SET status = ?, synced = 0 WHERE id = ?',
                'completed',
                id
              );

              // Create findings record (will be synced later)
              await db.runAsync(
                `INSERT INTO investigation_findings (
                  id, job_id, visit_date, arrived_at, departed_at,
                  findings_summary, structures_found, vehicles_found,
                  persons_contacted, evidence_photos, recommendations,
                  follow_up_required, officer_notes, completed_by,
                  completed_at, synced
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                Date.now().toString(),
                id,
                findings.visitDate.getTime(),
                findings.arrivedAt,
                new Date().toISOString(),
                findings.findingsSummary,
                findings.structuresFound,
                findings.vehiclesFound,
                JSON.stringify(findings.personsContacted),
                JSON.stringify(findings.evidencePhotos),
                findings.recommendations,
                findings.followUpRequired ? 1 : 0,
                findings.officerNotes,
                profile?.id || '',
                Date.now(),
                0
              );

              Alert.alert('Success', 'Investigation completed', [
                { text: 'OK', onPress: () => router.back() }
              ]);
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          },
        },
      ]
    );
  };

  if (!job) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Investigation Detail</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Job Info */}
        <View style={styles.infoCard}>
          <View style={styles.jobHeader}>
            <Text style={styles.jobType}>{job.job_type}</Text>
            <View
              style={[
                styles.statusBadge,
                status === 'pending' && styles.statusPending,
                status === 'in-progress' && styles.statusInProgress,
                status === 'completed' && styles.statusCompleted,
              ]}
            >
              <Text style={styles.statusText}>{status}</Text>
            </View>
          </View>
          
          <Text style={styles.reference}>#{job.reference_number}</Text>

          <View style={styles.infoRow}>
            <MaterialIcons name="location-on" size={16} color="#00b4d8" />
            <Text style={styles.infoText}>{job.location_address}</Text>
          </View>

          {job.client_name && (
            <View style={styles.infoRow}>
              <MaterialIcons name="business" size={16} color="#00b4d8" />
              <Text style={styles.infoText}>{job.client_name}</Text>
            </View>
          )}

          {job.due_date && (
            <View style={styles.infoRow}>
              <MaterialIcons name="schedule" size={16} color="#00b4d8" />
              <Text style={styles.infoText}>
                Due: {new Date(job.due_date).toLocaleDateString()}
              </Text>
            </View>
          )}
        </View>

        {/* Briefing */}
        {job.briefing_notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Briefing Notes</Text>
            <Text style={styles.briefingText}>{job.briefing_notes}</Text>
          </View>
        )}

        {/* Instructions */}
        {job.instructions && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Instructions</Text>
            <Text style={styles.briefingText}>{job.instructions}</Text>
          </View>
        )}

        {/* Start Button */}
        {status === 'pending' && (
          <TouchableOpacity style={styles.startButton} onPress={handleStartInvestigation}>
            <MaterialIcons name="play-arrow" size={24} color="#fff" />
            <Text style={styles.startButtonText}>Start Investigation</Text>
          </TouchableOpacity>
        )}

        {/* Findings Form */}
        {status === 'in-progress' && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Findings Summary *</Text>
              <TextInput
                style={styles.textArea}
                placeholder="Describe what you found..."
                placeholderTextColor="#666"
                multiline
                numberOfLines={6}
                value={findings.findingsSummary}
                onChangeText={(text) => setFindings(prev => ({ ...prev, findingsSummary: text }))}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Structures Found</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 2 tents, 1 makeshift shelter"
                placeholderTextColor="#666"
                value={findings.structuresFound}
                onChangeText={(text) => setFindings(prev => ({ ...prev, structuresFound: text }))}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Vehicles Found</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., ABC123, XYZ789"
                placeholderTextColor="#666"
                value={findings.vehiclesFound}
                onChangeText={(text) => setFindings(prev => ({ ...prev, vehiclesFound: text }))}
              />
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Persons Contacted</Text>
                <TouchableOpacity onPress={handleAddPerson}>
                  <MaterialIcons name="add-circle" size={24} color="#00b4d8" />
                </TouchableOpacity>
              </View>
              {findings.personsContacted.map((person, idx) => (
                <View key={idx} style={styles.personCard}>
                  <Text style={styles.personName}>{person.name}</Text>
                </View>
              ))}
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Evidence Photos</Text>
                <TouchableOpacity onPress={handleTakePhoto}>
                  <MaterialIcons name="add-a-photo" size={24} color="#00b4d8" />
                </TouchableOpacity>
              </View>
              <Text style={styles.photoCount}>
                {findings.evidencePhotos.length} photo(s) captured
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recommendations</Text>
              <TextInput
                style={styles.textArea}
                placeholder="Recommended follow-up actions..."
                placeholderTextColor="#666"
                multiline
                numberOfLines={4}
                value={findings.recommendations}
                onChangeText={(text) => setFindings(prev => ({ ...prev, recommendations: text }))}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Officer Notes</Text>
              <TextInput
                style={styles.textArea}
                placeholder="Additional notes..."
                placeholderTextColor="#666"
                multiline
                numberOfLines={4}
                value={findings.officerNotes}
                onChangeText={(text) => setFindings(prev => ({ ...prev, officerNotes: text }))}
              />
            </View>

            <TouchableOpacity
              style={styles.completeButton}
              onPress={handleCompleteInvestigation}
            >
              <MaterialIcons name="check-circle" size={24} color="#fff" />
              <Text style={styles.completeButtonText}>Complete Investigation</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Completed Status */}
        {status === 'completed' && (
          <View style={styles.completedCard}>
            <MaterialIcons name="check-circle" size={64} color="#4caf50" />
            <Text style={styles.completedText}>Investigation Complete</Text>
          </View>
        )}

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
  loadingText: {
    color: '#fff',
    textAlign: 'center',
    marginTop: 32,
  },
  infoCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  jobType: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusPending: {
    backgroundColor: '#ff9800',
  },
  statusInProgress: {
    backgroundColor: '#00b4d8',
  },
  statusCompleted: {
    backgroundColor: '#4caf50',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    textTransform: 'capitalize',
  },
  reference: {
    fontSize: 14,
    color: '#999',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#fff',
    flex: 1,
  },
  section: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
    marginBottom: 8,
  },
  briefingText: {
    fontSize: 14,
    color: '#fff',
    lineHeight: 20,
    backgroundColor: '#1a1a1a',
    padding: 12,
    borderRadius: 8,
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
  personCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  personName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  photoCount: {
    fontSize: 14,
    color: '#00b4d8',
  },
  startButton: {
    flexDirection: 'row',
    backgroundColor: '#00b4d8',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  completeButton: {
    flexDirection: 'row',
    backgroundColor: '#4caf50',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  completeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  completedCard: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  completedText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#4caf50',
    marginTop: 16,
  },
});
