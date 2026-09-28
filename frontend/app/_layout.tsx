import React, { useState, useEffect, createContext, useContext } from 'react';
import { Stack } from 'expo-router';
import {
  fetchJsonWithBackend,
  getDeviceId,
  isBackendConfigured,
  isPaywallEnabled,
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

export default function RootLayout() {
  const [isSubscribed, setIsSubscribed] = useState(!isPaywallEnabled);
  const [isLoading, setIsLoading] = useState(isPaywallEnabled);
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
        setIsLoading(false);
        return;
      }

      if (!isPaywallEnabled) {
        setIsSubscribed(true);
        setIsTrial(false);
        setTrialInfo(null);
        setStatusMessage('Backend connected; subscriptions disabled');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
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
      setIsLoading(false);
    } catch (error) {
      console.error('Error checking subscription:', error);
      setIsSubscribed(true);
      setIsTrial(false);
      setTrialInfo(null);
      setStatusMessage('Offline mode enabled');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Initialize device ID immediately without blocking app startup
    getDeviceId().then(id => setDeviceId(id)).catch(console.error);
    
    // Run subscription check in background (non-blocking)
    checkSubscription().catch(console.error);
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
