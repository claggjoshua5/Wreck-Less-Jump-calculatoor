import React, { useState, useEffect } from 'react';
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
  Modal,
  Share,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle, Line, Text as SvgText, G, Polygon } from 'react-native-svg';
import * as Location from 'expo-location';

const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const { width } = Dimensions.get('window');

interface TrajectoryPoint {
  x: number;
  y: number;
  time: number;
}

interface CalculationResult {
  id: string;
  input_data: {
    ramp_height: number;
    ramp_angle: number;
    gap_distance: number;
    bike_weight: number;
    rider_weight: number;
    landing_height: number;
    unit_system: string;
  };
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
  trajectory_points: TrajectoryPoint[];
  warnings: string[];
}

interface LocationData {
  latitude: number;
  longitude: number;
  address?: string;
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
  const [animationProgress, setAnimationProgress] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  
  // Save modal states
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [includeLocation, setIncludeLocation] = useState(true);
  const [shareCalculation, setShareCalculation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<LocationData | null>(null);

  // Request location permission on mount
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        try {
          const location = await Location.getCurrentPositionAsync({});
          const address = await Location.reverseGeocodeAsync({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          });
          setCurrentLocation({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            address: address[0] ? `${address[0].city || ''}, ${address[0].region || ''}` : undefined,
          });
        } catch (error) {
          console.log('Error getting location:', error);
        }
      }
    })();
  }, []);

  // Animation effect
  useEffect(() => {
    if (isAnimating && result) {
      const duration = result.flight_time_seconds * 1000;
      const startTime = Date.now();
      
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        setAnimationProgress(progress);
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setIsAnimating(false);
        }
      };
      
      requestAnimationFrame(animate);
    }
  }, [isAnimating]);

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
      // Start animation
      setAnimationProgress(0);
      setIsAnimating(true);
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
    setAnimationProgress(0);
  };

  const handleSave = async () => {
    if (!saveName.trim()) {
      Alert.alert('Error', 'Please enter a name for this calculation.');
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/save-calculation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: saveName,
          description: saveDescription,
          calculation: result,
          location: includeLocation ? currentLocation : null,
          share: shareCalculation,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save calculation');
      }

      const savedData = await response.json();
      
      setShowSaveModal(false);
      setSaveName('');
      setSaveDescription('');
      
      if (shareCalculation && savedData.share_code) {
        Alert.alert(
          'Saved & Shared!',
          `Your calculation has been saved.\n\nShare Code: ${savedData.share_code}`,
          [
            { text: 'Copy Code', onPress: () => handleShareCode(savedData.share_code) },
            { text: 'OK' },
          ]
        );
      } else {
        Alert.alert('Saved!', 'Your calculation has been saved successfully.');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save calculation.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleShareCode = async (code: string) => {
    try {
      await Share.share({
        message: `Check out my dirt bike jump calculation!\n\nShare Code: ${code}\n\nRequired Speed: ${useMetric ? result?.required_speed_kph : result?.required_speed_mph} ${useMetric ? 'km/h' : 'mph'}\nGap: ${result?.input_data.gap_distance} ${useMetric ? 'm' : 'ft'}\nAngle: ${result?.input_data.ramp_angle}°`,
      });
    } catch (error) {
      console.log('Error sharing:', error);
    }
  };

  const handleQuickShare = async () => {
    if (!result) return;
    
    try {
      await Share.share({
        message: `Dirt Bike Jump Calculator Results:\n\nRequired Speed: ${useMetric ? result.required_speed_kph : result.required_speed_mph} ${useMetric ? 'km/h' : 'mph'}\nSafe Speed (+15%): ${useMetric ? result.safety_speed_kph : result.safety_speed_mph} ${useMetric ? 'km/h' : 'mph'}\nGap Distance: ${result.input_data.gap_distance} ${useMetric ? 'm' : 'ft'}\nRamp Angle: ${result.input_data.ramp_angle}°\nFlight Time: ${result.flight_time_seconds}s\nMax Height: ${useMetric ? result.max_height_meters : result.max_height_feet} ${useMetric ? 'm' : 'ft'}`,
      });
    } catch (error) {
      console.log('Error sharing:', error);
    }
  };

  const replayAnimation = () => {
    setAnimationProgress(0);
    setIsAnimating(true);
  };

  const distanceUnit = useMetric ? 'm' : 'ft';
  const weightUnit = useMetric ? 'kg' : 'lbs';
  const speedUnit = useMetric ? 'km/h' : 'mph';

  // Trajectory visualization component
  const renderTrajectory = () => {
    if (!result || !result.trajectory_points || result.trajectory_points.length === 0) return null;

    const svgWidth = width - 40;
    const svgHeight = 180;
    const padding = 30;
    
    const points = result.trajectory_points;
    const maxX = Math.max(...points.map(p => p.x));
    const maxY = Math.max(...points.map(p => p.y));
    const minY = Math.min(...points.map(p => p.y), 0);
    
    const scaleX = (svgWidth - padding * 2) / maxX;
    const scaleY = (svgHeight - padding * 2) / (maxY - minY);
    
    const transformX = (x: number) => padding + x * scaleX;
    const transformY = (y: number) => svgHeight - padding - (y - minY) * scaleY;
    
    // Create path data
    const pathData = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${transformX(p.x)} ${transformY(p.y)}`)
      .join(' ');
    
    // Current bike position based on animation
    const currentIndex = Math.floor(animationProgress * (points.length - 1));
    const currentPoint = points[currentIndex] || points[0];
    
    // Ramp visualization
    const rampLength = maxX * 0.15;
    const rampAngleRad = (result.input_data.ramp_angle * Math.PI) / 180;
    const rampHeight = rampLength * Math.tan(rampAngleRad);
    
    return (
      <View style={styles.trajectoryContainer}>
        <View style={styles.trajectoryHeader}>
          <Text style={styles.trajectoryTitle}>
            <Ionicons name="analytics" size={18} color="#2196F3" /> Flight Trajectory
          </Text>
          <TouchableOpacity onPress={replayAnimation} style={styles.replayButton}>
            <Ionicons name="play-circle" size={24} color="#FF6B35" />
            <Text style={styles.replayText}>Replay</Text>
          </TouchableOpacity>
        </View>
        
        <Svg width={svgWidth} height={svgHeight} style={styles.svg}>
          {/* Ground line */}
          <Line
            x1={padding}
            y1={transformY(0)}
            x2={svgWidth - padding}
            y2={transformY(0)}
            stroke="#444"
            strokeWidth="2"
          />
          
          {/* Ramp */}
          <Polygon
            points={`${padding},${transformY(0)} ${transformX(rampLength)},${transformY(0)} ${padding},${transformY(rampHeight)}`}
            fill="#FF6B35"
            opacity={0.5}
          />
          <Line
            x1={padding}
            y1={transformY(rampHeight)}
            x2={transformX(rampLength)}
            y2={transformY(0)}
            stroke="#FF6B35"
            strokeWidth="3"
          />
          
          {/* Landing zone */}
          <Line
            x1={transformX(maxX * 0.85)}
            y1={transformY(result.input_data.landing_height || 0)}
            x2={svgWidth - padding}
            y2={transformY(result.input_data.landing_height || 0)}
            stroke="#4CAF50"
            strokeWidth="3"
          />
          
          {/* Gap indicator */}
          <Line
            x1={transformX(rampLength)}
            y1={transformY(0) + 15}
            x2={transformX(maxX * 0.85)}
            y2={transformY(0) + 15}
            stroke="#888"
            strokeWidth="1"
            strokeDasharray="5,5"
          />
          <SvgText
            x={(transformX(rampLength) + transformX(maxX * 0.85)) / 2}
            y={transformY(0) + 28}
            fill="#888"
            fontSize="10"
            textAnchor="middle"
          >
            {result.input_data.gap_distance} {distanceUnit}
          </SvgText>
          
          {/* Trajectory path */}
          <Path
            d={pathData}
            stroke="#2196F3"
            strokeWidth="2"
            fill="none"
            strokeDasharray="5,5"
          />
          
          {/* Animated trajectory (solid) */}
          {animationProgress > 0 && (
            <Path
              d={points
                .slice(0, currentIndex + 1)
                .map((p, i) => `${i === 0 ? 'M' : 'L'} ${transformX(p.x)} ${transformY(p.y)}`)
                .join(' ')}
              stroke="#FF6B35"
              strokeWidth="3"
              fill="none"
            />
          )}
          
          {/* Max height indicator */}
          <Line
            x1={transformX(maxX / 2)}
            y1={transformY(maxY)}
            x2={transformX(maxX / 2)}
            y2={transformY(0)}
            stroke="#9C27B0"
            strokeWidth="1"
            strokeDasharray="3,3"
            opacity={0.5}
          />
          <SvgText
            x={transformX(maxX / 2) + 5}
            y={transformY(maxY) + 12}
            fill="#9C27B0"
            fontSize="9"
          >
            {useMetric ? result.max_height_meters : result.max_height_feet} {useMetric ? 'm' : 'ft'}
          </SvgText>
          
          {/* Bike position */}
          <G>
            <Circle
              cx={transformX(currentPoint.x)}
              cy={transformY(currentPoint.y)}
              r="8"
              fill="#FF6B35"
            />
            <Circle
              cx={transformX(currentPoint.x)}
              cy={transformY(currentPoint.y)}
              r="12"
              fill="none"
              stroke="#FF6B35"
              strokeWidth="2"
              opacity={0.5}
            />
          </G>
        </Svg>
        
        <View style={styles.legendContainer}>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: '#FF6B35' }]} />
            <Text style={styles.legendText}>Ramp</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: '#4CAF50' }]} />
            <Text style={styles.legendText}>Landing</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: '#2196F3' }]} />
            <Text style={styles.legendText}>Path</Text>
          </View>
        </View>
      </View>
    );
  };

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
            <Image
              source={require('../../assets/images/wreckless-logo.png')}
              style={styles.headerLogo}
              resizeMode="contain"
            />
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
              <View style={styles.resultsHeader}>
                <Text style={styles.resultsTitle}>
                  <Ionicons name="checkmark-circle" size={22} color="#4CAF50" /> Results
                </Text>
                <View style={styles.resultActions}>
                  <TouchableOpacity onPress={handleQuickShare} style={styles.actionButton}>
                    <Ionicons name="share-social" size={20} color="#2196F3" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowSaveModal(true)} style={styles.actionButton}>
                    <Ionicons name="bookmark" size={20} color="#FF6B35" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Trajectory Visualization */}
              {renderTrajectory()}

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

      {/* Save Modal */}
      <Modal
        visible={showSaveModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSaveModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Save Calculation</Text>
              <TouchableOpacity onPress={() => setShowSaveModal(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Name <Text style={styles.required}>*</Text></Text>
                <TextInput
                  style={styles.input}
                  value={saveName}
                  onChangeText={setSaveName}
                  placeholder="e.g., Backyard Gap Jump"
                  placeholderTextColor="#666"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Description <Text style={styles.optional}>(optional)</Text></Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={saveDescription}
                  onChangeText={setSaveDescription}
                  placeholder="Add notes about this jump..."
                  placeholderTextColor="#666"
                  multiline
                  numberOfLines={3}
                />
              </View>

              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => setIncludeLocation(!includeLocation)}
              >
                <Ionicons
                  name={includeLocation ? 'checkbox' : 'square-outline'}
                  size={24}
                  color="#FF6B35"
                />
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>Include Location</Text>
                  <Text style={styles.optionSubtitle}>
                    {currentLocation ? currentLocation.address || 'Location available' : 'Location not available'}
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => setShareCalculation(!shareCalculation)}
              >
                <Ionicons
                  name={shareCalculation ? 'checkbox' : 'square-outline'}
                  size={24}
                  color="#FF6B35"
                />
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>Share with Others</Text>
                  <Text style={styles.optionSubtitle}>Generate a share code</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="bookmark" size={20} color="#fff" />
                    <Text style={styles.saveButtonText}>Save Calculation</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    marginBottom: 16,
  },
  headerLogo: {
    width: 250,
    height: 140,
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
  textArea: {
    height: 80,
    textAlignVertical: 'top',
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
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  resultsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  resultActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    padding: 8,
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
  },
  trajectoryContainer: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  trajectoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  trajectoryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  replayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  replayText: {
    color: '#FF6B35',
    fontSize: 12,
  },
  svg: {
    alignSelf: 'center',
  },
  legendContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendColor: {
    width: 12,
    height: 4,
    borderRadius: 2,
  },
  legendText: {
    color: '#888',
    fontSize: 11,
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
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  modalBody: {
    padding: 20,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    marginBottom: 12,
    gap: 12,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  optionSubtitle: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  saveButton: {
    backgroundColor: '#FF6B35',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
