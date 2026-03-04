import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getDatabase } from '@/services/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { startTracking, stopTracking } from '@/services/trackingService';

export default function PatrolsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [patrols, setPatrols] = useState<any[]>([]);
  const [activePatrol, setActivePatrol] = useState<any>(null);

  useEffect(() => {
    loadPatrols();
    loadActivePatrol();
  }, []);

  const loadPatrols = async () => {
    try {
      const db = getDatabase();
      const profileStr = await AsyncStorage.getItem('user_profile');
      
      if (!profileStr) return;
      
      const profile = JSON.parse(profileStr);
      
      const result = await db.getAllAsync<any>(
        `SELECT p.*, z.name as zone_name 
         FROM patrols p 
         LEFT JOIN zones z ON p.zone_id = z.id 
         WHERE p.assigned_to = ? 
         ORDER BY p.patrol_date DESC 
         LIMIT 20`,
        profile.id
      );
      
      setPatrols(result || []);
    } catch (error) {
      console.error('Load patrols error:', error);
    }
  };

  const loadActivePatrol = async () => {
    const activePatrolStr = await AsyncStorage.getItem('active_patrol');
    if (activePatrolStr) {
      setActivePatrol(JSON.parse(activePatrolStr));
    }
  };

  const handleCheckIn = async (patrol: any) => {
    Alert.alert(
      'Start Patrol',
      `Check in to ${patrol.zone_name} - ${patrol.shift} shift?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Check In',
          onPress: async () => {
            try {
              const db = getDatabase();
              
              await db.runAsync(
                'UPDATE patrols SET status = ?, checked_in_at = ? WHERE id = ?',
                'in-progress',
                Date.now(),
                patrol.id
              );

              await AsyncStorage.setItem('active_patrol', JSON.stringify(patrol));
              setActivePatrol(patrol);

              // Start GPS tracking
              await startTracking('patrol');

              Alert.alert('Success', 'Patrol started - GPS tracking enabled');
              loadPatrols();
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          },
        },
      ]
    );
  };

  const handleCheckOut = async () => {
    if (!activePatrol) return;

    Alert.alert(
      'End Patrol',
      'Complete this patrol shift?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          onPress: async () => {
            try {
              const db = getDatabase();
              
              await db.runAsync(
                'UPDATE patrols SET status = ?, completed_at = ? WHERE id = ?',
                'completed',
                Date.now(),
                activePatrol.id
              );

              await AsyncStorage.removeItem('active_patrol');
              setActivePatrol(null);

              // Stop GPS tracking
              await stopTracking();

              Alert.alert('Success', 'Patrol completed');
              loadPatrols();
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          },
        },
      ]
    );
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const today = new Date();
    
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    }
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    }
    
    return date.toLocaleDateString();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Patrol Roster</Text>
        <TouchableOpacity onPress={loadPatrols}>
          <MaterialIcons name="refresh" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Active Patrol */}
        {activePatrol && (
          <View style={styles.activePatrolCard}>
            <View style={styles.activeHeader}>
              <MaterialIcons name="local-shipping" size={32} color="#4caf50" />
              <View style={styles.activeInfo}>
                <Text style={styles.activeTitle}>Active Patrol</Text>
                <Text style={styles.activeZone}>{activePatrol.zone_name}</Text>
              </View>
              <View style={styles.liveBadge}>
                <View style={styles.liveIndicator} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            </View>
            
            <TouchableOpacity style={styles.checkOutButton} onPress={handleCheckOut}>
              <MaterialIcons name="stop" size={20} color="#fff" />
              <Text style={styles.checkOutButtonText}>End Patrol</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Upcoming Patrols */}
        <Text style={styles.sectionTitle}>Scheduled Patrols</Text>
        
        {patrols.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="event-busy" size={64} color="#666" />
            <Text style={styles.emptyText}>No patrols scheduled</Text>
          </View>
        ) : (
          patrols.map((patrol) => (
            <View key={patrol.id} style={styles.patrolCard}>
              <View style={styles.patrolHeader}>
                <View style={styles.dateCircle}>
                  <Text style={styles.dateText}>
                    {new Date(patrol.patrol_date).getDate()}
                  </Text>
                  <Text style={styles.monthText}>
                    {new Date(patrol.patrol_date).toLocaleDateString('en-US', { month: 'short' })}
                  </Text>
                </View>

                <View style={styles.patrolInfo}>
                  <Text style={styles.zoneName}>{patrol.zone_name}</Text>
                  <Text style={styles.shiftText}>{patrol.shift} Shift</Text>
                  <Text style={styles.dateLabel}>{formatDate(patrol.patrol_date)}</Text>
                </View>

                <View
                  style={[
                    styles.statusBadge,
                    patrol.status === 'scheduled' && styles.statusScheduled,
                    patrol.status === 'in-progress' && styles.statusInProgress,
                    patrol.status === 'completed' && styles.statusCompleted,
                  ]}
                >
                  <Text style={styles.statusText}>
                    {patrol.status === 'in-progress' ? 'Active' : patrol.status}
                  </Text>
                </View>
              </View>

              {patrol.status === 'scheduled' && !activePatrol && (
                <TouchableOpacity
                  style={styles.checkInButton}
                  onPress={() => handleCheckIn(patrol)}
                >
                  <MaterialIcons name="play-arrow" size={20} color="#fff" />
                  <Text style={styles.checkInButtonText}>Start Patrol</Text>
                </TouchableOpacity>
              )}
            </View>
          ))
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
  content: {
    flex: 1,
    padding: 16,
  },
  activePatrolCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#4caf50',
  },
  activeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  activeInfo: {
    flex: 1,
  },
  activeTitle: {
    fontSize: 14,
    color: '#4caf50',
    fontWeight: '600',
  },
  activeZone: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginTop: 2,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f44336',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  liveIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  liveText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  checkOutButton: {
    flexDirection: 'row',
    backgroundColor: '#f44336',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  checkOutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
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
  patrolCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  patrolHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dateCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#00b4d8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  monthText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
    textTransform: 'uppercase',
  },
  patrolInfo: {
    flex: 1,
  },
  zoneName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  shiftText: {
    fontSize: 14,
    color: '#999',
    marginTop: 2,
  },
  dateLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusScheduled: {
    backgroundColor: '#ff9800',
  },
  statusInProgress: {
    backgroundColor: '#4caf50',
  },
  statusCompleted: {
    backgroundColor: '#666',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    textTransform: 'capitalize',
  },
  checkInButton: {
    flexDirection: 'row',
    backgroundColor: '#00b4d8',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  checkInButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
