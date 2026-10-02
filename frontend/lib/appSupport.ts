import { Platform } from 'react-native';

export interface TrialInfo {
  is_trial_active: boolean;
  trial_started_at?: string;
  trial_expires_at?: string;
  trial_days_remaining?: number;
}

export interface JumpCalculationInput {
  ramp_height: number;
  ramp_angle: number;
  gap_distance: number;
  bike_weight: number;
  rider_weight: number;
  landing_height: number;
  unit_system: 'imperial' | 'metric';
}

export interface TrajectoryPoint {
  x: number;
  y: number;
  time: number;
}

export interface CalculationResult {
  id: string;
  input_data: JumpCalculationInput;
  required_speed_mph: number;
  required_speed_kph: number;
  required_speed_fps: number;
  total_weight_lbs: number;
  total_weight_kg: number;
  flight_time_seconds: number;
  max_height_feet: number;
  max_height_meters: number;
  safety_speed_mph: number;
  safety_speed_kph: number;
  landing_velocity_mph: number;
  landing_velocity_kph: number;
  trajectory_points: TrajectoryPoint[];
  warnings: string[];
  timestamp: string;
}

export interface LocationData {
  latitude: number;
  longitude: number;
  address?: string;
}

export interface SavedCalculation {
  id: string;
  device_id?: string;
  name: string;
  description?: string;
  calculation: CalculationResult;
  location?: LocationData | null;
  is_shared: boolean;
  share_code?: string;
  created_at: string;
}

export interface MapLocation {
  id: string;
  device_id?: string;
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  is_shared: boolean;
  share_code?: string;
  required_speed_mph: number;
  gap_distance: number;
  ramp_angle: number;
  created_at: string;
}

const LOCAL_SAVED_CALCULATIONS_KEY = 'wreckless_saved_calculations_v1';
const DEVICE_ID_STORAGE_KEY = 'device_id';
// Emergency-specific identifier and secret. These are intentionally never sent or stored
// alongside the general device_id above, and never returned by any backend endpoint, so a
// share-code holder who learns device_id (via GET /api/shared/{share_code}) cannot use it
// to take over a rider's emergency settings/token.
const EMERGENCY_DEVICE_ID_STORAGE_KEY = 'emergency_device_id';
const EMERGENCY_DEVICE_SECRET_STORAGE_KEY = 'emergency_device_secret';
const API_TIMEOUT_MS = 4000;
const rawBackendUrl = process.env.EXPO_PUBLIC_BACKEND_URL?.trim() ?? '';
const paywallFlag = process.env.EXPO_PUBLIC_ENABLE_PAYWALL?.trim().toLowerCase();

export const BACKEND_URL = rawBackendUrl ? rawBackendUrl.replace(/\/+$/, '') : null;
export const isBackendConfigured = BACKEND_URL !== null;
export const isPaywallEnabled =
  isBackendConfigured && (paywallFlag === 'true' || paywallFlag === '1' || paywallFlag === 'yes');

const getStorage = () => {
  if (Platform.OS === 'web') {
    return {
      async getItem(key: string) {
        return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
      },
      async setItem(key: string, value: string) {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(key, value);
        }
      },
    };
  }

  return {
    async getItem(key: string) {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      return AsyncStorage.getItem(key);
    },
    async setItem(key: string, value: string) {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      await AsyncStorage.setItem(key, value);
    },
  };
};

const storage = getStorage();

// Secure storage for emergency credentials: SecureStore on native, localStorage on web
// (matching the pre-existing device-token storage strategy this replaces).
async function getSecureItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  }

  return require('expo-secure-store').getItemAsync(key);
}

async function setSecureItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    // expo-secure-store has no encrypted backing store in a browser, so localStorage
    // is the least-bad option there (same trade-off the pre-existing device-token
    // storage made). Native builds always use the OS keychain/keystore via
    // expo-secure-store below, which is where this secret matters most.
    if (typeof localStorage !== 'undefined') {
      // lgtm[js/clear-text-storage-of-sensitive-data]
      localStorage.setItem(key, value);
    }
    return;
  }

  await require('expo-secure-store').setItemAsync(key, value);
}

