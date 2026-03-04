import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getDatabase } from '@/services/database';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Message {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  message: string;
  timestamp: number;
  read: boolean;
}

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [userProfile, setUserProfile] = useState<any>(null);

  useEffect(() => {
    loadMessages();
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const profileStr = await AsyncStorage.getItem('user_profile');
    if (profileStr) {
      setUserProfile(JSON.parse(profileStr));
    }
  };

  const loadMessages = async () => {
    try {
      const db = getDatabase();
      const result = await db.getAllAsync<Message>(
        `SELECT * FROM messages ORDER BY timestamp DESC LIMIT 50`
      );
      setMessages(result || []);
    } catch (error) {
      console.error('Load messages error:', error);
      // If table doesn't exist, create it
      await createMessagesTable();
    }
  };

  const createMessagesTable = async () => {
    try {
      const db = getDatabase();
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          sender_id TEXT,
          sender_name TEXT,
          sender_role TEXT,
          recipient_id TEXT,
          message TEXT,
          timestamp INTEGER,
          read INTEGER DEFAULT 0,
          synced INTEGER DEFAULT 0
        );
      `);
    } catch (error) {
      console.error('Create messages table error:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) {
      Alert.alert('Error', 'Please enter a message');
      return;
    }

    try {
      const db = getDatabase();
      
      const messageId = Date.now().toString();
      await db.runAsync(
        `INSERT INTO messages (
          id, sender_id, sender_name, sender_role, recipient_id,
          message, timestamp, read, synced
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        messageId,
        userProfile?.id || '',
        `${userProfile?.first_name} ${userProfile?.last_name}`,
        userProfile?.role || 'officer',
        'admin', // Send to admin
        newMessage,
        Date.now(),
        0,
        0
      );

      setNewMessage('');
      loadMessages();
      
      Alert.alert('Success', 'Message sent to admin');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={insets.top}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Messages</Text>
        <TouchableOpacity onPress={loadMessages}>
          <MaterialIcons name="refresh" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Messages List */}
      <ScrollView style={styles.messagesList} contentContainerStyle={styles.messagesContent}>
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="chat-bubble-outline" size={64} color="#666" />
            <Text style={styles.emptyText}>No messages</Text>
            <Text style={styles.emptySubtext}>Start a conversation with admin</Text>
          </View>
        ) : (
          messages.map((message) => (
            <View
              key={message.id}
              style={[
                styles.messageCard,
                message.sender_id === userProfile?.id && styles.messageCardSent,
              ]}
            >
              <View style={styles.messageHeader}>
                <Text style={styles.senderName}>{message.sender_name}</Text>
                <Text style={styles.senderRole}>{message.sender_role}</Text>
              </View>
              <Text style={styles.messageText}>{message.message}</Text>
              <Text style={styles.messageTime}>
                {new Date(message.timestamp).toLocaleString()}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* Message Input */}
      <View style={[styles.inputContainer, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={styles.input}
          placeholder="Type a message to admin..."
          placeholderTextColor="#666"
          value={newMessage}
          onChangeText={setNewMessage}
          multiline
          maxLength={500}
        />
        <TouchableOpacity style={styles.sendButton} onPress={handleSendMessage}>
          <MaterialIcons name="send" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
  messagesList: {
    flex: 1,
  },
  messagesContent: {
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
  messageCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
    maxWidth: '80%',
  },
  messageCardSent: {
    backgroundColor: '#00b4d822',
    borderColor: '#00b4d8',
    alignSelf: 'flex-end',
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  senderName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  senderRole: {
    fontSize: 12,
    color: '#999',
    textTransform: 'capitalize',
  },
  messageText: {
    fontSize: 14,
    color: '#fff',
    lineHeight: 20,
  },
  messageTime: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#1a1a1a',
    borderTopWidth: 1,
    borderTopColor: '#333',
    gap: 12,
  },
  input: {
    flex: 1,
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#fff',
    maxHeight: 100,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#00b4d8',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
