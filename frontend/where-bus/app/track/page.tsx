'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Bell, ListTree, MapPinned, Navigation, RefreshCcw, Route as RouteIcon } from 'lucide-react';
import BackHeader from '@/components/BackHeader';
import BottomTabBar from '@/components/BottomTabBar';
import MapPlaceholder from '@/components/MapPlaceholder';
import PhoneChrome from '@/components/PhoneChrome';
import { MOCK_BUSES, MOCK_ROUTES, MOCK_ROUTE_STOPS } from '@/lib/mocks/transit';

const POLL_INTERVAL = 30;

function TrackContent() {
  const searchParams = useSearchParams();
  const busId = searchParams.get('busId') ?? 'T789-04';
  const routeId = searchParams.get('routeId') ?? 'T789';
  const stopId = searchParams.get('stopId') ?? '1005840';

  const [secondsLeft, setSecondsLeft] = useState(POLL_INTERVAL);

  useEffect(() => {
    const tick = setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? POLL_INTERVAL : s - 1));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  const bus = MOCK_BUSES.find((b) => b.busId === busId) ?? MOCK_BUSES[0];
  const route = MOCK_ROUTES.find((r) => r.routeId === routeId) ?? MOCK_ROUTES[0];
  const routeStops = MOCK_ROUTE_STOPS;
  const userStopIndex = routeStops.findIndex((s) => s.stopId === stopId);
  const totalStops = routeStops.length;
  const stopSequence = userStopIndex >= 0 ? userStopIndex + 1 : 3;
  const userStopName = routeStops[userStopIndex]?.name ?? 'UM Main Gate';
  const nextStops = routeStops.slice(Math.max(0, userStopIndex - 1), userStopIndex + 3);
  const etaOffsets = [bus.eta - 2, bus.eta, bus.eta + 4, bus.eta + 8];

  return (
    <main className="mobile-screen flex flex-col overflow-hidden">
      <PhoneChrome />
      <BackHeader
        title={`${routeId} -> ${route.to}`}
        subtitle="updates every 30s - last refreshed just now"
        right={
          <span className="inline-flex items-center gap-1 rounded-full bg-white border border-ink px-[9px] py-[3px] font-mono-brand text-ink text-[9px]">
            <RefreshCcw size={10} />
            {secondsLeft}s
          </span>
        }
      />

      <section className="mx-[10px] mt-1 mb-2 border border-ink rounded-[10px] bg-accent-faint px-3 py-[10px]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono-brand text-ink-faint text-[9px] tracking-[0.08em] uppercase">
              arriving in
            </p>
            <div className="font-display font-bold text-accent text-[46px] leading-[0.9] tracking-[-0.025em]">
              {bus.eta} min
            </div>
          </div>
          <div className="text-right pt-0.5">
            <p className="font-mono-brand text-ink-faint text-[9px] tracking-[0.08em] uppercase">
              at
            </p>
            <p className="font-display font-bold text-ink text-[13px] leading-tight mt-1">
              {userStopName}
            </p>
            <p className="font-display text-ink-soft text-[12px] leading-tight">
              stop {String(stopSequence).padStart(2, '0')} of {totalStops}
            </p>
          </div>
        </div>
      </section>

      <section className="mx-[10px] mb-2">
        <MapPlaceholder className="h-[130px]" />
      </section>

      <section className="mx-[10px] mb-2 border border-ink rounded-lg bg-white px-[10px] py-2">
        <div className="flex items-center gap-2">
          <span className="w-[22px] h-[22px] rounded-[5px] border border-accent bg-accent-faint flex items-center justify-center text-accent shrink-0">
            <Navigation size={12} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-mono-brand text-ink-faint text-[9px] tracking-[0.08em] uppercase">
              shortest route
            </p>
            <p className="font-display font-bold text-ink text-[13px] leading-tight truncate">
              {routeStops.length} stops - ~{route.durationMin} min via {route.to}
            </p>
          </div>
        </div>
      </section>

      <section className="px-[14px] py-1">
        <p className="font-mono-brand text-ink-faint text-[9px] tracking-[0.08em] uppercase mb-2">
          next stops
        </p>
        <div className="space-y-[5px]">
          {nextStops.slice(0, 3).map((stop, i) => {
            const currentBusStop = routeStops[Math.max(0, userStopIndex - 1)]?.stopId;
            const isCurrentBus = stop.stopId === currentBusStop;
            const isUserStop = stop.stopId === stopId;
            const eta = etaOffsets[i] ?? bus.eta + i * 4;
            const arrTime = eta <= 0 ? 'now' : bus.arrivalTime;

            return (
              <div key={stop.stopId} className="flex items-center gap-2">
                <span
                  className={`w-[22px] h-[22px] rounded-[5px] border flex items-center justify-center shrink-0 ${
                    isCurrentBus ? 'bg-accent border-accent' : 'bg-white border-ink'
                  }`}
                />
                <div className="flex-1 min-w-0 font-display text-ink-soft text-[12px] leading-tight truncate">
                  <span className={isUserStop ? 'font-bold text-ink' : ''}>
                    {arrTime} - {stop.name}
                  </span>
                </div>
                {isCurrentBus && (
                  <span className="rounded-full bg-white border border-ink px-[9px] py-[3px] font-mono-brand text-ink text-[9px]">
                    approaching
                  </span>
                )}
                {isUserStop && !isCurrentBus && (
                  <span className="rounded-full bg-accent-faint border border-accent px-[9px] py-[3px] font-mono-brand text-ink text-[9px]">
                    your stop
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex-1" />

      <BottomTabBar
        tabs={[
          { label: 'Track', icon: <MapPinned size={9} />, active: true, href: '/track' },
          { label: 'Route', icon: <RouteIcon size={9} />, active: false, href: `/buses?routeId=${routeId}` },
          { label: 'Stops', icon: <ListTree size={9} />, active: false, disabled: true },
          { label: 'Alerts', icon: <Bell size={9} />, active: false, disabled: true },
        ]}
      />
    </main>
  );
}

export default function TrackPage() {
  return (
    <Suspense fallback={<div className="mobile-screen" />}>
      <TrackContent />
    </Suspense>
  );
}
