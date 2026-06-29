// Split-screen login layout — dark brand panel left, form right.
// Mirrors the InitialSetupWizard aesthetic: blob IS the brand,
// large mono numerals, heading outside the card.

"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";
import { AUTH_TRANSLATIONS, detectAuthLocale } from "../lib/auth-i18n";

// ─── Blob CSS (self-contained, same keyframes as the setup wizard) ────────────

const BLOB_STYLES = `
@keyframes login-blob-wobble {
  0%, 100% { transform: scaleX(1) scaleY(1) rotate(0deg); }
  25% { transform: scaleX(1.06) scaleY(0.94) rotate(-1.5deg); }
  50% { transform: scaleX(0.96) scaleY(1.04) rotate(0.5deg); }
  75% { transform: scaleX(1.04) scaleY(0.95) rotate(1.5deg); }
}
@keyframes login-eye-drift {
  0%, 18%, 100% { transform: translate(0, 0); }
  24%, 38% { transform: translate(2.2px, -1.4px); }
  44%, 60% { transform: translate(-2px, 1px); }
  66%, 82% { transform: translate(1.2px, 1.8px); }
  88% { transform: translate(-1px, -1.6px); }
}
@keyframes login-eye-blink {
  0%, 92%, 100% { transform: scaleY(1); }
  95% { transform: scaleY(0.08); }
}
@keyframes login-bubble-float {
  0%, 100% { transform: translateY(0); opacity: 0.7; }
  50% { transform: translateY(-3px); opacity: 0.4; }
}
@keyframes login-blob-shadow {
  0%, 100% { transform: translateX(-50%) scaleX(1); opacity: 0.45; }
  50% { transform: translateX(-50%) scaleX(0.8); opacity: 0.25; }
}
.login-blob { animation: login-blob-wobble 6s ease-in-out infinite; border-radius: 48% 52% 34% 36% / 72% 70% 30% 32%; background: oklch(64% 0.195 35); }
.login-blob-lid { animation: login-eye-blink 6s ease-in-out infinite; transform-origin: center; }
.login-blob-pupil { animation: login-eye-drift 9s ease-in-out infinite; }
.login-blob-bubble { animation: login-bubble-float 4s ease-in-out infinite; }
.login-blob-bubble-sm { animation-delay: -1.6s; animation-duration: 3.2s; }
.login-blob-shadow { animation: login-blob-shadow 7s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .login-blob, .login-blob-lid, .login-blob-pupil,
  .login-blob-bubble, .login-blob-shadow { animation: none; }
}
`;

const MAX_OFFSET = 3;
const FULL_DEFLECTION = 260;
const FOLLOW_MS = 4500;
const DRIFT_MS = 5500;

function useLoginPupilFollow(ref: React.RefObject<SVGGElement | null>) {
  useEffect(() => {
    const pupil = ref.current;
    if (!pupil || typeof window === "undefined") {
      return;
    }
    let following = false;
    let frame = 0;
    let lastEvent: MouseEvent | null = null;
    const release = () => {
      pupil.style.animation = "";
      pupil.style.transform = "";
      pupil.style.transition = "";
    };
    const apply = () => {
      frame = 0;
      if (!(following && lastEvent)) {
        return;
      }
      const box = pupil.ownerSVGElement?.getBoundingClientRect();
      if (!box || box.width === 0) {
        return;
      }
      const dx = lastEvent.clientX - (box.left + box.width / 2);
      const dy = lastEvent.clientY - (box.top + box.height / 2);
      const dist = Math.hypot(dx, dy);
      if (dist === 0) {
        return;
      }
      const reach = MAX_OFFSET * Math.min(1, dist / FULL_DEFLECTION);
      pupil.style.animation = "none";
      pupil.style.transition = "transform 180ms ease-out";
      pupil.style.transform = `translate(${((dx / dist) * reach).toFixed(2)}px, ${((dy / dist) * reach).toFixed(2)}px)`;
    };
    const onMove = (e: MouseEvent) => {
      lastEvent = e;
      if (following && frame === 0) {
        frame = window.requestAnimationFrame(apply);
      }
    };
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(
        () => {
          following = !following;
          if (following) {
            if (frame === 0) {
              frame = window.requestAnimationFrame(apply);
            }
          } else {
            release();
          }
          schedule();
        },
        following ? FOLLOW_MS : DRIFT_MS
      );
    };
    schedule();
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.clearTimeout(timer);
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener("mousemove", onMove);
      release();
    };
  }, [ref]);
}

