import React, { useState, useEffect, useRef } from 'react';
import {
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Alert,
  ActivityIndicator,
  Image,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { Accelerometer } from 'expo-sensors';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Circle, Line, Rect } from 'react-native-svg';

const { width } = Dimensions.get('window');

// Credit card standard dimensions in inches
const CREDIT_CARD_WIDTH_INCHES = 3.370;
const CREDIT_CARD_HEIGHT_INCHES = 2.125;

interface MeasurementPoint {
  x: number;
  y: number;
}

interface Measurements {
  rampAngle: number | null;
  rampHeight: number | null;
  gapDistance: number | null;
  landingHeight: number | null;
}

export default function MeasureScreen() {
  // Angle measurement states
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [currentAngle, setCurrentAngle] = useState<number | null>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [angleStable, setAngleStable] = useState(false);
  const angleHistory = useRef<number[]>([]);

  // Photo measurement states
  const [image, setImage] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [measurementMode, setMeasurementMode] = useState<'card' | 'rampHeight' | 'gap' | 'landing' | null>(null);
  const [cardPoints, setCardPoints] = useState<MeasurementPoint[]>([]);
  const [measurePoints, setMeasurePoints] = useState<MeasurementPoint[]>([]);
  const [pixelsPerInch, setPixelsPerInch] = useState<number | null>(null);

  // Final measurements
  const [measurements, setMeasurements] = useState<Measurements>({
    rampAngle: null,
    rampHeight: null,
    gapDistance: null,
    landingHeight: null,
  });

  // Accelerometer for angle measurement
  const startAngleMeasurement = () => {
    setIsCalibrating(true);
    setAngleStable(false);
    angleHistory.current = [];

    Accelerometer.setUpdateInterval(100);
    const sub = Accelerometer.addListener((data) => {
      // Calculate angle from accelerometer data
      // When phone is flat: z ≈ 1, x ≈ 0, y ≈ 0
      // When phone is tilted: angle = atan2(y, z) for pitch
      const { x, y, z } = data;
      
      // Calculate pitch angle (rotation around x-axis)
      const pitch = Math.atan2(y, Math.sqrt(x * x + z * z)) * (180 / Math.PI);
      
      // We want the angle of the surface the phone is resting on
      // If phone screen is facing up on a ramp, the angle is the pitch
      const angle = Math.abs(pitch);
      
      angleHistory.current.push(angle);
      
      // Keep last 20 readings
      if (angleHistory.current.length > 20) {
        angleHistory.current.shift();
      }
      
      // Calculate average and check stability
      if (angleHistory.current.length >= 10) {
        const avg = angleHistory.current.reduce((a, b) => a + b, 0) / angleHistory.current.length;
        const variance = angleHistory.current.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / angleHistory.current.length;
        
        setCurrentAngle(Math.round(avg * 10) / 10);
        
        // If variance is low, readings are stable
        if (variance < 1) {
          setAngleStable(true);
        } else {
          setAngleStable(false);
        }
      }
    });

    setSubscription(sub);
  };

  const stopAngleMeasurement = () => {
    if (subscription) {
      subscription.remove();
      setSubscription(null);
    }
    setIsCalibrating(false);
  };

  const saveAngle = () => {
    if (currentAngle !== null) {
      setMeasurements(prev => ({ ...prev, rampAngle: currentAngle }));
      stopAngleMeasurement();
      Alert.alert('Saved!', `Ramp angle: ${currentAngle}°`);
    }
  };

  useEffect(() => {
    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, [subscription]);

  // Photo measurement functions
  const pickImage = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera permission is needed to take measurements.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setImage(asset.uri);
      setImageSize({ width: asset.width, height: asset.height });
      setCardPoints([]);
      setMeasurePoints([]);
      setPixelsPerInch(null);
      setMeasurementMode('card');
    }
  };

  const handleImagePress = (event: any) => {
    if (!measurementMode || !imageSize) return;

    const { locationX, locationY } = event.nativeEvent;
    const displayWidth = width - 40;
    const displayHeight = (displayWidth / imageSize.width) * imageSize.height;
    
    // Scale coordinates to actual image size
    const scaleX = imageSize.width / displayWidth;
    const scaleY = imageSize.height / displayHeight;
    
    const point: MeasurementPoint = {
      x: locationX,
      y: locationY,
    };

    if (measurementMode === 'card') {
      if (cardPoints.length < 2) {
        const newPoints = [...cardPoints, point];
        setCardPoints(newPoints);
        
        if (newPoints.length === 2) {
          // Calculate pixels per inch from credit card width
          const dx = newPoints[1].x - newPoints[0].x;
          const dy = newPoints[1].y - newPoints[0].y;
          const pixelDistance = Math.sqrt(dx * dx + dy * dy);
          const ppi = pixelDistance / CREDIT_CARD_WIDTH_INCHES;
          setPixelsPerInch(ppi);
          setMeasurementMode(null);
          Alert.alert('Credit Card Marked', 'Now you can measure distances. Tap a measurement button below.');
        }
      }
    } else if (measurementMode === 'rampHeight' || measurementMode === 'gap' || measurementMode === 'landing') {
      if (measurePoints.length < 2) {
        const newPoints = [...measurePoints, point];
        setMeasurePoints(newPoints);
        
        if (newPoints.length === 2 && pixelsPerInch) {
          // Calculate distance
          const dx = newPoints[1].x - newPoints[0].x;
          const dy = newPoints[1].y - newPoints[0].y;
          const pixelDistance = Math.sqrt(dx * dx + dy * dy);
          const inches = pixelDistance / pixelsPerInch;
          const feet = inches / 12;
          
          const roundedFeet = Math.round(feet * 10) / 10;
          
          if (measurementMode === 'rampHeight') {
            setMeasurements(prev => ({ ...prev, rampHeight: roundedFeet }));
          } else if (measurementMode === 'gap') {
            setMeasurements(prev => ({ ...prev, gapDistance: roundedFeet }));
          } else if (measurementMode === 'landing') {
            setMeasurements(prev => ({ ...prev, landingHeight: roundedFeet }));
          }
          
          Alert.alert('Measured!', `Distance: ${roundedFeet} ft (${Math.round(inches)} inches)`);
          setMeasurePoints([]);
          setMeasurementMode(null);
        }
      }
    }
  };

  const startMeasurement = (type: 'rampHeight' | 'gap' | 'landing') => {
    if (!pixelsPerInch) {
      Alert.alert('Mark Credit Card First', 'Please mark the credit card width first by tapping its left and right edges.');
      return;
    }
    setMeasurePoints([]);
    setMeasurementMode(type);
  };

  const resetPhoto = () => {
    setImage(null);
    setImageSize(null);
    setCardPoints([]);
    setMeasurePoints([]);
    setPixelsPerInch(null);
    setMeasurementMode(null);
  };

  const getModeInstructions = () => {
    switch (measurementMode) {
      case 'card':
        return 'Tap the LEFT edge, then RIGHT edge of the credit card';
      case 'rampHeight':
        return 'Tap the BOTTOM, then TOP of the ramp to measure height';
      case 'gap':
        return 'Tap the START, then END of the gap to measure distance';
      case 'landing':
        return 'Tap the BOTTOM, then TOP to measure landing height difference';
      default:
        return 'Select a measurement to take';
    }
  };

  const renderImageOverlay = () => {
    if (!imageSize) return null;
    const displayWidth = width - 40;
    const displayHeight = (displayWidth / imageSize.width) * imageSize.height;

    return (
      <Svg width={displayWidth} height={displayHeight} style={styles.svgOverlay}>
        {/* Credit card points and line */}
        {cardPoints.map((point, index) => (
          <Circle
            key={`card-${index}`}
            cx={point.x}
            cy={point.y}
            r={8}
            fill="#4CAF50"
            stroke="#fff"
            strokeWidth={2}
          />
        ))}
        {cardPoints.length === 2 && (
          <Line
            x1={cardPoints[0].x}
            y1={cardPoints[0].y}
            x2={cardPoints[1].x}
            y2={cardPoints[1].y}
            stroke="#4CAF50"
            strokeWidth={3}
          />
        )}
        
        {/* Measurement points and line */}
        {measurePoints.map((point, index) => (
          <Circle
            key={`measure-${index}`}
            cx={point.x}
            cy={point.y}
            r={8}
            fill="#FF6B35"
            stroke="#fff"
            strokeWidth={2}
          />
        ))}
        {measurePoints.length === 2 && (
          <Line
            x1={measurePoints[0].x}
            y1={measurePoints[0].y}
            x2={measurePoints[1].x}
            y2={measurePoints[1].y}
            stroke="#FF6B35"
            strokeWidth={3}
            strokeDasharray="5,5"
          />
        )}
      </Svg>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Ionicons name="camera" size={32} color="#FF6B35" />
          <Text style={styles.title}>Measure Tool</Text>
          <Text style={styles.subtitle}>Use your phone to measure ramp dimensions</Text>
        </View>

        {/* Angle Measurement Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="analytics" size={20} color="#FF6B35" />
            <Text style={styles.sectionTitle}>Ramp Angle</Text>
          </View>
          
          <Text style={styles.instructions}>
            Place your phone flat on the ramp surface to measure the angle.
          </Text>

          {isCalibrating ? (
            <View style={styles.angleDisplay}>
              <View style={styles.angleCircle}>
                <Text style={styles.angleValue}>{currentAngle ?? '--'}°</Text>
                <Text style={styles.angleLabel}>
                  {angleStable ? 'Stable' : 'Stabilizing...'}
                </Text>
              </View>
              
              <View style={styles.angleButtons}>
                <TouchableOpacity
                  style={[styles.angleButton, styles.saveButton]}
                  onPress={saveAngle}
                  disabled={!angleStable}
                >
                  <Ionicons name="checkmark" size={20} color="#fff" />
                  <Text style={styles.angleButtonText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.angleButton, styles.cancelButton]}
                  onPress={stopAngleMeasurement}
                >
                  <Ionicons name="close" size={20} color="#FF6B35" />
                  <Text style={[styles.angleButtonText, { color: '#FF6B35' }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.startButton} onPress={startAngleMeasurement}>
              <Ionicons name="phone-portrait" size={24} color="#fff" />
              <Text style={styles.startButtonText}>Measure Angle</Text>
            </TouchableOpacity>
          )}

          {measurements.rampAngle !== null && (
            <View style={styles.savedMeasurement}>
              <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
              <Text style={styles.savedText}>Saved: {measurements.rampAngle}°</Text>
            </View>
          )}
        </View>

        {/* Photo Measurement Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="image" size={20} color="#FF6B35" />
            <Text style={styles.sectionTitle}>Distance Measurement</Text>
          </View>
          
          <Text style={styles.instructions}>
            Take a photo with a credit card in the frame as a reference. Then measure distances.
          </Text>

          {!image ? (
            <TouchableOpacity style={styles.startButton} onPress={pickImage}>
              <Ionicons name="camera" size={24} color="#fff" />
              <Text style={styles.startButtonText}>Take Photo with Credit Card</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.photoContainer}>
              {/* Instructions banner */}
              <View style={[
                styles.instructionBanner,
                measurementMode ? styles.instructionBannerActive : null
              ]}>
                <Text style={styles.instructionText}>{getModeInstructions()}</Text>
              </View>

              {/* Image with overlay */}
              <TouchableOpacity 
                activeOpacity={1} 
                onPress={handleImagePress}
                style={styles.imageWrapper}
              >
                <Image
                  source={{ uri: image }}
                  style={[
                    styles.previewImage,
                    imageSize && {
                      height: ((width - 40) / imageSize.width) * imageSize.height
                    }
                  ]}
                  resizeMode="contain"
                />
                {renderImageOverlay()}
              </TouchableOpacity>

              {/* Calibration status */}
              <View style={styles.calibrationStatus}>
                <Ionicons 
                  name={pixelsPerInch ? "checkmark-circle" : "ellipse-outline"} 
                  size={16} 
                  color={pixelsPerInch ? "#4CAF50" : "#888"} 
                />
                <Text style={[
                  styles.calibrationText,
                  pixelsPerInch && styles.calibrationTextActive
                ]}>
                  {pixelsPerInch ? 'Credit card calibrated' : 'Mark credit card edges'}
                </Text>
              </View>

              {/* Measurement buttons */}
              <View style={styles.measureButtons}>
                <TouchableOpacity
                  style={[
                    styles.measureButton,
                    measurementMode === 'rampHeight' && styles.measureButtonActive,
                    measurements.rampHeight !== null && styles.measureButtonDone
                  ]}
                  onPress={() => startMeasurement('rampHeight')}
                >
                  <Ionicons name="arrow-up" size={18} color="#fff" />
                  <Text style={styles.measureButtonText}>
                    {measurements.rampHeight !== null ? `${measurements.rampHeight} ft` : 'Ramp Height'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.measureButton,
                    measurementMode === 'gap' && styles.measureButtonActive,
                    measurements.gapDistance !== null && styles.measureButtonDone
                  ]}
                  onPress={() => startMeasurement('gap')}
                >
                  <Ionicons name="resize-horizontal" size={18} color="#fff" />
                  <Text style={styles.measureButtonText}>
                    {measurements.gapDistance !== null ? `${measurements.gapDistance} ft` : 'Gap Distance'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.measureButton,
                    measurementMode === 'landing' && styles.measureButtonActive,
                    measurements.landingHeight !== null && styles.measureButtonDone
                  ]}
                  onPress={() => startMeasurement('landing')}
                >
                  <Ionicons name="arrow-down" size={18} color="#fff" />
                  <Text style={styles.measureButtonText}>
                    {measurements.landingHeight !== null ? `${measurements.landingHeight} ft` : 'Landing Height'}
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.resetButton} onPress={resetPhoto}>
                <Ionicons name="refresh" size={18} color="#888" />
                <Text style={styles.resetButtonText}>Take New Photo</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Summary Section */}
        {(measurements.rampAngle !== null || measurements.rampHeight !== null || 
          measurements.gapDistance !== null || measurements.landingHeight !== null) && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="list" size={20} color="#FF6B35" />
              <Text style={styles.sectionTitle}>Measurements Summary</Text>
            </View>
            
            <View style={styles.summaryGrid}>
              {measurements.rampAngle !== null && (
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Ramp Angle</Text>
                  <Text style={styles.summaryValue}>{measurements.rampAngle}°</Text>
                </View>
              )}
              {measurements.rampHeight !== null && (
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Ramp Height</Text>
                  <Text style={styles.summaryValue}>{measurements.rampHeight} ft</Text>
                </View>
              )}
              {measurements.gapDistance !== null && (
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Gap Distance</Text>
                  <Text style={styles.summaryValue}>{measurements.gapDistance} ft</Text>
                </View>
              )}
              {measurements.landingHeight !== null && (
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Landing Height</Text>
                  <Text style={styles.summaryValue}>{measurements.landingHeight} ft</Text>
                </View>
              )}
            </View>

            <Text style={styles.tipText}>
              Use these measurements in the Calculator tab to get your required speed!
            </Text>
          </View>
        )}

        {/* Tips */}
        <View style={styles.tipsContainer}>
          <Text style={styles.tipsTitle}>
            <Ionicons name="bulb" size={16} color="#FF9800" /> Tips for Accurate Measurements
          </Text>
          <Text style={styles.tipItem}>• Place credit card flat on the ground parallel to camera</Text>
          <Text style={styles.tipItem}>• Keep camera level when taking photo</Text>
          <Text style={styles.tipItem}>• For angle: place phone directly on ramp surface</Text>
          <Text style={styles.tipItem}>• Measure at the same distance from camera as the credit card</Text>
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
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  section: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  instructions: {
    fontSize: 14,
    color: '#888',
    marginBottom: 16,
    lineHeight: 20,
  },
  startButton: {
    backgroundColor: '#FF6B35',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  angleDisplay: {
    alignItems: 'center',
  },
  angleCircle: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#FF6B35',
    marginBottom: 20,
  },
  angleValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FF6B35',
  },
  angleLabel: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  angleButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  angleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    gap: 8,
  },
  saveButton: {
    backgroundColor: '#4CAF50',
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#FF6B35',
  },
  angleButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  savedMeasurement: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    gap: 6,
  },
  savedText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
  },
  photoContainer: {
    marginTop: 8,
  },
  instructionBanner: {
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  instructionBannerActive: {
    backgroundColor: 'rgba(255, 107, 53, 0.2)',
    borderWidth: 1,
    borderColor: '#FF6B35',
  },
  instructionText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
  },
  imageWrapper: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
  },
  previewImage: {
    width: width - 40,
    borderRadius: 12,
  },
  svgOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  calibrationStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 6,
  },
  calibrationText: {
    color: '#888',
    fontSize: 13,
  },
  calibrationTextActive: {
    color: '#4CAF50',
  },
  measureButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },
  measureButton: {
    flex: 1,
    minWidth: 100,
    backgroundColor: '#2A2A2A',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  measureButtonActive: {
    backgroundColor: '#FF6B35',
  },
  measureButtonDone: {
    backgroundColor: '#4CAF50',
  },
  measureButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    padding: 12,
    gap: 6,
  },
  resetButtonText: {
    color: '#888',
    fontSize: 14,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  summaryItem: {
    backgroundColor: '#2A2A2A',
    borderRadius: 10,
    padding: 16,
    minWidth: (width - 80) / 2 - 6,
    alignItems: 'center',
  },
  summaryLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 4,
  },
  summaryValue: {
    color: '#FF6B35',
    fontSize: 24,
    fontWeight: 'bold',
  },
  tipText: {
    color: '#4CAF50',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 16,
  },
  tipsContainer: {
    backgroundColor: 'rgba(255, 152, 0, 0.1)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 152, 0, 0.3)',
  },
  tipsTitle: {
    color: '#FF9800',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  tipItem: {
    color: '#FFB74D',
    fontSize: 13,
    marginBottom: 6,
    lineHeight: 18,
  },
});
