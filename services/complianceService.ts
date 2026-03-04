import { getDatabase } from './database';

export interface ComplianceResult {
  isCompliant: boolean;
  isBreach: boolean;
  breachType: 'consecutive_nights' | 'monthly_nights' | 'day_visit' | 'self_contained' | null;
  consecutiveNights: number;
  monthlyNights: number;
  maxConsecutiveAllowed: number;
  maxMonthlyAllowed: number;
  selfContainedRequired: boolean;
  isSelfContained: boolean;
  violationReasons: string[];
  homelessExemption: boolean;
}

/**
 * Calculate compliance status locally without network calls
 * This is the core offline compliance algorithm
 */
export async function calculateLocalCompliance(
  plateNumber: string,
  zoneId: string,
  checkDate: Date = new Date()
): Promise<ComplianceResult> {
  const db = getDatabase();
  
  try {
    // Step 1: Get zone's current compliance matrix
    const matrix = await db.getFirstAsync<any>(
      `SELECT * FROM compliance_matrix 
       WHERE zone_id = ? AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
       ORDER BY version DESC LIMIT 1`,
      zoneId,
      checkDate.getTime(),
      checkDate.getTime()
    );
    
    if (!matrix) {
      // No compliance matrix found - default to permissive
      console.warn(`⚠️ No compliance matrix found for zone ${zoneId}`);
      return {
        isCompliant: true,
        isBreach: false,
        breachType: null,
        consecutiveNights: 0,
        monthlyNights: 0,
        maxConsecutiveAllowed: 999,
        maxMonthlyAllowed: 999,
        selfContainedRequired: false,
        isSelfContained: false,
        violationReasons: [],
        homelessExemption: false,
      };
    }
    
    // Step 2: Get vehicle info
    const vehicle = await db.getFirstAsync<any>(
      `SELECT * FROM canonical_vehicles WHERE plate_number = ?`,
      plateNumber
    );
    
    const isSelfContained = vehicle?.self_contained === 1;
    const homelessStatus = vehicle?.homeless_status || 'none';
    
    // Step 3: Check homeless exemption
    const homelessExemption = 
      matrix.homeless_exemption === 1 && 
      homelessStatus === 'confirmed';
    
    if (homelessExemption) {
      console.log(`✓ Homeless exemption applies for ${plateNumber}`);
      return {
        isCompliant: true,
        isBreach: false,
        breachType: null,
        consecutiveNights: 0,
        monthlyNights: 0,
        maxConsecutiveAllowed: matrix.max_consecutive_nights,
        maxMonthlyAllowed: matrix.nights_per_month,
        selfContainedRequired: matrix.self_contained_required === 1,
        isSelfContained,
        violationReasons: [],
        homelessExemption: true,
      };
    }
    
    // Step 4: Get current month's stay data
    const currentMonthStart = new Date(checkDate.getFullYear(), checkDate.getMonth(), 1);
    const monthlyStay = await db.getFirstAsync<any>(
      `SELECT * FROM vehicle_monthly_stays 
       WHERE plate_number = ? AND zone_id = ? AND calendar_month = ?`,
      plateNumber,
      zoneId,
      currentMonthStart.getTime()
    );
    
    const consecutiveNights = monthlyStay?.consecutive_nights || 0;
    const monthlyNights = monthlyStay?.nights_stayed || 0;
    
    // Step 5: Check day visit only zones
    if (matrix.day_visit_only === 1) {
      const currentHour = checkDate.getHours();
      const isDayTime = currentHour >= 8 && currentHour < 20;
      
      if (!isDayTime) {
        return {
          isCompliant: false,
          isBreach: true,
          breachType: 'day_visit',
          consecutiveNights,
          monthlyNights,
          maxConsecutiveAllowed: 0,
          maxMonthlyAllowed: matrix.nights_per_month,
          selfContainedRequired: matrix.self_contained_required === 1,
          isSelfContained,
          violationReasons: ['Day visit only zone - no overnight parking allowed'],
          homelessExemption: false,
        };
      }
    }
    
    // Step 6: Check self-contained requirement
    const violationReasons: string[] = [];
    let isBreach = false;
    let breachType: ComplianceResult['breachType'] = null;
    
    if (matrix.self_contained_required === 1 && !isSelfContained) {
      violationReasons.push('Self-contained certificate required for this zone');
      isBreach = true;
      breachType = 'self_contained';
    }
    
    // Step 7: Check consecutive nights limit
    if (consecutiveNights > matrix.max_consecutive_nights) {
      violationReasons.push(
        `Consecutive nights exceeded: ${consecutiveNights}/${matrix.max_consecutive_nights}`
      );
      isBreach = true;
      breachType = breachType || 'consecutive_nights';
    }
    
    // Step 8: Check monthly nights limit
    if (monthlyNights > matrix.nights_per_month) {
      violationReasons.push(
        `Monthly nights exceeded: ${monthlyNights}/${matrix.nights_per_month}`
      );
      isBreach = true;
      breachType = breachType || 'monthly_nights';
    }
    
    const isCompliant = !isBreach && violationReasons.length === 0;
    
    return {
      isCompliant,
      isBreach,
      breachType,
      consecutiveNights,
      monthlyNights,
      maxConsecutiveAllowed: matrix.max_consecutive_nights,
      maxMonthlyAllowed: matrix.nights_per_month,
      selfContainedRequired: matrix.self_contained_required === 1,
      isSelfContained,
      violationReasons,
      homelessExemption: false,
    };
    
  } catch (error) {
    console.error('Error calculating compliance:', error);
    throw error;
  }
}

/**
 * Get vehicle's recent observation history in zone
 */
export async function getVehicleHistory(
  plateNumber: string,
  zoneId: string,
  limit: number = 10
): Promise<any[]> {
  const db = getDatabase();
  
  const observations = await db.getAllAsync(
    `SELECT * FROM recent_observations 
     WHERE plate_number = ? AND zone_id = ? 
     ORDER BY recorded_at DESC LIMIT ?`,
    plateNumber,
    zoneId,
    limit
  );
  
  return observations || [];
}

/**
 * Check if vehicle is flagged
 */
export async function checkFlaggedVehicle(plateNumber: string): Promise<{
  isFlagged: boolean;
  priority?: string;
  reason?: string;
  notes?: string;
}> {
  const db = getDatabase();
  
  const flagged = await db.getFirstAsync<any>(
    `SELECT * FROM flagged_vehicles 
     WHERE plate_number = ? AND is_active = 1`,
    plateNumber
  );
  
  if (!flagged) {
    return { isFlagged: false };
  }
  
  return {
    isFlagged: true,
    priority: flagged.priority,
    reason: flagged.reason,
    notes: flagged.notes,
  };
}
