# Photo Upload Service Documentation

## Overview

The Photo Upload Service (`services/photoUpload.ts`) provides comprehensive evidence photo management for FreedomCamp Manager with automatic metadata tracking, SHA256 hash verification, retention policies, and court-ready evidence support.

## Features

✅ **File Size Validation** - Max 10MB per photo with automatic compression for files >2MB
✅ **SHA256 Hash Verification** - Cryptographic hash for evidence integrity (court-ready)
✅ **Automatic Compression** - Compresses large images to reduce upload time
✅ **Photo Metadata Tracking** - Complete audit trail with upload time, GPS, user, etc.
✅ **Retention Policies** - Standard (90 days), Long-term (365 days), Permanent
✅ **Court-Ready Flagging** - Mark photos as permanent evidence with no deletion
✅ **Soft Delete** - Photos marked deleted but preserved in storage for audit
✅ **Batch Upload** - Upload multiple photos in a single operation

## Storage Structure

- **Bucket**: `incident-evidence` (private bucket)
- **Path Pattern**: `{user_id}/{user_id}_{timestamp}_{hash_prefix}.jpg`
- **Example**: `abc123/abc123_1705023456789_a1b2c3d4.jpg`

## API Reference

### `uploadEvidencePhoto(data: PhotoUploadData): Promise<PhotoUploadResult>`

Upload a single evidence photo with automatic metadata creation.

**Parameters:**

```typescript
interface PhotoUploadData {
  photoUri: string;              // Local file URI (from camera or gallery)
  photoType: 'full' | 'cropped' | 'thumbnail';
  organizationId: string;
  userId: string;
  incidentId?: string;           // Link to incident
  vehicleRecordId?: string;      // Link to vehicle record
  observationId?: string;        // Link to vehicle observation
  gpsLatitude?: number;
  gpsLongitude?: number;
  gpsAccuracy?: number;
  courtReady?: boolean;          // If true, retention = permanent
  retentionPolicy?: 'standard' | 'long_term' | 'permanent';
}
```

**Returns:**

```typescript
interface PhotoUploadResult {
  success: boolean;
  photoUrl?: string;             // Public URL (for display)
  photoMetadataId?: string;      // Database record ID
  photoHash?: string;            // SHA256 hash
  error?: string;
}
```

**Example Usage:**

```typescript
import { uploadEvidencePhoto } from '@/services/photoUpload';

const result = await uploadEvidencePhoto({
  photoUri: 'file:///path/to/photo.jpg',
  photoType: 'full',
  organizationId: user.organization_id,
  userId: user.id,
  incidentId: incident.id,
  gpsLatitude: currentLocation.latitude,
  gpsLongitude: currentLocation.longitude,
  courtReady: true,
  retentionPolicy: 'permanent',
});

if (result.success) {
  console.log('Photo uploaded:', result.photoUrl);
  console.log('Hash:', result.photoHash);
} else {
  console.error('Upload failed:', result.error);
}
```

### `uploadMultiplePhotos(photos: PhotoUploadData[]): Promise<PhotoUploadResult[]>`

Upload multiple photos in batch with progress logging.

**Example:**

```typescript
const photos = photoUris.map(uri => ({
  photoUri: uri,
  photoType: 'full',
  organizationId: user.organization_id,
  userId: user.id,
  incidentId: incident.id,
  courtReady: false,
}));

const results = await uploadMultiplePhotos(photos);

const successCount = results.filter(r => r.success).length;
console.log(`${successCount}/${photos.length} photos uploaded`);
```

### `deleteEvidencePhoto(photoMetadataId: string): Promise<Result>`

Soft delete a photo (marks as deleted but preserves file for audit).

**Example:**

```typescript
const result = await deleteEvidencePhoto(photoMetadataId);
if (result.success) {
  console.log('Photo deleted');
}
```

### `verifyPhotoHash(photoUri: string, expectedHash: string): Promise<VerifyResult>`

Verify photo integrity by recalculating hash and comparing.

**Returns:**

```typescript
interface VerifyResult {
  verified: boolean;
  actualHash?: string;
}
```

**Example:**

```typescript
const { verified, actualHash } = await verifyPhotoHash(photoUri, expectedHash);

if (verified) {
  console.log('✅ Photo integrity verified');
} else {
  console.error('❌ Hash mismatch!');
  console.error(`Expected: ${expectedHash}`);
  console.error(`Actual: ${actualHash}`);
}
```

### `markPhotoCourtReady(photoMetadataId: string): Promise<Result>`

Mark photo as court-ready evidence (changes retention to permanent).

**Example:**

