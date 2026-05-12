'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bus, MapPin, Route as RouteIcon } from 'lucide-react';
import { Stop, Route } from '@/app/page';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  selectedStop: Stop | null;
  selectedRoute: Route | null;
}

// Custom hook to detect screen size for Framer Motion animations
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    // 768px matches Tailwind's 'md:' breakpoint
    const mediaQuery = window.matchMedia('(min-width: 768px)');
    setIsDesktop(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return isDesktop;
}

export default function BottomSheet({ isOpen, onClose, selectedStop, selectedRoute }: BottomSheetProps) {
  const isDesktop = useIsDesktop();

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
            
            {/* View for when a STOP is selected */}
            {selectedStop && (
              <>
                <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center">
                  <MapPin size={20} className="mr-2 text-gray-500" />
                  {selectedStop.name}
                </h2>
                <p className="text-sm text-gray-500 mb-5 ml-7">Stop ID: {selectedStop.id}</p>
                
                {/* Phase 6 Placeholder */}
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl flex flex-col items-center justify-center text-gray-400 py-8">
                  <Bus size={24} className="mb-2 opacity-50" />
                  <p className="text-sm text-center">Real-time ETAs will appear here once live tracking is connected.</p>
                </div>
              </>
            )}

            {/* View for when a ROUTE is selected */}
            {selectedRoute && (
              <>
                <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center">
                  <RouteIcon size={20} className="mr-2 text-blue-500" />
                  {selectedRoute.name}
                </h2>
                <p className="text-sm text-gray-500 mb-5 ml-7">{selectedRoute.longName}</p>
                
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl text-blue-700 text-sm flex items-center leading-relaxed">
                  <MapPin size={20} className="mr-3 shrink-0" />
                  The map is now displaying this route's path. Select a specific stop on the map to view arriving buses.
                </div>
              </>
            )}

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}