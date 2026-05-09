'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';

interface BackHeaderProps {
  title: string;
  subtitle?: string;
  href?: string;
  right?: ReactNode;
}

export default function BackHeader({ title, subtitle, href, right }: BackHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (href) {
      router.push(href);
    } else {
      router.back();
    }
  };

  return (
    <div className="flex items-center gap-2 px-[14px] pt-9 pb-3 bg-transparent">
      <button
        onClick={handleBack}
        className="shrink-0 w-[22px] h-[22px] flex items-center justify-center rounded-[5px] border border-ink bg-white text-ink"
        aria-label="Go back"
      >
        <ChevronLeft size={15} strokeWidth={2.4} />
      </button>
      <div className="flex-1 min-w-0">
        <h1 className="font-display font-bold text-ink text-[14px] leading-tight truncate">{title}</h1>
        {subtitle && (
          <p className="font-display text-ink-soft text-[12px] leading-tight mt-0.5">{subtitle}</p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