```typescript
const result = await markPhotoCourtReady(photoMetadataId);
if (result.success) {
  console.log('Photo marked as court-ready - retention: permanent');
}
```

### `getIncidentPhotos(incidentId: string): Promise<PhotoMetadata[]>`

Get all photos linked to an incident.

**Example:**

```typescript
const photos = await getIncidentPhotos(incidentId);
console.log(`Found ${photos.length} photos for incident`);
```

## Retention Policies

| Policy | Delete After | Use Case |
|--------|-------------|----------|
| `standard` | 90 days | Regular observations, routine photos |
| `long_term` | 365 days | Important evidence, investigations |
| `permanent` | Never | Court-ready evidence, critical incidents |

**Auto-upgrade:** Any photo marked `court_ready: true` automatically becomes `permanent`.

## Photo Metadata Schema

All uploaded photos create a record in `photo_metadata` table:

```typescript
{
  id: string;                    // UUID
  photo_url: string;             // Storage URL
  file_name: string;             // Original filename
  bucket_name: string;           // 'incident-evidence'
  storage_path: string;          // Full storage path
  photo_hash: string;            // SHA256 hash
  photo_type: string;            // 'full' | 'cropped' | 'thumbnail'
  file_size_bytes: number;
  width: number | null;
  height: number | null;
  mime_type: string;             // 'image/jpeg'
  organization_id: string;
  user_id: string;
  incident_id: string | null;
  vehicle_record_id: string | null;
  observation_id: string | null;
  retention_policy: string;      // 'standard' | 'long_term' | 'permanent'
  court_ready: boolean;
  delete_after_days: number | null;
  scheduled_deletion_at: string | null;
  gps_latitude: number | null;
  gps_longitude: number | null;
  gps_accuracy: number | null;
  captured_at: string;           // When photo was taken
  uploaded_at: string;           // When upload completed
  deleted_at: string | null;     // Soft delete timestamp
}
```

## Error Handling

The service handles these error scenarios:

1. **File Size Exceeded**: Returns error if file >10MB
2. **Upload Failure**: Cleans up partial uploads automatically
3. **Metadata Creation Failure**: Removes uploaded file if metadata fails
4. **Hash Calculation Failure**: Throws descriptive error
5. **Network Errors**: Gracefully handled with error messages

**Example Error Handling:**

```typescript
const result = await uploadEvidencePhoto(data);

if (!result.success) {
  if (result.error?.includes('10MB')) {
    Alert.alert('File Too Large', 'Photos must be under 10MB');
  } else if (result.error?.includes('network')) {
    Alert.alert('Upload Failed', 'Check your internet connection');
  } else {
    Alert.alert('Upload Error', result.error);
  }
}
```

## Integration with Incident Reporting

The incident reporting service automatically uses photo upload:

```typescript
// services/incidentReporting.ts
const result = await createIncident({
  ...incidentData,
  evidencePhotos: [photoUri1, photoUri2, photoUri3],
});

// Photos are automatically:
// 1. Uploaded to storage
// 2. Hashed for integrity
// 3. Linked to incident via photo_metadata
// 4. Added to incident.photo_metadata_ids array
```

## Security Considerations

✅ **Private Bucket**: `incident-evidence` bucket is private (RLS policies control access)
✅ **SHA256 Hashing**: Evidence integrity verification for court
✅ **Soft Delete**: Photos never permanently deleted (audit trail)
✅ **Metadata Tracking**: Complete audit trail (who, when, where, why)
✅ **File Size Limits**: Prevents storage abuse
✅ **Retention Policies**: Automatic cleanup of non-critical photos

## Testing Checklist

- [ ] Upload photo <2MB - Should upload without compression
- [ ] Upload photo >2MB - Should compress before upload
- [ ] Upload photo >10MB - Should reject with error
- [ ] Verify hash - Recalculate and verify matches original
- [ ] Mark court-ready - Retention should change to permanent
- [ ] Delete photo - Should soft delete (deleted_at set)
- [ ] Batch upload 5 photos - All should upload successfully
- [ ] Upload without network - Should fail gracefully
- [ ] Link to incident - photo_metadata_ids should update

## Performance

- **Compression**: Photos >2MB compressed to ~70% quality
- **Upload Speed**: Depends on network, typically 1-3 seconds per photo
- **Batch Upload**: Sequential (not parallel) to avoid overwhelming mobile device
- **Hash Calculation**: Fast (<100ms for typical photo)

## Future Enhancements

- [ ] Parallel batch uploads (with max concurrency limit)
- [ ] Image dimension extraction
- [ ] EXIF metadata preservation
- [ ] Thumbnail generation
- [ ] Client-side encryption for extra security
- [ ] Offline upload queue (retry failed uploads)
