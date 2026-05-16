'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bus, MapPin, Route as RouteIcon, X } from 'lucide-react';
import { Stop, Route } from '@/app/page';
import EtaList from '@/components/EtaList';

interface StopRoute {
  shortName: string;
  longName: string;
  servesOutbound: boolean;
  servesInbound: boolean;
  category?: string; // "rapid-bus-kl" | "rapid-bus-mrtfeeder"
}

interface BottomSheetProps {
  isOpen: boolean;
  onHide?: () => void;
  selectedStop: Stop | null;
  selectedRoute: Route | null;
  routeStops: Stop[];
  routeStopsError?: boolean;
  onSelectStop: (stop: Stop) => void;
}

// Custom hook to detect screen size for Framer Motion animations.
// Lazy initialiser reads the media query once on mount (avoids SSR mismatch)
// so the effect body only needs to subscribe to future changes — never calls
// setState synchronously, satisfying react-hooks/set-state-in-effect.
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(min-width: 768px)').matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 768px)');
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return isDesktop;
}

export default function BottomSheet({ isOpen, onHide, selectedStop, selectedRoute, routeStops, routeStopsError, onSelectStop }: BottomSheetProps) {
  const isDesktop = useIsDesktop();

  // Ref attached to whichever stop row is currently selected.
  const selectedRowRef = useRef<HTMLDivElement>(null);

  // Scroll the selected stop into view whenever it changes (map tap or panel tap).
  useEffect(() => {
    if (!selectedStop || !selectedRowRef.current) return;
    selectedRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [selectedStop?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Routes serving the selected stop (Branch 2 — stop selected with no route).
  // stopRoutesForId tracks which stop the cached routes belong to.
  // Comparing it to selectedStop.id lets us show a loading state between stops
  // without touching state synchronously inside the effect body, and — crucially —
  // prevents rendering <EtaList> with stale routes while the new fetch is in-flight
  // (which caused a spurious ETA request every time a new stop was selected).
  const [stopRoutes, setStopRoutes] = useState<StopRoute[]>([]);
  const [stopRoutesForId, setStopRoutesForId] = useState<string | null>(null);
  const [stopRoutesError, setStopRoutesError] = useState(false);

  useEffect(() => {
    if (!selectedStop) return;

    let cancelled = false;

    fetch(`/api/transit/stops/${encodeURIComponent(selectedStop.id)}/routes`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: StopRoute[]) => {
        if (!cancelled) {
          setStopRoutes(data);
          setStopRoutesForId(selectedStop.id);
          setStopRoutesError(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStopRoutesError(true);
          setStopRoutesForId(selectedStop.id);
        }
      });

    return () => { cancelled = true; };
  }, [selectedStop?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // True while the in-flight fetch has not yet resolved for the current stop.
  // During this window we show a spinner and never render <EtaList>.
  const stopRoutesStale = stopRoutesForId !== selectedStop?.id;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          // 1. Dynamic Animation: Slide from left on desktop, bottom on mobile
          initial={isDesktop ? { x: '-100%', y: 0 } : { y: '100%', x: 0 }}
          animate={{ x: 0, y: 0 }}
          exit={isDesktop ? { x: '-100%', y: 0 } : { y: '100%', x: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          
          // 2. Disable drag gesture on desktop, enable 'y' drag on mobile
          drag={isDesktop ? false : "y"}
          dragConstraints={{ top: 0 }}
          dragElastic={0.05}
          onDragEnd={(e, info) => {
            if (!isDesktop && info.offset.y > 100) {
              onHide?.();
            }
          }}
          
          // 3. Responsive Tailwind Styling (Mobile default + md: overrides)
          className="absolute z-[60] bg-white flex flex-col
                     /* Mobile styles */
                     bottom-0 left-0 right-0 rounded-t-3xl h-[50dvh] shadow-[0_-4px_20px_rgba(0,0,0,0.1)]
                     /* Desktop styles */
                     md:top-0 md:bottom-0 md:right-auto md:w-[400px] md:h-[100dvh] md:rounded-none md:shadow-[4px_0_20px_rgba(0,0,0,0.1)]"
        >
          {/* Drag Handle Area (Hidden on desktop) */}
          <div className="w-full flex justify-center pt-4 pb-2 shrink-0 cursor-grab active:cursor-grabbing md:hidden">
            <div className="w-12 h-1.5 bg-gray-300 rounded-full"></div>
          </div>

          {/* Desktop-only close (hide) button */}
          <button
            onClick={() => onHide?.()}
            className="hidden md:flex absolute top-4 right-4 z-10 w-8 h-8 items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="Hide panel"
          >
            <X size={18} />
          </button>

          {/* Scrollable Content inside the sheet */}
          <div className="px-6 pb-8 pt-2 overflow-y-auto flex-1 md:pt-8">
            
            {/* Branch 1: Route is selected — show full stop list with inline ETAs */}
            {selectedRoute ? (
              <>
                <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center">
                  {(() => {
                    const isMRT = selectedRoute.category
                      ? selectedRoute.category === 'rapid-bus-mrtfeeder'
                      : /^\d+$/.test(selectedRoute.id);
                    const iconColor = isMRT ? undefined : '#880808';
                    const iconLabel = isMRT ? 'MRT Feeder route' : 'RapidKL Bus route';
                    return (
                      <span
                        className="bg-gray-100 p-1.5 rounded-full mr-2 shrink-0 text-gray-600 inline-flex items-center justify-center"
                        title={iconLabel}
                        aria-label={iconLabel}
                      >
                        <RouteIcon size={18} color={iconColor} />
                      </span>
                    );
                  })()}
                  {selectedRoute.name}
                </h2>
                <p className="text-sm text-gray-500 mb-4 ml-7">{selectedRoute.longName}</p>

                {routeStopsError ? (
                  <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm text-center">
                    Failed to load stops. Please try again.
                  </div>
                ) : routeStops.length === 0 ? (
                  /* Loading state */
                  <div className="flex items-center justify-center py-10 text-gray-400">
                    <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin mr-2" />
                    <span className="text-sm">Loading stops…</span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {/* Deduplicate by stop.id — loop routes can visit the same
                        physical stop twice; first occurrence wins to preserve order. */}
                    {routeStops
                      .filter((stop, index, arr) => arr.findIndex(s => s.id === stop.id) === index)
                      .map((stop) => {
                      const isSelected = selectedStop?.id === stop.id;
                      return (
                        <div key={stop.id} ref={isSelected ? selectedRowRef : null}>
                          {/* Stop row */}
                          <button
                            onClick={() => onSelectStop(stop)}
                            className={`w-full text-left rounded-2xl px-3 py-2.5 transition-all duration-150 border ${
                              isSelected
                                ? 'bg-gray-100 border-gray-300 border-l-4 border-l-gray-600'
                                : 'bg-gray-50 border-gray-100 hover:bg-gray-100'
                            }`}
                          >
                            <p className={`text-sm leading-snug ${isSelected ? 'font-semibold text-gray-900' : 'font-medium text-gray-800'}`}>
                              {stop.name}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">Stop ID: {stop.id}</p>
                          </button>

                          {/* Inline ETA list — only for the selected stop */}
                          {isSelected && (
                            <div className="mt-2 mb-1 px-1">
                              <EtaList routeId={selectedRoute.name} stopId={stop.id} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>

            ) : selectedStop ? (
              /* Branch 2: Stop selected from search — show serving routes + live ETAs */
              <>
                <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center">
                  <MapPin size={20} className="mr-2 text-gray-500" />
                  {selectedStop.name}
                </h2>
                <p className="text-sm text-gray-500 mb-4 ml-7">Stop ID: {selectedStop.id}</p>

                {stopRoutesStale ? (
                  <div className="flex items-center justify-center py-10 text-gray-400">
                    <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin mr-2" />
                    <span className="text-sm">Loading routes…</span>
                  </div>
                ) : stopRoutesError ? (
                  <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm text-center">
                    Failed to load routes. Please try again.
                  </div>
                ) : stopRoutes.length === 0 ? (
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl flex flex-col items-center justify-center py-8 text-gray-400">
                    <Bus size={24} className="mb-2 opacity-50" />
                    <p className="text-sm text-center">No routes serve this stop.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {stopRoutes.map((route) => {
                      const isMRTFeeder = route.category
                        ? route.category === 'rapid-bus-mrtfeeder'
                        : route.shortName === route.longName;
                      const iconColor   = isMRTFeeder ? undefined : '#880808';
                      const iconLabel   = isMRTFeeder ? 'MRT Feeder route' : 'RapidKL Bus route';
                      return (
                      <div key={route.shortName} className="rounded-2xl border border-gray-100 overflow-hidden">
                        {/* Route header */}
                        <div className="flex items-center px-3 py-2.5 bg-gray-50 border-b border-gray-100">
                          <span
                            className="mr-2 shrink-0 text-gray-600"
                            title={iconLabel}
                            aria-label={iconLabel}
                          >
                            <RouteIcon size={16} color={iconColor} />
                          </span>
                          <div className="flex-1 min-w-0">
                            <span className="font-semibold text-gray-900 text-sm">{route.shortName}</span>
                            {route.longName && (
                              <span className="text-xs text-gray-500 ml-2 truncate block">
                                {isMRTFeeder ? 'MRT Feeder' : 'RapidKL Bus'} · {route.longName}
                              </span>
                            )}
                          </div>
                          <div className="flex gap-1 ml-2 shrink-0">
                            {route.servesOutbound && (
                              <span className="text-xs bg-gray-200 text-gray-600 rounded-full px-2 py-0.5">Out</span>
                            )}
                            {route.servesInbound && (
                              <span className="text-xs bg-gray-200 text-gray-600 rounded-full px-2 py-0.5">In</span>
                            )}
                          </div>
                        </div>
                        {/* Live ETAs for this route at this stop */}
                        <div className="p-3">
                          <EtaList routeId={route.shortName} stopId={selectedStop.id} />
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </>

            ) : null}

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}