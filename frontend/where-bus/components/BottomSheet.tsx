'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bus, MapPin, Route as RouteIcon } from 'lucide-react';
import { Stop, Route } from '@/app/page';
import EtaList from '@/components/EtaList';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  selectedStop: Stop | null;
  selectedRoute: Route | null;
  routeStops: Stop[];
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

export default function BottomSheet({ isOpen, onClose, selectedStop, selectedRoute, routeStops, onSelectStop }: BottomSheetProps) {
  const isDesktop = useIsDesktop();

  // Ref attached to whichever stop row is currently selected.
  const selectedRowRef = useRef<HTMLDivElement>(null);

  // Scroll the selected stop into view whenever it changes (map tap or panel tap).
  useEffect(() => {
    if (!selectedStop || !selectedRowRef.current) return;
    selectedRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [selectedStop?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
              onClose();
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

          {/* Scrollable Content inside the sheet */}
          <div className="px-6 pb-8 pt-2 overflow-y-auto flex-1 md:pt-8">
            
            {/* Branch 1: Route is selected — show full stop list with inline ETAs */}
            {selectedRoute ? (
              <>
                <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center">
                  <RouteIcon size={20} className="mr-2 text-blue-500" />
                  {selectedRoute.name}
                </h2>
                <p className="text-sm text-gray-500 mb-4 ml-7">{selectedRoute.longName}</p>

                {routeStops.length === 0 ? (
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
                                ? 'bg-blue-50 border-blue-200 border-l-4 border-l-blue-500'
                                : 'bg-gray-50 border-gray-100 hover:bg-gray-100'
                            }`}
                          >
                            <p className={`text-sm leading-snug ${isSelected ? 'font-semibold text-blue-900' : 'font-medium text-gray-800'}`}>
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
              /* Branch 2: Stop selected from search with no route */
              <>
                <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center">
                  <MapPin size={20} className="mr-2 text-gray-500" />
                  {selectedStop.name}
                </h2>
                <p className="text-sm text-gray-500 mb-5 ml-7">Stop ID: {selectedStop.id}</p>

                <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl flex flex-col items-center justify-center text-gray-400 py-8">
                  <Bus size={24} className="mb-2 opacity-50" />
                  <p className="text-sm text-center">Search for a route, then tap this stop on the map to see live ETAs.</p>
                </div>
              </>

            ) : null}

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}