export function BreathingMark({ intensity }: { intensity: number }) {
  const clamped = Math.min(Math.max(intensity, 0), 10);
  const offset = 283 - clamped * 18;

  return (
    <div className="breathing-mark" aria-hidden="true">
      <svg viewBox="0 0 120 120" role="img">
        <circle className="mark-ring-base" cx="60" cy="60" r="45" />
        <circle
          className="mark-ring-progress"
          cx="60"
          cy="60"
          r="45"
          strokeDasharray="283"
          strokeDashoffset={offset}
        />
        <path
          className="mark-line"
          d="M32 64c8-14 18-14 26-6 6 6 14 6 22-4 5-6 10-8 12-8"
          fill="none"
        />
        <circle className="mark-dot" cx="60" cy="60" r="3.4" />
      </svg>
    </div>
  );
}

export function BrandGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" strokeWidth="1.3" opacity="0.45" />
      <circle cx="12" cy="12" r="5.4" strokeWidth="1.5" />
      <path d="M5.5 12c2.2-3.6 5-3.6 6.5-1.4 1.4 2 4 2 6.5-1.6" strokeWidth="1.4" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
