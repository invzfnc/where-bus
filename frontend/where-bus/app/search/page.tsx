'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Keyboard, MapPin, MapPinned, Route as RouteIcon, Search } from 'lucide-react';
import BackHeader from '@/components/BackHeader';
import PhoneChrome from '@/components/PhoneChrome';
import { MOCK_ROUTES, MOCK_STOPS, Route, Stop } from '@/lib/mocks/transit';

function normalizeSearch(value: string) {
  return value.toLowerCase().replace(/\s+/g, '');
}

function SearchContent() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? 'Mid Valley');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const q = query.trim().toLowerCase();
  const compactQuery = normalizeSearch(query.trim());
  const matchedStops: Stop[] = q.length === 0
    ? MOCK_STOPS
    : MOCK_STOPS.filter(
        (s) => normalizeSearch(s.name).includes(compactQuery) || s.stopId.toLowerCase().includes(q)
      );

  const matchedRoutes: Route[] = q.length === 0
    ? MOCK_ROUTES
    : MOCK_ROUTES.filter(
        (r) =>
          r.routeId.toLowerCase().includes(q) ||
          normalizeSearch(r.from).includes(compactQuery) ||
          normalizeSearch(r.to).includes(compactQuery)
      );

  const noResults = q.length > 0 && matchedStops.length === 0 && matchedRoutes.length === 0;

  return (
    <main className="mobile-screen flex flex-col overflow-hidden">
      <PhoneChrome />
      <BackHeader title="search" href="/home" />

      <section className="px-[14px] pb-2">
        <div className="flex items-center gap-2 bg-white border border-ink rounded-lg px-[10px] py-2">
          <Search size={13} className="text-ink shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="stop name or route id..."
            className="flex-1 min-w-0 bg-transparent outline-none font-display font-bold text-ink text-[14px] placeholder:font-normal placeholder:text-ink-faint"
          />
          <span className="font-mono-brand text-ink-faint text-[9px]">|</span>
        </div>
      </section>

      <section className="flex-1 overflow-y-auto px-[14px] py-2">
        {noResults && (
          <p className="text-ink-faint text-[13px] text-center py-8">
            No results for &quot;{query}&quot;
          </p>
        )}

        {matchedStops.length > 0 && (
          <div className="mb-4">
            <p className="font-mono-brand text-ink-faint text-[9px] tracking-[0.08em] uppercase mb-2">
              stops - {matchedStops.length}
            </p>
            <div className="space-y-2">
              {matchedStops.slice(0, 4).map((stop) => (
                <Link
                  key={stop.stopId}
                  href={`/buses?stopId=${stop.stopId}&stopName=${encodeURIComponent(stop.name)}`}
                  className="flex items-center gap-2 bg-white border border-ink rounded-lg px-[10px] py-2"
                >
                  <span className="w-[22px] h-[22px] rounded-[5px] border border-ink bg-white flex items-center justify-center text-ink">
                    <MapPin size={12} />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-display font-bold text-ink text-[13px] leading-tight truncate">
                      {stop.name}
                    </span>
                    <span className="block font-display text-ink-soft text-[12px] leading-tight">
                      stop - {stop.stopId} - {stop.routeCount} routes
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {matchedRoutes.length > 0 && (
          <div>
            <p className="font-mono-brand text-ink-faint text-[9px] tracking-[0.08em] uppercase mb-2">
              routes - {matchedRoutes.length}
            </p>
            <div className="space-y-2">
              {matchedRoutes.slice(0, 3).map((route) => (
                <Link
                  key={route.routeId}
                  href={`/buses?routeId=${route.routeId}`}
                  className="flex items-center gap-2 bg-white border border-ink rounded-lg px-[10px] py-2"
                >
                  <span className="w-[22px] h-[22px] rounded-[5px] border border-accent bg-accent-faint flex items-center justify-center text-accent">
                    <RouteIcon size={12} />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-display font-bold text-ink text-[13px] leading-tight truncate">
                      {route.routeId} - {route.from} <span className="font-normal">to</span> {route.to}
                    </span>
                    <span className="block font-display text-ink-soft text-[12px] leading-tight">
                      {route.stopCount} stops - ~{route.durationMin} min
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="px-[14px] py-3">
        <div className="flex justify-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-white border border-ink px-[9px] py-[3px] font-mono-brand text-ink text-[9px]">
            <Keyboard size={10} />
            keyboard
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-paper-2 border border-ink-faint px-[9px] py-[3px] font-mono-brand text-ink-faint text-[9px]">
            <MapPinned size={10} />
            map pin soon
          </span>
        </div>
      </section>
    </main>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="mobile-screen" />}>
      <SearchContent />
    </Suspense>
  );
}
