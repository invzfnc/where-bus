'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { LocateFixed } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { Stop, Route } from '@/app/page';

// Minimalist Grey Map Marker
const MinimalGrayIcon = L.divIcon({
  className: 'bg-transparent',
  html: `<div style="width: 14px; height: 14px; background-color: #374151; border: 2px solid white; border-radius: 50%; box-shadow: 0 2px 5px rgba(0,0,0,0.2);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const UM_POSITION: [number, number] = [3.1209, 101.6538];

// Helper Component to Animate Map Movement
function MapUpdater({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.5 });
  }, [center, zoom, map]);
  return null;
}

// Helper Component for the Recenter Button
function RecenterControl() {
  const map = useMap();
  return (
    <button 
      onClick={() => map.flyTo(UM_POSITION, 15)}
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
  const [routePathCoords, setRoutePathCoords] = useState<[number, number][]>([]);

  // Fetch the physical polyline path when a route is selected
  useEffect(() => {
    if (selectedRoute) {
      fetch(`http://localhost:8080/api/transit/routes/${selectedRoute.id}/path`)
        .then(res => res.json())
        .then((data: Stop[]) => {
          // Convert the array of Stop objects into an array of [lat, lon] tuples for Leaflet
          const coords: [number, number][] = data.map(stop => [stop.latitude, stop.longitude]);
          setRoutePathCoords(coords);
        })
        .catch(err => console.error("Failed to fetch route path", err));
    } else {
      setRoutePathCoords([]); // Clear the line if route is deselected
    }
  }, [selectedRoute]);

  // Determine where the camera should point
  let currentCenter = UM_POSITION;
  let currentZoom = 15;

  if (selectedStop) {
    currentCenter = [selectedStop.latitude, selectedStop.longitude];
    currentZoom = 17; // Zoom in closer for a specific stop
  } else if (routePathCoords.length > 0) {
    currentCenter = routePathCoords[0]; // Center on the first stop of the route
    currentZoom = 14; // Zoom out to see the route
  }

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
        
        {/* The Camera Controller */}
        <MapUpdater center={currentCenter} zoom={currentZoom} />
        
        {/* Draw the Route Line */}
        {routePathCoords.length > 0 && (
          <Polyline 
            positions={routePathCoords} 
            color="#2563eb" // Tailwind blue-600
            weight={5} 
            opacity={0.8} 
          />
        )}

        {/* Draw the Selected Stop Marker */}
        {selectedStop && (
          <Marker position={[selectedStop.latitude, selectedStop.longitude]} icon={MinimalGrayIcon}>
            <Popup>{selectedStop.name}</Popup>
          </Marker>
        )}

        {/* Only draw default UM markers if nothing is actively selected */}
        {!selectedStop && !selectedRoute && (
          <>
            <Marker position={[3.1209, 101.6538]} icon={MinimalGrayIcon}>
              <Popup>Masjid Ar-Rahman (Default)</Popup>
            </Marker>
          </>
        )}

        <RecenterControl />
      </MapContainer>
    </div>
  );
}