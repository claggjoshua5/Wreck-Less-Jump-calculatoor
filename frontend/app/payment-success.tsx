import React, { useEffect, useState } from 'react';
import {
  Text,
  View,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useSubscription } from './_layout';

const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function PaymentSuccessScreen() {
  const { session_id } = useLocalSearchParams();
  const { setSubscribed, checkSubscription } = useSubscription();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Verifying your payment...');

  useEffect(() => {
    const verifyPayment = async () => {
      if (!session_id) {
        setStatus('error');
        setMessage('No session ID found');
        return;
      }

      try {
        // Poll for payment status
        let attempts = 0;
        const maxAttempts = 10;
        const pollInterval = 2000;

        const poll = async () => {
          attempts++;
          const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/payments/status/${session_id}`);
          
          if (!response.ok) {
            throw new Error('Failed to verify payment');
          }

          const data = await response.json();

          if (data.payment_status === 'paid') {
            setStatus('success');
            setMessage('Payment successful! Enjoy the app.');
            setSubscribed(true);
            
            // Redirect to main app after delay
            setTimeout(() => {
              router.replace('/(tabs)');
            }, 2000);
            return;
          }

          if (data.status === 'expired') {
            setStatus('error');
            setMessage('Payment session expired. Please try again.');
            return;
          }

          if (attempts < maxAttempts) {
            setTimeout(poll, pollInterval);
          } else {
            setStatus('error');
            setMessage('Payment verification timed out. Please contact support.');
          }
        };

        await poll();
      } catch (error: any) {
        setStatus('error');
        setMessage(error.message || 'Failed to verify payment');
      }
    };

    verifyPayment();
  }, [session_id]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.content}>
        {status === 'loading' && (
          <>
            <ActivityIndicator size="large" color="#FF6B35" />
            <Text style={styles.message}>{message}</Text>
          </>
        )}

        {status === 'success' && (
          <>
            <View style={styles.iconContainer}>
              <Ionicons name="checkmark-circle" size={80} color="#4CAF50" />
            </View>
            <Text style={styles.title}>Thank You!</Text>
            <Text style={styles.message}>{message}</Text>
            <Text style={styles.redirect}>Redirecting to the app...</Text>
          </>
        )}

        {status === 'error' && (
          <>
            <View style={styles.iconContainer}>
              <Ionicons name="close-circle" size={80} color="#F44336" />
            </View>
            <Text style={styles.title}>Payment Issue</Text>
            <Text style={styles.message}>{message}</Text>
            <Text 
              style={styles.retryLink}
              onPress={() => router.replace('/paywall')}
            >
              Try Again
            </Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  iconContainer: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 24,
  },
  redirect: {
    fontSize: 14,
    color: '#FF6B35',
    marginTop: 24,
  },
  retryLink: {
    fontSize: 16,
    color: '#FF6B35',
    marginTop: 24,
    textDecorationLine: 'underline',
  },
});
