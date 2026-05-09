interface MapPlaceholderProps {
  className?: string;
}

export default function MapPlaceholder({ className = 'h-32' }: MapPlaceholderProps) {
  return (
    <div className={`relative w-full ${className} rounded-md border border-ink overflow-hidden bg-[#f6efe0]`}>
      <svg
        viewBox="0 0 320 128"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <pattern id="wb-map-grid" width="14" height="14" patternUnits="userSpaceOnUse">
            <path d="M 14 0 L 0 0 0 14" fill="none" stroke="#ece8df" strokeWidth="1" />
          </pattern>
        </defs>

        {/* Grid background */}
        <rect width="320" height="128" fill="url(#wb-map-grid)" />

        {/* Road sketch lines */}
        <line x1="0" y1="90" x2="320" y2="90" stroke="#2a2622" strokeOpacity="0.08" strokeWidth="8" />
        <line x1="80" y1="0" x2="80" y2="128" stroke="#2a2622" strokeOpacity="0.06" strokeWidth="6" />
        <line x1="220" y1="0" x2="220" y2="128" stroke="#2a2622" strokeOpacity="0.06" strokeWidth="6" />

        {/* Route polyline (dashed accent) */}
        <polyline
          points="30,100 80,72 140,56 200,50 260,58 290,48"
          fill="none"
          stroke="#b56a4a"
          strokeWidth="2.5"
          strokeDasharray="6 4"
          strokeLinecap="round"
        />

        {/* Stop pins (white + dark border) */}
        <circle cx="140" cy="56" r="5" fill="white" stroke="#2a2622" strokeWidth="1.5" />
        <circle cx="200" cy="50" r="5" fill="white" stroke="#2a2622" strokeWidth="1.5" />

        {/* User pin (dark fill + light border) */}
        <circle cx="80" cy="72" r="7" fill="#2a2622" stroke="#fafaf7" strokeWidth="2" />

        {/* Bus pin (accent fill + dark border) */}
        <circle cx="140" cy="56" r="7" fill="#b56a4a" stroke="#2a2622" strokeWidth="1.5" />

        {/* Labels */}
        <text x="150" y="52" fontSize="8" fontFamily="monospace" fill="#2a2622" opacity="0.8">bus</text>
        <text x="90" y="68" fontSize="8" fontFamily="monospace" fill="#fafaf7">you</text>
      </svg>
    </div>
  );
}
