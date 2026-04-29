'use client';

import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { LocateFixed } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

// Minimalist Grey Map Marker
const MinimalGrayIcon = L.divIcon({
  className: 'bg-transparent',
  html: `<div style="width: 14px; height: 14px; background-color: #374151; border: 2px solid white; border-radius: 50%; box-shadow: 0 2px 5px rgba(0,0,0,0.2);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const UM_POSITION: [number, number] = [3.1209, 101.6538];

function RecenterControl() {
  const map = useMap();
  return (
    <button 
      onClick={() => map.flyTo(UM_POSITION, 15)}
      className="absolute bottom-6 right-4 z-[400] bg-white p-3 rounded-full shadow-md text-gray-600 hover:text-black transition-all border border-gray-200"
    >
      <LocateFixed size={24} />
    </button>
  );
}

export default function LiveMap() {
  return (
    <div className="relative w-full h-full bg-gray-100">
      <MapContainer 
        center={UM_POSITION} 
        zoom={15} 
        style={{ height: '100%', width: '100%', zIndex: 0 }}
        zoomControl={false} 
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; OSM & CARTO'
        />
        
        <Marker position={[3.1209, 101.6538]} icon={MinimalGrayIcon}>
          <Popup>Masjid Ar-Rahman</Popup>
        </Marker>
        <Marker position={[3.1225, 101.6550]} icon={MinimalGrayIcon}>
          <Popup>Fakulti Sains</Popup>
        </Marker>

        <RecenterControl />
      </MapContainer>
    </div>
  );
}