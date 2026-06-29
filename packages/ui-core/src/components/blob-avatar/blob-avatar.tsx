"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { BlobAccents } from "./blob-accents";
import { BlobEye } from "./blob-eye";
import { type BlobState, BlobStateLayers } from "./blob-state-layers";

/** Body/accent color per character index — keep in sync with the
 *  data-character rules in blob-eye.tsx. */
export const BLOB_CHARACTER_COLORS = [
  "var(--ember)",
  "#3358d4",
  "#e08c0b",
  "#1e7d49",
  "#d23b5e",
] as const;

/** Named characters (index order matches the data-character CSS rules):
 *  ember — pear, brand ember, bubbles; pilot — circle, blue, bubbles;
 *  scribe — egg, orange, companion dot; beam — droplet, green, rays;
 *  hum — squat, crimson, signal waves. */
export const BLOB_CHARACTER_NAMES = [
  "ember",
  "pilot",
  "scribe",
  "beam",
  "hum",
] as const;

export type BlobCharacterName = (typeof BLOB_CHARACTER_NAMES)[number];
export type BlobCharacter = BlobCharacterName | number;

/** Maps a character name (or index) to its data-character index. */
export function resolveBlobCharacter(character: BlobCharacter): number {
  if (typeof character === "number") {
    return character % BLOB_CHARACTER_NAMES.length;
  }
  const index = BLOB_CHARACTER_NAMES.indexOf(character);
  return index === -1 ? 0 : index;
}

/** Testing: cycle through the character silhouettes every 10s. */
export function useBlobCharacterCycle() {
  const [character, setCharacter] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(
      () => setCharacter((current) => (current + 1) % 5),
      10_000
    );
    return () => window.clearInterval(timer);
  }, []);
  return character;
}

export interface BlobAvatarProps {
  /** Character by name ("pilot") or index; defaults to the shared cycle. */
  character?: BlobCharacter;
  className?: string;
  state?: BlobState;
}

/** Animated blob character (visual only): wobbling silhouette, blinking
 *  cursor-following eye, per-character accessory, gradient/strand state
 *  fills, and a light jump when a run starts. */
export function BlobAvatar({
  character: characterProp,
  className,
  state = "idle",
}: BlobAvatarProps) {
  const cycledCharacter = useBlobCharacterCycle();
  const character =
    characterProp == null
      ? cycledCharacter
      : resolveBlobCharacter(characterProp);
  // Light jump when a message is submitted (idle -> thinking).
  const [jumping, setJumping] = useState(false);
  const prevStateRef = useRef(state);
  useEffect(() => {
    if (prevStateRef.current === "idle" && state === "thinking") {
      setJumping(true);
    }
    prevStateRef.current = state;
  }, [state]);

  const isActive = state !== "idle";
  return (
    <div aria-hidden="true" className={cn("pointer-events-none", className)}>
      <div
        className={cn(
          "blob-shape relative flex h-12 w-14 items-center justify-center bg-ember text-primary-foreground",
          jumping && "blob-jump"
        )}
        data-character={character}
        onAnimationEnd={(event) => {
          if (event.animationName === "blob-jump") {
            setJumping(false);
          }
        }}
      >
        <BlobStateLayers state={state} />
        <BlobAccents character={character} isActive={isActive} />
        <BlobEye isActive={isActive} sizeClassName="size-6" />
      </div>
    </div>
  );
}
