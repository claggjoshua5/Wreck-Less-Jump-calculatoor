import React, { useState, useEffect, useCallback } from 'react';
import {
  Text,
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
  RefreshControl,
  Share,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const { width } = Dimensions.get('window');

interface SavedCalculation {
  id: string;
  name: string;
  description?: string;
  calculation: {
    input_data: {
      ramp_angle: number;
      gap_distance: number;
      bike_weight: number;
      rider_weight: number;
      unit_system: string;
    };
    required_speed_mph: number;
    required_speed_kph: number;
    safety_speed_mph: number;
    safety_speed_kph: number;
    flight_time_seconds: number;
    max_height_feet: number;
    max_height_meters: number;
  };
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  is_shared: boolean;
  share_code?: string;
  created_at: string;
}

export default function SavedScreen() {
  const [calculations, setCalculations] = useState<SavedCalculation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lookupCode, setLookupCode] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [showLookupModal, setShowLookupModal] = useState(false);
  const [selectedCalc, setSelectedCalc] = useState<SavedCalculation | null>(null);

  const fetchCalculations = async () => {
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/saved-calculations`);
      if (!response.ok) throw new Error('Failed to fetch calculations');
      const data = await response.json();
      setCalculations(data);
    } catch (error) {
      console.error('Error fetching calculations:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCalculations();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchCalculations();
  }, []);

  const handleDelete = async (id: string, name: string) => {
    Alert.alert(
      'Delete Calculation',
      `Are you sure you want to delete "${name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/saved-calculation/${id}`, {
                method: 'DELETE',
              });
              if (!response.ok) throw new Error('Failed to delete');
              setCalculations(calculations.filter(c => c.id !== id));
            } catch (error) {
              Alert.alert('Error', 'Failed to delete calculation');
            }
          },
        },
      ]
    );
  };

  const handleShare = async (calc: SavedCalculation) => {
    if (calc.share_code) {
      // Already shared, just share the code
      await shareCode(calc);
    } else {
      // Generate share code first
      try {
        const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/share-calculation/${calc.id}`, {
          method: 'POST',
        });
        if (!response.ok) throw new Error('Failed to share');
        const data = await response.json();
        calc.share_code = data.share_code;
        calc.is_shared = true;
        setCalculations([...calculations]);
        await shareCode(calc);
      } catch (error) {
        Alert.alert('Error', 'Failed to generate share code');
      }
    }
  };

  const shareCode = async (calc: SavedCalculation) => {
    const isMetric = calc.calculation.input_data.unit_system === 'metric';
    try {
      await Share.share({
        message: `Check out my dirt bike jump: "${calc.name}"\n\nShare Code: ${calc.share_code}\n\nRequired Speed: ${isMetric ? calc.calculation.required_speed_kph : calc.calculation.required_speed_mph} ${isMetric ? 'km/h' : 'mph'}\nGap: ${calc.calculation.input_data.gap_distance} ${isMetric ? 'm' : 'ft'}\nAngle: ${calc.calculation.input_data.ramp_angle}°\n${calc.location?.address ? `Location: ${calc.location.address}` : ''}`,
      });
    } catch (error) {
      console.log('Error sharing:', error);
    }
  };

  const handleLookup = async () => {
    if (!lookupCode.trim()) {
      Alert.alert('Error', 'Please enter a share code');
      return;
    }

    setIsLookingUp(true);
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/shared/${lookupCode.toUpperCase()}`);
      if (!response.ok) {
        throw new Error('Calculation not found');
      }
      const data = await response.json();
      setSelectedCalc(data);
      setShowLookupModal(false);
      setLookupCode('');
    } catch (error) {
      Alert.alert('Not Found', 'No calculation found with that share code.');
    } finally {
      setIsLookingUp(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const renderCalculationCard = (calc: SavedCalculation) => {
    const isMetric = calc.calculation.input_data.unit_system === 'metric';
    
    return (
      <View key={calc.id} style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleContainer}>
            <Text style={styles.cardTitle}>{calc.name}</Text>
            {calc.is_shared && (
              <View style={styles.sharedBadge}>
                <Ionicons name="share-social" size={12} color="#fff" />
                <Text style={styles.sharedBadgeText}>{calc.share_code}</Text>
              </View>
            )}
          </View>
          <Text style={styles.cardDate}>{formatDate(calc.created_at)}</Text>
        </View>

        {calc.description && (
          <Text style={styles.cardDescription}>{calc.description}</Text>
        )}

        <View style={styles.cardStats}>
          <View style={styles.statItem}>
            <Ionicons name="speedometer" size={16} color="#4CAF50" />
            <Text style={styles.statText}>
              {isMetric ? calc.calculation.required_speed_kph : calc.calculation.required_speed_mph} {isMetric ? 'km/h' : 'mph'}
            </Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="resize" size={16} color="#2196F3" />
            <Text style={styles.statText}>
              {calc.calculation.input_data.gap_distance} {isMetric ? 'm' : 'ft'}
            </Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="trending-up" size={16} color="#FF6B35" />
            <Text style={styles.statText}>{calc.calculation.input_data.ramp_angle}°</Text>
          </View>
        </View>

        {calc.location && (
          <View style={styles.locationRow}>
            <Ionicons name="location" size={14} color="#888" />
            <Text style={styles.locationText}>
              {calc.location.address || `${calc.location.latitude.toFixed(4)}, ${calc.location.longitude.toFixed(4)}`}
            </Text>
          </View>
        )}

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.cardActionButton}
            onPress={() => setSelectedCalc(calc)}
          >
            <Ionicons name="eye" size={18} color="#2196F3" />
            <Text style={styles.cardActionText}>View</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cardActionButton}
            onPress={() => handleShare(calc)}
          >
            <Ionicons name="share-social" size={18} color="#4CAF50" />
            <Text style={[styles.cardActionText, { color: '#4CAF50' }]}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cardActionButton}
            onPress={() => handleDelete(calc.id, calc.name)}
          >
            <Ionicons name="trash" size={18} color="#F44336" />
            <Text style={[styles.cardActionText, { color: '#F44336' }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderDetailModal = () => {
    if (!selectedCalc) return null;
    const isMetric = selectedCalc.calculation.input_data.unit_system === 'metric';

    return (
      <Modal
        visible={!!selectedCalc}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedCalc(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedCalc.name}</Text>
              <TouchableOpacity onPress={() => setSelectedCalc(null)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {selectedCalc.description && (
                <Text style={styles.modalDescription}>{selectedCalc.description}</Text>
              )}

              <View style={styles.resultCard}>
                <Text style={styles.resultLabel}>Required Speed</Text>
                <Text style={styles.resultValue}>
                  {isMetric ? selectedCalc.calculation.required_speed_kph : selectedCalc.calculation.required_speed_mph}
                  <Text style={styles.resultUnit}> {isMetric ? 'km/h' : 'mph'}</Text>
                </Text>
              </View>

              <View style={styles.safetyCard}>
                <Ionicons name="shield-checkmark" size={20} color="#FF9800" />
                <View style={{ marginLeft: 12 }}>
                  <Text style={styles.safetyLabel}>Safe Speed (+15%)</Text>
                  <Text style={styles.safetyValue}>
                    {isMetric ? selectedCalc.calculation.safety_speed_kph : selectedCalc.calculation.safety_speed_mph} {isMetric ? 'km/h' : 'mph'}
                  </Text>
                </View>
              </View>

              <Text style={styles.detailsTitle}>Jump Details</Text>
              <View style={styles.detailsGrid}>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Gap Distance</Text>
                  <Text style={styles.detailValue}>
                    {selectedCalc.calculation.input_data.gap_distance} {isMetric ? 'm' : 'ft'}
                  </Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Ramp Angle</Text>
                  <Text style={styles.detailValue}>{selectedCalc.calculation.input_data.ramp_angle}°</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Flight Time</Text>
                  <Text style={styles.detailValue}>{selectedCalc.calculation.flight_time_seconds}s</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Max Height</Text>
                  <Text style={styles.detailValue}>
                    {isMetric ? selectedCalc.calculation.max_height_meters : selectedCalc.calculation.max_height_feet} {isMetric ? 'm' : 'ft'}
                  </Text>
                </View>
              </View>

              {selectedCalc.location && (
                <View style={styles.locationSection}>
                  <Text style={styles.detailsTitle}>Location</Text>
                  <View style={styles.locationDetail}>
                    <Ionicons name="location" size={18} color="#FF6B35" />
                    <Text style={styles.locationDetailText}>
                      {selectedCalc.location.address || `${selectedCalc.location.latitude.toFixed(6)}, ${selectedCalc.location.longitude.toFixed(6)}`}
                    </Text>
                  </View>
                </View>
              )}

              {selectedCalc.share_code && (
                <View style={styles.shareSection}>
                  <Text style={styles.detailsTitle}>Share Code</Text>
                  <View style={styles.shareCodeBox}>
                    <Text style={styles.shareCodeText}>{selectedCalc.share_code}</Text>
                    <TouchableOpacity onPress={() => shareCode(selectedCalc)}>
                      <Ionicons name="copy" size={20} color="#FF6B35" />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Saved Calculations</Text>
        <TouchableOpacity
          style={styles.lookupButton}
          onPress={() => setShowLookupModal(true)}
        >
          <Ionicons name="search" size={20} color="#FF6B35" />
          <Text style={styles.lookupButtonText}>Lookup</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6B35" />
          <Text style={styles.loadingText}>Loading calculations...</Text>
        </View>
      ) : calculations.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="bookmark-outline" size={64} color="#444" />
          <Text style={styles.emptyText}>No saved calculations</Text>
          <Text style={styles.emptySubtext}>
            Calculate a jump and save it to see it here
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#FF6B35"
            />
          }
        >
          {calculations.map(renderCalculationCard)}
        </ScrollView>
      )}

      {/* Lookup Modal */}
      <Modal
        visible={showLookupModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowLookupModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '40%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Lookup Share Code</Text>
              <TouchableOpacity onPress={() => setShowLookupModal(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.lookupLabel}>Enter the 8-character share code:</Text>
              <TextInput
                style={styles.lookupInput}
                value={lookupCode}
                onChangeText={setLookupCode}
                placeholder="e.g., ABC12345"
                placeholderTextColor="#666"
                autoCapitalize="characters"
                maxLength={8}
              />
              <TouchableOpacity
                style={[styles.lookupSubmitButton, isLookingUp && { opacity: 0.6 }]}
                onPress={handleLookup}
                disabled={isLookingUp}
              >
                {isLookingUp ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="search" size={20} color="#fff" />
                    <Text style={styles.lookupSubmitText}>Find Calculation</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Detail Modal */}
      {renderDetailModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  lookupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  lookupButtonText: {
    color: '#FF6B35',
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    marginTop: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    color: '#888',
    fontSize: 18,
    marginTop: 16,
    fontWeight: '600',
  },
  emptySubtext: {
    color: '#666',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardTitleContainer: {
    flex: 1,
    marginRight: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  sharedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 6,
    alignSelf: 'flex-start',
    gap: 4,
  },
  sharedBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  cardDate: {
    color: '#888',
    fontSize: 12,
  },
  cardDescription: {
    color: '#aaa',
    fontSize: 14,
    marginBottom: 12,
  },
  cardStats: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  locationText: {
    color: '#888',
    fontSize: 12,
    flex: 1,
  },
  cardActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: 12,
    marginTop: 4,
  },
  cardActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  cardActionText: {
    color: '#2196F3',
    fontSize: 14,
    fontWeight: '600',
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
    maxHeight: '85%',
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
  modalDescription: {
    color: '#aaa',
    fontSize: 14,
    marginBottom: 20,
    lineHeight: 20,
  },
  resultCard: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  resultLabel: {
    color: '#888',
    fontSize: 14,
    marginBottom: 8,
  },
  resultValue: {
    color: '#4CAF50',
    fontSize: 36,
    fontWeight: 'bold',
  },
  resultUnit: {
    fontSize: 20,
    fontWeight: 'normal',
  },
  safetyCard: {
    backgroundColor: 'rgba(255, 152, 0, 0.1)',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 152, 0, 0.3)',
  },
  safetyLabel: {
    color: '#FF9800',
    fontSize: 12,
  },
  safetyValue: {
    color: '#FF9800',
    fontSize: 20,
    fontWeight: 'bold',
  },
  detailsTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  detailItem: {
    backgroundColor: '#2A2A2A',
    borderRadius: 10,
    padding: 12,
    width: (width - 64) / 2,
  },
  detailLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 4,
  },
  detailValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  locationSection: {
    marginBottom: 20,
  },
  locationDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2A2A2A',
    borderRadius: 10,
    padding: 12,
  },
  locationDetailText: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
  },
  shareSection: {
    marginBottom: 20,
  },
  shareCodeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2A2A2A',
    borderRadius: 10,
    padding: 16,
  },
  shareCodeText: {
    color: '#FF6B35',
    fontSize: 24,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  lookupLabel: {
    color: '#ccc',
    fontSize: 14,
    marginBottom: 12,
  },
  lookupInput: {
    backgroundColor: '#2A2A2A',
    borderRadius: 10,
    padding: 16,
    fontSize: 18,
    color: '#fff',
    textAlign: 'center',
    letterSpacing: 2,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 16,
  },
  lookupSubmitButton: {
    backgroundColor: '#FF6B35',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  lookupSubmitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