const createId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const createDeviceId = async () => {
  const uuid = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : await require('expo-crypto').randomUUID();
  return `device_${uuid}`;
};

const createEmergencyDeviceId = async () => {
  const uuid = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : await require('expo-crypto').randomUUID();
  return `emg_${uuid}`;
};

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

// Generates a high-entropy (32 byte / 256 bit) random secret for authenticating emergency
// requests. The server only ever stores sha256(secret); the raw value never leaves this
// device after generation.
const createDeviceSecret = async (): Promise<string> => {
  if (Platform.OS === 'web') {
    const bytes = new Uint8Array(32);
    if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
      // Never fall back to Math.random() for an authentication secret — it isn't
      // cryptographically secure. Fail loudly instead so the caller surfaces an error
      // rather than silently enrolling with a guessable secret.
      throw new Error(
        'This browser does not support a secure random number generator required for emergency features.'
      );
    }
    crypto.getRandomValues(bytes);
    return bytesToHex(bytes);
  }

  const Crypto = require('expo-crypto');
  const bytes: Uint8Array = await Crypto.getRandomBytesAsync(32);
  return bytesToHex(bytes);
};

const createShareCode = () => Math.random().toString(36).slice(2, 10).toUpperCase();

async function getStoredJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const value = await storage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function setStoredJson(key: string, value: unknown): Promise<void> {
  await storage.setItem(key, JSON.stringify(value));
}

export async function getDeviceId(): Promise<string> {
  const existingDeviceId = await storage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existingDeviceId) {
    return existingDeviceId;
  }

  const nextDeviceId = await createDeviceId();
  await storage.setItem(DEVICE_ID_STORAGE_KEY, nextDeviceId);
  return nextDeviceId;
}

