export interface UserProfile {
  id: string;
  organization_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  role: 'officer' | 'admin' | 'master';
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OfficerWelfareAlert {
  id: string;
  officer_id: string;
  organization_id: string;
  alert_type: 'no_activity' | 'no_gps' | 'panic' | 'manual';
  status: 'pending' | 'acknowledged' | 'resolved';
  officer_name: string;
  officer_phone: string | null;
  gps_latitude: number | null;
  gps_longitude: number | null;
  gps_accuracy: number | null;
  last_activity_at: string;
  alert_sent_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  escalation_level: number;
  escalated_at: string | null;
  acknowledgement_notes: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OfficerActivityLog {
  id: string;
  user_id: string;
  organization_id: string;
  activity_type: 'login' | 'logout' | 'gps_ping' | 'observation' | 'incident';
  gps_latitude: number | null;
  gps_longitude: number | null;
  gps_accuracy: number | null;
  metadata: Record<string, any>;
  recorded_at: string;
  created_at: string;
}

export interface OfficerWelfareSettings {
  id: string;
  organization_id: string;
  user_id: string;
  auto_logoff_enabled: boolean;
  welfare_check_enabled: boolean;
  inactivity_warning_time: number;
  auto_logoff_time: number;
  gps_inactivity_threshold: number;
  gps_ping_interval: number;
  admin_escalation_time: number;
  critical_escalation_time: number;
  investigation_exception_enabled: boolean;
  created_at: string;
  updated_at: string;
}

// Canonical Vehicles
export interface CanonicalVehicle {
  vehicle_id: string;
  plate_number: string;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_color: string | null;
  first_seen_at: string;
  last_seen_at: string;
  total_observations: number;
  is_homeless: boolean;
  homeless_confirmed: boolean;
  homeless_confirmed_by: string | null;
  homeless_confirmed_at: string | null;
  homeless_notes: string | null;
  is_flagged: boolean;
  flagged_priority: string | null;
  flagged_reason: string | null;
  flagged_notes: string | null;
  flagged_at: string | null;
  flagged_by: string | null;
  created_at: string;
  updated_at: string;
}

// Vehicle Observations
export interface VehicleObservation {
  observation_id: string;
  vehicle_id: string;
  organization_id: string | null;
  zone_id: string;
  recorded_by: string | null;
  recorded_at: string;
  source_type: 'patrol' | 'scan' | 'manual';
  is_self_contained: boolean;
  is_compliant: boolean;
  gps_latitude: number | null;
  gps_longitude: number | null;
  gps_accuracy: number | null;
  evidence_photos: any;
  notes: string | null;
  original_record_id: string | null;
  created_at: string;
}

// Zones
export interface Zone {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  self_contained_required: boolean;
  nights_per_month: number;
  max_consecutive_nights: number;
  day_visit_only: boolean;
  allowed_days: string[];
  geometry: any;
  location_lat: number | null;
  location_lng: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Compliance Results
export interface ComplianceResult {
  id: string;
  observation_id: string | null;
  vehicle_id: string | null;
  zone_id: string;
  organization_id: string | null;
  matrix_id: string | null;
  matrix_version: number | null;
  is_compliant: boolean;
  violation_reasons: string[] | null;
  metrics_json: any;
  matrix_snapshot: any;
  evaluated_at: string;
  created_at: string;
  after_hours_violation: boolean;
}

// Breach Alerts
export interface BreachAlert {
  id: string;
  organization_id: string;
  vehicle_id: string;
  observation_id: string | null;
  zone_id: string;
  breach_type: 'consecutive_stay' | 'self_contained_required' | 'monthly_limit' | 'prohibited_zone' | 'day_visit_violation';
  status: 'pending' | 'acknowledged' | 'resolved' | 'dismissed';
  severity: 'low' | 'medium' | 'high' | 'critical';
  plate_number: string;
  zone_name: string | null;
  breach_details: any;
  violation_reasons: string[] | null;
  due_date: string | null;
  detected_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
}

// Incidents
export interface Incident {
  id: string;
  organization_id: string;
  incident_number: string;
  incident_type: 'security' | 'safety' | 'environmental' | 'public_health' | 'other';
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'draft' | 'submitted' | 'under_review' | 'resolved' | 'closed';
  title: string;
  description: string;
  location_description: string | null;
  gps_latitude: number | null;
  gps_longitude: number | null;
  zone_id: string | null;
  vehicle_id: string | null;
  person_name: string | null;
  reported_by: string;
  reported_at: string;
  involved_vehicles: string[] | null;
  involved_persons: any;
  witness_details: any;
  evidence_photos: any;
  evidence_documents: any;
  photo_metadata_ids: string[] | null;
  is_court_ready: boolean;
  court_ready_at: string | null;
  requires_investigation: boolean;
  investigation_id: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

// Health & Safety Reports
export interface HealthSafetyReport {
  id: string;
  organization_id: string;
  report_number: string;
  report_type: 'hazard' | 'near_miss' | 'injury' | 'illness' | 'unsafe_condition' | 'other';
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'draft' | 'submitted' | 'under_review' | 'resolved' | 'closed';
  title: string;
  description: string;
  location_description: string | null;
  gps_latitude: number | null;
  gps_longitude: number | null;
  zone_id: string | null;
  vehicle_id: string | null;
  person_name: string | null;
  reported_by: string;
  reported_at: string;
  immediate_action_taken: string | null;
  evidence_photos: any;
  witness_details: any;
  requires_investigation: boolean;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

// Patrols (from database schema)
export interface Patrol {
  id: string;
  organization_id: string;
  zone_id: string;
  patrol_date: string;
  shift: string;
  assigned_to: string | null;
  checked_in_at: string | null;
  check_in_location_lat: number | null;
  check_in_location_lng: number | null;
  completed_at: string | null;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Patrol with zone details
export interface PatrolWithZone extends Patrol {
  zone: Zone | null;
}

// Investigation Jobs
export interface InvestigationJob {
  id: string;
  organization_id: string;
  reference_number: string;
  job_type: 'homeless_occupation' | 'abandoned_vehicle' | 'unauthorized_structure' | 'environmental_hazard' | 'follow_up_inspection';
  location_address: string;
  property_details: string | null;
  gps_latitude: number | null;
  gps_longitude: number | null;
  briefing_notes: string | null;
  instructions: string | null;
  client_name: string | null;
  client_reference: string | null;
  assigned_to: string | null;
  assigned_at: string | null;
  assigned_by: string | null;
  status: 'pending' | 'assigned' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  completed_by: string | null;
  vehicle_id: string | null;
}

// Investigation Findings
export interface InvestigationFinding {
  id: string;
  job_id: string;
  visit_date: string;
  arrived_at: string | null;
  departed_at: string | null;
  findings_summary: string | null;
  structures_found: string | null;
  vehicles_found: string | null;
  persons_contacted: any;
  evidence_photos: string[] | null;
  vehicle_photos: string[] | null;
  structure_photos: string[] | null;
  recommendations: string | null;
  follow_up_required: boolean;
  follow_up_notes: string | null;
  officer_notes: string | null;
  weather_conditions: string | null;
  access_notes: string | null;
  completed_at: string;
  completed_by: string;
}

// Offline Queue Item
export interface OfflineQueueItem {
  id: string;
  type: 'observation' | 'incident' | 'enforcement_action' | 'hs_report' | 'investigation_finding';
  data: any;
  timestamp: string;
  attempts: number;
  lastError?: string;
}
