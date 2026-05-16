'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, Tooltip, useMap } from 'react-leaflet';
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

// ---------------------------------------------------------------------------
// Live vehicle types + helpers
// ---------------------------------------------------------------------------

interface Vehicle {
  vehicleId: string;
  latitude: number;
  longitude: number;
  bearing: number | null;
  directionId: number;
  directionLabel: string;
  licensePlate: string;
}

/**
 * Projects point Q onto segment P1→P2 and returns t ∈ [0, 1] where the
 * closest point lies (0 = P1, 1 = P2). Works in flat lat/lng space — fine
 * for the short segments between consecutive stops.
 */
function projectOntoSegment(
  qLat: number, qLng: number,
  p1Lat: number, p1Lng: number,
  p2Lat: number, p2Lng: number,
): number {
  const dLat = p2Lat - p1Lat;
  const dLng = p2Lng - p1Lng;
  const lenSq = dLat * dLat + dLng * dLng;
  if (lenSq === 0) return 0;
  return Math.max(0, Math.min(1,
    ((qLat - p1Lat) * dLat + (qLng - p1Lng) * dLng) / lenSq,
  ));
}

/**
 * Returns the index i of the routeStops segment [i, i+1] whose closest point
 * to (busLat, busLng) is nearest. Uses exact point-to-segment distance so
 * both snapping and heading always reference the same segment.
 */
function findNearestSegmentIdx(busLat: number, busLng: number, routeStops: Stop[]): number {
  let minDist = Infinity;
  let bestIdx = 0;
  for (let i = 0; i < routeStops.length - 1; i++) {
    const t = projectOntoSegment(
      busLat, busLng,
      routeStops[i].latitude,     routeStops[i].longitude,
      routeStops[i + 1].latitude, routeStops[i + 1].longitude,
    );
    const snapLat = routeStops[i].latitude     + t * (routeStops[i + 1].latitude     - routeStops[i].latitude);
    const snapLng = routeStops[i].longitude    + t * (routeStops[i + 1].longitude    - routeStops[i].longitude);
    const d = Math.hypot(busLat - snapLat, busLng - snapLng);
    if (d < minDist) { minDist = d; bestIdx = i; }
  }
  return bestIdx;
}

/**
 * Snaps a raw GPS position onto the nearest point of the routeStops polyline.
 * Returns the raw position unchanged when routeStops has fewer than 2 entries.
 */
function snapToRoute(
  busLat: number,
  busLng: number,
  routeStops: Stop[],
): { lat: number; lng: number } {
  if (routeStops.length < 2) return { lat: busLat, lng: busLng };
  const i = findNearestSegmentIdx(busLat, busLng, routeStops);
  const t = projectOntoSegment(
    busLat, busLng,
    routeStops[i].latitude,     routeStops[i].longitude,
    routeStops[i + 1].latitude, routeStops[i + 1].longitude,
  );
  return {
    lat: routeStops[i].latitude  + t * (routeStops[i + 1].latitude  - routeStops[i].latitude),
    lng: routeStops[i].longitude + t * (routeStops[i + 1].longitude - routeStops[i].longitude),
  };
}

/**
 * Returns the compass bearing (0–360°, clockwise from North) the bus is
 * heading, derived from the nearest segment of the route-stop polyline.
 * Returns null if routeStops < 2.
 * routeStops is in outbound order; inbound is flipped 180°.
 */
function getHeadingForBus(
  busLat: number,
  busLng: number,
  routeStops: Stop[],
  directionId: number,
): number | null {
  if (routeStops.length < 2) return null;

  // Use the same segment-finding logic as snapToRoute so heading and snapped
  // position are always derived from the same polyline segment.
  const bestIdx = findNearestSegmentIdx(busLat, busLng, routeStops);

  // Haversine forward bearing of that segment
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const φ1 = toRad(routeStops[bestIdx].latitude);
  const φ2 = toRad(routeStops[bestIdx + 1].latitude);
  const Δλ = toRad(routeStops[bestIdx + 1].longitude - routeStops[bestIdx].longitude);
  const y  = Math.sin(Δλ) * Math.cos(φ2);
  const x  = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  let bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;

  if (directionId === 1) bearing = (bearing + 180) % 360;
  return bearing;
}

