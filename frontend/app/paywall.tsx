import React, { useState } from 'react';
import {
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useSubscription } from './_layout';

const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function PaywallScreen() {
  const { deviceId, checkSubscription, trialInfo } = useSubscription();
  const [isLoading, setIsLoading] = useState(false);
  const [isTrialLoading, setIsTrialLoading] = useState(false);
  const [error, setError] = useState('');

  const handleStartTrial = async () => {
    setIsTrialLoading(true);
    setError('');

    try {
      const originUrl = Platform.OS === 'web' 
        ? window.location.origin 
        : EXPO_PUBLIC_BACKEND_URL;

      // Call the trial endpoint (requires credit card)
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/payments/start-trial`, {
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
        throw new Error('Failed to create trial checkout session');
      }

      const data = await response.json();

      // Open Stripe Checkout for trial (card required but not charged)
      if (Platform.OS === 'web') {
        window.location.href = data.checkout_url;
      } else {
        const result = await WebBrowser.openBrowserAsync(data.checkout_url);
        if (result.type === 'cancel' || result.type === 'dismiss') {
          await checkSubscription();
        }
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsTrialLoading(false);
    }
  };

  const handleSubscribe = async () => {
    setIsLoading(true);
    setError('');

    try {
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

      if (Platform.OS === 'web') {
        window.location.href = data.checkout_url;
      } else {
        const result = await WebBrowser.openBrowserAsync(data.checkout_url);
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
          <Image
            source={require('../assets/images/wreckless-logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
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

        {/* Free Trial Card */}
        <View style={styles.trialCard}>
          <View style={styles.trialHeader}>
            <Text style={styles.trialLabel}>START FREE</Text>
          </View>
          <View style={styles.trialContent}>
            <Text style={styles.trialDays}>3</Text>
            <Text style={styles.trialDaysLabel}>Day Free Trial</Text>
          </View>
          <View style={styles.trialInfo}>
            <Ionicons name="card" size={16} color="#888" />
            <Text style={styles.trialInfoText}>Credit card required</Text>
          </View>
          <Text style={styles.trialNote}>You won't be charged until trial ends</Text>
        </View>

        {/* Pricing Card */}
        <View style={styles.pricingCard}>
          <View style={styles.pricingHeader}>
            <Text style={styles.pricingLabel}>THEN $2/MONTH</Text>
          </View>
          <Text style={styles.pricingNote}>Cancel anytime before trial ends</Text>
        </View>

        {/* Error Message */}
        {error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={20} color="#F44336" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Start Trial Button */}
        <TouchableOpacity
          style={[styles.trialButton, isTrialLoading && styles.buttonDisabled]}
          onPress={handleStartTrial}
          disabled={isTrialLoading || isLoading}
        >
          {isTrialLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="rocket" size={24} color="#fff" />
              <Text style={styles.trialButtonText}>Start 3-Day Free Trial</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Or Subscribe Now */}
        <View style={styles.orContainer}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>or</Text>
          <View style={styles.orLine} />
        </View>

        {/* Subscribe Button */}
        <TouchableOpacity
          style={[styles.subscribeButton, isLoading && styles.buttonDisabled]}
          onPress={handleSubscribe}
          disabled={isLoading || isTrialLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#FF6B35" />
          ) : (
            <>
              <Ionicons name="card" size={24} color="#FF6B35" />
              <Text style={styles.subscribeButtonText}>Subscribe Now - $2/month</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Terms */}
        <Text style={styles.terms}>
          By starting a trial, you agree to our Terms of Service and Privacy Policy. 
          After the 3-day trial, your subscription will automatically renew at $2/month until cancelled.
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
    marginBottom: 24,
  },
  logo: {
    width: 280,
    height: 200,
    marginBottom: 8,
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
  trialCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  trialHeader: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
  },
  trialLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  trialContent: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  trialDays: {
    fontSize: 64,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  trialDaysLabel: {
    fontSize: 24,
    color: '#4CAF50',
    marginLeft: 8,
  },
  trialInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  trialInfoText: {
    color: '#888',
    fontSize: 14,
  },
  trialNote: {
    fontSize: 13,
    color: '#4CAF50',
  },
  pricingCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#333',
  },
  pricingHeader: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 8,
  },
  pricingLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  pricingNote: {
    fontSize: 13,
    color: '#888',
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
  trialButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  trialButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  orContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#333',
  },
  orText: {
    color: '#666',
    paddingHorizontal: 16,
    fontSize: 14,
  },
  subscribeButton: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 2,
    borderColor: '#FF6B35',
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  subscribeButtonText: {
    color: '#FF6B35',
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
