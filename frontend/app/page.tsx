'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import SearchBar from '@/components/SearchBar';
import BottomSheet from '@/components/BottomSheet';
import SearchResultsPanel from '@/components/SearchResultsPanel';

const LiveMap = dynamic(() => import('@/components/LiveMap'), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-gray-50 flex flex-col items-center justify-center">
      <div className="w-8 h-8 border-4 border-gray-400 border-t-transparent rounded-full animate-spin mb-4"></div>
    </div>
  )
});

export type UIState = 'STANDBY' | 'SEARCHING' | 'STOP_SELECTED';

export default function Home() {
  const [uiState, setUiState] = useState<UIState>('STANDBY');

  return (
    <main className="relative h-[100dvh] w-screen overflow-hidden bg-gray-50 font-sans">
      
      {/* Background Map */}
      <div className="absolute inset-0 z-0">
        <LiveMap />
      </div>

      {/* Full Screen Search Results (Covers Map and Sheet) */}
      {uiState === 'SEARCHING' && (
        <SearchResultsPanel 
          onSelectStop={() => setUiState('STOP_SELECTED')} 
        />
      )}

      {/* Top Foreground: Search Command Center */}
      <SearchBar 
        uiState={uiState}
        onSearchFocus={() => setUiState('SEARCHING')} 
        onCancel={() => setUiState('STANDBY')}
      />

      {/* Bottom Foreground: Draggable Data Sheet */}
      <BottomSheet 
        isOpen={uiState === 'STOP_SELECTED'} 
        onClose={() => setUiState('STANDBY')} 
      />

    </main>
  );
}