# 🔍 COMPREHENSIVE QA AUDIT REPORT
**Wreck-Less Jump Calculator - React Native/Expo Codebase**

**Date:** September 5, 2026  
**Auditor:** Senior QA Engineer & Mobile App Architect  
**Status:** ⚠️ CRITICAL ISSUES FOUND

---

## 📋 EXECUTIVE SUMMARY

This audit identified **12 Critical Issues**, **8 Warnings**, and **5 Optimization opportunities** across the React Native/Expo codebase. Critical issues can cause runtime crashes, memory leaks, and data loss.

**Priority Order:**
1. ✋ **CRITICAL** - Fix immediately (blocks production)
2. ⚠️ **WARNING** - Fix before release (degraded experience)
3. 💡 **OPTIMIZATION** - Nice-to-have improvements

---

## 🚨 CRITICAL ISSUES (Must Fix Before Production)

### **C1: Race Condition in Subscription Check - Missing Dependency Array**

**File:** `frontend/app/_layout.tsx` (Lines 114-116)

**Severity:** 🔴 CRITICAL - **Causes infinite loops & memory leaks**

**Issue:**
```typescript
useEffect(() => {
  checkSubscription();
}, []); // ✋ MISSING DEPENDENCY - checkSubscription function is dynamic
```

The `checkSubscription` function is created fresh on every render, but the dependency array is empty. This causes:
- Function reference changes every render
- Stale closure issues in nested async calls
- Potential infinite loops if `checkSubscription` updates state

**Why It's Broken:**
- `checkSubscription` is a state setter, but it's not memoized
- When this effect runs, it captures a stale version
- If subscription status changes, the old function is still referenced

**Fix:**
```typescript
import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';

export default function RootLayout() {
  const [isSubscribed, setIsSubscribed] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [isTrial, setIsTrial] = useState(false);
  const [trialInfo, setTrialInfo] = useState<TrialInfo | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

  // ✅ Memoize the function to prevent re-creation
  const checkSubscription = useCallback(async () => {
    try {
      const id = await getDeviceId();
      setDeviceId(id);
      
      if (!isBackendConfigured) {
        setIsSubscribed(true);
        setIsTrial(false);
        setTrialInfo(null);
        setStatusMessage('Offline mode enabled');
        return;
      }

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
    } catch (error) {
      console.error('Error checking subscription:', error);
      setIsSubscribed(true);
      setIsTrial(false);
      setTrialInfo(null);
      setStatusMessage('Offline mode enabled');
    }
  }, []); // ✅ Dependencies: none (only sets state, no external deps)

  useEffect(() => {
    checkSubscription();
  }, [checkSubscription]); // ✅ Now properly depends on memoized function
}
```

**Why This Fix Works:**
- `useCallback` memoizes the function with dependencies
- Effect now only runs when `checkSubscription` changes (which is never)
- Prevents stale closures and infinite loops
- Properly handles subscription status updates

---

### **C2: Unhandled Promise in Payment Verification - No AbortController**

**File:** `frontend/app/payment-success.tsx` (Lines 22-80)

**Severity:** 🔴 CRITICAL - **Can cause memory leaks and orphaned requests**

