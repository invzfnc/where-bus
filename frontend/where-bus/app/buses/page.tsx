'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { BusFront, Clock3, Search, SlidersHorizontal } from 'lucide-react';
import BackHeader from '@/components/BackHeader';
import PhoneChrome from '@/components/PhoneChrome';
import { MOCK_BUSES, MOCK_ROUTES, Bus } from '@/lib/mocks/transit';

function etaLabel(eta: number) {
  return eta <= 1 ? 'now' : `${eta} min`;
}

function BusCard({ bus, routeId, stopId, isHero }: { bus: Bus; routeId: string; stopId: string; isHero: boolean }) {
  const href = `/track?busId=${bus.busId}&routeId=${routeId}&stopId=${encodeURIComponent(stopId)}`;

  if (isHero) {
    return (
      <Link href={href} className="block">
        <div className="bg-accent-faint border border-ink rounded-lg px-[10px] py-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex gap-2 min-w-0">
              <span className="mt-0.5 w-[24px] h-[24px] rounded-[5px] border border-accent bg-accent flex items-center justify-center text-paper shrink-0">
                <BusFront size={13} />
              </span>
              <div className="min-w-0">
                <div className="font-display font-bold text-ink text-[18px] leading-tight">
                  {etaLabel(bus.eta)}
                </div>
                <div className="font-display font-bold text-ink text-[13px] leading-tight mt-1 truncate">
                  Bus {bus.busId}
                </div>
                <div className="font-display text-ink-soft text-[12px] leading-tight">
                  {bus.stopsAway > 0 ? `${bus.stopsAway} stops away` : bus.status} - arriving {bus.arrivalTime}
                </div>
              </div>
            </div>
            <span className="rounded-full bg-accent border border-accent px-[9px] py-[3px] font-mono-brand text-paper text-[9px]">
              soonest
            </span>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link href={href} className="block">
      <div className="bg-white border border-ink rounded-lg px-[10px] py-2">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 font-display font-bold text-ink text-[16px] leading-tight">
            <Clock3 size={13} />
            {etaLabel(bus.eta)}
          </span>
          <span className="rounded-full bg-white border border-ink px-[9px] py-[3px] font-mono-brand text-ink text-[9px]">
            {bus.arrivalTime}
          </span>
        </div>
        <div className="font-display text-ink-soft text-[12px] leading-tight mt-1">
          Bus {bus.busId} - {bus.stopsAway > 0 ? `${bus.stopsAway} stops away` : bus.status}
        </div>
      </div>
    </Link>
  );
}

function BusesContent() {
  const searchParams = useSearchParams();
  const routeId = searchParams.get('routeId') ?? 'T789';
  const stopId = searchParams.get('stopId') ?? '1005840';
  const stopName = searchParams.get('stopName') ?? 'UM Main Gate';

  const route = MOCK_ROUTES.find((r) => r.routeId === routeId);
  const destination = route ? route.to : stopName;
  const origin = route ? route.from : 'your stop';

  const buses: Bus[] = MOCK_BUSES.filter((b) => b.routeId === routeId);
  const sorted = [...buses].sort((a, b) => a.eta - b.eta);
  const soonest = sorted[0];
  const rest = sorted.slice(1);

  return (
    <main className="mobile-screen flex flex-col overflow-hidden pb-24">
      <PhoneChrome />
      <BackHeader
        title={`${origin} -> ${destination}`}
        subtitle={`${buses.length} active buses - live`}
        right={
          <span className="inline-flex items-center rounded-full bg-white border border-ink px-[9px] py-[3px] text-ink">
            <Search size={11} />
          </span>
        }
      />

      <section className="px-[14px] py-2 space-y-2">
        {buses.length === 0 ? (
          <p className="text-ink-faint text-[13px] text-center py-10 px-8">
            No active buses on this route right now - check schedule.
          </p>
        ) : (
          <>
            {soonest && <BusCard bus={soonest} routeId={routeId} stopId={stopId} isHero />}
            {rest.map((bus) => (
              <BusCard key={bus.busId} bus={bus} routeId={routeId} stopId={stopId} isHero={false} />
            ))}
          </>
        )}
      </section>

      <section className="px-[14px] py-2">
        <span className="inline-flex items-center gap-1 font-mono-brand text-ink-faint text-[9px] tracking-[0.08em] uppercase">
          <SlidersHorizontal size={10} />
          sort
        </span>
        <div className="mt-2 flex gap-1.5">
          <span className="rounded-full bg-ink border border-ink px-[9px] py-[3px] font-mono-brand text-paper text-[9px]">
            soonest
          </span>
          <span className="rounded-full bg-paper-2 border border-ink-faint px-[9px] py-[3px] font-mono-brand text-ink-faint text-[9px]">
            crowd soon
          </span>
          <span className="rounded-full bg-paper-2 border border-ink-faint px-[9px] py-[3px] font-mono-brand text-ink-faint text-[9px]">
            AC soon
          </span>
        </div>
      </section>

      <div className="flex-1" />

      {soonest && (
        <div className="px-[14px] py-3 bg-screen">
          <Link
            href={`/track?busId=${soonest.busId}&routeId=${routeId}&stopId=${encodeURIComponent(stopId)}`}
            className="block w-full text-center rounded-full bg-ink border border-ink px-3 py-2 font-display font-bold text-paper text-[13px]"
          >
            {'track soonest ->'}
          </Link>
        </div>
      )}
    </main>
  );
}

export default function BusesPage() {
  return (
    <Suspense fallback={<div className="mobile-screen" />}>
      <BusesContent />
    </Suspense>
  );
}
