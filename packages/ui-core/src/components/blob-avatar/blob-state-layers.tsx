"use client";

const stateLayerStyles = `
@keyframes blob-gradient-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes blob-strand-flow {
  from { transform: translateX(0); }
  to { transform: translateX(-36px); }
}
@keyframes blob-jump {
  0% { translate: 0 0; }
  30% { translate: 0 -10px; }
  52% { translate: 0 1px; }
  68% { translate: 0 -4px; }
  100% { translate: 0 0; }
}
.blob-jump { animation: blob-jump 600ms cubic-bezier(0.3, 0.7, 0.4, 1); }
.blob-gradient {
  animation: blob-gradient-spin 4.5s linear infinite;
  background: conic-gradient(
    from 0deg,
    oklch(0.72 0.18 35),
    oklch(0.78 0.16 80),
    oklch(0.68 0.2 350),
    oklch(0.62 0.18 300),
    oklch(0.72 0.18 35)
  );
}
.blob-strand { animation: blob-strand-flow 1.4s linear infinite; }
.blob-strand-slow { animation-duration: 2.2s; animation-direction: reverse; }
@media (prefers-reduced-motion: reduce) {
  .blob-gradient, .blob-strand, .blob-jump { animation: none; }
}
`;

export type BlobState = "idle" | "thinking" | "streaming";

/** Clipped fill layers inside the blob body: gradient (thinking), strands (streaming). */
export function BlobStateLayers({ state }: { state: BlobState }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
    >
      <style>{stateLayerStyles}</style>
      {state === "thinking" && (
        <span className="blob-gradient absolute -inset-1/2 opacity-90" />
      )}
      {state === "streaming" && (
        <svg
          aria-hidden="true"
          className="absolute inset-0 size-full opacity-80"
          fill="none"
          preserveAspectRatio="none"
          viewBox="0 0 72 60"
        >
          <g className="blob-strand" stroke="currentColor">
            <path
              d="M-36 22c6-6 12-6 18 0s12 6 18 0 12-6 18 0 12 6 18 0 12-6 18 0 12 6 18 0"
              opacity="0.7"
              strokeWidth="1.8"
            />
            <path
              d="M-36 40c6-5 12-5 18 0s12 5 18 0 12-5 18 0 12 5 18 0 12-5 18 0 12 5 18 0"
              opacity="0.4"
              strokeWidth="1.4"
            />
          </g>
          <g className="blob-strand blob-strand-slow" stroke="currentColor">
            <path
              d="M-36 31c6-4 12-4 18 0s12 4 18 0 12-4 18 0 12 4 18 0 12-4 18 0 12 4 18 0"
              opacity="0.5"
              strokeWidth="1.2"
            />
          </g>
        </svg>
      )}
    </span>
  );
}
