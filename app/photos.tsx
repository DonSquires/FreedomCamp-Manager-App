import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Alert,
  Dimensions,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getAllPhotos, deletePhoto } from '@/services/statsService';
import * as FileSystem from 'expo-file-system';
import StatusHeader from '@/components/StatusHeader';

const { width } = Dimensions.get('window');
const ITEM_SIZE = (width - 48) / 3; // 3 columns with padding

export default function PhotosScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [photos, setPhotos] = useState<any[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPhotos();
  }, []);

  const loadPhotos = async () => {
    setLoading(true);
    try {
      const allPhotos = await getAllPhotos();
      setPhotos(allPhotos);
    } catch (error) {
      console.error('Error loading photos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePhoto = async (photoPath: string) => {
    Alert.alert(
      'Delete Photo',
      'Are you sure you want to delete this photo? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete from database
              await deletePhoto(photoPath);

              // Delete file from storage
              await FileSystem.deleteAsync(photoPath, { idempotent: true });

              // Refresh list
              setPhotos(photos.filter((p) => p.localPath !== photoPath));
              setSelectedPhoto(null);

              Alert.alert('Success', 'Photo deleted');
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          },
        },
      ]
    );
  };

  const renderPhotoItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.photoItem}
      onPress={() => setSelectedPhoto(item)}
    >
      <Image source={{ uri: item.localPath }} style={styles.thumbnail} />
      <View style={styles.photoInfo}>
        <Text style={styles.plateText} numberOfLines={1}>
          {item.plateNumber || 'Unknown'}
        </Text>
        <Text style={styles.dateText} numberOfLines={1}>
          {new Date(item.capturedAt).toLocaleDateString()}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Status Header */}
      <StatusHeader currentZone={null} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push('/(tabs)')}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Photos ({photos.length})</Text>
        <TouchableOpacity onPress={loadPhotos}>
          <MaterialIcons name="refresh" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Photo Grid */}
      {loading ? (
        <View style={styles.emptyState}>
          <MaterialIcons name="photo-library" size={64} color="#666" />
          <Text style={styles.emptyText}>Loading photos...</Text>
        </View>
      ) : photos.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialIcons name="photo-library" size={64} color="#666" />
          <Text style={styles.emptyText}>No photos yet</Text>
          <Text style={styles.emptySubtext}>Photos will appear here after scanning</Text>
        </View>
      ) : (
        <FlatList
          data={photos}
          renderItem={renderPhotoItem}
          keyExtractor={(item, index) => `${item.localPath}_${index}`}
          numColumns={3}
          contentContainerStyle={styles.gridContainer}
        />
      )}

      {/* Photo Detail Modal */}
      <Modal
        visible={!!selectedPhoto}
        animationType="fade"
        transparent
        onRequestClose={() => setSelectedPhoto(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setSelectedPhoto(null)}>
                <MaterialIcons name="close" size={28} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>
                {selectedPhoto?.plateNumber || 'Unknown'}
              </Text>
              <TouchableOpacity
                onPress={() => handleDeletePhoto(selectedPhoto?.localPath)}
              >
                <MaterialIcons name="delete" size={28} color="#f44336" />
              </TouchableOpacity>
            </View>

            {/* Full Photo */}
            <Image
              source={{ uri: selectedPhoto?.localPath }}
              style={styles.fullPhoto}
              resizeMode="contain"
            />

            {/* Photo Details */}
            <View style={styles.photoDetails}>
              <View style={styles.detailRow}>
                <MaterialIcons name="calendar-today" size={20} color="#00b4d8" />
                <Text style={styles.detailText}>
                  {selectedPhoto &&
                    new Date(selectedPhoto.capturedAt).toLocaleString()}
                </Text>
              </View>

              {selectedPhoto?.gpsLatitude && selectedPhoto?.gpsLongitude && (
                <View style={styles.detailRow}>
                  <MaterialIcons name="location-on" size={20} color="#00b4d8" />
                  <Text style={styles.detailText}>
                    {selectedPhoto.gpsLatitude.toFixed(6)},{' '}
                    {selectedPhoto.gpsLongitude.toFixed(6)}
                  </Text>
                </View>
              )}

              <View style={styles.detailRow}>
                <MaterialIcons name="photo" size={20} color="#00b4d8" />
                <Text style={styles.detailText} numberOfLines={1}>
                  {selectedPhoto?.localPath.split('/').pop()}
                </Text>
              </View>
            </View>

            {/* Actions */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.viewVehicleButton}
                onPress={() => {
                  setSelectedPhoto(null);
                  router.push({
                    pathname: '/vehicle-details',
                    params: { plate: selectedPhoto?.plateNumber },
                  });
                }}
              >
                <MaterialIcons name="info" size={20} color="#fff" />
                <Text style={styles.viewVehicleText}>View Vehicle Details</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
  gridContainer: {
    padding: 12,
  },
  photoItem: {
    width: ITEM_SIZE,
    margin: 4,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#333',
  },
  thumbnail: {
    width: '100%',
    height: ITEM_SIZE,
    backgroundColor: '#333',
  },
  photoInfo: {
    padding: 8,
  },
  plateText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  dateText: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
  },
  modalContent: {
    flex: 1,
    paddingTop: 50,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  fullPhoto: {
    flex: 1,
    width: '100%',
  },
  photoDetails: {
    backgroundColor: '#1a1a1a',
    padding: 16,
    gap: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  detailText: {
    fontSize: 14,
    color: '#fff',
    flex: 1,
  },
  modalActions: {
    padding: 16,
    paddingBottom: 32,
  },
  viewVehicleButton: {
    flexDirection: 'row',
    backgroundColor: '#00b4d8',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  viewVehicleText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
