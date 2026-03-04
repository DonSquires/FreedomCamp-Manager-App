import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: any;
  read: boolean;
  timestamp: number;
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      const notificationsStr = await AsyncStorage.getItem('notifications_history');
      if (notificationsStr) {
        const parsed = JSON.parse(notificationsStr);
        setNotifications(parsed);
      }
    } catch (error) {
      console.error('Load notifications error:', error);
    }
  };

  const handleNotificationTap = async (notification: Notification) => {
    // Mark as read
    const updated = notifications.map(n => 
      n.id === notification.id ? { ...n, read: true } : n
    );
    setNotifications(updated);
    await AsyncStorage.setItem('notifications_history', JSON.stringify(updated));

    // Navigate based on notification type
    if (notification.data?.jobId) {
      router.push({ pathname: '/jobs/[id]', params: { id: notification.data.jobId } });
    } else if (notification.data?.plateNumber) {
      router.push({ 
        pathname: '/vehicle-details',
        params: { plateNumber: notification.data.plateNumber }
      });
    }
  };

  const handleClearAll = async () => {
    setNotifications([]);
    await AsyncStorage.setItem('notifications_history', JSON.stringify([]));
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'job_assignment': return 'assignment';
      case 'breach_alert': return 'warning';
      case 'welfare_alert': return 'health-and-safety';
      case 'flagged_vehicle': return 'flag';
      default: return 'notifications';
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'job_assignment': return '#00b4d8';
      case 'breach_alert': return '#f44336';
      case 'welfare_alert': return '#ff9800';
      case 'flagged_vehicle': return '#ff9800';
      default: return '#999';
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <TouchableOpacity onPress={handleClearAll}>
          <MaterialIcons name="delete-sweep" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {notifications.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="notifications-none" size={64} color="#666" />
            <Text style={styles.emptyText}>No notifications</Text>
          </View>
        ) : (
          notifications.map((notification) => (
            <TouchableOpacity
              key={notification.id}
              style={[
                styles.notificationCard,
                !notification.read && styles.notificationCardUnread,
              ]}
              onPress={() => handleNotificationTap(notification)}
            >
              <View
                style={[
                  styles.iconCircle,
                  { backgroundColor: getNotificationColor(notification.type) + '22' },
                ]}
              >
                <MaterialIcons
                  name={getNotificationIcon(notification.type) as any}
                  size={24}
                  color={getNotificationColor(notification.type)}
                />
              </View>

              <View style={styles.notificationContent}>
                <Text style={styles.notificationTitle}>{notification.title}</Text>
                <Text style={styles.notificationBody}>{notification.body}</Text>
                <Text style={styles.notificationTime}>
                  {new Date(notification.timestamp).toLocaleString()}
                </Text>
              </View>

              {!notification.read && <View style={styles.unreadDot} />}
            </TouchableOpacity>
          ))
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
  emptyState: {
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
  },
  notificationCard: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  notificationCardUnread: {
    borderColor: '#00b4d8',
    backgroundColor: '#00b4d811',
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationContent: {
    flex: 1,
    marginLeft: 12,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  notificationBody: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  notificationTime: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  unreadDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#00b4d8',
  },
});
