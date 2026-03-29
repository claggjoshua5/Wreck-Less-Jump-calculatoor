import React, { useState } from 'react';
import {
  Text,
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const { width } = Dimensions.get('window');

interface CalculationResult {
  required_speed_mph: number;
  required_speed_kph: number;
  safety_speed_mph: number;
  safety_speed_kph: number;
  total_weight_lbs: number;
  total_weight_kg: number;
  flight_time_seconds: number;
  max_height_feet: number;
  max_height_meters: number;
  landing_velocity_mph: number;
  landing_velocity_kph: number;
  warnings: string[];
}

export default function Index() {
  // Input states
  const [rampHeight, setRampHeight] = useState('');
  const [rampAngle, setRampAngle] = useState('');
  const [gapDistance, setGapDistance] = useState('');
  const [bikeWeight, setBikeWeight] = useState('');
  const [riderWeight, setRiderWeight] = useState('');
  const [landingHeight, setLandingHeight] = useState('');
  
  // UI states
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [useMetric, setUseMetric] = useState(false);

  const validateInputs = (): boolean => {
    if (!rampAngle || !gapDistance || !bikeWeight || !riderWeight) {
      Alert.alert('Missing Information', 'Please fill in all required fields (ramp angle, gap distance, bike weight, and rider weight).');
      return false;
    }

    const angle = parseFloat(rampAngle);
    if (angle <= 0 || angle >= 90) {
      Alert.alert('Invalid Angle', 'Ramp angle must be between 0 and 90 degrees.');
      return false;
    }

    const gap = parseFloat(gapDistance);
    if (gap <= 0) {
      Alert.alert('Invalid Distance', 'Gap distance must be greater than 0.');
      return false;
    }

    return true;
  };

  const calculateSpeed = async () => {
    if (!validateInputs()) return;

    setIsLoading(true);
    setResult(null);

    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/calculate-jump`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ramp_height: parseFloat(rampHeight) || 0,
          ramp_angle: parseFloat(rampAngle),
          gap_distance: parseFloat(gapDistance),
          bike_weight: parseFloat(bikeWeight),
          rider_weight: parseFloat(riderWeight),
          landing_height: parseFloat(landingHeight) || 0,
          unit_system: useMetric ? 'metric' : 'imperial',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Calculation failed');
      }

      const data = await response.json();
      setResult(data);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to calculate. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const clearForm = () => {
    setRampHeight('');
    setRampAngle('');
    setGapDistance('');
    setBikeWeight('');
    setRiderWeight('');
    setLandingHeight('');
    setResult(null);
  };

  const distanceUnit = useMetric ? 'm' : 'ft';
  const weightUnit = useMetric ? 'kg' : 'lbs';
  const speedUnit = useMetric ? 'km/h' : 'mph';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Ionicons name="speedometer" size={40} color="#FF6B35" />
            <Text style={styles.title}>Dirt Bike Jump Calculator</Text>
            <Text style={styles.subtitle}>Calculate the speed needed to clear your gap</Text>
          </View>

          {/* Unit Toggle */}
          <View style={styles.toggleContainer}>
            <TouchableOpacity
              style={[styles.toggleButton, !useMetric && styles.toggleActive]}
              onPress={() => setUseMetric(false)}
            >
              <Text style={[styles.toggleText, !useMetric && styles.toggleTextActive]}>Imperial</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, useMetric && styles.toggleActive]}
              onPress={() => setUseMetric(true)}
            >
              <Text style={[styles.toggleText, useMetric && styles.toggleTextActive]}>Metric</Text>
            </TouchableOpacity>
          </View>

          {/* Input Form */}
          <View style={styles.formContainer}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="construct" size={18} color="#FF6B35" /> Ramp Details
            </Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Ramp Height ({distanceUnit}) <Text style={styles.optional}>(optional)</Text></Text>
              <TextInput
                style={styles.input}
                value={rampHeight}
                onChangeText={setRampHeight}
                placeholder={`e.g., ${useMetric ? '1.5' : '5'}`}
                placeholderTextColor="#666"
                keyboardType="decimal-pad"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Ramp Angle (degrees) <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.input}
                value={rampAngle}
                onChangeText={setRampAngle}
                placeholder="e.g., 30"
                placeholderTextColor="#666"
                keyboardType="decimal-pad"
              />
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>
              <Ionicons name="resize" size={18} color="#FF6B35" /> Jump Details
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gap Distance ({distanceUnit}) <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.input}
                value={gapDistance}
                onChangeText={setGapDistance}
                placeholder={`e.g., ${useMetric ? '15' : '50'}`}
                placeholderTextColor="#666"
                keyboardType="decimal-pad"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Landing Height Diff ({distanceUnit}) <Text style={styles.optional}>(optional, - if lower)</Text></Text>
              <TextInput
                style={styles.input}
                value={landingHeight}
                onChangeText={setLandingHeight}
                placeholder="e.g., -3"
                placeholderTextColor="#666"
                keyboardType="decimal-pad"
              />
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>
              <Ionicons name="body" size={18} color="#FF6B35" /> Weight Details
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Dirt Bike Weight ({weightUnit}) <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.input}
                value={bikeWeight}
                onChangeText={setBikeWeight}
                placeholder={`e.g., ${useMetric ? '100' : '220'}`}
                placeholderTextColor="#666"
                keyboardType="decimal-pad"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Rider Weight ({weightUnit}) <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.input}
                value={riderWeight}
                onChangeText={setRiderWeight}
                placeholder={`e.g., ${useMetric ? '75' : '165'}`}
                placeholderTextColor="#666"
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.calculateButton}
              onPress={calculateSpeed}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="calculator" size={20} color="#fff" />
                  <Text style={styles.calculateButtonText}>Calculate Speed</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.clearButton} onPress={clearForm}>
              <Ionicons name="refresh" size={20} color="#FF6B35" />
              <Text style={styles.clearButtonText}>Clear</Text>
            </TouchableOpacity>
          </View>

          {/* Results */}
          {result && (
            <View style={styles.resultsContainer}>
              <Text style={styles.resultsTitle}>
                <Ionicons name="checkmark-circle" size={22} color="#4CAF50" /> Results
              </Text>

              {/* Main Speed Result */}
              <View style={styles.mainResultCard}>
                <Text style={styles.mainResultLabel}>Required Speed</Text>
                <Text style={styles.mainResultValue}>
                  {useMetric ? result.required_speed_kph : result.required_speed_mph}
                  <Text style={styles.mainResultUnit}> {speedUnit}</Text>
                </Text>
              </View>

              {/* Safety Speed */}
              <View style={styles.safetyCard}>
                <Ionicons name="shield-checkmark" size={24} color="#FF9800" />
                <View style={styles.safetyContent}>
                  <Text style={styles.safetyLabel}>Recommended Safe Speed (+15%)</Text>
                  <Text style={styles.safetyValue}>
                    {useMetric ? result.safety_speed_kph : result.safety_speed_mph} {speedUnit}
                  </Text>
                </View>
              </View>

              {/* Detailed Stats */}
              <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                  <Ionicons name="time" size={20} color="#2196F3" />
                  <Text style={styles.statValue}>{result.flight_time_seconds}s</Text>
                  <Text style={styles.statLabel}>Flight Time</Text>
                </View>

                <View style={styles.statCard}>
                  <Ionicons name="arrow-up" size={20} color="#9C27B0" />
                  <Text style={styles.statValue}>
                    {useMetric ? result.max_height_meters : result.max_height_feet}
                    {useMetric ? 'm' : 'ft'}
                  </Text>
                  <Text style={styles.statLabel}>Max Height</Text>
                </View>

                <View style={styles.statCard}>
                  <Ionicons name="arrow-down" size={20} color="#E91E63" />
                  <Text style={styles.statValue}>
                    {useMetric ? result.landing_velocity_kph : result.landing_velocity_mph}
                    {speedUnit}
                  </Text>
                  <Text style={styles.statLabel}>Landing Speed</Text>
                </View>

                <View style={styles.statCard}>
                  <Ionicons name="fitness" size={20} color="#4CAF50" />
                  <Text style={styles.statValue}>
                    {useMetric ? result.total_weight_kg : result.total_weight_lbs}
                    {weightUnit}
                  </Text>
                  <Text style={styles.statLabel}>Total Weight</Text>
                </View>
              </View>

              {/* Warnings */}
              {result.warnings && result.warnings.length > 0 && (
                <View style={styles.warningsContainer}>
                  <Text style={styles.warningsTitle}>
                    <Ionicons name="warning" size={18} color="#FF9800" /> Safety Warnings
                  </Text>
                  {result.warnings.map((warning, index) => (
                    <Text key={index} style={styles.warningText}>
                      {warning}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Disclaimer */}
          <View style={styles.disclaimer}>
            <Ionicons name="information-circle" size={16} color="#888" />
            <Text style={styles.disclaimerText}>
              This calculator provides estimates based on ideal physics conditions. Actual results may vary due to wind, surface conditions, bike setup, and rider technique. Always prioritize safety and wear proper protective gear.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 6,
    textAlign: 'center',
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  toggleActive: {
    backgroundColor: '#FF6B35',
  },
  toggleText: {
    color: '#888',
    fontWeight: '600',
    fontSize: 14,
  },
  toggleTextActive: {
    color: '#fff',
  },
  formContainer: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 8,
  },
  required: {
    color: '#FF6B35',
  },
  optional: {
    color: '#666',
    fontSize: 12,
  },
  input: {
    backgroundColor: '#2A2A2A',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  calculateButton: {
    flex: 2,
    backgroundColor: '#FF6B35',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  calculateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  clearButton: {
    flex: 1,
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#FF6B35',
  },
  clearButtonText: {
    color: '#FF6B35',
    fontSize: 16,
    fontWeight: '600',
  },
  resultsContainer: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  resultsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  mainResultCard: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  mainResultLabel: {
    fontSize: 14,
    color: '#888',
    marginBottom: 8,
  },
  mainResultValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  mainResultUnit: {
    fontSize: 24,
    fontWeight: 'normal',
  },
  safetyCard: {
    backgroundColor: 'rgba(255, 152, 0, 0.1)',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 152, 0, 0.3)',
  },
  safetyContent: {
    marginLeft: 12,
    flex: 1,
  },
  safetyLabel: {
    fontSize: 12,
    color: '#FF9800',
    marginBottom: 4,
  },
  safetyValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FF9800',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 16,
    width: (width - 76) / 2,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  warningsContainer: {
    backgroundColor: 'rgba(255, 152, 0, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 152, 0, 0.3)',
  },
  warningsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF9800',
    marginBottom: 12,
  },
  warningText: {
    fontSize: 13,
    color: '#FFB74D',
    marginBottom: 8,
    lineHeight: 18,
  },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 12,
    color: '#888',
    lineHeight: 18,
  },
});
