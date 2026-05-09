import Link from 'next/link';
import type { ReactNode } from 'react';

interface Tab {
  label: string;
  icon?: ReactNode;
  active: boolean;
  href?: string;
  disabled?: boolean;
}

interface BottomTabBarProps {
  tabs: Tab[];
}

export default function BottomTabBar({ tabs }: BottomTabBarProps) {
  return (
    <div className="mt-auto bg-paper-2 border-t border-ink flex justify-around px-[14px] pt-[7px] pb-[10px]">
      {tabs.map((tab) => {
        const marker = (
          <span
            className={`w-[14px] h-[14px] rounded-[4px] border flex items-center justify-center ${
              tab.active ? 'border-accent bg-accent text-paper' : 'border-ink-soft bg-transparent text-ink-soft'
            }`}
          >
            {tab.icon}
          </span>
        );

        const label = (
          <span
            className={`font-mono-brand text-[8px] tracking-[0.08em] uppercase ${
              tab.active ? 'font-bold' : ''
            }`}
          >
            {tab.label}
          </span>
        );

        if (tab.active || tab.disabled || !tab.href) {
          return (
            <div
              key={tab.label}
              className={`flex-1 flex flex-col items-center gap-0.5 ${
                tab.active ? 'text-accent' : 'text-ink-faint opacity-60'
              }`}
              aria-disabled={tab.disabled || undefined}
            >
              {marker}
              {label}
            </div>
          );
        }

        return (
          <Link
            key={tab.label}
            href={tab.href}
            className="flex-1 flex flex-col items-center gap-0.5 text-ink-soft"
          >
            {marker}
            {label}
          </Link>
        );
      })}
    </div>
  );
}
