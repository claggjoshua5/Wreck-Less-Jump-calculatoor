import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import {
  EmergencySettings,
  getDeviceId,
  getEmergencySettings,
  isBackendConfigured,
  updateEmergencySettings,
} from '@/lib/appSupport';

export default function EmergencySettingsScreen() {
  const [settings, setSettings] = useState<EmergencySettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const deviceId = await getDeviceId();
      setSettings(await getEmergencySettings(deviceId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load emergency settings.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadSettings();
    }, [loadSettings])
  );

  const updateSetting = async (update: {
    allow_notifications?: boolean;
    location_sharing_enabled?: boolean;
    location?: { latitude: number; longitude: number };
  }) => {
    setIsSaving(true);
    setError('');
    try {
      const deviceId = await getDeviceId();
      setSettings(await updateEmergencySettings(deviceId, update));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save emergency settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const setLocationSharing = async (enabled: boolean) => {
    if (!enabled) {
      await updateSetting({ location_sharing_enabled: false });
      return;
    }

    setIsSaving(true);
    setError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setError('Location permission was not granted. Sharing remains off. You can allow location access in your device settings.');
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const deviceId = await getDeviceId();
      setSettings(
        await updateEmergencySettings(deviceId, {
          location_sharing_enabled: true,
          location: {
            latitude: current.coords.latitude,
            longitude: current.coords.longitude,
          },
        })
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to enable location sharing. Sharing remains off.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Ionicons name="heart" size={30} color="#FF6B35" />
          <Text style={styles.title}>Emergency Settings</Text>
        </View>
        <Text style={styles.subtitle}>Choose how your device participates in nearby-rider features.</Text>

        <View style={styles.notice}>
          <Ionicons name="cloud-offline-outline" size={20} color="#FFB74D" />
          <Text style={styles.noticeText}>
            Nearby-rider features require a configured, online backend.{' '}
            {isBackendConfigured
              ? 'If the backend is unreachable, settings are saved only on this device and are not shared with other riders.'
              : 'No backend is configured, so settings are saved only on this device and are not shared with other riders.'}
          </Text>
        </View>

        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#FF6B35" />
            <Text style={styles.loadingText}>Loading emergency settings…</Text>
          </View>
        ) : (
          <>
            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity onPress={() => void loadSettings()} accessibilityRole="button">
                  <Text style={styles.retryText}>Try again</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {settings && (
              <>
                <View style={styles.settingCard}>
                  <View style={styles.settingCopy}>
                    <Text style={styles.settingTitle}>Share my location with nearby riders</Text>
                    <Text style={styles.settingDescription}>
                      Shares your last known location for nearby matching while this is on.
                    </Text>
                  </View>
                  <Switch
                    value={settings.location_sharing_enabled}
                    onValueChange={(value) => void setLocationSharing(value)}
                    disabled={isSaving}
                    trackColor={{ false: '#555', true: '#FF6B35' }}
                    thumbColor="#fff"
                    accessibilityLabel="Share my location with nearby riders"
                  />
                </View>
                <Text style={styles.locationState}>
                  {settings.has_location ? 'A last known location is stored.' : 'No location is currently stored.'}
                </Text>

                <View style={styles.settingCard}>
                  <View style={styles.settingCopy}>
                    <Text style={styles.settingTitle}>Receive nearby rider alerts</Text>
                    <Text style={styles.settingDescription}>
                      Alert delivery to other riders is not available yet. This only controls whether your device is counted as nearby.
                    </Text>
                  </View>
                  <Switch
                    value={settings.allow_notifications}
                    onValueChange={(value) => void updateSetting({ allow_notifications: value })}
                    disabled={isSaving}
                    trackColor={{ false: '#555', true: '#FF6B35' }}
                    thumbColor="#fff"
                    accessibilityLabel="Receive nearby rider alerts"
                  />
                </View>
              </>
            )}
          </>
        )}

        <View style={styles.privacyCard}>
          <Text style={styles.sectionTitle}>Your location and privacy</Text>
          <Text style={styles.privacyText}>
            While sharing is on, the app stores your last known location. Its exact coordinates are never shown to other riders; the server uses them only to count opted-in riders within 5 miles when an alert is requested.
          </Text>
          <Text style={styles.privacyText}>
            Turn sharing off at any time to delete the stored location. Location access is used only while the app is in use.
          </Text>
          <Text style={styles.disclaimer}>
            This feature is NOT a substitute for calling 911. In an emergency, call 911 directly.
          </Text>
        </View>

        {isSaving && <ActivityIndicator style={styles.saving} color="#FF6B35" />}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  content: {
    padding: 20,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  title: {
    color: '#fff',
    fontSize: 26,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#aaa',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(255, 152, 0, 0.1)',
    borderColor: 'rgba(255, 152, 0, 0.3)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  noticeText: {
    flex: 1,
    color: '#FFB74D',
    fontSize: 13,
    lineHeight: 19,
  },
  loading: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    color: '#aaa',
    fontSize: 14,
  },
  errorBox: {
    backgroundColor: 'rgba(244, 67, 54, 0.12)',
    borderColor: 'rgba(244, 67, 54, 0.35)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  errorText: {
    color: '#ff8a80',
    fontSize: 14,
    lineHeight: 20,
  },
  retryText: {
    color: '#FF6B35',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
  },
  settingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    padding: 16,
    gap: 12,
    marginBottom: 8,
  },
  settingCopy: {
    flex: 1,
  },
  settingTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  settingDescription: {
    color: '#aaa',
    fontSize: 13,
    lineHeight: 18,
  },
  locationState: {
    color: '#888',
    fontSize: 12,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  privacyCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    padding: 16,
    marginTop: 12,
    gap: 12,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
  },
  privacyText: {
    color: '#bbb',
    fontSize: 13,
    lineHeight: 20,
  },
  disclaimer: {
    color: '#FFB74D',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  saving: {
    marginTop: 16,
  },
});
