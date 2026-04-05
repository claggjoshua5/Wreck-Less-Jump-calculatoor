import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ViroARScene,
  ViroARSceneNavigator,
  ViroNode,
  ViroSphere,
  ViroText,
  ViroPolyline,
  ViroAmbientLight,
  ViroMaterials,
  ViroTrackingStateConstants,
} from '@reactvision/react-viro';

const { width: screenWidth } = Dimensions.get('window');
const METERS_TO_FEET = 3.28084;

// Define materials for AR objects
try {
  ViroMaterials.createMaterials({
    markerStart: {
      diffuseColor: '#4CAF50',
      lightingModel: 'Constant',
    },
    markerEnd: {
      diffuseColor: '#FF6B35',
      lightingModel: 'Constant',
    },
    measureLine: {
      diffuseColor: '#FFEB3B',
      lightingModel: 'Constant',
    },
  });
} catch (e) {
  // Materials may already be created
}

type MeasureType = 'gap' | 'height' | 'angle';
type Viro3DPoint = [number, number, number];

interface ARMarker {
  position: Viro3DPoint;
  label: string;
}

interface Props {
  onMeasurement: (type: 'rampAngle' | 'rampHeight' | 'gapDistance', value: number) => void;
  onClose: () => void;
}

// ─── ViroARScene Component ─────────────────────────────────────────────────────
const ARMeasureScene = (props: any) => {
  const appProps = props.sceneNavigator?.viroAppProps || {};
  const { markers = [], onHitTestUpdate, trackingCallback } = appProps;

  return (
    <ViroARScene
      anchorDetectionTypes={['PlanesHorizontal', 'PlanesVertical']}
      onTrackingUpdated={(state: any, reason: any) => {
        if (trackingCallback) trackingCallback(state);
      }}
      onCameraARHitTest={(event: any) => {
        if (event.hitTestResults && event.hitTestResults.length > 0 && onHitTestUpdate) {
          // Prefer plane-based results for better accuracy
          const planeResult = event.hitTestResults.find(
            (r: any) =>
              r.type === 'ExistingPlaneUsingExtent' || r.type === 'ExistingPlane'
          );
          const bestResult = planeResult || event.hitTestResults[0];
          if (bestResult?.transform?.position) {
            onHitTestUpdate(bestResult.transform.position as Viro3DPoint);
          }
        }
      }}
    >
      <ViroAmbientLight color="#ffffff" intensity={500} />

      {/* Render placed markers */}
      {markers.map((marker: ARMarker, index: number) => (
        <ViroNode key={`marker-${index}`} position={marker.position}>
          <ViroSphere
            radius={0.03}
            materials={[index === 0 ? 'markerStart' : 'markerEnd']}
          />
          <ViroText
            text={marker.label}
            position={[0, 0.08, 0]}
            style={{
              fontSize: 14,
              color: '#FFFFFF',
              fontWeight: 'bold',
            }}
            outerStroke={{ type: 'Outline', width: 2, color: '#000000' }}
            width={1}
            height={0.3}
          />
        </ViroNode>
      ))}

      {/* Line between markers */}
      {markers.length === 2 && (
        <ViroPolyline
          position={[0, 0, 0]}
          points={markers.map((m: ARMarker) => m.position)}
          thickness={0.005}
          materials={['measureLine']}
        />
      )}

      {/* Distance label at midpoint between markers */}
      {markers.length === 2 && (() => {
        const p1 = markers[0].position;
        const p2 = markers[1].position;
        const mid: Viro3DPoint = [
          (p1[0] + p2[0]) / 2,
          Math.max(p1[1], p2[1]) + 0.15,
          (p1[2] + p2[2]) / 2,
        ];
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const dz = p2[2] - p1[2];
        const distMeters = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const distFeet = (distMeters * METERS_TO_FEET).toFixed(1);
        return (
          <ViroText
            text={`${distFeet} ft`}
            position={mid}
            style={{
              fontSize: 20,
              color: '#FFEB3B',
              fontWeight: 'bold',
            }}
            outerStroke={{ type: 'Outline', width: 3, color: '#000000' }}
            width={2}
            height={0.5}
          />
        );
      })()}
    </ViroARScene>
  );
};

