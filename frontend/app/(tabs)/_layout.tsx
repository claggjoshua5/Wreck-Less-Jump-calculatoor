import React from 'react';
import { Tabs, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, ActivityIndicator, View, Text, StyleSheet } from 'react-native';
import { useSubscription } from '../_layout';

// Tab bar icon components defined outside of render
const CalculatorIcon = ({ color, size }: { color: string; size: number }) => (
  <Ionicons name="calculator" size={size} color={color} />
);

const MeasureIcon = ({ color, size }: { color: string; size: number }) => (
  <Ionicons name="camera" size={size} color={color} />
);

const SavedIcon = ({ color, size }: { color: string; size: number }) => (
  <Ionicons name="bookmark" size={size} color={color} />
);

const MapIcon = ({ color, size }: { color: string; size: number }) => (
  <Ionicons name="map" size={size} color={color} />
);

export default function TabLayout() {
  const { isSubscribed, isLoading, isTrial, trialInfo } = useSubscription();

  // Show loading while checking subscription
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' }}>
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  // Redirect to paywall if not subscribed and not on trial
  if (!isSubscribed) {
    return <Redirect href="/paywall" />;
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Trial Banner */}
      {isTrial && trialInfo && (
        <View style={styles.trialBanner}>
          <Ionicons name="time" size={16} color="#fff" />
          <Text style={styles.trialBannerText}>
            Free Trial: {trialInfo.trial_days_remaining?.toFixed(1)} days remaining
          </Text>
        </View>
      )}
      
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#1A1A1A',
            borderTopColor: '#333',
            borderTopWidth: 1,
            paddingBottom: Platform.OS === 'ios' ? 20 : 8,
            paddingTop: 8,
            height: Platform.OS === 'ios' ? 85 : 65,
          },
          tabBarActiveTintColor: '#FF6B35',
          tabBarInactiveTintColor: '#888',
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '600',
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Calculator',
            tabBarIcon: CalculatorIcon,
          }}
        />
        <Tabs.Screen
          name="measure"
          options={{
            title: 'Measure',
            tabBarIcon: MeasureIcon,
          }}
        />
        <Tabs.Screen
          name="saved"
          options={{
            title: 'Saved',
            tabBarIcon: SavedIcon,
          }}
        />
        <Tabs.Screen
          name="map"
          options={{
            title: 'Map',
            tabBarIcon: MapIcon,
          }}
        />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  trialBanner: {
    backgroundColor: '#FF9800',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
  },
  trialBannerText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
