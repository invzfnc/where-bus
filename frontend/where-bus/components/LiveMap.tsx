'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { LocateFixed } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { Stop, Route } from '@/app/page';

// Updated coordinates to point to FSKTM, Universiti Malaya
const FSKTM_POSITION: [number, number] = [3.1280, 101.6505];

const MinimalGrayIcon = L.divIcon({
  className: 'bg-transparent',
  html: `<div style="width: 14px; height: 14px; background-color: #374151; border: 2px solid white; border-radius: 50%; box-shadow: 0 2px 5px rgba(0,0,0,0.2);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

/**
 * Handles smooth camera animations and applies a mathematical offset
 * so the target coordinates appear in the top 25vh of the screen,
 * preventing the Bottom Sheet from covering the focal point.
 */
function MapUpdater({ center, zoom, isOffset }: { center: [number, number]; zoom: number; isOffset: boolean }) {
  const map = useMap();
  
  useEffect(() => {
    let targetLatLng = L.latLng(center[0], center[1]);

    if (isOffset) {
      const targetPoint = map.project(targetLatLng, zoom);
      const offsetPixels = window.innerHeight / 4;
      targetPoint.y += offsetPixels;
      targetLatLng = map.unproject(targetPoint, zoom);
    }

    map.flyTo(targetLatLng, zoom, { duration: 1.5 });
    
  }, [center[0], center[1], zoom, isOffset, map]);

  return null;
}

/**
 * Recenter button that uses a dynamic target position (user location or default).
 */
function RecenterControl({ targetPosition }: { targetPosition: [number, number] }) {
  const map = useMap();
  return (
    <button 
      onClick={() => map.flyTo(targetPosition, 15)}
      className="absolute bottom-[55vh] right-4 z-[400] bg-white p-3 rounded-full shadow-md text-gray-600 hover:text-black transition-all border border-gray-200"
    >
      <LocateFixed size={24} />
    </button>
  );
}

interface LiveMapProps {
  selectedStop: Stop | null;
  selectedRoute: Route | null;
}

export default function LiveMap({ selectedStop, selectedRoute }: LiveMapProps) {
  const [routeStops, setRouteStops] = useState<Stop[]>([]);
  // Use FSKTM as the initial default state
  const [userLocation, setUserLocation] = useState<[number, number]>(FSKTM_POSITION);
  const [hasUserLocation, setHasUserLocation] = useState(false);

  // Request browser geolocation on mount
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation([position.coords.latitude, position.coords.longitude]);
          setHasUserLocation(true);
        },
        (error) => {
          console.warn("Geolocation permission denied or failed. Using default location.", error.message);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    }
  }, []);

  // Fetch the physical polyline path when a route is selected
  useEffect(() => {
    if (selectedRoute) {
      fetch(`/api/transit/routes/${selectedRoute.id}/path`)
        .then(res => res.json())
        .then((data: Stop[]) => {
          setRouteStops(data);
        })
        .catch(err => console.error("Failed to fetch route path", err));
    } else {
      setRouteStops([]); 
    }
  }, [selectedRoute]);

  let currentCenter = userLocation;
  let currentZoom = 15;
  let applyOffset = false;

  if (selectedStop) {
    currentCenter = [selectedStop.latitude, selectedStop.longitude];
    currentZoom = 17; 
    applyOffset = true;
  } else if (routeStops.length > 0) {
    currentCenter = [routeStops[0].latitude, routeStops[0].longitude];
    currentZoom = 14; 
    applyOffset = true;
  }

  const polylineCoords: [number, number][] = routeStops.map(stop => [stop.latitude, stop.longitude]);

  return (
    <div className="relative w-full h-full bg-gray-100">
      <MapContainer 
        center={currentCenter} 
        zoom={currentZoom} 
        style={{ height: '100%', width: '100%', zIndex: 0 }}
        zoomControl={false} 
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; OSM & CARTO'
        />
        
        <MapUpdater center={currentCenter} zoom={currentZoom} isOffset={applyOffset} />
        
        {polylineCoords.length > 0 && (
          <Polyline 
            positions={polylineCoords} 
            color="#374151" 
            weight={4} 
            opacity={0.8} 
            dashArray="8, 6"
          />
        )}

        {routeStops.map((stop, index) => (
          <CircleMarker 
            key={`${stop.id}-${index}`} 
            center={[stop.latitude, stop.longitude]} 
            radius={5}
            pathOptions={{ color: 'white', fillColor: '#374151', fillOpacity: 1, weight: 2 }}
          >
            <Popup>{stop.name}</Popup>
          </CircleMarker>
        ))}

        {selectedStop && (
          <Marker position={[selectedStop.latitude, selectedStop.longitude]} icon={MinimalGrayIcon}>
            <Popup>{selectedStop.name}</Popup>
          </Marker>
        )}

        {/* Always draw a distinctive grey dot if the user's live location is known */}
        {hasUserLocation && (
          <CircleMarker 
            center={userLocation} 
            radius={7}
            pathOptions={{ color: 'white', fillColor: '#484849', fillOpacity: 1, weight: 3 }}
          >
            <Popup>Your Location</Popup>
          </CircleMarker>
        )}

        {/* Show the default FSKTM fallback if we don't have user location */}
        {!hasUserLocation && (
          <CircleMarker 
            center={FSKTM_POSITION} 
            radius={7}
            pathOptions={{ color: 'white', fillColor: '#484849', fillOpacity: 1, weight: 3 }}
          >
            <Popup>FSKTM, Universiti Malaya (Default)</Popup>
          </CircleMarker>
        )}

        {/* Pass the dynamic target position to the recenter button */}
        <RecenterControl targetPosition={userLocation} />
      </MapContainer>
    </div>
  );
}