import React, { useState, useEffect, useCallback } from 'react';
import {
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  ScrollView,
  RefreshControl,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import Svg, { Circle, G, Text as SvgText, Rect, Line } from 'react-native-svg';
import {
  fetchJsonWithBackend,
  isBackendConfigured,
  listMapLocationsLocally,
  MapLocation,
} from '@/lib/appSupport';

const { width } = Dimensions.get('window');

export default function MapScreen() {
  const [locations, setLocations] = useState<MapLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<MapLocation | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 39.8283, lng: -98.5795 }); // US center
  const [mapZoom, setMapZoom] = useState(4);

  const fetchLocations = async () => {
    try {
      let data: MapLocation[];

      if (isBackendConfigured) {
        try {
          data = await fetchJsonWithBackend<MapLocation[]>('/api/map-locations');
        } catch {
          data = await listMapLocationsLocally();
        }
      } else {
        data = await listMapLocationsLocally();
      }

      setLocations(data);
      
      // Center map on locations if available
      if (data.length > 0) {
        const avgLat = data.reduce((sum: number, loc: MapLocation) => sum + loc.latitude, 0) / data.length;
        const avgLng = data.reduce((sum: number, loc: MapLocation) => sum + loc.longitude, 0) / data.length;
        setMapCenter({ lat: avgLat, lng: avgLng });
      }
    } catch (error) {
      console.error('Error fetching locations:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const getUserLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      try {
        const location = await Location.getCurrentPositionAsync({});
        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
        setMapCenter({
          lat: location.coords.latitude,
          lng: location.coords.longitude,
        });
        setMapZoom(8);
      } catch (error) {
        console.log('Error getting location:', error);
      }
    }
  };

  useEffect(() => {
    getUserLocation();
    fetchLocations();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchLocations();
  }, []);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Simple map projection (Mercator-like)
  const projectToMap = (lat: number, lng: number, centerLat: number, centerLng: number, zoom: number) => {
    const mapWidth = width - 40;
    const mapHeight = 300;
    const scale = Math.pow(2, zoom) * 0.5;
    
    const x = mapWidth / 2 + (lng - centerLng) * scale;
    const y = mapHeight / 2 - (lat - centerLat) * scale * 1.2; // Adjust for latitude
    
    return { x: Math.max(20, Math.min(mapWidth - 20, x)), y: Math.max(20, Math.min(mapHeight - 20, y)) };
  };

  const renderSimpleMap = () => {
    const mapWidth = width - 40;
    const mapHeight = 300;

    return (
      <View style={styles.mapContainer}>
        <Svg width={mapWidth} height={mapHeight} style={styles.mapSvg}>
          {/* Map background */}
          <Rect x="0" y="0" width={mapWidth} height={mapHeight} fill="#1A1A1A" rx="12" />
          
          {/* Grid lines */}
          {[...Array(5)].map((_, i) => (
            <G key={`grid-${i}`}>
              <Line
                x1={0}
                y1={(mapHeight / 4) * i}
                x2={mapWidth}
                y2={(mapHeight / 4) * i}
                stroke="#2A2A2A"
                strokeWidth="1"
              />
              <Line
                x1={(mapWidth / 4) * i}
                y1={0}
                x2={(mapWidth / 4) * i}
                y2={mapHeight}
                stroke="#2A2A2A"
                strokeWidth="1"
              />
            </G>
          ))}
          
          {/* User location */}
          {userLocation && (
            <G>
              <Circle
                cx={projectToMap(userLocation.latitude, userLocation.longitude, mapCenter.lat, mapCenter.lng, mapZoom).x}
                cy={projectToMap(userLocation.latitude, userLocation.longitude, mapCenter.lat, mapCenter.lng, mapZoom).y}
                r="20"
                fill="rgba(33, 150, 243, 0.2)"
              />
              <Circle
                cx={projectToMap(userLocation.latitude, userLocation.longitude, mapCenter.lat, mapCenter.lng, mapZoom).x}
                cy={projectToMap(userLocation.latitude, userLocation.longitude, mapCenter.lat, mapCenter.lng, mapZoom).y}
                r="8"
                fill="#2196F3"
                stroke="#fff"
                strokeWidth="2"
              />
            </G>
          )}
          
          {/* Location markers */}
          {locations.map((loc, index) => {
            const pos = projectToMap(loc.latitude, loc.longitude, mapCenter.lat, mapCenter.lng, mapZoom);
            const isSelected = selectedLocation?.id === loc.id;
            
            return (
              <G key={loc.id}>
                {/* Marker shadow/glow */}
                <Circle
                  cx={pos.x}
                  cy={pos.y}
                  r={isSelected ? 18 : 14}
                  fill={loc.is_shared ? 'rgba(76, 175, 80, 0.3)' : 'rgba(255, 107, 53, 0.3)'}
                />
                {/* Marker */}
                <Circle
                  cx={pos.x}
                  cy={pos.y}
                  r={isSelected ? 12 : 10}
                  fill={loc.is_shared ? '#4CAF50' : '#FF6B35'}
                  stroke="#fff"
                  strokeWidth="2"
                  onPress={() => setSelectedLocation(loc)}
                />
                {/* Number label */}
                <SvgText
                  x={pos.x}
                  y={pos.y + 4}
                  fill="#fff"
                  fontSize="10"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {index + 1}
                </SvgText>
              </G>
            );
          })}
        </Svg>
        
        {/* Map controls */}
        <View style={styles.mapControls}>
          <TouchableOpacity
            style={styles.mapControlButton}
            onPress={() => setMapZoom(Math.min(mapZoom + 1, 10))}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.mapControlButton}
            onPress={() => setMapZoom(Math.max(mapZoom - 1, 1))}
          >
            <Ionicons name="remove" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.mapControlButton}
            onPress={getUserLocation}
          >
            <Ionicons name="locate" size={20} color="#2196F3" />
          </TouchableOpacity>
        </View>
        
        {/* Legend */}
        <View style={styles.mapLegend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#FF6B35' }]} />
            <Text style={styles.legendText}>Private</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#4CAF50' }]} />
            <Text style={styles.legendText}>Shared</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#2196F3' }]} />
            <Text style={styles.legendText}>You</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderLocationCard = (loc: MapLocation, index: number) => (
    <TouchableOpacity
      key={loc.id}
      style={[
        styles.locationCard,
        selectedLocation?.id === loc.id && styles.locationCardSelected,
      ]}
      onPress={() => {
        setSelectedLocation(loc);
        setMapCenter({ lat: loc.latitude, lng: loc.longitude });
        setMapZoom(8);
      }}
    >
      <View style={styles.locationCardHeader}>
        <View style={[styles.locationNumber, { backgroundColor: loc.is_shared ? '#4CAF50' : '#FF6B35' }]}>
          <Text style={styles.locationNumberText}>{index + 1}</Text>
        </View>
        <View style={styles.locationInfo}>
          <Text style={styles.locationName}>{loc.name}</Text>
          <Text style={styles.locationAddress}>
            {loc.address || `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`}
          </Text>
        </View>
        {loc.is_shared && (
          <View style={styles.sharedBadgeSmall}>
            <Ionicons name="share-social" size={10} color="#fff" />
          </View>
        )}
      </View>
      
      <View style={styles.locationStats}>
        <View style={styles.locationStat}>
          <Ionicons name="speedometer" size={14} color="#4CAF50" />
          <Text style={styles.locationStatText}>{loc.required_speed_mph} mph</Text>
        </View>
        <View style={styles.locationStat}>
          <Ionicons name="resize" size={14} color="#2196F3" />
          <Text style={styles.locationStatText}>{loc.gap_distance} ft</Text>
        </View>
        <View style={styles.locationStat}>
          <Ionicons name="trending-up" size={14} color="#FF6B35" />
          <Text style={styles.locationStatText}>{loc.ramp_angle}°</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Jump Locations</Text>
        <Text style={styles.subtitle}>{locations.length} saved locations</Text>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6B35" />
          <Text style={styles.loadingText}>Loading map data...</Text>
        </View>
      ) : locations.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#FF6B35"
            />
          }
        >
          <Ionicons name="map-outline" size={64} color="#444" />
          <Text style={styles.emptyText}>No locations saved</Text>
          <Text style={styles.emptySubtext}>
            Save a calculation with location enabled to see it on the map
          </Text>
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.scrollView}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#FF6B35"
            />
          }
        >
          {/* Simple Map Visualization */}
          {renderSimpleMap()}
          
          {/* Location List */}
          <View style={styles.locationsList}>
            <Text style={styles.sectionTitle}>All Locations</Text>
            {locations.map((loc, index) => renderLocationCard(loc, index))}
          </View>
        </ScrollView>
      )}

      {/* Selected Location Details Modal */}
      <Modal
        visible={!!selectedLocation}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedLocation(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedLocation?.name}</Text>
              <TouchableOpacity onPress={() => setSelectedLocation(null)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {selectedLocation && (
                <>
                  {/* Location */}
                  <View style={styles.modalSection}>
                    <View style={styles.modalSectionHeader}>
                      <Ionicons name="location" size={18} color="#FF6B35" />
                      <Text style={styles.modalSectionTitle}>Location</Text>
                    </View>
                    <Text style={styles.modalText}>
                      {selectedLocation.address || 
                        `${selectedLocation.latitude.toFixed(6)}, ${selectedLocation.longitude.toFixed(6)}`}
                    </Text>
                  </View>

                  {/* Jump Stats */}
                  <View style={styles.modalSection}>
                    <View style={styles.modalSectionHeader}>
                      <Ionicons name="stats-chart" size={18} color="#FF6B35" />
                      <Text style={styles.modalSectionTitle}>Jump Stats</Text>
                    </View>
                    <View style={styles.modalStatsGrid}>
                      <View style={styles.modalStatItem}>
                        <Text style={styles.modalStatValue}>{selectedLocation.required_speed_mph}</Text>
                        <Text style={styles.modalStatLabel}>mph</Text>
                      </View>
                      <View style={styles.modalStatItem}>
                        <Text style={styles.modalStatValue}>{selectedLocation.gap_distance}</Text>
                        <Text style={styles.modalStatLabel}>ft gap</Text>
                      </View>
                      <View style={styles.modalStatItem}>
                        <Text style={styles.modalStatValue}>{selectedLocation.ramp_angle}</Text>
                        <Text style={styles.modalStatLabel}>degrees</Text>
                      </View>
                    </View>
                  </View>

                  {/* Share Info */}
                  {selectedLocation.is_shared && selectedLocation.share_code && (
                    <View style={styles.modalSection}>
                      <View style={styles.modalSectionHeader}>
                        <Ionicons name="share-social" size={18} color="#4CAF50" />
                        <Text style={styles.modalSectionTitle}>Shared</Text>
                      </View>
                      <View style={styles.shareCodeDisplay}>
                        <Text style={styles.shareCodeLabel}>Share Code:</Text>
                        <Text style={styles.shareCodeValue}>{selectedLocation.share_code}</Text>
                      </View>
                    </View>
                  )}

                  {/* Date */}
                  <View style={styles.modalSection}>
                    <View style={styles.modalSectionHeader}>
                      <Ionicons name="calendar" size={18} color="#888" />
                      <Text style={styles.modalSectionTitle}>Created</Text>
                    </View>
                    <Text style={styles.modalText}>{formatDate(selectedLocation.created_at)}</Text>
                  </View>
                </>
              )}
            </ScrollView>
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
  header: {
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
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
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
  mapContainer: {
    margin: 20,
    marginBottom: 0,
    position: 'relative',
  },
  mapSvg: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  mapControls: {
    position: 'absolute',
    right: 10,
    top: 10,
    gap: 8,
  },
  mapControlButton: {
    backgroundColor: '#2A2A2A',
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  mapLegend: {
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
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    color: '#888',
    fontSize: 12,
  },
  locationsList: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  locationCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  locationCardSelected: {
    borderColor: '#FF6B35',
  },
  locationCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  locationNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  locationNumberText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  locationInfo: {
    flex: 1,
  },
  locationName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  locationAddress: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  sharedBadgeSmall: {
    backgroundColor: '#4CAF50',
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationStats: {
    flexDirection: 'row',
    gap: 16,
  },
  locationStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationStatText: {
    color: '#ccc',
    fontSize: 13,
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
    maxHeight: '70%',
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
  modalSection: {
    marginBottom: 20,
  },
  modalSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  modalSectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalText: {
    color: '#ccc',
    fontSize: 14,
    lineHeight: 20,
  },
  modalStatsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 16,
  },
  modalStatItem: {
    alignItems: 'center',
  },
  modalStatValue: {
    color: '#FF6B35',
    fontSize: 24,
    fontWeight: 'bold',
  },
  modalStatLabel: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
  shareCodeDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    borderRadius: 10,
    padding: 12,
  },
  shareCodeLabel: {
    color: '#888',
    fontSize: 14,
    marginRight: 8,
  },
  shareCodeValue: {
    color: '#4CAF50',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
});