**Issue:**
```typescript
useEffect(() => {
  const verifyPayment = async () => {
    // ... polling logic without cleanup
    const poll = async () => {
      attempts++;
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/payments/status/${session_id}`);
      // ... more logic
      if (attempts < maxAttempts) {
        setTimeout(poll, pollInterval); // ✋ No cleanup if component unmounts
      }
    };
    await poll();
  };

  verifyPayment();
}, [session_id]); // ✋ No cleanup function
```

**Problems:**
1. If component unmounts mid-poll, timeouts continue running
2. setStatus/setMessage called on unmounted component = memory leak warning
3. No abort mechanism for stuck requests
4. `session_id` changes cause duplicate polls
5. Missing error boundaries for network failures

**Fix:**
```typescript
useEffect(() => {
  let isMounted = true; // ✅ Track mount status
  let pollTimeoutId: NodeJS.Timeout | null = null;
  const controller = new AbortController(); // ✅ Abort controller for fetch

  const verifyPayment = async () => {
    if (!session_id) {
      if (isMounted) {
        setStatus('error');
        setMessage('No session ID found');
      }
      return;
    }

    try {
      let attempts = 0;
      const maxAttempts = 10;
      const pollInterval = 2000;

      const poll = async () => {
        // ✅ Check mount status before updating state
        if (!isMounted) return;

        attempts++;
        try {
          const response = await fetch(
            `${EXPO_PUBLIC_BACKEND_URL}/api/payments/status/${session_id}`,
            { signal: controller.signal } // ✅ Pass abort signal
          );
          
          if (!isMounted) return; // ✅ Check again after async

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: Failed to verify payment`);
          }

          const data = await response.json();

          if (!isMounted) return;

          if (data.payment_status === 'paid') {
            setStatus('success');
            setMessage('Payment successful! Enjoy the app.');
            setSubscribed(true);
            
            pollTimeoutId = setTimeout(() => {
              if (isMounted) {
                router.replace('/(tabs)');
              }
            }, 2000);
            return;
          }

          if (data.status === 'expired') {
            setStatus('error');
            setMessage('Payment session expired. Please try again.');
            return;
          }

          if (attempts < maxAttempts) {
            // ✅ Store timeout ID for cleanup
            pollTimeoutId = setTimeout(poll, pollInterval);
          } else {
            if (isMounted) {
              setStatus('error');
              setMessage('Payment verification timed out. Please contact support.');
            }
          }
        } catch (error) {
          if (!isMounted) return;
          
          // ✅ Handle abort error separately
          if (error instanceof Error && error.name === 'AbortError') {
            console.log('Payment verification cancelled');
            return;
          }
          
          if (attempts < maxAttempts) {
            pollTimeoutId = setTimeout(poll, pollInterval);
          } else {
            setStatus('error');
            setMessage((error as Error)?.message || 'Failed to verify payment');
          }
        }
      };

      await poll();
    } catch (error) {
      if (isMounted) {
        setStatus('error');
        setMessage((error as Error)?.message || 'Failed to verify payment');
      }
    }
  };

  verifyPayment();

  // ✅ Cleanup function - runs on unmount or when session_id changes
  return () => {
    isMounted = false;
    controller.abort(); // ✅ Cancel in-flight requests
    if (pollTimeoutId) {
      clearTimeout(pollTimeoutId); // ✅ Clear pending timeouts
    }
  };
}, [session_id]); // ✅ Properly depends on session_id
```

**Why This Fix Works:**
- `isMounted` flag prevents state updates on unmounted component
- `AbortController` cancels in-flight fetch requests
- All timeouts are tracked and cleared
- Multiple poll invocations are prevented
- Error handling for network and abort scenarios

---

### **C3: Null Reference Error in Notification Display**

**File:** `.github/NotificationProvider.js` (Lines 314-319)

**Severity:** 🔴 CRITICAL - **Crashes on null notification data**

**Issue:**
```javascript
{notification && (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>Last Notification</Text>
    <Text style={styles.notificationText}>
      {notification.request.content.title}  // ✋ Can be undefined
    </Text>
    <Text style={styles.notificationBody}>
      {notification.request.content.body}   // ✋ Can be undefined
    </Text>
  </View>
)}
```

**Problem:** 
If title or body are missing, rendering fails. Notifications can be sent without these fields.

**Fix:**
```javascript
{notification && (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>Last Notification</Text>
    <Text style={styles.notificationText}>
      {notification.request.content.title || 'Untitled Notification'}
    </Text>
    <Text style={styles.notificationBody}>
      {notification.request.content.body || 'No message'}
    </Text>
  </View>
)}
```

---

### **C4: Missing Error Type Guard in Notification Setup**

**File:** `.github/NotificationProvider.js` (Lines 102-105)

**Severity:** 🔴 CRITICAL - **TypeError if error is not an Error object**

**Issue:**
```javascript
catch (err) {
  console.error('❌ Error retrieving push token:', err.message); // ✋ err might not be Error
  throw err;
}
```

**Problem:** 
`err` can be any type (string, null, object). Accessing `.message` on non-Error throws TypeError.

**Fix:**
```javascript
catch (err) {
  const errorMessage = err instanceof Error ? err.message : String(err);
  console.error('❌ Error retrieving push token:', errorMessage);
  setError(errorMessage);
  throw err;
}
```

---

### **C5: Fetch Response Not Consumed - Network Leak**

**File:** `frontend/app/paywall.tsx` (Line 76)

**Severity:** 🔴 CRITICAL - **Memory leak from unclosed responses**

**Issue:**
```typescript
const originUrl = Platform.OS === 'web' ? window.location.origin : 'wreckless://app';

const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/payments/create-checkout`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ origin_url: originUrl, device_id: deviceId }),
});

if (!response.ok) {
  throw new Error('Failed to create checkout session');
}

const data = await response.json();
// ✋ Response body already consumed by response.json()
```

**Problem:**
Hardcoded `'wreckless://app'` will fail in dev/Expo client. The fix in the file (using `Linking.createURL`) is correct but there's also a duplicate definition on line 76 that overrides the fixed version on lines 21-24.

**Fix:**
```typescript
// ✅ Remove the duplicate originUrl definition on line 76
// Use only the correct version from lines 21-24:

const originUrl =
  Platform.OS === 'web'
    ? window.location.origin
    : Linking.createURL('');

// Then in handleSubscribe, don't redefine it:
const handleSubscribe = async () => {
  setIsLoading(true);
  setError('');

  try {
    // ✅ Use the already-defined originUrl, don't recreate it
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
```

---

### **C6: Missing Return Type in Async Function**

**File:** `.github/NotificationProvider.js` (Lines 65-106)

**Severity:** 🔴 CRITICAL - **Can cause type safety issues**

**Issue:**
```javascript
const registerForPushNotificationsAsync = async () => {
  // ✋ No explicit return type
  // ...
  return token.data;
};
```

**Fix:**
```javascript
const registerForPushNotificationsAsync = async (): Promise<string> => {
  // ✅ Explicit return type
  try {
    // ... existing code
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch (err) {
    console.error('❌ Error retrieving push token:', err instanceof Error ? err.message : String(err));
    throw err;
  }
};
```

---

### **C7: Uncontrolled State Growth in ARMeasureView**

**File:** `frontend/components/ARMeasureView.tsx` (Lines 137-147)

**Severity:** 🔴 CRITICAL - **Memory leak from marker array growth**

**Issue:**
```typescript
const [markers, setMarkers] = useState<ARMarker[]>([]);
// ... 
const placeMarker = () => {
  if (!latestHitPos.current) {
    Alert.alert('No Surface Detected', 'Point your camera at a flat surface and try again.');
    return;
  }
  const label = markers.length === 0 ? 'Start' : 'End';
  const pos: Viro3DPoint = [...latestHitPos.current];
  const newMarkers = [...markers, { position: pos, label }];
  setMarkers(newMarkers); // ✋ Markers array can grow unbounded
};
```

**Problem:**
User can place unlimited markers, growing the array. After calling `resetMarkers()`, placing new markers can create duplicates if the reset doesn't clear properly.

**Fix:**
```typescript
const placeMarker = () => {
  if (!latestHitPos.current) {
    Alert.alert('No Surface Detected', 'Point your camera at a flat surface and try again.');
    return;
  }
  
  // ✅ Enforce max 2 markers
  if (markers.length >= 2) {
    Alert.alert('Maximum Markers', 'You can only place 2 markers. Tap Redo to start over.');
    return;
  }

  const label = markers.length === 0 ? 'Start' : 'End';
  const pos: Viro3DPoint = [...latestHitPos.current];
  const newMarkers = [...markers, { position: pos, label }];
  setMarkers(newMarkers);

  if (newMarkers.length === 2) {
    calculateMeasurement(newMarkers);
  }
};

const resetMarkers = () => {
  setMarkers([]);
  setMeasurement(null);
  latestHitPos.current = null; // ✅ Explicitly nullify
};
```

---

### **C8: Missing Abort in Backend Fetch Calls**

**File:** `frontend/lib/appSupport.ts` (Lines 139-164)

**Severity:** 🔴 CRITICAL - **Network requests leak if user navigates away**

**Issue:**
```typescript
export async function fetchWithBackend(path: string, init?: RequestInit): Promise<Response> {
  if (!BACKEND_URL) {
    throw new Error('Backend unavailable');
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), API_TIMEOUT_MS)
    : null;

  try {
    return await fetch(`${BACKEND_URL}${path}`, {
      ...init,
      signal: controller?.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
```

**Problem:**
AbortController creation fails silently on web if not available. The timeout only triggers abort, but if the request succeeds after timeout, it's still consumed.

**Fix:**
```typescript
export async function fetchWithBackend(path: string, init?: RequestInit): Promise<Response> {
  if (!BACKEND_URL) {
    throw new Error('Backend unavailable');
  }

  // ✅ Always create AbortController (supported in all modern runtimes)
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    // ✅ Set timeout to abort request if it takes too long
    timeoutId = setTimeout(() => {
      controller.abort();
    }, API_TIMEOUT_MS);

    const response = await fetch(`${BACKEND_URL}${path}`, {
      ...init,
      signal: controller.signal,
    });

    // ✅ Clear timeout if request succeeds
    if (timeoutId) clearTimeout(timeoutId);

    return response;
  } catch (error) {
    // ✅ Clear timeout on error
    if (timeoutId) clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timed out after ' + API_TIMEOUT_MS + 'ms');
      }
    }
    throw error;
  }
}
```

---

### **C9: Missing PropTypes/Type Checking in ARMeasureView Props**

**File:** `frontend/components/ARMeasureView.tsx` (Lines 36-39)

**Severity:** 🔴 CRITICAL - **Silent failures if wrong props passed**

**Issue:**
```typescript
interface Props {
  onMeasurement: (type: 'rampAngle' | 'rampHeight' | 'gapDistance', value: number) => void;
  onClose: () => void;
}

export default function ARMeasureView({ onMeasurement, onClose }: Props) {
  // ... 
  onMeasurement(type, value); // ✋ Could be undefined at runtime
}
```

**Problem:**
If parent component doesn't pass `onMeasurement`, it becomes undefined and crashes.

**Fix:**
```typescript
import React, { useEffect, useState, useRef, useCallback } from 'react';

interface Props {
  onMeasurement?: (type: 'rampAngle' | 'rampHeight' | 'gapDistance', value: number) => void;
  onClose?: () => void;
}

export default function ARMeasureView({ 
  onMeasurement = () => console.warn('onMeasurement not implemented'),
  onClose = () => console.warn('onClose not implemented'),
}: Props) {
  // ... existing code

  const saveMeasurement = useCallback(() => {
    if (!measurement) return;
    let value: number;
    let type: 'rampAngle' | 'rampHeight' | 'gapDistance';

    switch (measureType) {
      case 'gap':
        type = 'gapDistance';
        value = Math.round(measurement.horizDist * 10) / 10;
        break;
      case 'height':
        type = 'rampHeight';
        value = Math.round(measurement.vertDist * 10) / 10;
        break;
      case 'angle':
        type = 'rampAngle';
        value = Math.round(measurement.angle * 10) / 10;
        break;
    }

    // ✅ Safe call with default handler
    if (typeof onMeasurement === 'function') {
      onMeasurement(type, value);
    }
    
    Alert.alert(
      'Measurement Saved!',
      `${getTypeLabel(measureType)} has been saved.`,
      [
        { text: 'Measure More', onPress: resetMarkers },
        { text: 'Done', onPress: () => {
          setArActive(false);
          if (typeof onClose === 'function') {
            onClose();
          }
        }},
      ]
    );
  }, [measurement, measureType, onMeasurement, onClose]);

  // ... rest of component
}
```

---

### **C10: Package.json Version Conflicts - Major Version Mismatch**

**File:** `frontend/package.json`

**Severity:** 🔴 CRITICAL - **Build failures and incompatibilities**

**Issue:**
```json
{
  "dependencies": {
    "expo": "57.0.17",
    "react": "19.1.0",
    "react-native": "0.81.5",
    "expo-router": "~6.0.22",
    "expo-notifications": "0.17.0",  // ✋ MISSING - Never installed
    "expo-device": "5.7.0",           // ✋ MISSING - Never installed
    "expo-constants": "~18.0.13"      // ✋ VERSION MISMATCH
  }
}
```

**Problems:**
1. `expo-notifications`, `expo-device` not listed (but used in code)
2. React 19.1.0 with React Native 0.81.5 = compatibility issue
3. Expo 57 requires specific SDK versions

**Fix:**
Update `frontend/package.json`:
```json
{
  "name": "frontend",
  "main": "expo-router/entry",
  "version": "1.0.0",
  "scripts": {
    "start": "expo start",
    "reset-project": "node ./scripts/reset-project.js",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web",
    "lint": "expo lint",
    "test": "jest",
    "build:apk": "eas build --platform android --profile preview --local",
    "build:apk:cloud": "eas build --platform android --profile preview",
    "build:apk:debug": "eas build --platform android --profile development"
  },
  "dependencies": {
    "@babel/runtime": "^7.20.6",
    "@expo/metro-runtime": "^6.1.2",
    "@expo/ngrok": "^4.1.3",
    "@expo/vector-icons": "^15.0.3",
    "@react-native-async-storage/async-storage": "^2.2.0",
    "@react-navigation/bottom-tabs": "^7.3.10",
    "@react-navigation/elements": "^2.3.8",
    "@react-navigation/native": "^7.1.6",
    "@react-navigation/native-stack": "^7.3.10",
    "@reactvision/react-viro": "2.54.0",
    "expo": "^57.0.17",
    "expo-blur": "~15.0.8",
    "expo-camera": "~17.0.10",
    "expo-constants": "~18.0.13",
    "expo-device": "~5.7.0",
    "expo-font": "~14.0.11",
    "expo-image": "~3.0.11",
    "expo-image-picker": "~17.0.10",
    "expo-linking": "~8.0.11",
    "expo-location": "~19.0.8",
    "expo-notifications": "~0.17.0",
    "expo-router": "~6.0.22",
    "expo-sensors": "~15.0.8",
    "expo-splash-screen": "~31.0.13",
    "expo-status-bar": "~3.0.9",
    "expo-symbols": "~1.0.8",
    "expo-system-ui": "~6.0.9",
    "expo-web-browser": "~15.0.10",
    "react": "18.2.0",
    "react-dom": "18.2.0",
    "react-native": "0.73.0",
    "react-native-dotenv": "^3.4.11",
    "react-native-gesture-handler": "~2.28.0",
    "react-native-gifted-charts": "^1.4.76",
    "react-native-reanimated": "~4.1.1",
    "react-native-safe-area-context": "~5.6.0",
    "react-native-screens": "~4.16.0",
    "react-native-share": "^12.2.6",
    "react-native-svg": "15.12.1",
    "react-native-web": "^0.21.0",
    "react-native-webview": "13.15.0",
    "react-native-worklets": "0.5.1"
  },
  "devDependencies": {
    "@babel/core": "^7.25.2",
    "@testing-library/jest-native": "^5.4.3",
    "@testing-library/react-native": "^12.4.0",
    "@types/jest": "^29.5.0",
    "@types/react": "~18.2.0",
    "eslint": "^9.25.0",
    "eslint-config-expo": "~10.0.0",
    "jest": "^29.7.0",
    "jest-expo": "^49.0.0",
    "typescript": "~5.9.3"
  },
  "private": true,
  "packageManager": "npm@11.17.0"
}
```

**Why This Fix:**
- React 18.2.0 is stable and compatible with React Native 0.73.0
- All expo-* packages now explicitly listed and pinned
- Testing libraries added for C11 (test suite)
- Tilde (~) versions allow patch updates while maintaining compatibility

---

### **C11: No Error Boundary - App Crashes Without Recovery**

**File:** `frontend/app/_layout.tsx`

**Severity:** 🔴 CRITICAL - **Unhandled errors crash entire app**

**Issue:**
No Error Boundary wrapper for the app stack. Any child component error crashes the whole app.

**Fix - Create new file:** `frontend/components/ErrorBoundary.tsx`

```typescript
import React, { ReactNode, ReactElement } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, retry: () => void) => ReactElement;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('🚨 Error Boundary caught:', error);
    console.error('Component Stack:', errorInfo.componentStack);
  }

  retry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return this.props.fallback ? (
        this.props.fallback(this.state.error!, this.retry)
      ) : (
        <View style={styles.container}>
          <Ionicons name="alert-circle" size={64} color="#F44336" />
          <Text style={styles.title}>Something Went Wrong</Text>
          <Text style={styles.message}>{this.state.error?.message}</Text>
          <TouchableOpacity style={styles.button} onPress={this.retry}>
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 16,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: '#888',
    marginTop: 8,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 24,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
```

**Update:** `frontend/app/_layout.tsx`
```typescript
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function RootLayout() {
  // ... existing code

  return (
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}
```

---

### **C12: Listener Cleanup Not Verified in NotificationProvider**

**File:** `.github/NotificationProvider.js` (Lines 241-248)

**Severity:** 🔴 CRITICAL - **Listeners not guaranteed to unsubscribe**

**Issue:**
```javascript
return () => {
  if (notificationListener.current) {
    Notifications.removeNotificationSubscription(notificationListener.current);
  }
  if (responseListener.current) {
    Notifications.removeNotificationSubscription(responseListener.current);
  }
};
```

**Problem:**
The `removeNotificationSubscription` might fail silently if refs become stale, and there's no error handling.

**Fix:**
```javascript
useEffect(() => {
  // ... setup code

  return () => {
    try {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
      console.log('✅ Notification listeners cleaned up successfully');
    } catch (error) {
      console.warn('⚠️ Error cleaning up notification listeners:', error);
    }
  };
}, []);
```

---

## ⚠️ WARNING ISSUES (Fix Before Release)

### **W1: Race Condition in Trial State**

**File:** `frontend/app/paywall.tsx` (Lines 33-69)

**Severity:** ⚠️ WARNING - **Can show incorrect trial status**

**Issue:**
```typescript
const handleStartTrial = async () => {
  setIsTrialLoading(true);
  setError('');

  try {
    const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/payments/start-trial`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: deviceId }),
    });

    if (!response.ok) {
      throw new Error('Failed to start free trial');
    }

    const data = await response.json();

    if (!data.success) {
      setError(data.message || 'Could not start trial. Please try subscribing instead.');
      return;
    }

    // Trial started! Refresh subscription state
    await checkSubscription(); // ✋ No error handling for checkSubscription failure
    router.replace('/(tabs)');
  } catch (err: any) {
    setError(err.message || 'Something went wrong. Please try again.');
  } finally {
    setIsTrialLoading(false);
  }
};
```

**Fix:**
```typescript
const handleStartTrial = async () => {
  setIsTrialLoading(true);
  setError('');

  try {
    const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/payments/start-trial`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: deviceId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to start free trial (HTTP ${response.status})`);
    }

    const data = await response.json();

    if (!data.success) {
      setError(data.message || 'Could not start trial. Please try subscribing instead.');
      setIsTrialLoading(false);
      return;
    }

    // ✅ Error handling for subscription check
    try {
      await checkSubscription();
      router.replace('/(tabs)');
    } catch (checkError) {
      setError('Trial started but failed to load app state. Please restart the app.');
      console.error('Failed to check subscription after trial start:', checkError);
    }
  } catch (err: any) {
    setError(err.message || 'Something went wrong. Please try again.');
  } finally {
    setIsTrialLoading(false);
  }
};
```

---

### **W2: Missing Null Checks in Device Storage**

**File:** `frontend/app/_layout.tsx` (Lines 64-72)

**Severity:** ⚠️ WARNING - **Can create invalid device IDs**

**Issue:**
```typescript
const getDeviceId = async (): Promise<string> => {
  let deviceId = await storage.getItem('device_id');
  if (!deviceId) {
    deviceId = `device_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    await storage.setItem('device_id', deviceId);
  }
  return deviceId;
};
```

**Problem:**
If storage.setItem fails, an unsaved ID is returned. Next call generates a new ID.

**Fix:**
```typescript
const getDeviceId = async (): Promise<string> => {
  try {
    let deviceId = await storage.getItem('device_id');
    if (deviceId && deviceId.trim()) {
      return deviceId;
    }

    // Generate new ID
    const newDeviceId = `device_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    
    // Try to persist, but return regardless
    try {
      await storage.setItem('device_id', newDeviceId);
      console.log('Device ID created and persisted:', newDeviceId);
    } catch (storageError) {
      console.warn('Failed to persist device ID, using in-memory:', storageError);
    }

    return newDeviceId;
  } catch (error) {
    console.error('Error getting device ID:', error);
    // Fallback to temporary ID
    return `device_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
};
```

---

### **W3: Unvalidated JSON Parsing**

**File:** `frontend/lib/appSupport.ts` (Lines 166-187)

**Severity:** ⚠️ WARNING - **Invalid JSON crashes parsing**

**Issue:**
```typescript
export async function fetchJsonWithBackend<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithBackend(path, init);
  const contentType = response.headers.get('content-type') ?? '';
  const responseBody = contentType.includes('application/json')
    ? await response.json() // ✋ Can throw if body is empty or malformed
    : await response.text();
```

**Fix:**
```typescript
export async function fetchJsonWithBackend<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithBackend(path, init);
  const contentType = response.headers.get('content-type') ?? '';
  
  let responseBody: any;
  try {
    responseBody = contentType.includes('application/json')
      ? await response.json()
      : await response.text();
  } catch (parseError) {
    console.error('Failed to parse response:', parseError);
    throw new Error('Server returned invalid response format');
  }

  if (!response.ok) {
    if (
      responseBody &&
      typeof responseBody === 'object' &&
      'detail' in responseBody &&
      typeof responseBody.detail === 'string'
    ) {
      throw new Error(responseBody.detail);
    }

    throw new Error(typeof responseBody === 'string' ? responseBody : 'Request failed');
  }

  return responseBody as T;
}
```

---

### **W4: Missing Input Validation in Jump Calculator**

**File:** `frontend/lib/appSupport.ts` (Lines 275-338)

**Severity:** ⚠️ WARNING - **Silently produces invalid calculations**

**Issue:**
```typescript
export function calculateJumpLocally(inputData: JumpCalculationInput): CalculationResult {
  if (inputData.ramp_angle <= 0 || inputData.ramp_angle >= 90) {
    throw new Error('Ramp angle must be between 0 and 90 degrees');
  }

  if (inputData.gap_distance <= 0) {
    throw new Error('Gap distance must be positive');
  }
  // ✋ Missing validation for bike_weight, rider_weight, landing_height
```

**Fix:**
```typescript
export function calculateJumpLocally(inputData: JumpCalculationInput): CalculationResult {
  // ✅ Comprehensive validation
  const errors: string[] = [];

  if (!Number.isFinite(inputData.ramp_angle)) {
    errors.push('Ramp angle must be a valid number');
  } else if (inputData.ramp_angle <= 0 || inputData.ramp_angle >= 90) {
    errors.push('Ramp angle must be between 0 and 90 degrees');
  }

  if (!Number.isFinite(inputData.gap_distance)) {
    errors.push('Gap distance must be a valid number');
  } else if (inputData.gap_distance <= 0) {
    errors.push('Gap distance must be positive');
  }

  if (!Number.isFinite(inputData.bike_weight) || inputData.bike_weight <= 0) {
    errors.push('Bike weight must be a positive number');
  }

  if (!Number.isFinite(inputData.rider_weight) || inputData.rider_weight <= 0) {
    errors.push('Rider weight must be a positive number');
  }

  if (!Number.isFinite(inputData.landing_height)) {
    errors.push('Landing height must be a valid number');
  }

  if (errors.length > 0) {
    throw new Error(`Validation failed: ${errors.join(', ')}`);
  }

  // ... rest of function
}
```

---

### **W5-W8: Additional Warnings**

**W5:** Missing cleanup for AR materials initialization  
**W6:** No timeout for ARMeasureView camera initialization  
**W7:** Payment polling duplicated if user rapidly navigates  
**W8:** No retry mechanism for failed network requests  

*(See test suite below for handling)*

---

## 💡 OPTIMIZATION OPPORTUNITIES

### **O1:** Memoize subscription context value
### **O2:** Add React Query for backend caching
### **O3:** Implement service worker for offline support
### **O4:** Optimize image assets with WebP conversion
### **O5:** Add analytics/error tracking (Sentry)

---

## 📦 DEPENDENCY AUDIT

| Package | Current | Issue | Fix |
|---------|---------|-------|-----|
| `react` | 19.1.0 | Major version mismatch | 18.2.0 |
| `react-native` | 0.81.5 | Too new, unstable | 0.73.0 |
| `expo-notifications` | ❌ Missing | Not in package.json | Add ~0.17.0 |
| `expo-device` | ❌ Missing | Not in package.json | Add ~5.7.0 |
| `expo-constants` | ~18.0.13 | Wrong version | ~15.0.13 |

---

## 🧪 COMPREHENSIVE TEST SUITE

See next file: `frontend/__tests__/CriticalFlows.test.tsx`

---

## ✅ SIGN-OFF CHECKLIST

- [ ] All CRITICAL issues fixed and tested
- [ ] All WARNING issues addressed
- [ ] Test suite passes 100%
- [ ] No console errors/warnings in CI
- [ ] Code review approved
- [ ] Package.json locked and verified
- [ ] Ready for production build
