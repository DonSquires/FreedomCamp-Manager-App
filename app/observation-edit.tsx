import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Image,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getDatabase } from '@/services/database';
import { addToUploadQueue } from '@/services/uploadQueue';
import CameraScanner from '@/components/CameraScanner';
import StatusHeader from '@/components/StatusHeader';

export default function ObservationEditScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  const observationId = params.id as string;

  const [observation, setObservation] = useState<any>(null);
  const [notes, setNotes] = useState('');
  const [selfContained, setSelfContained] = useState(false);
  const [isCompliant, setIsCompliant] = useState(true);
  const [photos, setPhotos] = useState<string[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadObservation();
  }, []);

  const loadObservation = async () => {
    try {
      const db = getDatabase();

      // Load observation
      const obs = await db.getFirstAsync<any>(
        'SELECT * FROM recent_observations WHERE observation_id = ?',
        observationId
      );

      if (obs) {
        setObservation(obs);
        setSelfContained(obs.self_contained === 1);
        setIsCompliant(obs.is_compliant === 1);
      }

      // Load photos
      const photoRecords = await db.getAllAsync<any>(
        'SELECT local_path FROM local_photos WHERE observation_id = ?',
        observationId
      );
      setPhotos(photoRecords.map((p: any) => p.local_path));
    } catch (error) {
      console.error('Error loading observation:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddPhoto = () => {
    setShowCamera(true);
  };

  const handlePhotoCapture = async (scanData: any) => {
    setShowCamera(false);
    
    try {
      const db = getDatabase();
      
      // Add photo to local database
      const photoId = Date.now().toString();
      await db.runAsync(
        `INSERT INTO local_photos (
          id, local_path, plate_number, observation_id,
          captured_at, gps_latitude, gps_longitude, uploaded
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        photoId,
        scanData.photoPath,
        observation.plate_number,
        observationId,
        Date.now(),
        scanData.gpsLatitude,
        scanData.gpsLongitude,
        0
      );

      // Add to upload queue
      await addToUploadQueue('photo', {
        local_path: scanData.photoPath,
        plate_number: observation.plate_number,
        observation_id: observationId,
        captured_at: new Date().toISOString(),
        gps_latitude: scanData.gpsLatitude,
        gps_longitude: scanData.gpsLongitude,
      });

      setPhotos([...photos, scanData.photoPath]);
      Alert.alert('Success', 'Photo added to observation');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleSaveChanges = async () => {
    try {
      const db = getDatabase();

      // Update local observation
      await db.runAsync(
        `UPDATE recent_observations 
         SET self_contained = ?, is_compliant = ?
         WHERE observation_id = ?`,
        selfContained ? 1 : 0,
        isCompliant ? 1 : 0,
        observationId
      );

      // Add update to upload queue
      await addToUploadQueue('observation_update', {
        observation_id: observationId,
        self_contained: selfContained,
        is_compliant: isCompliant,
        notes: notes,
        updated_at: new Date().toISOString(),
      });

      Alert.alert('Success', 'Observation updated', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleDeleteObservation = async () => {
    Alert.alert(
      'Delete Observation',
      'Are you sure you want to delete this observation? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const db = getDatabase();

              // Delete observation
              await db.runAsync(
                'DELETE FROM recent_observations WHERE observation_id = ?',
                observationId
              );

              // Delete associated photos
              await db.runAsync(
                'DELETE FROM local_photos WHERE observation_id = ?',
                observationId
              );

              // Add deletion to upload queue
              await addToUploadQueue('observation_delete', {
                observation_id: observationId,
                deleted_at: new Date().toISOString(),
              });

              Alert.alert('Success', 'Observation deleted', [
                { text: 'OK', onPress: () => router.back() },
              ]);
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          },
        },
      ]
    );
  };

  if (loading || !observation) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusHeader currentZone={null} />
        <View style={styles.loading}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusHeader currentZone={null} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Observation</Text>
        <TouchableOpacity onPress={handleDeleteObservation}>
          <MaterialIcons name="delete" size={24} color="#f44336" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Observation Info */}
        <View style={styles.infoCard}>
          <View style={styles.plateDisplay}>
            <Text style={styles.plateText}>{observation.plate_number}</Text>
          </View>
          <View style={styles.infoRow}>
            <MaterialIcons name="calendar-today" size={16} color="#999" />
            <Text style={styles.infoText}>
              {new Date(observation.recorded_at).toLocaleString()}
            </Text>
          </View>
        </View>

        {/* Self-Contained Toggle */}
        <TouchableOpacity
          style={styles.toggleCard}
          onPress={() => setSelfContained(!selfContained)}
        >
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleTitle}>Self-Contained Vehicle</Text>
            <Text style={styles.toggleSubtitle}>
              Vehicle has required certification
            </Text>
          </View>
          <View
            style={[
              styles.toggle,
              selfContained && styles.toggleActive,
            ]}
          >
            <View
              style={[
                styles.toggleKnob,
                selfContained && styles.toggleKnobActive,
              ]}
            />
          </View>
        </TouchableOpacity>

        {/* Compliance Toggle */}
        <TouchableOpacity
          style={styles.toggleCard}
          onPress={() => setIsCompliant(!isCompliant)}
        >
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleTitle}>Compliant</Text>
            <Text style={styles.toggleSubtitle}>
              No violations detected
            </Text>
          </View>
          <View
            style={[
              styles.toggle,
              isCompliant && styles.toggleActive,
            ]}
          >
            <View
              style={[
                styles.toggleKnob,
                isCompliant && styles.toggleKnobActive,
              ]}
            />
          </View>
        </TouchableOpacity>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Officer Notes</Text>
          <TextInput
            style={styles.textArea}
            placeholder="Add notes about this observation..."
            placeholderTextColor="#666"
            multiline
            numberOfLines={4}
            value={notes}
            onChangeText={setNotes}
          />
        </View>

        {/* Photos */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Photos ({photos.length})</Text>
            <TouchableOpacity style={styles.addPhotoButton} onPress={handleAddPhoto}>
              <MaterialIcons name="add-a-photo" size={20} color="#00b4d8" />
              <Text style={styles.addPhotoText}>Add Photo</Text>
            </TouchableOpacity>
          </View>

          {photos.length === 0 ? (
            <View style={styles.emptyPhotos}>
              <MaterialIcons name="photo-camera" size={48} color="#666" />
              <Text style={styles.emptyText}>No photos attached</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {photos.map((photoPath, index) => (
                <View key={index} style={styles.photoCard}>
                  <Image source={{ uri: photoPath }} style={styles.photo} />
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Save Button */}
        <TouchableOpacity style={styles.saveButton} onPress={handleSaveChanges}>
          <MaterialIcons name="save" size={24} color="#fff" />
          <Text style={styles.saveButtonText}>Save Changes</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Camera Modal */}
      <Modal
        visible={showCamera}
        animationType="slide"
        onRequestClose={() => setShowCamera(false)}
      >
        <CameraScanner
          onScanComplete={handlePhotoCapture}
          onClose={() => setShowCamera(false)}
        />
      </Modal>
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
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#999',
  },
  infoCard: {
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
    marginBottom: 12,
  },
  plateText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    letterSpacing: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
  },
  infoText: {
    fontSize: 14,
    color: '#999',
  },
  toggleCard: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  toggleInfo: {
    flex: 1,
  },
  toggleTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  toggleSubtitle: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  toggle: {
    width: 56,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#333',
    padding: 2,
    justifyContent: 'center',
  },
  toggleActive: {
    backgroundColor: '#00b4d8',
  },
  toggleKnob: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
  },
  toggleKnobActive: {
    marginLeft: 24,
  },
  section: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
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
  addPhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addPhotoText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#00b4d8',
  },
  emptyPhotos: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  photoCard: {
    marginRight: 12,
  },
  photo: {
    width: 150,
    height: 150,
    borderRadius: 8,
    backgroundColor: '#333',
  },
  saveButton: {
    flexDirection: 'row',
    backgroundColor: '#00b4d8',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
