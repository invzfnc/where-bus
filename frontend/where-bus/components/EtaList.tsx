'use client';

import { useEffect, useState } from 'react';
import { Bus } from 'lucide-react';

interface EtaEntry {
  distanceMeters: number;
  stopsAway: number | null;
  licensePlate: string;
  directionLabel: string;
  directionId: number;
  vehicleId: string;
  etaFormatted: string;
  etaSeconds: number;
}

interface EtaListProps {
  routeId: string;
  stopId: string;
}

export default function EtaList({ routeId, stopId }: EtaListProps) {
  const [entries, setEntries] = useState<EtaEntry[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let currentController: AbortController | null = null;

    const fetchEta = async () => {
      const controller = new AbortController();
      currentController = controller;
      try {
        const res = await fetch(
          `/api/transit/eta?routeId=${encodeURIComponent(routeId)}&stopId=${encodeURIComponent(stopId)}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: EtaEntry[] = await res.json();
        setEntries(data);
        setError(false);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(true);
      }
    };

    fetchEta();
    const interval = setInterval(fetchEta, 30_000);
    return () => {
      currentController?.abort();
      clearInterval(interval);
    };
  }, [routeId, stopId]);

  // Loading state: first fetch hasn't returned yet
  if (entries === null && !error) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400">
        <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin mr-2" />
        <span className="text-sm">Loading ETAs…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm text-center">
        Failed to load ETAs. Will retry in 30 s.
      </div>
    );
  }

  if (entries!.length === 0) {
    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl flex flex-col items-center justify-center py-8 text-gray-400">
        <Bus size={24} className="mb-2 opacity-50" />
        <p className="text-sm text-center">No buses approaching right now.</p>
      </div>
    );
  }

  // Group buses by direction label (already sorted by ETA from the backend)
  const grouped = entries!.reduce<Record<string, EtaEntry[]>>((acc, entry) => {
    if (!acc[entry.directionLabel]) acc[entry.directionLabel] = [];
    acc[entry.directionLabel].push(entry);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([direction, buses]) => (
        <div key={direction}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 capitalize">
            {direction}
          </p>
          <div className="space-y-2">
            {buses.map((bus) => (
              <div
                key={bus.vehicleId}
                className="flex items-center p-3 bg-gray-50 border border-gray-200 rounded-2xl"
              >
                <div className="p-2 bg-gray-100 rounded-xl mr-3 shrink-0">
                  <Bus size={18} className="text-gray-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{bus.licensePlate}</p>
                  {bus.stopsAway != null && (
                    <p className="text-xs text-gray-500">{bus.stopsAway === 1 ? '1 stop away' : `${bus.stopsAway} stops away`}</p>
                  )}
                </div>
                <span className="text-base font-bold text-gray-900 ml-2 shrink-0">
                  {bus.etaFormatted}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