// The emergency_device_id is separate from the general device_id above: it is generated
// on-device, stored in secure storage, and never returned by any backend endpoint, so it
// can't be learned from a share code the way device_id can.
export async function getEmergencyDeviceId(): Promise<string> {
  const existing = await getSecureItem(EMERGENCY_DEVICE_ID_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const next = await createEmergencyDeviceId();
  await setSecureItem(EMERGENCY_DEVICE_ID_STORAGE_KEY, next);
  return next;
}

// Returns the client-generated secret used to authenticate emergency requests, generating
// and persisting a new one on first use. Persistence happens BEFORE this ever needs to be
// sent to the server, so a lost response, network timeout, or app restart can always retry
// with the exact same secret and recover the same enrollment (see enroll_or_verify on the
// backend). If SecureStore fails to persist the secret, this throws instead of silently
// proceeding with an unrecoverable one-shot secret.
//
// Concurrent callers (e.g. two emergency actions triggered in quick succession before any
// secret exists yet) share a single in-flight generation via deviceSecretPromise instead of
// each independently generating and persisting their own secret, which would otherwise let
// the last write win and orphan any request already sent with an earlier secret.
let deviceSecretPromise: Promise<string> | null = null;

export async function getDeviceSecret(): Promise<string> {
  const existing = await getSecureItem(EMERGENCY_DEVICE_SECRET_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  if (!deviceSecretPromise) {
    deviceSecretPromise = (async () => {
      // Re-check in case another concurrent call already persisted one while we awaited
      // the initial getSecureItem() above.
      const raced = await getSecureItem(EMERGENCY_DEVICE_SECRET_STORAGE_KEY);
      if (raced) {
        return raced;
      }

      const next = await createDeviceSecret();
      try {
        await setSecureItem(EMERGENCY_DEVICE_SECRET_STORAGE_KEY, next);
      } catch {
        throw new Error(
          'Unable to securely save your emergency device credentials. Please try again.'
        );
      }

      const verified = await getSecureItem(EMERGENCY_DEVICE_SECRET_STORAGE_KEY);
      if (verified !== next) {
        throw new Error(
          'Unable to securely save your emergency device credentials. Please try again.'
        );
      }

      return next;
    })().finally(() => {
      deviceSecretPromise = null;
    });
  }

  return deviceSecretPromise;
}

async function getSavedCalculationsStorage(): Promise<SavedCalculation[]> {
  const calculations = await getStoredJson<SavedCalculation[]>(LOCAL_SAVED_CALCULATIONS_KEY, []);
  return calculations.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

async function setSavedCalculationsStorage(calculations: SavedCalculation[]): Promise<void> {
  await setStoredJson(LOCAL_SAVED_CALCULATIONS_KEY, calculations);
}

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

export async function fetchJsonWithBackend<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithBackend(path, init);
  const contentType = response.headers.get('content-type') ?? '';
  const responseBody = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

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

const generateTrajectoryPoints = (
  speedFeetPerSecond: number,
  angleRadians: number,
  gapDistanceFeet: number
): TrajectoryPoint[] => {
  const gravity = 32.174;
  const cosTheta = Math.cos(angleRadians);
  const sinTheta = Math.sin(angleRadians);
  const horizontalVelocity = speedFeetPerSecond * cosTheta;
  const verticalVelocity = speedFeetPerSecond * sinTheta;

  if (horizontalVelocity <= 0) {
    return [];
  }

  const totalTime = gapDistanceFeet / horizontalVelocity;
  const points: TrajectoryPoint[] = [];

  for (let index = 0; index <= 50; index += 1) {
    const time = (index / 50) * totalTime;
    points.push({
      x: Number((horizontalVelocity * time).toFixed(2)),
      y: Number((verticalVelocity * time - 0.5 * gravity * time * time).toFixed(2)),
      time: Number(time.toFixed(3)),
    });
  }

  return points;
};

const calculateJumpSpeed = (
  rampAngleDegrees: number,
  gapDistanceFeet: number,
  landingHeightFeet: number
) => {
  const gravity = 32.174;
  const theta = (rampAngleDegrees * Math.PI) / 180;
  const cosine = Math.cos(theta);
  const tangent = Math.tan(theta);
  let denominator = 2 * (cosine ** 2) * (gapDistanceFeet * tangent - landingHeightFeet);

  if (denominator <= 0) {
    denominator = Math.sin(2 * theta);
    if (denominator <= 0) {
      throw new Error('Invalid angle: cannot compute trajectory');
    }
    const speedFeetPerSecond = Math.sqrt((gapDistanceFeet * gravity) / denominator);
    return finalizeCalculation(speedFeetPerSecond, theta, gapDistanceFeet, landingHeightFeet);
  }

  const speedFeetPerSecond = Math.sqrt((gravity * gapDistanceFeet * gapDistanceFeet) / denominator);
  return finalizeCalculation(speedFeetPerSecond, theta, gapDistanceFeet, landingHeightFeet);
};

const finalizeCalculation = (
  speedFeetPerSecond: number,
  angleRadians: number,
  gapDistanceFeet: number,
  landingHeightFeet: number
) => {
  const gravity = 32.174;
  const speedMph = speedFeetPerSecond * 0.681818;
  const speedKph = speedFeetPerSecond * 1.09728;
  const flightTime =
    gapDistanceFeet / (speedFeetPerSecond * Math.cos(angleRadians));
  const verticalVelocity = speedFeetPerSecond * Math.sin(angleRadians);
  const maxHeightFeet = (verticalVelocity ** 2) / (2 * gravity);
  const landingVelocityTerm = speedFeetPerSecond ** 2 - 2 * gravity * landingHeightFeet;
  const landingVelocityFeetPerSecond =
    landingVelocityTerm > 0
      ? Math.sqrt(landingVelocityTerm)
      : speedFeetPerSecond;

  return {
    required_speed_fps: Number(speedFeetPerSecond.toFixed(2)),
    required_speed_mph: Number(speedMph.toFixed(2)),
    required_speed_kph: Number(speedKph.toFixed(2)),
    flight_time_seconds: Number(flightTime.toFixed(2)),
    max_height_feet: Number(maxHeightFeet.toFixed(2)),
    max_height_meters: Number((maxHeightFeet * 0.3048).toFixed(2)),
    landing_velocity_mph: Number((landingVelocityFeetPerSecond * 0.681818).toFixed(2)),
    landing_velocity_kph: Number((landingVelocityFeetPerSecond * 1.09728).toFixed(2)),
    trajectory_points: generateTrajectoryPoints(speedFeetPerSecond, angleRadians, gapDistanceFeet),
  };
};

const calculateSafetyMargin = (
  totalWeightLbs: number,
  rampHeightFeet: number,
  rampAngleDegrees: number
) => {
  const weightMargin = Math.max(0, (totalWeightLbs - 350) / 1500);
  const shortRampMargin = rampHeightFeet > 0 ? Math.max(0, (4 - rampHeightFeet) * 0.01) : 0.04;
  const steepRampMargin = rampAngleDegrees > 35 ? Math.min((rampAngleDegrees - 35) / 300, 0.08) : 0;
  return Math.min(0.35, 0.15 + weightMargin + shortRampMargin + steepRampMargin);
};

export function calculateJumpLocally(inputData: JumpCalculationInput): CalculationResult {
  if (inputData.ramp_angle <= 0 || inputData.ramp_angle >= 90) {
    throw new Error('Ramp angle must be between 0 and 90 degrees');
  }

  if (inputData.gap_distance <= 0) {
    throw new Error('Gap distance must be positive');
  }

  const warnings: string[] = [];
  const totalWeightLbs = inputData.bike_weight + inputData.rider_weight;
  const totalWeightKg = totalWeightLbs * 0.453592;

  if (totalWeightLbs > 500) {
    warnings.push(
      'Heavy combined weight may affect suspension and landing. Consider adjusting suspension settings.'
    );
  }

  const gapDistanceFeet =
    inputData.unit_system === 'metric'
      ? inputData.gap_distance * 3.28084
      : inputData.gap_distance;
  const landingHeightFeet =
    inputData.unit_system === 'metric'
      ? inputData.landing_height * 3.28084
      : inputData.landing_height;
  const rampHeightFeet =
    inputData.unit_system === 'metric'
      ? inputData.ramp_height * 3.28084
      : inputData.ramp_height;

  const calculation = calculateJumpSpeed(
    inputData.ramp_angle,
    gapDistanceFeet,
    landingHeightFeet
  );

  if (calculation.required_speed_mph > 60) {
    warnings.push(
      'High speed required! This is an advanced jump. Ensure proper safety gear and experience.'
    );
  }

  if (inputData.ramp_angle > 45) {
    warnings.push('Steep ramp angle may cause instability during takeoff.');
  }

  if (inputData.ramp_angle < 15) {
    warnings.push('Low ramp angle requires higher speed and longer landing zone.');
  }

  if (calculation.landing_velocity_mph > 50) {
    warnings.push('High landing velocity. Ensure proper landing ramp and suspension setup.');
  }

  if (rampHeightFeet > 0 && rampHeightFeet < 3) {
    warnings.push('Short takeoff ramp height reduces margin for body position and throttle correction.');
  }

  const safetyMargin = calculateSafetyMargin(totalWeightLbs, rampHeightFeet, inputData.ramp_angle);

  return {
    id: createId('calc'),
    input_data: inputData,
    ...calculation,
    total_weight_lbs: Number(totalWeightLbs.toFixed(2)),
    total_weight_kg: Number(totalWeightKg.toFixed(2)),
    safety_speed_mph: Number((calculation.required_speed_mph * (1 + safetyMargin)).toFixed(2)),
    safety_speed_kph: Number((calculation.required_speed_kph * (1 + safetyMargin)).toFixed(2)),
    warnings,
    timestamp: new Date().toISOString(),
  };
}

export async function listSavedCalculationsLocally(): Promise<SavedCalculation[]> {
  const calculations = await getSavedCalculationsStorage();
  const deviceId = await getDeviceId();
  return calculations.filter((calculation) => (calculation.device_id ?? deviceId) === deviceId);
}

export async function saveCalculationLocally(input: {
  device_id?: string;
  name: string;
  description?: string;
  calculation: CalculationResult;
  location?: LocationData | null;
  share: boolean;
}): Promise<SavedCalculation> {
  const calculations = await getSavedCalculationsStorage();
  const savedCalculation: SavedCalculation = {
    id: createId('saved'),
    device_id: input.device_id ?? (await getDeviceId()),
    name: input.name,
    description: input.description,
    calculation: input.calculation,
    location: input.location ?? null,
    is_shared: input.share,
    share_code: input.share ? createShareCode() : undefined,
    created_at: new Date().toISOString(),
  };

  await setSavedCalculationsStorage([savedCalculation, ...calculations]);
  return savedCalculation;
}

export async function deleteCalculationLocally(id: string): Promise<void> {
  const calculations = await getSavedCalculationsStorage();
  const deviceId = await getDeviceId();
  await setSavedCalculationsStorage(
    calculations.filter(
      (calculation) => calculation.id !== id || (calculation.device_id ?? deviceId) !== deviceId
    )
  );
}

export async function shareCalculationLocally(id: string): Promise<SavedCalculation> {
  const calculations = await getSavedCalculationsStorage();
  const deviceId = await getDeviceId();
  const updatedCalculations = calculations.map((calculation) => {
    if (calculation.id !== id || (calculation.device_id ?? deviceId) !== deviceId) {
      return calculation;
    }

    return {
      ...calculation,
      is_shared: true,
      share_code: calculation.share_code ?? createShareCode(),
    };
  });
  const sharedCalculation = updatedCalculations.find((calculation) => calculation.id === id);

  if (!sharedCalculation) {
    throw new Error('Calculation not found');
  }

  await setSavedCalculationsStorage(updatedCalculations);
  return sharedCalculation;
}

export async function lookupSharedCalculationLocally(
  shareCode: string
): Promise<SavedCalculation | null> {
  const calculations = await getSavedCalculationsStorage();
  return (
    calculations.find(
      (calculation) =>
        calculation.is_shared &&
        calculation.share_code?.toUpperCase() === shareCode.toUpperCase()
    ) ?? null
  );
}

// ==================== EMERGENCY ALERT SUPPORT ====================
// Safety-first design: no auto-dialing and no automatic location broadcast.
// Every action here is only ever triggered after an explicit, confirmed user tap.
//
// All requests here use emergency_device_id (see getEmergencyDeviceId above), a separate
// identifier from the general device_id used for saved calculations/share codes, plus a
// client-generated secret sent as X-Device-Token. The server never returns this secret, so
// enrollment (the settings POST) is safe to retry: the secret is persisted locally before
// the first request is ever sent, so a timeout, dropped response, or app restart can always
// retry with the same secret and recover the same claim.

export const EMERGENCY_ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

export interface EmergencySettings {
  allow_notifications: boolean;
  location_sharing_enabled: boolean;
  alert_cooldown_ms: number;
  has_location: boolean;
  last_known_location?: LocationData | null;
}

export interface EmergencySettingsUpdate {
  allow_notifications?: boolean;
  location_sharing_enabled?: boolean;
  location?: LocationData | null;
}

export interface AlertNearbyRidersResult {
  success: boolean;
  message: string;
  alerted_count: number;
  alert_id: string;
}

const EMERGENCY_SETTINGS_STORAGE_KEY = 'wreckless_emergency_settings_v1';
const LAST_NEARBY_ALERT_STORAGE_KEY = 'wreckless_last_nearby_alert_v1';
const emergencySettingsPath = (emergencyDeviceId: string) =>
  `/api/emergency/settings/${encodeURIComponent(emergencyDeviceId)}`;

class DeviceAuthError extends Error {}

async function parseEmergencyResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') ?? '';
  const responseBody = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    if (response.status === 401) {
      throw new DeviceAuthError(
        'This device is not authorized for emergency features. Please re-enable location sharing in Emergency Settings.'
      );
    }

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

async function fetchEmergencyJson<T>(path: string, init?: RequestInit): Promise<T> {
  // Persisted before every request (including enrollment), so retries always reuse the
  // same secret instead of the server ever needing to hand back a one-time token.
  const secret = await getDeviceSecret();
  const response = await fetchWithBackend(path, {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string> | undefined),
      'X-Device-Token': secret,
    },
  });
  return parseEmergencyResponse<T>(response);
}

const defaultEmergencySettings = (): EmergencySettings => ({
  allow_notifications: true,
  location_sharing_enabled: false,
  alert_cooldown_ms: EMERGENCY_ALERT_COOLDOWN_MS,
  has_location: false,
  last_known_location: null,
});

export async function getEmergencySettings(emergencyDeviceId: string): Promise<EmergencySettings> {
  if (isBackendConfigured) {
    try {
      return await fetchEmergencyJson<EmergencySettings>(emergencySettingsPath(emergencyDeviceId));
    } catch (error) {
      if (error instanceof DeviceAuthError) {
        throw error;
      }
      // Fall back to local storage below.
    }
  }

  const local = await getStoredJson<EmergencySettings | null>(EMERGENCY_SETTINGS_STORAGE_KEY, null);
  return local
    ? {
        ...local,
        has_location: local.last_known_location != null,
      }
    : defaultEmergencySettings();
}

export async function updateEmergencySettings(
  emergencyDeviceId: string,
  update: EmergencySettingsUpdate
): Promise<EmergencySettings> {
  if (isBackendConfigured) {
    try {
      return await fetchEmergencyJson<EmergencySettings>(emergencySettingsPath(emergencyDeviceId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
    } catch (error) {
      if (error instanceof DeviceAuthError) {
        throw error;
      }
      // Fall back to local storage below.
    }
  }

  const current = await getEmergencySettings(emergencyDeviceId);
  const next: EmergencySettings = {
    ...current,
    ...(update.allow_notifications !== undefined && { allow_notifications: update.allow_notifications }),
    ...(update.location_sharing_enabled !== undefined && {
      location_sharing_enabled: update.location_sharing_enabled,
      last_known_location: update.location_sharing_enabled ? current.last_known_location : null,
    }),
    ...(update.location !== undefined &&
      (update.location_sharing_enabled ?? current.location_sharing_enabled) && {
        last_known_location: update.location,
      }),
  };
  next.has_location = next.last_known_location != null;

  await setStoredJson(EMERGENCY_SETTINGS_STORAGE_KEY, next);
  return next;
}

export async function logCallForHelp(
  emergencyDeviceId: string,
  location?: LocationData | null
): Promise<void> {
  if (!isBackendConfigured) {
    return;
  }

  try {
    await fetchEmergencyJson('/api/emergency/call-for-help', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emergency_device_id: emergencyDeviceId, location: location ?? null }),
    });
  } catch (error) {
    console.log('Failed to log call-for-help attempt:', error);
    if (error instanceof DeviceAuthError) {
      throw error;
    }
  }
}

