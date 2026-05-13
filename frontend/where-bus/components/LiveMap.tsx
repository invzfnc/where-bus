'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { LocateFixed } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { Stop, Route } from '@/app/page';

const FSKTM_POSITION: [number, number] = [3.1280, 101.6505];

const MinimalGrayIcon = L.divIcon({
  className: 'bg-transparent',
  html: `<div style="width: 14px; height: 14px; background-color: #374151; border: 2px solid white; border-radius: 50%; box-shadow: 0 2px 5px rgba(0,0,0,0.2);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

/**
 * Handles smooth camera animations and applies dynamic bounding boxes 
 * and offsets so the UI never covers the active target.
 */
function MapUpdater({ 
  selectedStop, 
  routeStops, 
  userLocation 
}: { 
  selectedStop: Stop | null; 
  routeStops: Stop[]; 
  userLocation: [number, number];
}) {
  const map = useMap();
  
  useEffect(() => {
    // Safely check window size (important for Next.js SSR)
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;

    if (routeStops.length > 0) {
      // --- 1. ROUTE SELECTED: Fit bounds around the whole route ---
      const bounds = L.latLngBounds(routeStops.map(s => [s.latitude, s.longitude]));
      
      map.fitBounds(bounds, {
        paddingTopLeft: isDesktop ? [420, 50] : [50, 50], 
        paddingBottomRight: isDesktop ? [50, 50] : [50, (window?.innerHeight || 800) * 0.55], 
        animate: true,
        duration: 1.5
      });

    } else if (selectedStop) {
      // --- 2. STOP SELECTED: Pan to single point with visual offset ---
      const targetLatLng = L.latLng(selectedStop.latitude, selectedStop.longitude);
      const zoom = 17;
      const targetPoint = map.project(targetLatLng, zoom);
      
      if (isDesktop) {
        targetPoint.x -= 200; 
      } else {
        targetPoint.y += (window?.innerHeight || 800) * 0.25; 
      }
      
      const offsetLatLng = map.unproject(targetPoint, zoom);
      
      // Distance check to prevent shivering
      if (map.getCenter().distanceTo(offsetLatLng) > 50) {
        map.flyTo(offsetLatLng, zoom, { duration: 1.5 });
      } else {
        map.setView(offsetLatLng, zoom);
      }

    } else {
      // --- 3. DEFAULT: Pan to user location ---
      const targetLatLng = L.latLng(userLocation[0], userLocation[1]);
      
      if (map.getCenter().distanceTo(targetLatLng) > 50) {
        map.flyTo(targetLatLng, 15, { duration: 1.5 });
      } else {
        map.setView(targetLatLng, 15); // Instantly snap, no animation shivering!
      }
    }

    // Force Leaflet to recalculate container size to fix layout shifts
    const timeout = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(timeout);

  }, [selectedStop, routeStops, userLocation, map]);

  return null;
}

/**
 * Recenter button that uses a dynamic target position.
 */
/**
 * Recenter button that uses a dynamic target position and accounts for UI overlays.
 */
function RecenterControl({ targetPosition }: { targetPosition: [number, number] }) {
  const map = useMap();
  
  const handleRecenter = () => {
    const zoom = 15;
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
    const targetLatLng = L.latLng(targetPosition[0], targetPosition[1]);
    
    // Project to pixel coordinates to apply offset
    const targetPoint = map.project(targetLatLng, zoom);
    
    if (isDesktop) {
      // Offset for the left sidebar on desktop
      targetPoint.x -= 200; 
    } else {
      // Offset for the bottom sheet on mobile
      targetPoint.y += (window?.innerHeight || 800) * 0.25; 
    }
    
    // Unproject back to LatLng and fly there
    const offsetLatLng = map.unproject(targetPoint, zoom);
    map.flyTo(offsetLatLng, zoom, { duration: 1.0 });
  };

  return (
    <button 
      onClick={handleRecenter}
      className="absolute bottom-[55vh] md:bottom-8 right-4 md:right-8 z-[400] bg-white p-3 rounded-full shadow-md text-gray-600 hover:text-black transition-all border border-gray-200"
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
          console.warn("Geolocation permission denied or failed.", error.message);
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

  const polylineCoords: [number, number][] = routeStops.map(stop => [stop.latitude, stop.longitude]);

  return (
    <div className="relative w-full h-full bg-gray-100">
      <MapContainer 
        center={userLocation} 
        zoom={15} 
        style={{ height: '100%', width: '100%', zIndex: 0 }}
        zoomControl={false} 
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; OSM & CARTO'
        />
        
        {/* We moved all the camera logic into MapUpdater, passing the raw state */}
        <MapUpdater 
          selectedStop={selectedStop} 
          routeStops={routeStops} 
          userLocation={userLocation} 
        />
        
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

        {hasUserLocation && (
          <CircleMarker 
            center={userLocation} 
            radius={7}
            pathOptions={{ color: 'white', fillColor: '#484849', fillOpacity: 1, weight: 3 }}
          >
            <Popup>Your Location</Popup>
          </CircleMarker>
        )}

        {!selectedStop && !selectedRoute && !hasUserLocation && (
          <Marker position={FSKTM_POSITION} icon={MinimalGrayIcon}>
            <Popup>FSKTM, Universiti Malaya (Default)</Popup>
          </Marker>
        )}

        <RecenterControl targetPosition={userLocation} />
      </MapContainer>
    </div>
  );
}