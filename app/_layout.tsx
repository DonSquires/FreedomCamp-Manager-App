import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { initDatabase } from '@/services/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, View } from 'react-native';

function RootLayoutNav() {
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Initialize database
      await initDatabase();
      
      // Check if user is logged in
      const session = await AsyncStorage.getItem('user_session');
      const userProfile = await AsyncStorage.getItem('user_profile');
      
      setIsAuthenticated(!!(session && userProfile));
      setIsReady(true);
    } catch (error) {
      console.error('App initialization error:', error);
      setIsReady(true);
    }
  };

  useEffect(() => {
    if (!isReady) return;

    const inAuthGroup = segments[0] === '(tabs)';
    const allowedRoutes = ['sync', 'settings', 'photos', 'analytics', 'vehicle-details', 'zone-create', 'observation-edit', 'jobs', 'enforcement', 'patrols', 'messages', 'notifications'];
    const currentRoute = segments[0];

    // Re-check authentication when navigating to protected routes
    if (inAuthGroup) {
      checkAuth();
    }

    if (!isAuthenticated && inAuthGroup) {
      // Redirect to login if not authenticated
      router.replace('/login');
    } else if (isAuthenticated && !inAuthGroup && !allowedRoutes.includes(currentRoute)) {
      // Redirect to tabs if authenticated and not in an allowed route
      router.replace('/(tabs)');
    }
  }, [isReady, isAuthenticated, segments]);

  const checkAuth = async () => {
    const session = await AsyncStorage.getItem('user_session');
    const userProfile = await AsyncStorage.getItem('user_profile');
    const isAuth = !!(session && userProfile);
    
    if (isAuth !== isAuthenticated) {
      setIsAuthenticated(isAuth);
    }
  };

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' }}>
        <ActivityIndicator size="large" color="#00b4d8" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="sync" options={{ headerShown: false }} />

        <Stack.Screen name="vehicle-details" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="photos" options={{ headerShown: false }} />
        <Stack.Screen name="analytics" options={{ headerShown: false }} />
        <Stack.Screen name="zone-create" options={{ headerShown: false }} />
      <Stack.Screen name="observation-edit" options={{ headerShown: false }} />
        <Stack.Screen name="jobs" options={{ headerShown: false }} />
        <Stack.Screen name="enforcement" options={{ headerShown: false }} />
        <Stack.Screen name="patrols" options={{ headerShown: false }} />
        <Stack.Screen name="messages" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <RootLayoutNav />
    </SafeAreaProvider>
  );
}
