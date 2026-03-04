import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface StatusHeaderProps {
  currentZone?: string | null;
}

export default function StatusHeader({ currentZone }: StatusHeaderProps) {
  const [organizationName, setOrganizationName] = useState<string>('');
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    loadOrganization();
    
    // Update time every minute
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, []);

  const loadOrganization = async () => {
    try {
      const profileStr = await AsyncStorage.getItem('user_profile');
      if (profileStr) {
        const profile = JSON.parse(profileStr);
        // Get organization name from profile or use organization_id
        setOrganizationName(profile.organization_name || 'JDE Security');
      }
    } catch (error) {
      console.error('Error loading organization:', error);
    }
  };

  const formatDate = (date: Date): string => {
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    };
    return date.toLocaleDateString('en-NZ', options);
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('en-NZ', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {/* Organization */}
        <View style={styles.item}>
          <MaterialIcons name="business" size={14} color="#00b4d8" />
          <Text style={styles.label}>Org:</Text>
          <Text style={styles.value}>{organizationName}</Text>
        </View>

        {/* Zone */}
        <View style={styles.item}>
          <MaterialIcons name="location-on" size={14} color="#00b4d8" />
          <Text style={styles.label}>Zone:</Text>
          <Text style={styles.value}>{currentZone || 'Not Set'}</Text>
        </View>
      </View>

      <View style={styles.row}>
        {/* Date */}
        <View style={styles.item}>
          <MaterialIcons name="calendar-today" size={14} color="#00b4d8" />
          <Text style={styles.value}>{formatDate(currentTime)}</Text>
        </View>

        {/* Time */}
        <View style={styles.item}>
          <MaterialIcons name="access-time" size={14} color="#00b4d8" />
          <Text style={styles.value}>{formatTime(currentTime)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  label: {
    fontSize: 11,
    color: '#999',
    fontWeight: '500',
  },
  value: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
  },
});
