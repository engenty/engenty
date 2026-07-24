// Split-screen login layout — landing ember band left, form right.
// Engenties (not app blobs) carry the friendly brand on auth surfaces.

"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { AUTH_TRANSLATIONS, detectAuthLocale } from "../lib/auth-i18n";
import { Engenty, EngentyLogoMark, EngentyWordmark } from "./engenties";

/** Landing hero ember — matches www mockup `oklch(44% 0.16 30)`. */
const BRAND_EMBER = "oklch(44% 0.16 30)";
const BRAND_CREAM = "oklch(88% 0.11 75)";
const BRAND_MUTED = "oklch(92% 0.03 40)";
const BRAND_SOFT = "oklch(100% 0 0 / 0.55)";

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
          color: BRAND_CREAM,
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
        <p style={{ fontSize: 12, color: BRAND_SOFT, lineHeight: 1.4 }}>
          {desc}
        </p>
      </div>
    </div>
  );
}

export function AuthLoginLayout({ children }: { children: ReactNode }) {
  const t = useMemo(() => AUTH_TRANSLATIONS[detectAuthLocale()], []);

  return (
    <div
      className="grid min-h-screen"
      style={{ background: "var(--color-paper, oklch(98.4% 0.006 70))" }}
    >
      <div className="grid min-h-screen lg:grid-cols-[440px_1fr]">
        {/* Left: landing-colored brand panel */}
        <div
          className="relative hidden flex-col justify-between overflow-hidden lg:flex"
          style={{ background: BRAND_EMBER, padding: "3rem" }}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute rounded-full"
            style={{
              width: 520,
              height: 520,
              top: -180,
              right: -160,
              background: "#fff",
              filter: "blur(90px)",
              opacity: 0.12,
            }}
          />

          <div className="relative z-10 flex flex-1 flex-col justify-center space-y-10">
            <div className="flex items-center gap-4">
              <EngentyLogoMark size={88} />
              <div className="space-y-1">
                <p
                  className="font-bold font-heading text-white"
                  style={{ fontSize: 34, letterSpacing: "-0.02em" }}
                >
                  <EngentyWordmark onDark />
                </p>
                <p style={{ fontSize: 13, color: BRAND_MUTED }}>{t.tagline}</p>
              </div>
            </div>

            <div className="flex flex-col gap-5">
              {t.features.map((f) => (
                <FeatureItem key={f.num} {...f} />
              ))}
            </div>
          </div>

          <div className="relative z-10 flex items-end justify-between gap-4">
            <p className="text-xs" style={{ color: "oklch(100% 0 0 / 0.35)" }}>
              {t.footer}
            </p>
            <div aria-hidden="true" className="flex gap-2">
              <Engenty kind="drop" size={44} />
              <Engenty kind="dome" size={44} />
              <Engenty kind="flame" size={44} />
            </div>
          </div>
        </div>

        {/* Right: form panel */}
        <div className="flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-[420px]">
            <div className="relative">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-8 right-4 z-10"
              >
                <Engenty kind="oval" size={96} />
              </div>
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
