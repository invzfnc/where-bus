'use client';

import { MapPin, Bus } from 'lucide-react';

interface SearchResultsPanelProps {
  onSelectStop: () => void;
}

export default function SearchResultsPanel({ onSelectStop }: SearchResultsPanelProps) {
  return (
    <div className="absolute inset-0 z-[50] bg-white/95 backdrop-blur-sm pt-24 px-4 overflow-y-auto">
      <div className="max-w-md mx-auto space-y-4">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-2">Recent Searches</p>
        
        {/* Mock Stop Result */}
        <div 
          onClick={onSelectStop}
          className="flex items-center p-4 bg-white rounded-2xl shadow-sm border border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
        >
          <div className="bg-gray-100 p-3 rounded-full mr-4 text-gray-600">
            <MapPin size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Masjid Ar-Rahman</h3>
            <p className="text-sm text-gray-500">Stop ID: 100432</p>
          </div>
        </div>

        {/* Mock Route Result */}
        <div 
          onClick={onSelectStop}
          className="flex items-center p-4 bg-white rounded-2xl shadow-sm border border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
        >
          <div className="bg-gray-100 p-3 rounded-full mr-4 text-gray-600">
            <Bus size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Route T789</h3>
            <p className="text-sm text-gray-500">LRT Universiti ↺ Universiti Malaya</p>
          </div>
        </div>
      </div>
    </div>
  );
}