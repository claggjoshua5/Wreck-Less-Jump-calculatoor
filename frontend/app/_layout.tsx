import React, { useState, useEffect, createContext, useContext } from 'react';
import { Stack } from 'expo-router';
import * as Device from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface SubscriptionContextType {
  isSubscribed: boolean;
  isLoading: boolean;
  deviceId: string;
  checkSubscription: () => Promise<void>;
  setSubscribed: (value: boolean) => void;
}

export const SubscriptionContext = createContext<SubscriptionContextType>({
  isSubscribed: false,
  isLoading: true,
  deviceId: '',
  checkSubscription: async () => {},
  setSubscribed: () => {},
});

export const useSubscription = () => useContext(SubscriptionContext);

// Generate or retrieve device ID
const getDeviceId = async (): Promise<string> => {
  let deviceId = await AsyncStorage.getItem('device_id');
  if (!deviceId) {
    // Generate a unique device ID
    deviceId = `device_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    await AsyncStorage.setItem('device_id', deviceId);
  }
  return deviceId;
};

export default function RootLayout() {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [deviceId, setDeviceId] = useState('');

  const checkSubscription = async () => {
    try {
      const id = await getDeviceId();
      setDeviceId(id);
      
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/subscription/status/${id}`);
      if (response.ok) {
        const data = await response.json();
        setIsSubscribed(data.is_active);
      }
    } catch (error) {
      console.error('Error checking subscription:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkSubscription();
  }, []);

  const setSubscribed = (value: boolean) => {
    setIsSubscribed(value);
  };

  return (
    <SubscriptionContext.Provider value={{ 
      isSubscribed, 
      isLoading, 
      deviceId, 
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
