import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { getLastSyncTime, isDataFresh } from '@/services/syncService';
import { getQueueStats, processUploadQueue } from '@/services/uploadQueue';
import { getDashboardStats, DashboardStats } from '@/services/statsService';
import StatusHeader from '@/components/StatusHeader';

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [queueStats, setQueueStats] = useState({ total: 0, pending: 0, failed: 0 });
  const [userProfile, setUserProfile] = useState<any>(null);
  const [dataFresh, setDataFresh] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  useEffect(() => {
    loadDashboardData();
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected || false);
    });

    return () => unsubscribe();
  }, []);

  const loadDashboardData = async () => {
    try {
      const profileStr = await AsyncStorage.getItem('user_profile');
      if (profileStr) {
        setUserProfile(JSON.parse(profileStr));
      }

      const syncTime = await getLastSyncTime();
      setLastSync(syncTime);

      const fresh = await isDataFresh();
      setDataFresh(fresh);

      const qStats = await getQueueStats();
      setQueueStats(qStats);

      const dashStats = await getDashboardStats();
      setStats(dashStats);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    }
  };

  const handleForceSync = async () => {
    if (!isOnline) {
      Alert.alert('Offline', 'Cannot sync while offline');
      return;
    }

    Alert.alert('Force Sync', 'Process upload queue now?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sync',
        onPress: async () => {
          const result = await processUploadQueue();
          Alert.alert(
            'Sync Complete',
            `Processed: ${result.processed}\nSuccessful: ${result.successful}\nFailed: ${result.failed}`
          );
          loadDashboardData();
        },
      },
    ]);
  };

  const handleLogout = async () => {
    Alert.alert('Logout', 'Clear local data and logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.clear();
          router.replace('/login');
        },
      },
    ]);
  };

  const formatSyncTime = (date: Date | null) => {
    if (!date) return 'Never';
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours === 0) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Status Header */}
      <StatusHeader currentZone={null} />
      
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>FreedomCamp Manager</Text>
          <Text style={styles.subGreeting}>
            {userProfile?.first_name} {userProfile?.last_name}
          </Text>
        </View>
        <TouchableOpacity style={styles.headerButton} onPress={handleLogout}>
          <MaterialIcons name="logout" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Network Status */}
        <View style={[styles.statusCard, isOnline ? styles.statusOnline : styles.statusOffline]}>
          <MaterialIcons
            name={isOnline ? 'wifi' : 'wifi-off'}
            size={24}
            color={isOnline ? '#4caf50' : '#f44336'}
          />
          <View style={styles.statusText}>
            <Text style={styles.statusTitle}>
              {isOnline ? 'Online' : 'Offline Mode'}
            </Text>
            <Text style={styles.statusSubtitle}>
              Last sync: {formatSyncTime(lastSync)}
            </Text>
          </View>
          {!dataFresh && (
            <MaterialIcons name="warning" size={20} color="#ff9800" />
          )}
        </View>

        {/* Upload Queue */}
        {queueStats.total > 0 && (
          <TouchableOpacity
            style={styles.queueCard}
            onPress={() => router.push('/(tabs)/queue')}
          >
            <MaterialIcons name="upload" size={24} color="#00b4d8" />
            <View style={styles.queueText}>
              <Text style={styles.queueTitle}>Upload Queue</Text>
              <Text style={styles.queueSubtitle}>
                {queueStats.pending} pending · {queueStats.failed} failed
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#666" />
          </TouchableOpacity>
        )}

        {/* Quick Stats */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <MaterialIcons name="camera-alt" size={32} color="#00b4d8" />
            <Text style={styles.statValue}>{stats?.scansToday || 0}</Text>
            <Text style={styles.statLabel}>Scans Today</Text>
          </View>

          <View style={styles.statCard}>
            <MaterialIcons name="warning" size={32} color="#f44336" />
            <Text style={styles.statValue}>{stats?.breachesActive || 0}</Text>
            <Text style={styles.statLabel}>Breaches</Text>
          </View>

          <View style={styles.statCard}>
            <MaterialIcons name="photo" size={32} color="#4caf50" />
            <Text style={styles.statValue}>{stats?.totalPhotos || 0}</Text>
            <Text style={styles.statLabel}>Photos</Text>
          </View>

          <View style={styles.statCard}>
            <MaterialIcons name="flag" size={32} color="#9c27b0" />
            <Text style={styles.statValue}>{stats?.flaggedVehicles || 0}</Text>
            <Text style={styles.statLabel}>Flagged</Text>
          </View>
        </View>

        {/* Recent Activity */}
        {stats && stats.recentScans.length > 0 && (
          <View style={styles.activityCard}>
            <Text style={styles.activityTitle}>Recent Activity</Text>
            {stats.recentScans.map((scan, index) => (
              <TouchableOpacity
                key={index}
                style={styles.activityItem}
                onPress={() => router.push({ pathname: '/vehicle-details', params: { plate: scan.plateNumber } })}
              >
                <View style={[styles.activityBadge, scan.isCompliant ? styles.badgeGood : styles.badgeBad]}>
                  <MaterialIcons
                    name={scan.isCompliant ? 'check' : 'warning'}
                    size={16}
                    color="#fff"
                  />
                </View>
                <View style={styles.activityInfo}>
                  <Text style={styles.activityPlate}>{scan.plateNumber}</Text>
                  <Text style={styles.activityZone}>{scan.zoneName}</Text>
                </View>
                <Text style={styles.activityTime}>
                  {new Date(scan.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Primary Action - Large Scan Button */}
        <TouchableOpacity
          style={styles.scanButton}
          onPress={() => router.push('/(tabs)/scan')}
          activeOpacity={0.8}
        >
          <View style={styles.scanButtonIcon}>
            <MaterialIcons name="camera-alt" size={48} color="#fff" />
          </View>
          <View style={styles.scanButtonContent}>
            <Text style={styles.scanButtonText}>SCAN VEHICLE</Text>
            <Text style={styles.scanButtonSubtext}>Tap to start scanning</Text>
          </View>
          <MaterialIcons name="arrow-forward" size={32} color="#fff" />
        </TouchableOpacity>

        {/* Quick Actions */}
        <View style={styles.actionsCard}>
          <Text style={styles.actionsTitle}>Quick Actions</Text>

          <TouchableOpacity style={styles.actionItem} onPress={handleForceSync}>
            <MaterialIcons name="sync" size={20} color="#00b4d8" />
            <Text style={styles.actionText}>Force Sync</Text>
            <MaterialIcons name="chevron-right" size={20} color="#666" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionItem}
            onPress={() => router.push('/(tabs)/queue')}
          >
            <MaterialIcons name="list" size={20} color="#00b4d8" />
            <Text style={styles.actionText}>View Upload Queue</Text>
            <MaterialIcons name="chevron-right" size={20} color="#666" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionItem}
            onPress={() => setShowMoreMenu(true)}
          >
            <MaterialIcons name="more-horiz" size={20} color="#00b4d8" />
            <Text style={styles.actionText}>More Options</Text>
            <MaterialIcons name="chevron-right" size={20} color="#666" />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* More Options Dropdown Menu */}
      <Modal
        visible={showMoreMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMoreMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowMoreMenu(false)}
        >
          <View style={styles.menuContainer}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>More Options</Text>
              <TouchableOpacity onPress={() => setShowMoreMenu(false)}>
                <MaterialIcons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowMoreMenu(false);
                router.push('/photos');
              }}
            >
              <MaterialIcons name="photo-library" size={24} color="#00b4d8" />
              <View style={styles.menuItemContent}>
                <Text style={styles.menuItemTitle}>Photos</Text>
                <Text style={styles.menuItemSubtitle}>View captured photos</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color="#666" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowMoreMenu(false);
                router.push('/analytics');
              }}
            >
              <MaterialIcons name="bar-chart" size={24} color="#00b4d8" />
              <View style={styles.menuItemContent}>
                <Text style={styles.menuItemTitle}>Analytics</Text>
                <Text style={styles.menuItemSubtitle}>View statistics & reports</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color="#666" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowMoreMenu(false);
                router.replace('/settings');
              }}
            >
              <MaterialIcons name="settings" size={24} color="#00b4d8" />
              <View style={styles.menuItemContent}>
                <Text style={styles.menuItemTitle}>Settings</Text>
                <Text style={styles.menuItemSubtitle}>Account & logout</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color="#666" />
            </TouchableOpacity>


          </View>
        </TouchableOpacity>
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

  headerButton: {
    padding: 4,
  },
  greeting: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  subGreeting: {
    fontSize: 14,
    color: '#999',
    marginTop: 2,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
  },
  statusOnline: {
    borderColor: '#4caf50',
  },
  statusOffline: {
    borderColor: '#f44336',
  },
  statusText: {
    flex: 1,
    marginLeft: 12,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  statusSubtitle: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  queueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#00b4d8',
  },
  queueText: {
    flex: 1,
    marginLeft: 12,
  },
  queueTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  queueSubtitle: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  scanButton: {
    flexDirection: 'row',
    backgroundColor: '#00b4d8',
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 24,
    marginTop: 8,
    shadowColor: '#00b4d8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  scanButtonIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanButtonContent: {
    flex: 1,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 1,
  },
  scanButtonSubtext: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 4,
  },
  actionsCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  actionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  actionText: {
    flex: 1,
    fontSize: 14,
    color: '#fff',
    marginLeft: 12,
  },
  activityCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  activityTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  activityBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeGood: {
    backgroundColor: '#4caf50',
  },
  badgeBad: {
    backgroundColor: '#f44336',
  },
  activityInfo: {
    flex: 1,
    marginLeft: 12,
  },
  activityPlate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  activityZone: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  activityTime: {
    fontSize: 12,
    color: '#666',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  menuContainer: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  menuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  menuItemContent: {
    flex: 1,
    marginLeft: 16,
  },
  menuItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  menuItemSubtitle: {
    fontSize: 13,
    color: '#999',
    marginTop: 2,
  },
});
