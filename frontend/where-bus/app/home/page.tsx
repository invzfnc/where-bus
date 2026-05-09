'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Bookmark, Clock3, Map, MapPin, MoreHorizontal, Search, User } from 'lucide-react';
import BottomTabBar from '@/components/BottomTabBar';
import PhoneChrome from '@/components/PhoneChrome';
import { MOCK_ROUTES, NEAREST_STOP } from '@/lib/mocks/transit';

const QUICK_PILLS = MOCK_ROUTES.slice(0, 3).map((r) => r.routeId);

export default function HomePage() {
  const router = useRouter();

  return (
    <main className="mobile-screen flex flex-col overflow-hidden">
      <PhoneChrome />
      <section className="px-[14px] pt-11 pb-2">
        <h1 className="font-display font-extrabold text-ink text-[38px] leading-[0.92] tracking-[-0.025em]">
          where to,<br />today?
        </h1>
        <p className="font-display text-ink-soft text-[12px] leading-tight mt-2">
          UM, Petaling Jaya - live now
        </p>
      </section>

      <section className="px-[14px] py-2">
        <button
          onClick={() => router.push('/search')}
          className="w-full flex items-center gap-2 bg-white border border-ink rounded-lg px-[10px] py-2 text-left"
        >
          <Search size={13} className="text-ink shrink-0" />
          <span className="text-ink-faint text-[12px]">stop name or route id...</span>
        </button>

        <div className="flex gap-1.5 flex-wrap mt-2">
          {QUICK_PILLS.map((routeId) => (
            <Link
              key={routeId}
              href={`/buses?routeId=${routeId}`}
              className="inline-flex items-center rounded-full bg-white border border-ink px-[9px] py-[3px] font-mono-brand text-ink text-[9px]"
            >
              {routeId}
            </Link>
          ))}
          <span className="inline-flex items-center gap-1 rounded-full bg-paper-2 border border-ink-faint px-[9px] py-[3px] font-mono-brand text-ink-faint text-[9px]">
            <MoreHorizontal size={11} />
            more soon
          </span>
        </div>
      </section>

      <section className="px-[14px] py-2">
        <span className="font-mono-brand text-ink-faint text-[9px] tracking-[0.08em] uppercase">
          recent trips
        </span>
        <div className="mt-2 space-y-2">
          {[
            ['T789', 'UM -> Mid Valley'],
            ['S1040', 'KL Sentral -> Subang Jaya'],
            ['PJ06', 'SS15 -> Sunway Pyramid'],
          ].map(([route, name]) => (
            <Link
              key={route}
              href={`/buses?routeId=${route}`}
              className="flex items-center gap-2 bg-white border border-ink rounded-lg px-[10px] py-2"
            >
              <span className="w-[22px] h-[22px] rounded-[5px] border border-ink bg-white flex items-center justify-center text-ink">
                <Clock3 size={12} />
              </span>
              <div className="min-w-0">
                <div className="font-display font-bold text-ink text-[13px] leading-tight">{route}</div>
                <div className="font-display text-ink-soft text-[12px] leading-tight truncate">{name}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="px-[14px] py-2">
        <span className="font-mono-brand text-ink-faint text-[9px] tracking-[0.08em] uppercase">
          nearest stop
        </span>
        <div className="mt-2 bg-accent-faint border border-ink rounded-lg px-[10px] py-2 flex items-center gap-2">
          <span className="w-[22px] h-[22px] rounded-[5px] border border-accent bg-accent-faint flex items-center justify-center text-accent">
            <MapPin size={12} />
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="font-display font-bold text-ink text-[13px] leading-tight">
              {NEAREST_STOP.name}
            </h2>
            <p className="font-display text-ink-soft text-[12px] leading-tight">
              {NEAREST_STOP.distanceMeters}m - {NEAREST_STOP.routeCount} routes here
            </p>
          </div>
          <Link
            href={`/buses?stopId=${NEAREST_STOP.stopId}&stopName=${encodeURIComponent(NEAREST_STOP.name)}`}
            className="inline-flex items-center rounded-full bg-accent border border-accent px-[9px] py-[3px] font-mono-brand text-paper text-[9px]"
          >
            go
          </Link>
        </div>
      </section>

      <div className="flex-1" />

      <BottomTabBar
        tabs={[
          { label: 'Find', icon: <Search size={9} />, active: true, href: '/home' },
          { label: 'Map', icon: <Map size={9} />, active: false, disabled: true },
          { label: 'Saved', icon: <Bookmark size={9} />, active: false, disabled: true },
          { label: 'Me', icon: <User size={9} />, active: false, disabled: true },
        ]}
      />
    </main>
  );
}
