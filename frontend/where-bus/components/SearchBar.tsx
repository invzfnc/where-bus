'use client';

import { Search, X, Moon, Sun } from 'lucide-react';
import { UIState } from '@/app/page';

interface SearchBarProps {
  uiState: UIState;
  query: string;
  onQueryChange: (query: string) => void;
  onSearchFocus: () => void;
  onCancel: () => void;
  isDarkMode: boolean;
  onToggleDark: () => void;
}

export default function SearchBar({ uiState, query, onQueryChange, onSearchFocus, onCancel, isDarkMode, onToggleDark }: SearchBarProps) {
  return (
    <div className="absolute top-4 left-3 right-3 z-[60] max-w-md mx-auto flex items-center gap-1.5 transition-all">
      <div className="flex flex-1 items-center bg-white dark:bg-[var(--bg-sidebar)] rounded-full shadow-md border border-gray-200 dark:border-[var(--border-subtle)] px-4 py-2.5">
        <input
          type="text"
          placeholder="Search route (e.g. T789) or stop..."
          className="flex-1 bg-transparent outline-none text-gray-800 dark:text-[var(--text-primary)] placeholder-gray-400 dark:placeholder-[var(--text-muted)] text-sm sm:text-base font-medium min-w-0"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onFocus={onSearchFocus}
        />
        {query.length > 0 ? (
          <button onClick={() => onQueryChange('')} className="text-gray-400 dark:text-[var(--text-muted)] hover:text-gray-600 dark:hover:text-[var(--text-primary)] ml-2">
            <X size={18} />
          </button>
        ) : (
          <Search size={18} className="text-gray-500 dark:text-[var(--text-muted)] ml-2" />
        )}
      </div>

      {/* Dark mode toggle — hidden while Cancel is showing to save space */}
      {uiState !== 'SEARCHING' && (
        <button
          onClick={onToggleDark}
          className="bg-white dark:bg-[var(--bg-sidebar)] rounded-full p-2.5 text-gray-500 dark:text-[var(--text-primary)] shadow-md border border-gray-200 dark:border-[var(--border-subtle)] hover:bg-gray-50 dark:hover:bg-[var(--bg-card-hover)] transition-colors"
          aria-label="Toggle dark mode"
        >
          {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      )}

      {uiState === 'SEARCHING' && (
        <button
          onClick={onCancel}
          className="bg-white dark:bg-[var(--bg-sidebar)] rounded-full px-3 py-2.5 text-xs sm:text-sm font-semibold text-gray-700 dark:text-[var(--text-primary)] shadow-md border border-gray-200 dark:border-[var(--border-subtle)] hover:bg-gray-50 dark:hover:bg-[var(--bg-card-hover)] transition-colors whitespace-nowrap"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
