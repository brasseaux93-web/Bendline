import { useId } from "react";

export function BrandMark({ size = 36 }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={`bm-${id}`} x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="rgb(var(--bg-elevated))" />
          <stop offset="1" stopColor="rgb(var(--bg))" />
        </linearGradient>
      </defs>
      <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="9" fill={`url(#bm-${id})`} stroke="rgb(var(--accent) / 0.55)" strokeWidth="1.5" />
      <path d="M9 22V14.5L16 10.5L23 14.5V21.5" stroke="rgb(var(--primary))" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 22V14.5L16 10.5L23 14.5V21.5" stroke="rgb(255 255 255 / 0.3)" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="23" cy="21.5" r="2.3" fill="rgb(var(--accent))" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`text-[1.0625rem] font-semibold tracking-[-0.02em] ${className}`}>Bendline</span>;
}
