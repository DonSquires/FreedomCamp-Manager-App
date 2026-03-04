export interface Officer {
  id: string;
  email: string;
  name: string;
  badgeNumber: string;
  organizationId?: string;
  role?: 'officer' | 'admin' | 'master';
}

export interface GPSLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export interface WelfarePing {
  id: string;
  officerId: string;
  location: GPSLocation;
  timestamp: number;
  status: 'active' | 'missed' | 'emergency';
}

export interface VehicleObservation {
  id: string;
  officerId: string;
  licensePlate: string;
  location: GPSLocation;
  timestamp: number;
  vehicleType: string;
  complianceStatus: 'compliant' | 'breach' | 'warning';
  notes: string;
  photoUri?: string;
  synced: boolean;
}

export interface ObservationQueue {
  pending: VehicleObservation[];
  failed: VehicleObservation[];
}