// ─── Main AR Measure View ──────────────────────────────────────────────────────
export default function ARMeasureView({ onMeasurement, onClose }: Props) {
  const [arActive, setArActive] = useState(false);
  const [measureType, setMeasureType] = useState<MeasureType>('gap');
  const [markers, setMarkers] = useState<ARMarker[]>([]);
  const [trackingState, setTrackingState] = useState<number>(
    ViroTrackingStateConstants.TRACKING_UNAVAILABLE
  );
  const [measurement, setMeasurement] = useState<{
    totalDist: number;
    horizDist: number;
    vertDist: number;
    angle: number;
  } | null>(null);
  const latestHitPos = useRef<Viro3DPoint | null>(null);

  // Helpers
  const getTypeLabel = (type: MeasureType) => {
    switch (type) {
      case 'gap': return 'Gap Distance';
      case 'height': return 'Ramp Height';
      case 'angle': return 'Ramp Angle';
    }
  };

  const getTypeIcon = (type: MeasureType): string => {
    switch (type) {
      case 'gap': return 'resize-horizontal';
      case 'height': return 'arrow-up';
      case 'angle': return 'analytics';
    }
  };

  const getInstructions = (): string => {
    if (markers.length === 0) {
      switch (measureType) {
        case 'gap': return 'Aim at the TAKEOFF edge and tap Place Marker';
        case 'height': return 'Aim at the BASE of the ramp and tap Place Marker';
        case 'angle': return 'Aim at the BASE of the ramp and tap Place Marker';
      }
    }
    if (markers.length === 1) {
      switch (measureType) {
        case 'gap': return 'Now aim at the LANDING spot and tap Place Marker';
        case 'height': return 'Now aim at the TOP of the ramp and tap Place Marker';
        case 'angle': return 'Now aim at the TOP/LIP of the ramp and tap Place Marker';
      }
    }
    return 'Measurement complete!';
  };

  const placeMarker = () => {
    if (!latestHitPos.current) {
      Alert.alert('No Surface Detected', 'Point your camera at a flat surface and try again.');
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

  const calculateMeasurement = (m: ARMarker[]) => {
    const [p1, p2] = m.map((mk) => mk.position);
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const dz = p2[2] - p1[2];

    const totalDist = Math.sqrt(dx * dx + dy * dy + dz * dz) * METERS_TO_FEET;
    const horizDist = Math.sqrt(dx * dx + dz * dz) * METERS_TO_FEET;
    const vertDist = Math.abs(dy) * METERS_TO_FEET;
    const angle = Math.atan2(Math.abs(dy), Math.sqrt(dx * dx + dz * dz)) * (180 / Math.PI);

    setMeasurement({ totalDist, horizDist, vertDist, angle });
  };

  const saveMeasurement = () => {
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

    onMeasurement(type, value);
    Alert.alert(
      'Measurement Saved!',
      `${getTypeLabel(measureType)} has been saved.`,
      [
        { text: 'Measure More', onPress: resetMarkers },
        { text: 'Done', onPress: () => setArActive(false) },
      ]
    );
  };

  const resetMarkers = () => {
    setMarkers([]);
    setMeasurement(null);
    latestHitPos.current = null;
  };

  const getTrackingText = () => {
    switch (trackingState) {
      case ViroTrackingStateConstants.TRACKING_NORMAL: return 'Tracking: Good';
      case ViroTrackingStateConstants.TRACKING_LIMITED: return 'Scanning...';
      default: return 'Initializing AR...';
    }
  };

  const getTrackingColor = () => {
    switch (trackingState) {
      case ViroTrackingStateConstants.TRACKING_NORMAL: return '#4CAF50';
      case ViroTrackingStateConstants.TRACKING_LIMITED: return '#FF9800';
      default: return '#F44336';
    }
  };

  // ─── Pre-launch Screen ─────────────────────────────────────────────────
  if (!arActive) {
    return (
      <View style={styles.preLaunchContainer}>
        <View style={styles.arIconRow}>
          <Ionicons name="scan" size={44} color="#FF6B35" />
          <Text style={styles.arTitle}>True AR Measurement</Text>
          <Text style={styles.arSubtitle}>
            Use your camera to measure real-world distances with augmented reality
          </Text>
        </View>

        {/* Measure Type Selector */}
        <Text style={styles.selectLabel}>What do you want to measure?</Text>
        <View style={styles.typeSelector}>
          {(['gap', 'height', 'angle'] as MeasureType[]).map((type) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.typeButton,
                measureType === type && styles.typeButtonActive,
              ]}
              onPress={() => setMeasureType(type)}
            >
              <Ionicons
                name={getTypeIcon(type) as any}
                size={22}
                color={measureType === type ? '#fff' : '#888'}
              />
              <Text
                style={[
                  styles.typeButtonText,
                  measureType === type && styles.typeButtonTextActive,
                ]}
              >
                {getTypeLabel(type)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Instructions */}
        <View style={styles.howItWorks}>
          <Ionicons name="information-circle" size={18} color="#FF9800" />
          <View style={{ flex: 1 }}>
            <Text style={styles.howTitle}>How it works:</Text>
            <Text style={styles.howText}>
              1. Point camera at the area to measure{"\n"}
              2. Tap to place start and end markers{"\n"}
              3. Distance calculated in real-world units
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.launchButton} onPress={() => setArActive(true)}>
          <Ionicons name="camera" size={24} color="#fff" />
          <Text style={styles.launchButtonText}>Launch AR Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Full-screen AR Camera ─────────────────────────────────────────────
  return (
    <Modal visible={arActive} animationType="slide" statusBarTranslucent>
      <View style={styles.arContainer}>
        <ViroARSceneNavigator
          initialScene={{ scene: ARMeasureScene }}
          viroAppProps={{
            markers,
            onHitTestUpdate: (pos: Viro3DPoint) => {
              latestHitPos.current = pos;
            },
            trackingCallback: (state: number) => setTrackingState(state),
          }}
          style={{ flex: 1 }}
        />

        {/* ── Top Bar ── */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => setArActive(false)}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <View style={[styles.trackingBadge, { backgroundColor: getTrackingColor() }]}>
            <Text style={styles.trackingText}>{getTrackingText()}</Text>
          </View>
          <View style={styles.typeBadge}>
            <Ionicons name={getTypeIcon(measureType) as any} size={14} color="#FF6B35" />
            <Text style={styles.typeBadgeText}>{getTypeLabel(measureType)}</Text>
          </View>
        </View>

        {/* ── Center Crosshair ── */}
        <View style={styles.crosshairWrap} pointerEvents="none">
          <View style={styles.crossH} />
          <View style={styles.crossV} />
          <View style={styles.crossDot} />
        </View>

        {/* ── Instructions ── */}
        <View style={styles.instrOverlay}>
          <Text style={styles.instrText}>{getInstructions()}</Text>
          <View style={styles.dotRow}>
            <View style={[styles.dot, markers.length >= 1 && styles.dotActive]} />
            <View style={[styles.dot, markers.length >= 2 && styles.dotActive]} />
          </View>
        </View>

        {/* ── Bottom Controls ── */}
        <View style={styles.bottomBar}>
          {markers.length < 2 ? (
            <TouchableOpacity
              style={[
                styles.placeBtn,
                trackingState !== ViroTrackingStateConstants.TRACKING_NORMAL && styles.placeBtnDisabled,
              ]}
              onPress={placeMarker}
              disabled={trackingState !== ViroTrackingStateConstants.TRACKING_NORMAL}
            >
              <View style={styles.placeBtnInner}>
                <Ionicons name="add-circle" size={30} color="#fff" />
                <Text style={styles.placeBtnText}>Place Marker {markers.length + 1}</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.resultWrap}>
              <View style={styles.resultCard}>
                <Text style={styles.resultLabel}>{getTypeLabel(measureType)}</Text>
                <Text style={styles.resultValue}>
                  {measureType === 'angle'
                    ? `${measurement?.angle?.toFixed(1)}\u00B0`
                    : measureType === 'height'
                    ? `${measurement?.vertDist?.toFixed(1)} ft`
                    : `${measurement?.horizDist?.toFixed(1)} ft`}
                </Text>
                {measureType === 'gap' && measurement && (
                  <Text style={styles.resultSub}>
                    Total: {measurement.totalDist.toFixed(1)} ft
                  </Text>
                )}
              </View>
              <View style={styles.resultBtns}>
                <TouchableOpacity style={styles.saveBtn} onPress={saveMeasurement}>
                  <Ionicons name="checkmark" size={22} color="#fff" />
                  <Text style={styles.saveBtnText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.redoBtn} onPress={resetMarkers}>
                  <Ionicons name="refresh" size={22} color="#FF6B35" />
                  <Text style={styles.redoBtnText}>Redo</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Pre-launch
  preLaunchContainer: { flex: 1, paddingHorizontal: 4 },
  arIconRow: { alignItems: 'center', marginBottom: 20 },
  arTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginTop: 8 },
  arSubtitle: { color: '#888', fontSize: 13, textAlign: 'center', marginTop: 4, lineHeight: 19 },
  selectLabel: { color: '#aaa', fontSize: 13, fontWeight: '600', marginBottom: 10 },
  typeSelector: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  typeButton: {
    flex: 1,
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 4,
  },
  typeButtonActive: { backgroundColor: '#FF6B35' },
  typeButtonText: { color: '#888', fontSize: 11, fontWeight: '600' },
  typeButtonTextActive: { color: '#fff' },
  howItWorks: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 152, 0, 0.1)',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 152, 0, 0.25)',
  },
  howTitle: { color: '#FF9800', fontSize: 13, fontWeight: '600', marginBottom: 4 },
  howText: { color: '#ccc', fontSize: 12, lineHeight: 18 },
  launchButton: {
    backgroundColor: '#FF6B35',
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  launchButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },

  // Full-screen AR
  arContainer: { flex: 1, backgroundColor: '#000' },

  // Top bar
  topBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 30,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackingBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  trackingText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 4,
    marginLeft: 'auto',
  },
  typeBadgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },

  // Crosshair
  crosshairWrap: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -20,
    marginLeft: -20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  crossH: { position: 'absolute', width: 30, height: 1.5, backgroundColor: 'rgba(255,255,255,0.7)' },
  crossV: { position: 'absolute', width: 1.5, height: 30, backgroundColor: 'rgba(255,255,255,0.7)' },
  crossDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF6B35',
  },

  // Instructions overlay
  instrOverlay: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 100 : 80,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  instrText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    overflow: 'hidden',
  },
  dotRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  dotActive: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },

  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 40 : 24,
    left: 20,
    right: 20,
  },
  placeBtn: {
    backgroundColor: '#FF6B35',
    borderRadius: 16,
    paddingVertical: 16,
  },
  placeBtnDisabled: { backgroundColor: '#555', opacity: 0.7 },
  placeBtnInner: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  placeBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },

  // Results
  resultWrap: { gap: 12 },
  resultCard: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FF6B35',
  },
  resultLabel: { color: '#aaa', fontSize: 13, marginBottom: 4 },
  resultValue: { color: '#FF6B35', fontSize: 36, fontWeight: 'bold' },
  resultSub: { color: '#888', fontSize: 12, marginTop: 4 },
  resultBtns: { flexDirection: 'row', gap: 12 },
  saveBtn: {
    flex: 1,
    backgroundColor: '#4CAF50',
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  redoBtn: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#FF6B35',
  },
  redoBtnText: { color: '#FF6B35', fontSize: 16, fontWeight: '700' },
});
