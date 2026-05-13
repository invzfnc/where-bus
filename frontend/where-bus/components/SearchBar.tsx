'use client';

import { Search, X } from 'lucide-react';
import { UIState } from '@/app/page';

interface SearchBarProps {
  uiState: UIState;
  query: string;
  onQueryChange: (query: string) => void;
  onSearchFocus: () => void;
  onCancel: () => void;
}

export default function SearchBar({ uiState, query, onQueryChange, onSearchFocus, onCancel }: SearchBarProps) {
  return (
    /* Changed gap-2 to gap-1.5 and reduced horizontal side padding to left-3 right-3 for more room on mobile */
    <div className="absolute top-4 left-3 right-3 z-[60] max-w-md mx-auto flex items-center gap-1.5 transition-all">
      <div className="flex flex-1 items-center bg-white rounded-full shadow-md border border-gray-200 px-4 py-2.5">
        <input 
          type="text" 
          placeholder="Search route (e.g. T789) or stop..." 
          className="flex-1 bg-transparent outline-none text-gray-800 placeholder-gray-400 text-sm sm:text-base font-medium min-w-0"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onFocus={onSearchFocus}
        />
        {query.length > 0 ? (
          <button onClick={() => onQueryChange('')} className="text-gray-400 hover:text-gray-600 ml-2">
            <X size={18} />
          </button>
        ) : (
          <Search size={18} className="text-gray-500 ml-2" />
        )}
      </div>
      
      {uiState === 'SEARCHING' && (
        <button 
          onClick={onCancel}
          /* Reduced px-4 to px-3 and added whitespace-nowrap to prevent the text from wrapping */
          className="bg-white rounded-full px-3 py-2.5 text-xs sm:text-sm font-semibold text-gray-700 shadow-md border border-gray-200 hover:bg-gray-50 transition-colors whitespace-nowrap"
        >
          Cancel
        </button>
      )}
    </div>
  );
}