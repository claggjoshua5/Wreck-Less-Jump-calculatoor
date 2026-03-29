import React, { useState } from 'react';
import {
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useSubscription } from './_layout';

const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function PaywallScreen() {
  const { deviceId, checkSubscription } = useSubscription();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubscribe = async () => {
    setIsLoading(true);
    setError('');

    try {
      // Get current origin URL
      const originUrl = Platform.OS === 'web' 
        ? window.location.origin 
        : EXPO_PUBLIC_BACKEND_URL;

      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/payments/create-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          origin_url: originUrl,
          device_id: deviceId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }

      const data = await response.json();

      // Open Stripe Checkout
      if (Platform.OS === 'web') {
        window.location.href = data.checkout_url;
      } else {
        const result = await WebBrowser.openBrowserAsync(data.checkout_url);
        // After browser closes, check subscription status
        if (result.type === 'cancel' || result.type === 'dismiss') {
          await checkSubscription();
        }
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const features = [
    { icon: 'calculator', title: 'Jump Calculator', description: 'Calculate exact speed for any gap' },
    { icon: 'analytics', title: 'Trajectory Animation', description: 'Visualize your flight path' },
    { icon: 'bookmark', title: 'Save & Share', description: 'Save calculations with location' },
    { icon: 'map', title: 'Jump Map', description: 'See jump locations worldwide' },
    { icon: 'shield-checkmark', title: 'Safety Warnings', description: 'Get important safety alerts' },
    { icon: 'sync', title: 'Monthly Updates', description: 'New features every month' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Logo/Header */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Ionicons name="speedometer" size={60} color="#FF6B35" />
          </View>
          <Text style={styles.title}>Dirt Bike Jump Calculator</Text>
          <Text style={styles.subtitle}>Professional jump calculations at your fingertips</Text>
        </View>

        {/* Features */}
        <View style={styles.featuresContainer}>
          {features.map((feature, index) => (
            <View key={index} style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <Ionicons name={feature.icon as any} size={24} color="#FF6B35" />
              </View>
              <View style={styles.featureContent}>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDescription}>{feature.description}</Text>
              </View>
              <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
            </View>
          ))}
        </View>

        {/* Pricing Card */}
        <View style={styles.pricingCard}>
          <View style={styles.pricingHeader}>
            <Text style={styles.pricingLabel}>MONTHLY SUBSCRIPTION</Text>
          </View>
          <View style={styles.priceRow}>
            <Text style={styles.currencySymbol}>$</Text>
            <Text style={styles.priceAmount}>2</Text>
            <Text style={styles.pricePeriod}>/month</Text>
          </View>
          <Text style={styles.pricingNote}>Cancel anytime</Text>
        </View>

        {/* Error Message */}
        {error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={20} color="#F44336" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Subscribe Button */}
        <TouchableOpacity
          style={[styles.subscribeButton, isLoading && styles.subscribeButtonDisabled]}
          onPress={handleSubscribe}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="card" size={24} color="#fff" />
              <Text style={styles.subscribeButtonText}>Subscribe Now</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Terms */}
        <Text style={styles.terms}>
          By subscribing, you agree to our Terms of Service and Privacy Policy. 
          Your subscription will automatically renew each month until cancelled.
        </Text>

        {/* Secure Payment Badge */}
        <View style={styles.securePayment}>
          <Ionicons name="lock-closed" size={16} color="#888" />
          <Text style={styles.securePaymentText}>Secure payment via Stripe</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
  },
  featuresContainer: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  featureDescription: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  pricingCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#FF6B35',
  },
  pricingHeader: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
  },
  pricingLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  currencySymbol: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
  },
  priceAmount: {
    fontSize: 64,
    fontWeight: 'bold',
    color: '#fff',
  },
  pricePeriod: {
    fontSize: 18,
    color: '#888',
    marginTop: 32,
  },
  pricingNote: {
    fontSize: 14,
    color: '#4CAF50',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    color: '#F44336',
    fontSize: 14,
    flex: 1,
  },
  subscribeButton: {
    backgroundColor: '#FF6B35',
    borderRadius: 12,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 16,
  },
  subscribeButtonDisabled: {
    opacity: 0.6,
  },
  subscribeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  terms: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  securePayment: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  securePaymentText: {
    fontSize: 13,
    color: '#888',
  },
});
