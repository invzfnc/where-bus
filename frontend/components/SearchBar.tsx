'use client';

import { Search, X } from 'lucide-react';
import { UIState } from '@/app/page';

interface SearchBarProps {
  uiState: UIState;
  onSearchFocus: () => void;
  onCancel: () => void;
}

export default function SearchBar({ uiState, onSearchFocus, onCancel }: SearchBarProps) {
  return (
    <div className="absolute top-4 left-4 right-4 z-[60] max-w-md mx-auto flex gap-2 transition-all">
      <div className="flex flex-1 items-center bg-white rounded-full shadow-md border border-gray-200 px-5 py-3">
        <input 
          type="text" 
          placeholder="Search route (e.g. T789) or stop..." 
          className="flex-1 bg-transparent outline-none text-gray-800 placeholder-gray-400 text-base font-medium"
          onFocus={onSearchFocus}
        />
        <Search size={20} className="text-gray-500 ml-3" />
      </div>
      
      {/* Cancel button only appears when the search panel is active */}
      {uiState === 'SEARCHING' && (
        <button 
          onClick={onCancel}
          className="bg-white rounded-full px-4 text-sm font-semibold text-gray-700 shadow-md border border-gray-200 hover:bg-gray-50"
        >
          Cancel
        </button>
      )}
    </div>
  );
}