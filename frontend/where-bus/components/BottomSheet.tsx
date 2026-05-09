'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Bus, MapPin, Route as RouteIcon } from 'lucide-react';
import { Stop, Route } from '@/app/page';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  selectedStop: Stop | null;
  selectedRoute: Route | null;
}

export default function BottomSheet({ isOpen, onClose, selectedStop, selectedRoute }: BottomSheetProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ y: '100%' }}
          animate={{ y: '0%' }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          drag="y"
          dragConstraints={{ top: 0 }}
          dragElastic={0.05}
          onDragEnd={(e, info) => {
            // If dragged down far enough, close the sheet
            if (info.offset.y > 100) {
              onClose();
            }
          }}
          className="absolute bottom-0 left-0 right-0 z-[60] bg-white rounded-t-3xl shadow-[0_-4px_20px_rgba(0,0,0,0.1)] h-[50dvh] flex flex-col"
        >
          {/* Drag Handle Area */}
          <div className="w-full flex justify-center pt-4 pb-2 shrink-0 cursor-grab active:cursor-grabbing">
            <div className="w-12 h-1.5 bg-gray-300 rounded-full"></div>
          </div>

          {/* Scrollable Content inside the sheet */}
          <div className="px-6 pb-8 pt-2 overflow-y-auto flex-1">
            
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
                  <p className="text-sm text-center">Real-time ETAs will appear here when live tracking is connected.</p>
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
                  The map is now displaying this route path. Select a specific stop on the map to view arriving buses.
                </div>
              </>
            )}

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
