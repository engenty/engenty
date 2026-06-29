"use client";

const accentStyles = `
@keyframes blob-shadow-squash {
  0%, 100% { transform: translateX(-50%) scaleX(1); opacity: 0.7; }
  50% { transform: translateX(-50%) scaleX(0.82); opacity: 0.5; }
}
@keyframes blob-bubble-float {
  0%, 100% { transform: translateY(0); opacity: 0.9; }
  50% { transform: translateY(-2.5px); opacity: 0.55; }
}
@keyframes blob-wave-pulse {
  0%, 100% { opacity: 0.35; transform: translateX(-50%) scale(0.94); }
  50% { opacity: 0.9; transform: translateX(-50%) scale(1.06); }
}
@keyframes blob-ray-pulse {
  0%, 100% { opacity: 0.85; transform: scaleX(1); }
  50% { opacity: 0.4; transform: scaleX(0.6); }
}
.blob-shadow { animation: blob-shadow-squash 7s ease-in-out infinite; }
.blob-bubble { animation: blob-bubble-float 4s ease-in-out infinite; background: var(--blob-accent); }
.blob-bubble-sm { animation-delay: -1.6s; animation-duration: 3.2s; }
.blob-ray { animation: blob-ray-pulse 2.6s ease-in-out infinite; background: var(--blob-accent); }
.blob-waves { color: var(--blob-accent); animation: blob-wave-pulse 2.2s ease-in-out infinite; }
.blob-waves[data-fast="true"] { animation-duration: 1.2s; }
@media (prefers-reduced-motion: reduce) {
  .blob-shadow, .blob-bubble, .blob-ray, .blob-waves { animation: none; }
}
`;

export interface BlobAccentsProps {
  character: number;
  isActive: boolean;
}

/** Ground shadow plus a per-character accessory: bubbles, dot, rays, or waves. */
export function BlobAccents({ character, isActive }: BlobAccentsProps) {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0">
      <style>{accentStyles}</style>
      <span className="blob-shadow absolute -bottom-2.5 left-1/2 h-1.5 w-4/5 rounded-full bg-foreground/15 blur-[1.5px]" />
      {(character === 0 || character === 1) && (
        <>
          <span className="blob-bubble absolute -top-1.5 -right-1 size-2 rounded-full opacity-60" />
          <span className="blob-bubble blob-bubble-sm absolute -top-3 right-2.5 size-1.5 rounded-full opacity-35" />
        </>
      )}
      {character === 2 && (
        <span className="blob-bubble absolute -top-2 right-0.5 size-2 rounded-full opacity-70" />
      )}
      {character === 3 && (
        <>
          <span className="blob-ray absolute top-1/2 -left-3 h-0.5 w-2 origin-right rounded-full" />
          <span className="blob-ray absolute top-1/2 -right-3 h-0.5 w-2 origin-left rounded-full" />
          <span className="blob-ray absolute -top-2.5 left-1/2 h-2 w-0.5 -translate-x-1/2 rounded-full" />
        </>
      )}
      {(character === 4 || isActive) && (
        <svg
          aria-hidden="true"
          className="blob-waves absolute -top-4.5 left-1/2 w-7"
          data-fast={isActive}
          fill="none"
          viewBox="0 0 28 12"
        >
          <path
            d="M6 10c4.8-4.4 11.2-4.4 16 0"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2"
          />
          <path
            d="M9.5 4.5c2.8-2.4 6.2-2.4 9 0"
            opacity="0.6"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.6"
          />
        </svg>
      )}
    </span>
  );
}
