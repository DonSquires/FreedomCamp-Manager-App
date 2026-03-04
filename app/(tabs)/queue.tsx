
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getPendingQueueItems, processUploadQueue, clearUploadedItems, getQueueStats } from '@/services/uploadQueue';
import { getDatabase } from '@/services/database';
import NetInfo from '@react-native-community/netinfo';
import StatusHeader from '@/components/StatusHeader';

export default function QueueScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [queueItems, setQueueItems] = useState<any[]>([]);
  const [observations, setObservations] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, failed: 0 });
  const [isOnline, setIsOnline] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'queue' | 'observations'>('queue');

  useEffect(() => {
    loadQueue();
    
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected || false);
    });

    return () => unsubscribe();
  }, []);

  const loadQueue = async () => {
    const items = await getPendingQueueItems(100);
    setQueueItems(items);

    const queueStats = await getQueueStats();
    setStats(queueStats);

    // Load recent observations for editing (ONLY current user's observations from last 24 hours)
    try {
      const db = getDatabase();
      const userProfileStr = await AsyncStorage.getItem('user_profile');
      if (!userProfileStr) {
        console.log('No user profile found');
        setObservations([]);
        return;
      }

      const userProfile = JSON.parse(userProfileStr);
      const userId = userProfile.id;
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);

      const obs = await db.getAllAsync<any>(
        `SELECT 
          ro.observation_id,
          ro.plate_number,
          ro.zone_id,
          ro.recorded_at,
          ro.recorded_by,
          ro.self_contained,
          ro.is_compliant,
          z.name as zone_name
         FROM recent_observations ro
         LEFT JOIN zones z ON ro.zone_id = z.id
         WHERE ro.recorded_by = ? AND ro.recorded_at >= ?
         ORDER BY ro.recorded_at DESC
         LIMIT 50`,
        userId,
        oneDayAgo
      );
      setObservations(obs);
    } catch (error) {
      console.error('Error loading observations:', error);
    }
  };

  const handleForceSync = async () => {
    if (!isOnline) {
      Alert.alert('Offline', 'Cannot sync while offline');
      return;
    }

    setIsSyncing(true);

    try {
      const result = await processUploadQueue();
      
      Alert.alert(
        'Sync Complete',
        `Processed: ${result.processed}\nSuccessful: ${result.successful}\nFailed: ${result.failed}`,
        [{ text: 'OK' }]
      );

      loadQueue();
    } catch (error: any) {
      Alert.alert('Sync Error', error.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClearUploaded = async () => {
    Alert.alert(
      'Clear Uploaded Items',
      'Remove successfully uploaded items from queue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          onPress: async () => {
            await clearUploadedItems();
            loadQueue();
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Status Header */}
      <StatusHeader currentZone={null} />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Queue & Records</Text>
        <TouchableOpacity onPress={loadQueue}>
          <MaterialIcons name="refresh" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Tab Selector */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, selectedTab === 'queue' && styles.tabActive]}
          onPress={() => setSelectedTab('queue')}
        >
          <MaterialIcons name="upload" size={20} color={selectedTab === 'queue' ? '#00b4d8' : '#999'} />
          <Text style={[styles.tabText, selectedTab === 'queue' && styles.tabTextActive]}>
            Upload Queue ({stats.total})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, selectedTab === 'observations' && styles.tabActive]}
          onPress={() => setSelectedTab('observations')}
        >
          <MaterialIcons name="edit" size={20} color={selectedTab === 'observations' ? '#00b4d8' : '#999'} />
          <Text style={[styles.tabText, selectedTab === 'observations' && styles.tabTextActive]}>
            Observations ({observations.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Stats - Only show for queue tab */}
      {selectedTab === 'queue' && (
        <View style={styles.statsCard}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.total}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: '#00b4d8' }]}>{stats.pending}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: '#f44336' }]}>{stats.failed}</Text>
          <Text style={styles.statLabel}>Failed</Text>
        </View>
      </View>
      )}

      {/* Actions - Only show for queue tab */}
      {selectedTab === 'queue' && (
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionButton, !isOnline && styles.actionButtonDisabled]}
          onPress={handleForceSync}
          disabled={!isOnline || isSyncing}
        >
          <MaterialIcons name="sync" size={20} color="#fff" />
          <Text style={styles.actionButtonText}>
            {isSyncing ? 'Syncing...' : 'Force Sync'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.actionButtonSecondary]}
          onPress={handleClearUploaded}
        >
          <MaterialIcons name="delete" size={20} color="#00b4d8" />
          <Text style={[styles.actionButtonText, { color: '#00b4d8' }]}>
            Clear Uploaded
          </Text>
        </TouchableOpacity>
      </View>
      )}

      {/* Content */}
      <ScrollView style={styles.queueList}>
        {selectedTab === 'queue' ? (
        queueItems.length === 0 ? ( // This was the problematic line, missing a surrounding JSX element
          <View style={styles.emptyState}>
            <MaterialIcons name="check-circle" size={64} color="#4caf50" />
            <Text style={styles.emptyText}>Queue is empty</Text>
            <Text style={styles.emptySubtext}>All items have been synced</Text>
          </View>
        ) : (
          queueItems.map((item) => (
            <View key={item.id} style={styles.queueItem}>
              <View style={styles.queueIcon}>
                <MaterialIcons
                  name={
                    item.action_type === 'observation' ? 'camera-alt' :
                    item.action_type === 'incident' ? 'report' :
                    item.action_type === 'photo' ? 'photo' : 'note'
                  }
                  size={24}
                  color="#00b4d8"
                />
              </View>

              <View style={styles.queueContent}>
                <Text style={styles.queueType}>{item.action_type}</Text>
                <Text style={styles.queueDetails}>
                  {item.payload.plate_number || 'Unknown'}
                </Text>
                <Text style={styles.queueTime}>
                  {new Date(item.created_at).toLocaleString()}
                </Text>
              </View>

              {item.upload_attempts > 0 && (
                <View style={styles.attemptsBadge}>
                  <Text style={styles.attemptsText}>{item.upload_attempts}</Text>
                </View>
              )}
            </View>
          ))
        )
        ) : (
          // Observations Tab - Editable Records
          observations.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="search-off" size={64} color="#666" />
              <Text style={styles.emptyText}>No observations found</Text>
              <Text style={styles.emptySubtext}>Scan vehicles to create records</Text>
            </View>
          ) : (
            observations.map((obs) => (
              <TouchableOpacity
                key={obs.observation_id}
                style={styles.observationCard}
                onPress={() => router.push({ pathname: '/observation-edit', params: { id: obs.observation_id } })}
              >
                <View style={styles.obsHeader}>
                  <View style={styles.plateContainer}>
                    <Text style={styles.plateBadge}>{obs.plate_number}</Text>
                  </View>
                  <View style={[styles.complianceBadge, obs.is_compliant ? styles.complianceGood : styles.complianceBad]}>
                    <MaterialIcons
                      name={obs.is_compliant ? 'check-circle' : 'warning'}
                      size={16}
                      color="#fff"
                    />
                    <Text style={styles.complianceText}>
                      {obs.is_compliant ? 'Compliant' : 'Breach'}
                    </Text>
                  </View>
                </View>

                <View style={styles.obsDetails}>
                  <View style={styles.obsRow}>
                    <MaterialIcons name="location-on" size={16} color="#00b4d8" />
                    <Text style={styles.obsText}>{obs.zone_name || 'Unknown Zone'}</Text>
                  </View>

                  <View style={styles.obsRow}>
                    <MaterialIcons name="calendar-today" size={16} color="#999" />
                    <Text style={styles.obsText}>
                      {new Date(obs.recorded_at).toLocaleDateString()} {new Date(obs.recorded_at).toLocaleTimeString()}
                    </Text>
                  </View>

                  {obs.self_contained === 1 && (
                    <View style={styles.obsRow}>
                      <MaterialIcons name="check-circle" size={16} color="#4caf50" />
                      <Text style={styles.obsText}>Self-Contained</Text>
                    </View>
                  )}
                </View>

                <View style={styles.obsFooter}>
                  <MaterialIcons name="edit" size={16} color="#00b4d8" />
                  <Text style={styles.editText}>Tap to edit observation</Text>
                </View>
              </TouchableOpacity>
            ))
          )
        )}
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
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#00b4d8',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonSecondary: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#00b4d8',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  queueList: {
    flex: 1,
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 64,
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
  },
  queueItem: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  queueIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#121212',
    justifyContent: 'center',
    alignItems: 'center',
  },
  queueContent: {
    flex: 1,
    marginLeft: 12,
  },
  queueType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    textTransform: 'capitalize',
  },
  queueDetails: {
    fontSize: 14,
    color: '#999',
    marginTop: 2,
  },
  queueTime: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  attemptsBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f44336',
    justifyContent: 'center',
    alignItems: 'center',
  },
  attemptsText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
    gap: 6,
  },
  tabActive: {
    backgroundColor: '#00b4d822',
    borderWidth: 1,
    borderColor: '#00b4d8',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999',
  },
  tabTextActive: {
    color: '#00b4d8',
  },
  observationCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  obsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  plateContainer: {
    flex: 1,
  },
  plateBadge: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 1,
  },
  complianceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  complianceGood: {
    backgroundColor: '#4caf50',
  },
  complianceBad: {
    backgroundColor: '#f44336',
  },
  complianceText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  obsDetails: {
    gap: 8,
  },
  obsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  obsText: {
    fontSize: 14,
    color: '#999',
  },
  obsFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  editText: {
    fontSize: 12,
    color: '#00b4d8',
    fontWeight: '600',
  },
});
