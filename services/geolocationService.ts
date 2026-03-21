/**
 * Geolocation Service
 * Manejo de GPS + Location Permissions en iOS/Android
 */

import * as Location from 'expo-location';
import { GeoLocation } from '@/types/businessCard';

// Type definitions (in case expo-location types are not available)
interface LocationCoords {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  heading: number | null;
  speed: number | null;
}

interface LocationObject {
  coords: LocationCoords;
  timestamp: number;
}

/**
 * Solicitar permiso de ubicación al usuario
 */
export async function requestLocationPermission(): Promise<boolean> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('Error requesting location permission:', error);
    return false;
  }
}

/**
 * Obtener ubicación actual del usuario
 */
export async function getCurrentLocation(): Promise<GeoLocation | null> {
  try {
    // Primero verificar si ya tenemos permiso
    const { status } = await Location.getForegroundPermissionsAsync();
    
    if (status !== 'granted') {
      console.log('Location permission not granted');
      return null;
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 1000,
    });

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy || 0,
      timestamp: new Date(),
      userGPSPermissionGranted: true,
    };
  } catch (error) {
    console.error('Error getting current location:', error);
    return null;
  }
}

/**
 * Ver si el usuario ya otorgó permiso de Location
 */
export async function hasLocationPermission(): Promise<boolean> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('Error checking location permission:', error);
    return false;
  }
}

/**
 * Obtener nombre de ciudad desde coordenadas (Reverse Geocoding)
 */
export async function getCityFromCoordinates(
  latitude: number,
  longitude: number
): Promise<string | null> {
  try {
    const result = await Location.reverseGeocodeAsync({
      latitude,
      longitude,
    });

    if (result && result.length > 0) {
      const address = result[0];
      return address.city || address.region || 'Unknown Location';
    }

    return null;
  } catch (error) {
    console.error('Error reverse geocoding:', error);
    return null;
  }
}

/**
 * Obtener coordenadas desde dirección (Forward Geocoding)
 */
export async function getCoordinatesFromAddress(
  address: string
): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const result = await Location.geocodeAsync(address);

    if (result && result.length > 0) {
      const location = result[0];
      return {
        latitude: location.latitude,
        longitude: location.longitude,
      };
    }

    return null;
  } catch (error) {
    console.error('Error geocoding address:', error);
    return null;
  }
}
