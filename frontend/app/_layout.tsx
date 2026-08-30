import React, { useState, useEffect, createContext, useContext } from 'react';
import { Stack } from 'expo-router';
import { Platform } from 'react-native';
import {
  fetchJsonWithBackend,
  isBackendConfigured,
  TrialInfo,
} from '@/lib/appSupport';

interface SubscriptionContextType {
  isSubscribed: boolean;
  isLoading: boolean;
  deviceId: string;
  isTrial: boolean;
  trialInfo: TrialInfo | null;
  statusMessage: string;
  checkSubscription: () => Promise<void>;
  setSubscribed: (value: boolean) => void;
}

export const SubscriptionContext = createContext<SubscriptionContextType>({
  isSubscribed: false,
  isLoading: true,
  deviceId: '',
  isTrial: false,
  trialInfo: null,
  statusMessage: '',
  checkSubscription: async () => {},
  setSubscribed: () => {},
});

export const useSubscription = () => useContext(SubscriptionContext);

// Platform-agnostic storage
const storage = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    } else {
      // For native, use a simple in-memory fallback with persistence attempt
      try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        return await AsyncStorage.getItem(key);
      } catch {
        return null;
      }
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
    } else {
      try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        await AsyncStorage.setItem(key, value);
      } catch {
        // Silently fail on native if storage not available
      }
    }
  },
};

// Generate or retrieve device ID
const getDeviceId = async (): Promise<string> => {
  let deviceId = await storage.getItem('device_id');
  if (!deviceId) {
    // Generate a unique device ID
    deviceId = `device_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    await storage.setItem('device_id', deviceId);
  }
  return deviceId;
};

export default function RootLayout() {
  const [isSubscribed, setIsSubscribed] = useState(true);
  const [isLoading] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [isTrial, setIsTrial] = useState(false);
  const [trialInfo, setTrialInfo] = useState<TrialInfo | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

  const checkSubscription = async () => {
    try {
      const id = await getDeviceId();
      setDeviceId(id);
      
      if (!isBackendConfigured) {
        setIsSubscribed(true);
        setIsTrial(false);
        setTrialInfo(null);
        setStatusMessage('Offline mode enabled');
        return;
      }

      const data = await fetchJsonWithBackend<{
        is_active: boolean;
        is_trial?: boolean;
        trial_info?: TrialInfo | null;
        status_message?: string;
      }>(`/api/subscription/status/${id}`);
      setIsSubscribed(Boolean(data.is_active));
      setIsTrial(Boolean(data.is_trial));
      setTrialInfo(data.trial_info ?? null);
      setStatusMessage(data.status_message ?? '');
    } catch (error) {
      console.error('Error checking subscription:', error);
      setIsSubscribed(true);
      setIsTrial(false);
      setTrialInfo(null);
      setStatusMessage('Offline mode enabled');
    }
  };

  useEffect(() => {
    checkSubscription();
  }, []);

  const setSubscribed = (value: boolean) => {
    setIsSubscribed(value);
    setIsTrial(false);
  };

  return (
    <SubscriptionContext.Provider value={{ 
      isSubscribed, 
      isLoading, 
      deviceId, 
      isTrial,
      trialInfo,
      statusMessage,
      checkSubscription,
      setSubscribed 
    }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="paywall" />
        <Stack.Screen name="payment-success" />
        <Stack.Screen name="payment-cancel" />
      </Stack>
    </SubscriptionContext.Provider>
  );
}
