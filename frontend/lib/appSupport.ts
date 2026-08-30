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
const API_TIMEOUT_MS = 4000;
const rawBackendUrl = process.env.EXPO_PUBLIC_BACKEND_URL?.trim() ?? '';

export const BACKEND_URL = rawBackendUrl ? rawBackendUrl.replace(/\/+$/, '') : null;
export const isBackendConfigured = BACKEND_URL !== null;

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

const createId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

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

  return {
    id: createId('calc'),
    input_data: inputData,
    ...calculation,
    total_weight_lbs: Number(totalWeightLbs.toFixed(2)),
    total_weight_kg: Number(totalWeightKg.toFixed(2)),
    safety_speed_mph: Number((calculation.required_speed_mph * 1.15).toFixed(2)),
    safety_speed_kph: Number((calculation.required_speed_kph * 1.15).toFixed(2)),
    warnings,
    timestamp: new Date().toISOString(),
  };
}

export async function listSavedCalculationsLocally(): Promise<SavedCalculation[]> {
  return getSavedCalculationsStorage();
}

export async function saveCalculationLocally(input: {
  name: string;
  description?: string;
  calculation: CalculationResult;
  location?: LocationData | null;
  share: boolean;
}): Promise<SavedCalculation> {
  const calculations = await getSavedCalculationsStorage();
  const savedCalculation: SavedCalculation = {
    id: createId('saved'),
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
  await setSavedCalculationsStorage(calculations.filter((calculation) => calculation.id !== id));
}

export async function shareCalculationLocally(id: string): Promise<SavedCalculation> {
  const calculations = await getSavedCalculationsStorage();
  const updatedCalculations = calculations.map((calculation) => {
    if (calculation.id !== id) {
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

export async function listMapLocationsLocally(): Promise<MapLocation[]> {
  const calculations = await getSavedCalculationsStorage();

  return calculations
    .filter(
      (calculation): calculation is SavedCalculation & { location: LocationData } =>
        Boolean(calculation.location)
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
