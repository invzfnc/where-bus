'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Bus } from 'lucide-react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function BottomSheet({ isOpen, onClose }: BottomSheetProps) {
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
            <h2 className="text-xl font-bold text-gray-900 mb-1">Masjid Ar-Rahman</h2>
            <p className="text-sm text-gray-500 mb-5">Universiti Malaya • Stop ID: 100432</p>

            <div className="space-y-3">
              {/* Mock Real Data Card */}
              <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-2xl">
                <div className="flex items-center space-x-4">
                  <div className="bg-gray-800 text-white font-bold px-3 py-1.5 rounded-lg text-sm">
                    T789
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">LRT Universiti</p>
                    <div className="flex items-center text-xs text-gray-500 mt-0.5">
                      <Bus size={12} className="mr-1" /> Approaching
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-800">4 min</p>
                  <p className="text-xs text-gray-400">10:50 AM</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}