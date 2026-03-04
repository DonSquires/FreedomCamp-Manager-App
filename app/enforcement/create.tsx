import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getDatabase } from '@/services/database';
import { getCurrentLocation } from '@/services/trackingService';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ACTION_TYPES = [
  { value: 'verbal_warning', label: 'Verbal Warning', icon: 'record-voice-over' },
  { value: 'written_warning', label: 'Written Warning', icon: 'description' },
  { value: 'notice_to_vacate', label: 'Notice to Vacate', icon: 'exit-to-app' },
  { value: 'tow_request', label: 'Tow Request', icon: 'local-shipping' },
];

const DELIVERY_METHODS = [
  { value: 'in_person', label: 'In Person' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'windscreen', label: 'Windscreen Notice' },
];

export default function CreateEnforcementScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const [actionType, setActionType] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [notes, setNotes] = useState('');

  const handleCreate = async () => {
    if (!actionType) {
      Alert.alert('Error', 'Please select an action type');
      return;
    }

    if (!deliveryMethod) {
      Alert.alert('Error', 'Please select a delivery method');
      return;
    }

    Alert.alert(
      'Create Enforcement Action',
      `Issue ${ACTION_TYPES.find(a => a.value === actionType)?.label}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create',
          onPress: async () => {
            try {
              const db = getDatabase();
              const profileStr = await AsyncStorage.getItem('user_profile');
              const profile = profileStr ? JSON.parse(profileStr) : null;
              
              const location = await getCurrentLocation();

              await db.runAsync(
                `INSERT INTO enforcement_actions (
                  id, organization_id, plate_number, zone_id,
                  action_type, delivery_method, recipient_name,
                  recipient_email, recipient_phone, gps_latitude,
                  gps_longitude, notes, status, recorded_at,
                  created_at, synced
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                Date.now().toString(),
                profile?.organization_id || '',
                params.plateNumber || '',
                params.zoneId || '',
                actionType,
                deliveryMethod,
                recipientName,
                recipientEmail,
                recipientPhone,
                location?.coords.latitude || 0,
                location?.coords.longitude || 0,
                notes,
                'pending',
                Date.now(),
                Date.now(),
                0
              );

              Alert.alert('Success', 'Enforcement action created', [
                { text: 'OK', onPress: () => router.back() }
              ]);
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Enforcement Action</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Vehicle Info */}
        {params.plateNumber && (
          <View style={styles.infoCard}>
            <Text style={styles.plateNumber}>{params.plateNumber}</Text>
            {params.zoneName && (
              <Text style={styles.zoneText}>at {params.zoneName}</Text>
            )}
          </View>
        )}

        {/* Action Type */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Action Type *</Text>
          {ACTION_TYPES.map((action) => (
            <TouchableOpacity
              key={action.value}
              style={[
                styles.optionCard,
                actionType === action.value && styles.optionCardSelected,
              ]}
              onPress={() => setActionType(action.value)}
            >
              <MaterialIcons
                name={action.icon as any}
                size={24}
                color={actionType === action.value ? '#00b4d8' : '#999'}
              />
              <Text
                style={[
                  styles.optionText,
                  actionType === action.value && styles.optionTextSelected,
                ]}
              >
                {action.label}
              </Text>
              {actionType === action.value && (
                <MaterialIcons name="check-circle" size={24} color="#00b4d8" />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Delivery Method */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery Method *</Text>
          {DELIVERY_METHODS.map((method) => (
            <TouchableOpacity
              key={method.value}
              style={[
                styles.optionCard,
                deliveryMethod === method.value && styles.optionCardSelected,
              ]}
              onPress={() => setDeliveryMethod(method.value)}
            >
              <Text
                style={[
                  styles.optionText,
                  deliveryMethod === method.value && styles.optionTextSelected,
                ]}
              >
                {method.label}
              </Text>
              {deliveryMethod === method.value && (
                <MaterialIcons name="check-circle" size={24} color="#00b4d8" />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Recipient Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recipient Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter recipient name"
            placeholderTextColor="#666"
            value={recipientName}
            onChangeText={setRecipientName}
          />
        </View>

        {deliveryMethod === 'email' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recipient Email</Text>
            <TextInput
              style={styles.input}
              placeholder="email@example.com"
              placeholderTextColor="#666"
              keyboardType="email-address"
              autoCapitalize="none"
              value={recipientEmail}
              onChangeText={setRecipientEmail}
            />
          </View>
        )}

        {deliveryMethod === 'phone' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recipient Phone</Text>
            <TextInput
              style={styles.input}
              placeholder="027 123 4567"
              placeholderTextColor="#666"
              keyboardType="phone-pad"
              value={recipientPhone}
              onChangeText={setRecipientPhone}
            />
          </View>
        )}

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <TextInput
            style={styles.textArea}
            placeholder="Additional details..."
            placeholderTextColor="#666"
            multiline
            numberOfLines={6}
            value={notes}
            onChangeText={setNotes}
          />
        </View>

        {/* Create Button */}
        <TouchableOpacity style={styles.createButton} onPress={handleCreate}>
          <MaterialIcons name="check" size={24} color="#fff" />
          <Text style={styles.createButtonText}>Create Enforcement Action</Text>
        </TouchableOpacity>

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
  infoCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
  },
  plateNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  zoneText: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
    marginBottom: 8,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#333',
    gap: 12,
  },
  optionCardSelected: {
    borderColor: '#00b4d8',
    backgroundColor: '#00b4d822',
  },
  optionText: {
    flex: 1,
    fontSize: 14,
    color: '#999',
  },
  optionTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: '#fff',
  },
  textArea: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: '#fff',
    minHeight: 120,
    textAlignVertical: 'top',
  },
  createButton: {
    flexDirection: 'row',
    backgroundColor: '#00b4d8',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
