import React, { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import { Stack } from 'expo-router';
import { AppState, InteractionManager } from 'react-native';
import * as Location from 'expo-location';
import {
  fetchJsonWithBackend,
  getDeviceId,
  getEmergencySettings,
  isBackendConfigured,
  isPaywallEnabled,
  TrialInfo,
  updateEmergencySettings,
} from '@/lib/appSupport';

const EMERGENCY_LOCATION_SYNC_INTERVAL_MS = 5 * 60 * 1000;

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
  const isMountedRef = useRef(true);
  const lastEmergencyLocationSyncAtRef = useRef(0);
  const emergencyLocationSyncInProgressRef = useRef(false);

  const checkSubscription = useCallback(async () => {
    try {
      const id = await getDeviceId();
      if (!isMountedRef.current) {
        return;
      }

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

      if (!isMountedRef.current) {
        return;
      }

      setIsSubscribed(Boolean(data.is_active));
      setIsTrial(Boolean(data.is_trial));
      setTrialInfo(data.trial_info ?? null);
      setStatusMessage(data.status_message ?? '');
      setIsLoading(false);
    } catch (error) {
      console.error('Error checking subscription:', error);
      if (!isMountedRef.current) {
        return;
      }

      setIsSubscribed(true);
      setIsTrial(false);
      setTrialInfo(null);
      setStatusMessage('Offline mode enabled');
      setIsLoading(false);
    }
  }, []);

  const syncEmergencyLocation = useCallback(async () => {
    const now = Date.now();
    if (
      AppState.currentState !== 'active' ||
      now - lastEmergencyLocationSyncAtRef.current < EMERGENCY_LOCATION_SYNC_INTERVAL_MS ||
      emergencyLocationSyncInProgressRef.current
    ) {
      return;
    }

    lastEmergencyLocationSyncAtRef.current = now;
    emergencyLocationSyncInProgressRef.current = true;
    try {
      const deviceId = await getDeviceId();
      const settings = await getEmergencySettings(deviceId);
      if (!settings.location_sharing_enabled) {
        return;
      }

      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (AppState.currentState !== 'active') {
        return;
      }

      await updateEmergencySettings(deviceId, {
        location: {
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
        },
      });
    } catch {
      // Location refresh is best-effort; settings remain available offline.
    } finally {
      emergencyLocationSyncInProgressRef.current = false;
    }
  }, []);

  useEffect(() => {
    void syncEmergencyLocation();
    const interval = setInterval(() => {
      void syncEmergencyLocation();
    }, EMERGENCY_LOCATION_SYNC_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void syncEmergencyLocation();
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [syncEmergencyLocation]);

  useEffect(() => {
    isMountedRef.current = true;
    const task = InteractionManager.runAfterInteractions(() => {
      void checkSubscription();
    });

    return () => {
      task.cancel();
      isMountedRef.current = false;
    };
  }, [checkSubscription]);

  const setSubscribed = useCallback((value: boolean) => {
    setIsSubscribed(value);
    setIsTrial(false);
  }, []);

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
