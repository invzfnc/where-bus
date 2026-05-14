"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import SearchBar from "@/components/SearchBar";
import BottomSheet from "@/components/BottomSheet";
import SearchResultsPanel from "@/components/SearchResultsPanel";

export interface Stop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface Route {
  id: string;
  name: string;
  longName: string;
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

  // Data State
  const [searchQuery, setSearchQuery] = useState("");
  const [stopResults, setStopResults] = useState<Stop[]>([]);
  const [routeResults, setRouteResults] = useState<Route[]>([]);

  // Selection State
  const [selectedStop, setSelectedStop] = useState<Stop | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);

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
    setUiState("STANDBY");
  };

  // Selecting a stop on the route path: keep the route selected, just update the stop
  const handleSelectStopOnRoute = (stop: Stop) => {
    setSelectedStop(stop);
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
          onStopClick={handleSelectStopOnRoute}
        />
      </div>
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
              setUiState("STOP_SELECTED");
            }}
            onSelectRoute={(route) => {
              setSelectedRoute(route);
              setSelectedStop(null);
              setUiState("ROUTE_SELECTED");
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
        isOpen={uiState === "STOP_SELECTED" || uiState === "ROUTE_SELECTED"}
        onClose={() => {
          setUiState("STANDBY");
          setSelectedStop(null);
          setSelectedRoute(null);
        }}
        selectedStop={selectedStop}
        selectedRoute={selectedRoute}
      />
    </main>
  );
}
