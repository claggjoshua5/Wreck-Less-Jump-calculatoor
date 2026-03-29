import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';

// Tab bar icon components defined outside of render
const CalculatorIcon = ({ color, size }: { color: string; size: number }) => (
  <Ionicons name="calculator" size={size} color={color} />
);

const SavedIcon = ({ color, size }: { color: string; size: number }) => (
  <Ionicons name="bookmark" size={size} color={color} />
);

const MapIcon = ({ color, size }: { color: string; size: number }) => (
  <Ionicons name="map" size={size} color={color} />
);

export default function TabLayout() {
  return (
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
  );
}
