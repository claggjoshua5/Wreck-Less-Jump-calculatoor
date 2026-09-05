import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

/**
 * NotificationProvider Component
 * 
 * This component handles the complete push notification lifecycle:
 * 1. Requests user permissions
 * 2. Retrieves the Expo Push Token
 * 3. Sends the token to a backend API
 * 4. Listens for foreground and background notifications
 * 5. Cleans up listeners on unmount
 * 
 * Stack: React Native, Expo SDK (expo-notifications, expo-device, expo-constants)
 */

// ============================================================================
// NOTIFICATION HANDLER CONFIGURATION
// ============================================================================

/**
 * Set the notification handler for foreground notifications.
 * This configuration determines how notifications are displayed when the app is in focus.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,    // Display an alert
    shouldPlaySound: true,    // Play a sound
    shouldSetBadge: true,     // Set the app badge count
  }),
});

// ============================================================================
// NOTIFICATION PROVIDER COMPONENT
// ============================================================================

export default function NotificationProvider() {
  // State Management
  const [expoPushToken, setExpoPushToken] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState(null);
  const [registeredSuccessfully, setRegisteredSuccessfully] = useState(false);

  // Refs for notification listeners (used for cleanup)
  const notificationListener = useRef();
  const responseListener = useRef();

  // ============================================================================
  // PERMISSION & TOKEN RETRIEVAL
  // ============================================================================

  /**
   * registerForPushNotificationsAsync()
   * 
   * This function:
   * 1. Checks if running on a physical device
   * 2. Requests notification permissions
   * 3. Retrieves the Expo Push Token
   * 4. Returns the token or throws an error
   */
  const registerForPushNotificationsAsync = async () => {
    try {
      // Step 1: Verify we're on a physical device
      // (Simulators/emulators cannot receive push notifications)
      if (!Device.isDevice) {
        console.log('⚠️  Push notifications only work on physical devices.');
        throw new Error('Push notifications require a physical device');
      }

      // Step 2: Get current permission status
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      // Step 3: Request permission if not already granted
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      // Step 4: Verify permission was granted
      if (finalStatus !== 'granted') {
        throw new Error('Failed to get push notification permissions');
      }

      // Step 5: Retrieve the Expo Push Token
      // The projectId is required and comes from app.json or Constants.expoConfig
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ||
                        Constants.easConfig?.projectId;

      if (!projectId) {
        throw new Error('Project ID is required to get push token');
      }

      const token = await Notifications.getExpoPushTokenAsync({ projectId });

      console.log('✅ Expo Push Token retrieved:', token.data);
      return token.data;
    } catch (err) {
      console.error('❌ Error retrieving push token:', err.message);
      throw err;
    }
  };

  // ============================================================================
  // API CALL TO BACKEND
  // ============================================================================

  /**
   * sendTokenToBackend(token)
   * 
   * Sends the Expo Push Token and sample data to the backend API.
   * Includes error handling and retry logic.
   */
  const sendTokenToBackend = async (token) => {
    try {
      const payload = {
        expoPushToken: token,
        deviceInfo: {
          deviceId: Device.modelId,
          osVersion: Device.osVersion,
          platform: Device.osName,
          appVersion: Constants.expoConfig?.version || '1.0.0',
        },
        registeredAt: new Date().toISOString(),
      };

      console.log('📤 Sending token to backend:', payload);

      const response = await fetch('https://api.example.com/register-device', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('✅ Backend response:', data);
      setRegisteredSuccessfully(true);

      return data;
    } catch (err) {
      console.error('❌ Error sending token to backend:', err.message);
      setError(err.message);
      throw err;
    }
  };

  // ============================================================================
  // EFFECTS & LISTENERS
  // ============================================================================

  /**
   * Main effect: Initialize push notifications
   * 
   * Lifecycle:
   * 1. Request permissions and get token (runs once on mount)
   * 2. Send token to backend
   * 3. Set up foreground and response listeners
   * 4. Clean up listeners on unmount
   */
  useEffect(() => {
    const initializeNotifications = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Step 1: Register for push notifications
        const token = await registerForPushNotificationsAsync();
        setExpoPushToken(token);

        // Step 2: Send token to backend
        await sendTokenToBackend(token);
      } catch (err) {
        console.error('Failed to initialize notifications:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    initializeNotifications();

    // ========================================================================
    // FOREGROUND NOTIFICATION LISTENER
    // ========================================================================
    /**
     * This listener handles notifications received while the app is in focus.
     * It updates the state to display the notification to the user.
     */
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log('📬 Foreground notification received:', notification);
        setNotification(notification);
      }
    );

    // ========================================================================
    // NOTIFICATION RESPONSE LISTENER (USER TAP)
    // ========================================================================
    /**
     * This listener handles when the user taps on a notification.
     * This is crucial for deep linking or navigating to relevant screens.
     */
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        console.log('👆 User tapped notification:', response);
        const { notification } = response;
        
        // Extract custom data if available
        if (notification.request.content.data) {
          const customData = notification.request.content.data;
          console.log('📦 Custom data:', customData);
          
          // TODO: Implement deep linking or navigation based on customData
          // Example:
          // if (customData.screen) {
          //   navigation.navigate(customData.screen, customData.params);
          // }
        }

        setNotification(notification);
      }
    );

    // ========================================================================
    // CLEANUP FUNCTION
    // ========================================================================
    /**
     * Unsubscribe from listeners when component unmounts.
     * This prevents memory leaks and multiple listener registrations.
     */
    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  // ============================================================================
  // RENDER
  // ============================================================================

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Initializing push notifications...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Push Notifications Setup</Text>

        {/* Status Indicator */}
        <View style={styles.statusContainer}>
          <View
            style={[
              styles.statusIndicator,
              {
                backgroundColor: registeredSuccessfully ? '#4CAF50' : '#FF6B6B',
              },
            ]}
          />
          <Text style={styles.statusText}>
            {registeredSuccessfully ? 'Connected' : 'Not Connected'}
          </Text>
        </View>

        {/* Token Display */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Expo Push Token</Text>
          <Text style={styles.tokenText} numberOfLines={2} ellipsizeMode="tail">
            {expoPushToken || 'N/A'}
          </Text>
        </View>

        {/* Device Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Device Info</Text>
          <Text style={styles.infoText}>Model: {Device.modelId}</Text>
          <Text style={styles.infoText}>OS: {Device.osName} {Device.osVersion}</Text>
          <Text style={styles.infoText}>
            Physical Device: {Device.isDevice ? 'Yes' : 'No'}
          </Text>
        </View>

        {/* Error Display */}
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorTitle}>Error</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Last Notification */}
        {notification && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Last Notification</Text>
            <Text style={styles.notificationText}>
              {notification.request.content.title}
            </Text>
            <Text style={styles.notificationBody}>
              {notification.request.content.body}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  tokenText: {
    fontSize: 12,
    color: '#007AFF',
    fontFamily: 'Courier New',
    backgroundColor: '#f0f0f0',
    padding: 8,
    borderRadius: 4,
  },
  infoText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 6,
  },
  notificationText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  notificationBody: {
    fontSize: 13,
    color: '#666',
    fontStyle: 'italic',
  },
  errorContainer: {
    backgroundColor: '#ffe0e0',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FF6B6B',
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#d32f2f',
    marginBottom: 4,
  },
  errorText: {
    fontSize: 13,
    color: '#b71c1c',
  },
});
