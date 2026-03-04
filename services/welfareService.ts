import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { getLastActivityTime, isTrackingActive } from './trackingService';

export interface WelfareSettings {
  autoLogoffEnabled: boolean;
  welfareCheckEnabled: boolean;
  inactivityWarningTime: number; // minutes
  autoLogoffTime: number; // minutes
  gpsInactivityThreshold: number; // minutes
  investigationExemption: boolean;
}

const DEFAULT_SETTINGS: WelfareSettings = {
  autoLogoffEnabled: true,
  welfareCheckEnabled: true,
  inactivityWarningTime: 10,
  autoLogoffTime: 20,
  gpsInactivityThreshold: 10,
  investigationExemption: true,
};

let welfareCheckInterval: NodeJS.Timeout | null = null;
let warningShown = false;

/**
 * Get welfare settings
 */
export async function getWelfareSettings(): Promise<WelfareSettings> {
  try {
    const settingsStr = await AsyncStorage.getItem('welfare_settings');
    return settingsStr ? JSON.parse(settingsStr) : DEFAULT_SETTINGS;
  } catch (error) {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save welfare settings
 */
export async function saveWelfareSettings(settings: WelfareSettings): Promise<void> {
  await AsyncStorage.setItem('welfare_settings', JSON.stringify(settings));
}

/**
 * Start welfare monitoring
 */
export async function startWelfareMonitoring(): Promise<void> {
  const settings = await getWelfareSettings();

  if (!settings.welfareCheckEnabled) {
    return;
  }

  // Check every minute
  if (welfareCheckInterval) {
    clearInterval(welfareCheckInterval);
  }

  welfareCheckInterval = setInterval(async () => {
    await checkWelfareStatus();
  }, 60000); // 1 minute

  console.log('🛡️ Welfare monitoring started');
}

/**
 * Stop welfare monitoring
 */
export async function stopWelfareMonitoring(): Promise<void> {
  if (welfareCheckInterval) {
    clearInterval(welfareCheckInterval);
    welfareCheckInterval = null;
  }

  warningShown = false;
  console.log('🛡️ Welfare monitoring stopped');
}

/**
 * Check welfare status
 */
async function checkWelfareStatus(): Promise<void> {
  try {
    const settings = await getWelfareSettings();
    
    // Check if in investigation mode (exemption)
    const activityType = await AsyncStorage.getItem('tracking_activity_type');
    if (settings.investigationExemption && activityType === 'investigation') {
      return; // Exempt from welfare checks
    }

    const lastActivity = await getLastActivityTime();
    const minutesSinceActivity = (Date.now() - lastActivity) / (1000 * 60);

    // Inactivity warning
    if (minutesSinceActivity >= settings.inactivityWarningTime && !warningShown) {
      warningShown = true;
      showInactivityWarning(settings.autoLogoffTime - settings.inactivityWarningTime);
    }

    // Auto-logoff
    if (settings.autoLogoffEnabled && minutesSinceActivity >= settings.autoLogoffTime) {
      await handleAutoLogoff();
    }

  } catch (error) {
    console.error('Welfare check error:', error);
  }
}

/**
 * Show inactivity warning
 */
function showInactivityWarning(minutesUntilLogoff: number): void {
  Alert.alert(
    '⚠️ Inactivity Warning',
    `No activity detected for ${Math.round(minutesUntilLogoff)} minutes.\n\nYou will be automatically logged off if no activity is detected.\n\nPress OK to confirm you're safe.`,
    [
      {
        text: 'OK - I\'m Safe',
        onPress: async () => {
          // Update activity
          await AsyncStorage.setItem('last_activity_timestamp', Date.now().toString());
          warningShown = false;
        },
      },
    ]
  );
}

/**
 * Handle auto-logoff
 */
async function handleAutoLogoff(): Promise<void> {
  Alert.alert(
    '🚨 Auto-Logoff',
    'You have been automatically logged off due to inactivity.',
    [
      {
        text: 'OK',
        onPress: async () => {
          // Stop tracking
          const { stopTracking } = require('./trackingService');
          await stopTracking();
          
          // Clear session
          await AsyncStorage.removeItem('user_session');
          await AsyncStorage.removeItem('user_profile');
          
          // Navigate to login (would need router context)
          console.log('Auto-logged off');
        },
      },
    ]
  );
}

/**
 * Acknowledge welfare check
 */
export async function acknowledgeWelfareCheck(): Promise<void> {
  await AsyncStorage.setItem('last_activity_timestamp', Date.now().toString());
  warningShown = false;
}

/**
 * Get welfare status
 */
export async function getWelfareStatus(): Promise<{
  lastActivity: Date;
  minutesIdle: number;
  trackingActive: boolean;
}> {
  const lastActivity = await getLastActivityTime();
  const trackingActive = await isTrackingActive();

  return {
    lastActivity: new Date(lastActivity),
    minutesIdle: Math.floor((Date.now() - lastActivity) / (1000 * 60)),
    trackingActive,
  };
}
