import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export interface NotificationPreferences {
  breachAlerts: boolean;
  investigationAssignments: boolean;
  flaggedVehicleAlerts: boolean;
  welfareAlerts: boolean;
  systemAlerts: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  breachAlerts: true,
  investigationAssignments: true,
  flaggedVehicleAlerts: true,
  welfareAlerts: true,
  systemAlerts: true,
};

/**
 * Register device for push notifications
 */
export async function registerForPushNotifications(): Promise<string | null> {
  try {
    if (!Device.isDevice) {
      console.log('Push notifications require a physical device');
      return null;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permission denied');
      return null;
    }

    const token = (await Notifications.getExpoPushTokenAsync()).data;
    
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#00b4d8',
      });
    }

    // Store token in backend
    await storePushToken(token);

    return token;
  } catch (error) {
    console.error('Register push notification error:', error);
    return null;
  }
}

/**
 * Store push token in backend
 */
async function storePushToken(token: string): Promise<void> {
  try {
    const profileStr = await AsyncStorage.getItem('user_profile');
    if (!profileStr) return;

    const profile = JSON.parse(profileStr);

    const { error } = await supabase
      .from('user_profiles')
      .update({
        push_token: token,
        push_token_updated_at: new Date().toISOString(),
      })
      .eq('id', profile.id);

    if (error) {
      console.error('Store push token error:', error);
    } else {
      console.log('✅ Push token registered');
    }
  } catch (error) {
    console.error('Store token error:', error);
  }
}

/**
 * Get notification preferences
 */
export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const prefsStr = await AsyncStorage.getItem('notification_preferences');
    return prefsStr ? JSON.parse(prefsStr) : DEFAULT_PREFERENCES;
  } catch (error) {
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Save notification preferences
 */
export async function saveNotificationPreferences(prefs: NotificationPreferences): Promise<void> {
  await AsyncStorage.setItem('notification_preferences', JSON.stringify(prefs));

  // Update backend
  try {
    const profileStr = await AsyncStorage.getItem('user_profile');
    if (!profileStr) return;

    const profile = JSON.parse(profileStr);

    await supabase
      .from('user_profiles')
      .update({
        notification_preferences: prefs,
      })
      .eq('id', profile.id);
  } catch (error) {
    console.error('Save preferences error:', error);
  }
}

/**
 * Setup notification listeners
 */
export function setupNotificationListeners(
  onNotificationReceived: (notification: Notifications.Notification) => void,
  onNotificationTapped: (response: Notifications.NotificationResponse) => void
): () => void {
  const receivedSubscription = Notifications.addNotificationReceivedListener(onNotificationReceived);
  const responseSubscription = Notifications.addNotificationResponseReceivedListener(onNotificationTapped);

  return () => {
    receivedSubscription.remove();
    responseSubscription.remove();
  };
}

/**
 * Show local notification
 */
export async function showLocalNotification(
  title: string,
  body: string,
  data?: any
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: true,
    },
    trigger: null, // Show immediately
  });
}

/**
 * Clear all notifications
 */
export async function clearAllNotifications(): Promise<void> {
  await Notifications.dismissAllNotificationsAsync();
}

/**
 * Get notification badge count
 */
export async function getBadgeCount(): Promise<number> {
  return await Notifications.getBadgeCountAsync();
}

/**
 * Set notification badge count
 */
export async function setBadgeCount(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(count);
}