// Accent palette — matches setup wizard BLOB_COLORS
const BLOB_COLORS = [
  "oklch(64% 0.195 35)", // 0 ember
  "#3358d4", // 1 iris
  "#e08c0b", // 2 citrus
  "#1e7d49", // 3 meadow
  "#d23b5e", // 4 berry
] as const;

function LoginBlobAvatar({ character = 0 }: { character?: number }) {
  const pupilRef = useRef<SVGGElement>(null);
  useLoginPupilFollow(pupilRef);
  const bg = BLOB_COLORS[character % BLOB_COLORS.length];
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none relative"
      style={{ width: 96, height: 116 }}
    >
      <style>{BLOB_STYLES}</style>
      <div
        className="login-blob absolute inset-x-0 top-0 flex items-center justify-center text-white"
        style={{ height: 106, background: bg }}
      >
        <span
          className="login-blob-bubble absolute rounded-full bg-white/60"
          style={{ width: 12, height: 12, top: -7, right: -5 }}
        />
        <span
          className="login-blob-bubble login-blob-bubble-sm absolute rounded-full bg-white/35"
          style={{ width: 8, height: 8, top: -13, right: 13 }}
        />
        <svg
          aria-hidden="true"
          className="size-12 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
        >
          <g className="login-blob-lid">
            <circle
              cx="12"
              cy="11"
              r="5.2"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <g className="login-blob-pupil" ref={pupilRef}>
              <circle cx="12" cy="11" fill="currentColor" r="2.2" />
            </g>
          </g>
        </svg>
      </div>
      <span
        className="login-blob-shadow absolute rounded-full bg-black/20 blur-[3px]"
        style={{ height: 6, width: "70%", bottom: 0, left: "50%" }}
      />
    </div>
  );
}

function FeatureItem({
  num,
  label,
  desc,
}: {
  num: string;
  label: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <p
        className="shrink-0"
        style={{
          fontFamily: "ui-monospace, 'Cascadia Code', monospace",
          fontSize: 40,
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: "-0.04em",
          color: "oklch(64% 0.195 35)",
        }}
      >
        {num}
      </p>
      <div className="space-y-0.5 pt-1">
        <p
          style={{
            fontFamily: "ui-monospace, 'Cascadia Code', monospace",
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "white",
          }}
        >
          {label}
        </p>
        <p
          style={{
            fontSize: 12,
            color: "oklch(100% 0 0 / 0.4)",
            lineHeight: 1.4,
          }}
        >
          {desc}
        </p>
      </div>
    </div>
  );
}

// ─── Public layout component ──────────────────────────────────────────────────

export function AuthLoginLayout({ children }: { children: ReactNode }) {
  const t = useMemo(() => AUTH_TRANSLATIONS[detectAuthLocale()], []);

  return (
    <div
      className="grid min-h-screen"
      style={{ background: "var(--color-paper, oklch(98.4% 0.006 70))" }}
    >
      <div className="grid min-h-screen lg:grid-cols-[420px_1fr]">
        {/* Left: brand panel */}
        <div
          className="hidden flex-col justify-between lg:flex"
          style={{
            background:
              "linear-gradient(160deg, oklch(20% 0.025 60) 0%, oklch(25% 0.06 285) 45%, oklch(28% 0.07 35) 100%)",
            padding: "3rem",
          }}
        >
          {/* Content — fills remaining height and centers vertically */}
          <div className="flex flex-1 flex-col justify-center space-y-10">
            <div className="space-y-1">
              <p
                className="font-bold font-heading text-white"
                style={{ fontSize: 34, letterSpacing: "-0.02em" }}
              >
                engenty
              </p>
              <p style={{ fontSize: 13, color: "oklch(100% 0 0 / 0.4)" }}>
                {t.tagline}
              </p>
            </div>

            {/* Principles list — vertical column */}
            <div className="flex flex-col gap-5">
              {t.features.map((f) => (
                <FeatureItem key={f.num} {...f} />
              ))}
            </div>
          </div>

          {/* Footer */}
          <p className="text-xs" style={{ color: "oklch(100% 0 0 / 0.25)" }}>
            {t.footer}
          </p>
        </div>

        {/* Right: form panel */}
        <div className="flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-[420px]">
            {/* Ember blob sits on top-right of the card */}
            <div className="relative">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-6 right-5 z-10"
              >
                <LoginBlobAvatar character={0} />
              </div>
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
