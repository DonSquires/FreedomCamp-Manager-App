import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '@/services/supabase';
import { downloadOrganizationData, storeDataLocally } from '@/services/syncService';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function SyncScreen() {
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [currentTask, setCurrentTask] = useState('Initializing...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    performInitialSync();
  }, []);

  const performInitialSync = async () => {
    try {
      // Step 1: Get user profile
      setCurrentTask('Fetching user profile...');
      setProgress(10);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');

      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;

      // Store user profile
      await AsyncStorage.setItem('user_profile', JSON.stringify(profile));

      setProgress(20);

      // Step 2: Download organization data
      setCurrentTask('Downloading zones...');
      setProgress(30);

      const { success, error: downloadError, data } = await downloadOrganizationData(
        profile.organization_id,
        7 // Last 7 days
      );

      if (!success || !data) {
        throw new Error(downloadError || 'Failed to download data');
      }

      setProgress(50);

      // Step 3: Store data locally
      setCurrentTask('Storing data locally...');
      setProgress(60);

      await storeDataLocally(data);

      setProgress(80);

      // Step 4: Calculate data size
      const dataSize = (
        (data.zones?.length || 0) +
        (data.flagged_vehicles?.length || 0) +
        (data.recent_observations?.length || 0) +
        (data.canonical_vehicles?.length || 0)
      );

      setCurrentTask(`Sync complete! ${dataSize} records cached`);
      setProgress(100);

      // Navigate to dashboard after 1 second
      setTimeout(() => {
        router.replace('/(tabs)');
      }, 1000);

    } catch (err: any) {
      console.error('Sync error:', err);
      setError(err.message);
      Alert.alert(
        'Sync Failed',
        'Unable to download organization data. Please check your connection and try again.',
        [
          { text: 'Retry', onPress: () => performInitialSync() },
          { text: 'Logout', onPress: () => router.replace('/login') },
        ]
      );
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <MaterialIcons name="cloud-download" size={80} color="#00b4d8" />
        
        <Text style={styles.title}>Syncing Organization Data</Text>
        <Text style={styles.subtitle}>{currentTask}</Text>

        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.progressText}>{progress}%</Text>
        </View>

        {!error && <ActivityIndicator size="large" color="#00b4d8" style={styles.loader} />}
        
        {error && (
          <View style={styles.errorContainer}>
            <MaterialIcons name="error" size={48} color="#f44336" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Text style={styles.hint}>This may take 30-60 seconds on mobile data</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginTop: 24,
  },
  subtitle: {
    fontSize: 16,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  progressContainer: {
    width: '100%',
    marginTop: 32,
    gap: 8,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#00b4d8',
  },
  progressText: {
    color: '#00b4d8',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  loader: {
    marginTop: 32,
  },
  errorContainer: {
    alignItems: 'center',
    marginTop: 32,
    gap: 16,
  },
  errorText: {
    color: '#f44336',
    fontSize: 14,
    textAlign: 'center',
  },
  hint: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 48,
  },
});