// Body colours — both clearly grey, distinguishable from each other.
const BUS_COLORS = {
  outbound: '#374151', // gray-700 — darker grey
  inbound:  '#6B7280', // gray-500 — lighter grey
};

/**
 * Builds a Leaflet DivIcon with a side-view bus silhouette (faces RIGHT by
 * default — corresponds to compass bearing 90°/east). The wrapper div is
 * rotated by (heading − 90°) so the front always points along the polyline.
 * When heading is null (routeStops < 2), rotation is 0 and no transform applied.
 *
 * SVG layout (viewBox 0 0 80 50, facing right):
 *   rect body + 3 side windows + 2 wheels with hub dots.
 */
function createBusIcon(heading: number | null, directionId: number): L.DivIcon {
  const fill  = directionId === 0 ? BUS_COLORS.outbound : BUS_COLORS.inbound;
  const rotateDeg = heading !== null ? heading - 90 : 0;

  // viewBox 0 0 80 50, rendered at 40×25 px. Front = right side.
  // Minimal design: rounded-rect body, 3 side windows, 2 wheels with hub dot.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 50" width="40" height="25">

    <!-- Body -->
    <rect x="1" y="2" width="78" height="30" rx="5"
          fill="${fill}" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>

    <!-- 3 side windows (rear → front) -->
    <rect x="5"  y="7" width="14" height="12" rx="2" fill="rgba(255,255,255,0.75)"/>
    <rect x="23" y="7" width="14" height="12" rx="2" fill="rgba(255,255,255,0.75)"/>
    <rect x="41" y="7" width="14" height="12" rx="2" fill="rgba(255,255,255,0.75)"/>

    <!-- Rear wheel + hub -->
    <circle cx="17" cy="38" r="8" fill="${fill}" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>
    <circle cx="17" cy="38" r="2.5" fill="rgba(255,255,255,0.6)"/>

    <!-- Front wheel + hub -->
    <circle cx="63" cy="38" r="8" fill="${fill}" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>
    <circle cx="63" cy="38" r="2.5" fill="rgba(255,255,255,0.6)"/>

  </svg>`;

  return L.divIcon({
    className: 'bg-transparent',
    html: `<div style="
      width:40px; height:40px;
      display:flex; align-items:center; justify-content:center;
      transform:rotate(${rotateDeg}deg);
      transform-origin:center;
      filter:drop-shadow(0 2px 5px rgba(0,0,0,0.35));
    ">${svg}</div>`,
    iconSize:   [40, 40],
    iconAnchor: [20, 20],
  });
}

/**
 * Handles smooth camera animations and applies dynamic bounding boxes
 * and offsets so the UI never covers the active target.
 */