export async function sendNearbyRidersAlert(
  emergencyDeviceId: string,
  location: LocationData
): Promise<AlertNearbyRidersResult> {
  return fetchEmergencyJson<AlertNearbyRidersResult>('/api/emergency/alert-nearby-riders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emergency_device_id: emergencyDeviceId, location }),
  });
}

export async function getLastNearbyAlertSentAt(): Promise<number | null> {
  return getStoredJson<number | null>(LAST_NEARBY_ALERT_STORAGE_KEY, null);
}

export async function setLastNearbyAlertSentAt(timestamp: number): Promise<void> {
  await setStoredJson(LAST_NEARBY_ALERT_STORAGE_KEY, timestamp);
}

export function getRemainingAlertCooldownMs(
  lastSentAt: number | null,
  cooldownMs: number = EMERGENCY_ALERT_COOLDOWN_MS
): number {
  if (!lastSentAt) {
    return 0;
  }
  return Math.max(0, cooldownMs - (Date.now() - lastSentAt));
}

export async function listMapLocationsLocally(): Promise<MapLocation[]> {
  const calculations = await getSavedCalculationsStorage();
  const deviceId = await getDeviceId();

  return calculations
    .filter(
      (calculation): calculation is SavedCalculation & { location: LocationData } =>
        Boolean(calculation.location) && (calculation.device_id ?? deviceId) === deviceId
    )
    .map((calculation) => ({
      id: calculation.id,
      name: calculation.name,
      latitude: calculation.location.latitude,
      longitude: calculation.location.longitude,
      address: calculation.location.address,
      is_shared: calculation.is_shared,
      share_code: calculation.share_code,
      required_speed_mph: calculation.calculation.required_speed_mph,
      gap_distance: calculation.calculation.input_data.gap_distance,
      ramp_angle: calculation.calculation.input_data.ramp_angle,
      created_at: calculation.created_at,
    }));
}
