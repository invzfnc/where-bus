"use client";

import { MapPin, Bus } from "lucide-react";
import { Stop, Route } from "@/app/page";

interface SearchResultsPanelProps {
  stopResults: Stop[];
  routeResults: Route[];
  onSelectStop: (stop: Stop) => void;
  onSelectRoute: (route: Route) => void;
  isDarkMode?: boolean;
}

export default function SearchResultsPanel({
  stopResults,
  routeResults,
  onSelectStop,
  onSelectRoute,
  isDarkMode = false,
}: SearchResultsPanelProps) {
  const accent = isDarkMode ? '#F97316' : '#5e6673';
  const isSearching = stopResults.length > 0 || routeResults.length > 0;

  return (
    <div
      className="
      absolute top-20 left-0 right-0 z-[50] px-4"
     >

    <div
      className="
      max-w-md mx-auto
      max-h-[75vh]
      overflow-y-auto

      rounded-3xl
      bg-white/90 dark:bg-[var(--bg-sidebar)]
      backdrop-blur-2xl
      border border-gray-200 dark:border-[var(--border-subtle)]
      shadow-2xl
      p-5 space-y-6"

      >
        
        {!isSearching && (
          <p className="text-sm text-center text-[#2B2926]/50 dark:text-[var(--text-muted)] mt-10">
            Type a route number or stop name to begin...
          </p>
        )}

        {/* Dynamic Routes Section */}
        {routeResults.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-bold text-[#2B2926]/50 dark:text-[var(--text-muted)] uppercase tracking-wider ml-2">
              Routes
            </p>
            {routeResults.map((route) => {
              const isMRTFeeder = route.category
                ? route.category === 'rapid-bus-mrtfeeder'
                : /^\d+$/.test(route.id);
              const routeColor  = accent;
              const iconLabel   = isMRTFeeder ? 'MRT Feeder route' : 'RapidKL Bus route';
              return (
                <div
                  key={route.id}
                  onClick={() => onSelectRoute(route)}
                  className="
                  flex items-center p-4
                  bg-white/70 dark:bg-[var(--bg-card)]
                  rounded-2xl
                  border border-gray-100 dark:border-[var(--border-card)]
                  shadow-sm
                  cursor-pointer
                  transition-all duration-200
                  hover:bg-white dark:hover:bg-[var(--bg-card-hover)]
                  hover:shadow-xl
                  hover:scale-[1.01]
                  active:scale-[0.99]"
                >
                  <div
                    className="p-3 rounded-full mr-4"
                    style={{ backgroundColor: `${routeColor}20` }}
                    title={iconLabel}
                    aria-label={iconLabel}
                  >
                    <Bus size={20} color={routeColor} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-[#2B2926] dark:text-[var(--text-primary)]">{route.name}</h3>
                    <p className="text-xs text-[#2B2926]/50 dark:text-[var(--text-secondary)] line-clamp-1">
                      {isMRTFeeder ? 'MRT Feeder' : 'RapidKL Bus'} · {route.longName}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Dynamic Stops Section */}
        {stopResults.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-bold text-[#2B2926]/50 dark:text-[var(--text-muted)] uppercase tracking-wider ml-2">
              Stops
            </p>
            {stopResults.map((stop) => {
              const isMRTFeeder = stop.category === 'rapid-bus-mrtfeeder';
              const iconLabel   = isMRTFeeder ? 'MRT Feeder stop' : 'Rapid Bus stop';
              return (
                <div
                  key={stop.id}
                  onClick={() => onSelectStop(stop)}
                  className="flex items-center p-4 bg-white/70 dark:bg-[var(--bg-card)] rounded-2xl border
                  border-gray-100 dark:border-[var(--border-card)] shadow-sm cursor-pointer transition-all
                  duration-200 hover:bg-white dark:hover:bg-[var(--bg-card-hover)] hover:shadow-xl hover:scale-[1.01]
                  active:scale-[0.99]"
                >
                  <div
                    className="bg-gray-100 dark:bg-[var(--bg-card-hover)] p-3 rounded-full mr-4"
                    title={iconLabel}
                    aria-label={iconLabel}
                  >
                    <MapPin size={20} color={accent} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-[#2B2926] dark:text-[var(--text-primary)]">{stop.name}</h3>
                    <p className="text-xs text-[#2B2926]/50 dark:text-[var(--text-secondary)]">
                      {isMRTFeeder ? 'MRT Feeder' : 'RapidKL Bus'} ({stop.id})
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