function MapUpdater({
  selectedStop,
  routeStops,
  userLocation,
  isSheetOpen,
}: {
  selectedStop: Stop | null;
  routeStops: Stop[];
  userLocation: [number, number];
  isSheetOpen: boolean;
}) {
  const map = useMap();

  const fitToCurrentSelection = () => {
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;

    if (routeStops.length > 0) {
      // --- 1. ROUTE SELECTED: Fit bounds around the whole route ---
      const bounds = L.latLngBounds(routeStops.map(s => [s.latitude, s.longitude]));
      map.fitBounds(bounds, {
        paddingTopLeft: isDesktop ? (isSheetOpen ? [420, 50] : [50, 50]) : [50, 50],
        paddingBottomRight: isDesktop ? [50, 50] : [50, isSheetOpen ? (window?.innerHeight || 800) * 0.55 : 50],
        animate: true,
        duration: 1.5,
      });

    } else if (selectedStop) {
      // --- 2. STOP SELECTED: Pan to single point with visual offset ---
      const targetLatLng = L.latLng(selectedStop.latitude, selectedStop.longitude);
      const zoom = 17;
      const targetPoint = map.project(targetLatLng, zoom);

      if (isDesktop && isSheetOpen) {
        targetPoint.x -= 200;
      } else if (!isDesktop && isSheetOpen) {
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
        map.setView(targetLatLng, 15);
      }
    }
  };

  // Refit when selection changes (initial selection, stop change, etc.)
  useEffect(() => {
    fitToCurrentSelection();
    // Force Leaflet to recalculate container size to fix layout shifts
    const timeout = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(timeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStop, routeStops, userLocation, map]);

  // When the side panel hides, the map container widens but Leaflet caches
  // its old pixel dimensions. Wait for the Framer Motion spring to settle
  // (~400ms), invalidate Leaflet's size cache, then refit to the full viewport.
  useEffect(() => {
    if (isSheetOpen) return;
    const timeout = setTimeout(() => {
      map.invalidateSize();
      fitToCurrentSelection();
    }, 400);
    return () => clearTimeout(timeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSheetOpen]);

  return null;
}

/**
 * Recenter button that uses a dynamic target position.
 */
/**
 * Recenter button that uses a dynamic target position and accounts for UI overlays.
 */
function RecenterControl({
  targetPosition,
  onResetToHome,
}: {
  targetPosition: [number, number];
  onResetToHome: () => void;
}) {
  const map = useMap();

  const handleRecenter = () => {
    // Reset all app state to the home/default state first.
    onResetToHome();

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
  routeStops: Stop[];
  onStopClick: (stop: Stop) => void;
  onResetToHome: () => void;
  isSheetOpen: boolean;
}

export default function LiveMap({ selectedStop, selectedRoute, routeStops, onStopClick, onResetToHome, isSheetOpen }: LiveMapProps) {
  const [userLocation, setUserLocation] = useState<[number, number]>(FSKTM_POSITION);
  const [hasUserLocation, setHasUserLocation] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  // Poll live vehicle positions every 15 s while a route is selected.
  // setVehicles is only called inside the async callback to satisfy
  // the react-hooks/set-state-in-effect lint rule.
  useEffect(() => {
    if (!selectedRoute) return;

    let cancelled = false;
    const fetchVehicles = async () => {
      try {
        const res = await fetch(
          `/api/transit/vehicles?routeId=${encodeURIComponent(selectedRoute.name)}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: Vehicle[] = await res.json();
        if (!cancelled) setVehicles(data);
      } catch (err) {
        console.error('Failed to fetch vehicles:', err);
      }
    };

    fetchVehicles();
    const interval = setInterval(fetchVehicles, 15_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [selectedRoute]);

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
          isSheetOpen={isSheetOpen}
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
            eventHandlers={{ click: () => onStopClick(stop) }}
          />
        ))}

        {selectedStop && (
          <Marker position={[selectedStop.latitude, selectedStop.longitude]} icon={MinimalGrayIcon}>
            <Tooltip permanent direction="top" offset={[0, -10]}>
              {selectedStop.name}
            </Tooltip>
          </Marker>
        )}

        {/* Live bus markers — only rendered while a route is active */}
        {selectedRoute && vehicles.map((vehicle) => {
          // Snap raw GPS onto the polyline so the icon sits on the route line.
          const snapped = snapToRoute(vehicle.latitude, vehicle.longitude, routeStops);
          // Heading uses the same raw position so findNearestSegmentIdx picks
          // the same segment as snapToRoute and the flip stays consistent.
          const heading = getHeadingForBus(
            vehicle.latitude, vehicle.longitude,
            routeStops, vehicle.directionId,
          );
          return (
            <Marker
              key={vehicle.vehicleId}
              position={[snapped.lat, snapped.lng]}
              icon={createBusIcon(heading, vehicle.directionId)}
            >
              <Popup>
                <strong>{vehicle.licensePlate}</strong><br />
                <span style={{ textTransform: 'capitalize' }}>{vehicle.directionLabel}</span>
              </Popup>
            </Marker>
          );
        })}

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

        <RecenterControl targetPosition={userLocation} onResetToHome={onResetToHome} />
      </MapContainer>
    </div>
  );
}