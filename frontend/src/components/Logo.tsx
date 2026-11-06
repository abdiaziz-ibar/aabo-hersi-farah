import React, { useId } from 'react';

/** Hersi Farah mark: an "H" whose right side rises (growth) with a coin on top. */
export function Logo({ size = 36, mono = false }: { size?: number; mono?: boolean }) {
  const gid = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Hersi Farah" style={{ flex: 'none' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4f46e5" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={mono ? 'rgba(255,255,255,0.2)' : `url(#${gid})`} />
      <rect x="16" y="24" width="10" height="26" rx="3" fill="#fff" />
      <rect x="38" y="14" width="10" height="36" rx="3" fill="#fff" />
      <rect x="24" y="29" width="16" height="8" rx="2" fill="#fff" />
      <circle cx="21" cy="15" r="4.5" fill="#fbbf24" />
    </svg>
  );
}
