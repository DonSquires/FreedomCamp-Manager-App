import * as FileSystem from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

export interface PhotoMetadata {
  uri: string;
  width: number;
  height: number;
  size: number;
  timestamp: number;
}

/**
 * Save photo to local storage with metadata
 */
export async function savePhotoLocally(
  photoUri: string,
  plateNumber: string,
  gpsLatitude: number | null,
  gpsLongitude: number | null
): Promise<{ localPath: string; metadata: PhotoMetadata }> {
  try {
    // Create photos directory if it doesn't exist
    const photosDir = `${FileSystem.documentDirectory}photos`;
    const dirInfo = await FileSystem.getInfoAsync(photosDir);
    
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(photosDir, { intermediates: true });
    }

    // Compress and resize photo
    const manipulatedPhoto = await manipulateAsync(
      photoUri,
      [{ resize: { width: 1920 } }], // Max width 1920px
      { compress: 0.8, format: SaveFormat.JPEG }
    );

    // Generate filename
    const timestamp = Date.now();
    const filename = `${plateNumber}_${timestamp}.jpg`;
    const localPath = `${photosDir}/${filename}`;

    // Move photo to permanent storage
    await FileSystem.moveAsync({
      from: manipulatedPhoto.uri,
      to: localPath,
    });

    // Get file info
    const fileInfo = await FileSystem.getInfoAsync(localPath);
    
    const metadata: PhotoMetadata = {
      uri: localPath,
      width: manipulatedPhoto.width,
      height: manipulatedPhoto.height,
      size: fileInfo.size || 0,
      timestamp,
    };

    console.log(`📸 Photo saved locally: ${localPath} (${Math.round(metadata.size / 1024)}KB)`);

    return { localPath, metadata };
  } catch (error) {
    console.error('Error saving photo:', error);
    throw error;
  }
}

/**
 * Delete local photo
 */
export async function deleteLocalPhoto(localPath: string): Promise<void> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(localPath);
    if (fileInfo.exists) {
      await FileSystem.deleteAsync(localPath);
      console.log(`🗑️ Photo deleted: ${localPath}`);
    }
  } catch (error) {
    console.error('Error deleting photo:', error);
  }
}

/**
 * Get total storage used by photos
 */
export async function getPhotosStorageSize(): Promise<number> {
  try {
    const photosDir = `${FileSystem.documentDirectory}photos`;
    const dirInfo = await FileSystem.getInfoAsync(photosDir);
    
    if (!dirInfo.exists) {
      return 0;
    }

    const files = await FileSystem.readDirectoryAsync(photosDir);
    let totalSize = 0;

    for (const file of files) {
      const fileInfo = await FileSystem.getInfoAsync(`${photosDir}/${file}`);
      totalSize += fileInfo.size || 0;
    }

    return totalSize;
  } catch (error) {
    console.error('Error calculating storage:', error);
    return 0;
  }
}
