"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import SearchBar from "@/components/SearchBar";
import BottomSheet from "@/components/BottomSheet";
import SearchResultsPanel from "@/components/SearchResultsPanel";

export interface Stop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  category?: string; // "rapid-bus-kl" | "rapid-bus-mrtfeeder"
}

export interface Route {
  id: string;
  name: string;
  longName: string;
  category?: string; // "rapid-bus-kl" | "rapid-bus-mrtfeeder"
}

const LiveMap = dynamic(() => import("@/components/LiveMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-gray-50 flex flex-col items-center justify-center">
      <div className="w-8 h-8 border-4 border-gray-400 border-t-transparent rounded-full animate-spin mb-4"></div>
    </div>
  ),
});

export type UIState =
  | "STANDBY"
  | "SEARCHING"
  | "STOP_SELECTED"
  | "ROUTE_SELECTED";

export default function Home() {
  const [uiState, setUiState] = useState<UIState>("STANDBY");
  const [isSheetOpen, setIsSheetOpen] = useState(true);

  // Data State
  const [searchQuery, setSearchQuery] = useState("");
  const [stopResults, setStopResults] = useState<Stop[]>([]);
  const [routeResults, setRouteResults] = useState<Route[]>([]);

  // Selection State
  const [selectedStop, setSelectedStop] = useState<Stop | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [routeStops, setRouteStops] = useState<Stop[]>([]);
  const [routeStopsError, setRouteStopsError] = useState(false);
  // Incremented on every onSelectRoute call so the effect always re-fires,
  // even when the same Route object reference is reselected after returning
  // to search (which would otherwise be a no-op due to Object.is equality).
  const [routeSelectionKey, setRouteSelectionKey] = useState(0);

  // Fetch the route's stop list whenever the selected route changes.
  // Uses AbortController (mirrors EtaList) so rapid re-selects abort the
  // in-flight request and never call setRouteStops with stale data.
  // Clearing routeStops is handled in the event handlers below, never here.
  useEffect(() => {
    if (!selectedRoute) return;

    const controller = new AbortController();
    fetch(`/api/transit/routes/${encodeURIComponent(selectedRoute.name)}/path`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: Stop[]) => {
        setRouteStopsError(false);
        setRouteStops(data);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('Failed to fetch route path', err);
        setRouteStopsError(true);
      });

    return () => controller.abort();
  }, [selectedRoute, routeSelectionKey]);

  // The Fetch Function connecting to Spring Boot
  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setStopResults([]);
      setRouteResults([]);
      return;
    }

    try {
      const res = await fetch(`/api/transit/search?q=${query}`);
      const data = await res.json();
      setStopResults(data.stops || []);
      setRouteResults(data.routes || []);
    } catch (error) {
      console.error("Failed to fetch search results:", error);
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
    setStopResults([]);
    setRouteResults([]);
    setIsSheetOpen(true);
    if (selectedRoute) {
      setUiState("ROUTE_SELECTED");
    } else if (selectedStop) {
      setUiState("STOP_SELECTED");
    } else {
      setUiState("STANDBY");
    }
  };

  // Full home reset: clears selection, route stops, search, and panel.
  // Called by the recenter button so one tap returns the app to its initial state.
  const resetToHome = () => {
    setSelectedStop(null);
    setSelectedRoute(null);
    setRouteStops([]);
    setRouteStopsError(false);
    setSearchQuery("");
    setStopResults([]);
    setRouteResults([]);
    setUiState("STANDBY");
    setIsSheetOpen(true);
  };

  const handleHideSheet = () => setIsSheetOpen(false);

  // Selecting a stop on the route path: keep the route selected, just update the stop
  const handleSelectStopOnRoute = (stop: Stop) => {
    setSelectedStop(stop);
    setIsSheetOpen(true);
    // deliberately do NOT clear selectedRoute or change uiState
  };

  return (
    <main className="relative h-[100dvh] w-screen overflow-hidden bg-gray-50 font-sans">
      {/* Background Map */}
<div
        className={`
          absolute inset-0 z-0
          transition-transform duration-500 ease-out
          ${uiState === "SEARCHING" ? "scale-[1.03]" : "scale-100"}
        `}
      >
        <LiveMap
          selectedRoute={selectedRoute}
          selectedStop={selectedStop}
          routeStops={routeStops}
          onStopClick={handleSelectStopOnRoute}
          onResetToHome={resetToHome}
          isSheetOpen={isSheetOpen}
        />
      </div>

      {/* Full Screen Search Results */}
      <div
    className={`
    absolute inset-0 z-10
    transition-all duration-300 ease-out
    ${
      uiState === "SEARCHING"
        ? "opacity-100 backdrop-blur-md bg-black/20 pointer-events-auto"
        : "opacity-0 pointer-events-none"
    }
  `}
      >
      <div
      className={`
      h-full w-full
      transform transition-all duration-300 ease-out
      ${
        uiState === "SEARCHING"
          ? "translate-y-0 opacity-100"
          : "translate-y-4 opacity-0"
      }
    `}
        >
          <SearchResultsPanel
            stopResults={stopResults}
            routeResults={routeResults}
            onSelectStop={(stop) => {
              setSelectedStop(stop);
              setSelectedRoute(null);
              setRouteStops([]);
              setRouteStopsError(false);
              setUiState("STOP_SELECTED");
              setIsSheetOpen(true);
            }}
            onSelectRoute={(route) => {
              setSelectedRoute(route);
              setSelectedStop(null);
              setRouteStops([]);
              setRouteStopsError(false);
              setRouteSelectionKey(k => k + 1);
              setUiState("ROUTE_SELECTED");
              setIsSheetOpen(true);
            }}
          />
        </div>
      </div>

      {/* Top Foreground: Search Command Center */}
      <SearchBar
        uiState={uiState}
        query={searchQuery}
        onQueryChange={handleSearch}
        onSearchFocus={() => setUiState("SEARCHING")}
        onCancel={clearSearch}
      />

      {/* Bottom Foreground: Draggable Data Sheet */}
      <BottomSheet
        isOpen={(uiState === "STOP_SELECTED" || uiState === "ROUTE_SELECTED") && isSheetOpen}
        onHide={handleHideSheet}
        selectedStop={selectedStop}
        selectedRoute={selectedRoute}
        routeStops={routeStops}
        routeStopsError={routeStopsError}
        onSelectStop={handleSelectStopOnRoute}
      />
    </main>
  );
}
