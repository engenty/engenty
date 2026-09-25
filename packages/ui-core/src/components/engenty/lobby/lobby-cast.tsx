"use client";

import { useEffect, useRef, useState } from "react";
import type { EngentyKind } from "../colors";
import { LobbyMascot } from "./lobby-mascot";
import { speakFrom, standOn, TILES } from "./pixel-room-geometry";

type Tile = readonly [number, number];

export interface LobbyMember {
  kind: EngentyKind;
  /** What they say when it is their turn in the chat; "⌘K" renders as a key. */
  lines: readonly string[];
  name: string;
  size: number;
  tile: Tile;
}

/** Tiles the furniture stands on (see `lobby-room-3d.ts`): nobody drifts
 *  onto them. */
const BLOCKED: readonly Tile[] = [
  [1, 0],
  [2, 0],
  [1, 1],
  [2, 1],
  [5, 0],
  [0, 4],
];

/** How far from home a member roams, in tiles, and how fast (tiles/second). */
const ROAM = 0.6;
const SPEED = 0.12;
/** Keep inside the floor, away from the front lip and the walls. */
const MARGIN = 0.6;
/** Personal space, in tiles: closer than this and they ease apart. */
const KEEP_APART = 1.05;
/** How long a chat line stays up, and the pause while the bubble hops. */
const LINE_MS = 5200;
const HOP_MS = 320;

function blocked(i: number, j: number): boolean {
  return BLOCKED.some(
    ([bi, bj]) => Math.abs(i - bi) < 0.9 && Math.abs(j - bj) < 0.9
  );
}

function onFloor(i: number, j: number): boolean {
  return (
    i >= MARGIN &&
    j >= MARGIN &&
    i <= TILES - 1 - MARGIN &&
    j <= TILES - 1 - MARGIN &&
    !blocked(i, j)
  );
}

/** A chat line, with the ⌘K shortcut set as a key cap. */
function Line({ text }: { text: string }) {
  const parts = text.split("⌘K");
  return (
    <>
      {parts.map((part, index) => (
        <span key={index}>
          {index > 0 && <kbd>⌘K</kbd>}
          {part}
        </span>
      ))}
    </>
  );
}

/** A random point within ROAM of `home` on the free floor, clear of the
 *  spots the others are heading for. */
function pickTarget(
  home: Tile,
  others: readonly (readonly [number, number])[]
): [number, number] {
  for (let tries = 0; tries < 16; tries++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * ROAM;
    const i = home[0] + Math.cos(a) * r;
    const j = home[1] + Math.sin(a) * r;
    if (
      onFloor(i, j) &&
      others.every(([oi, oj]) => Math.hypot(i - oi, j - oj) >= KEEP_APART)
    ) {
      return [i, j];
    }
  }
  return [home[0], home[1]];
}

/**
 * The lobby cast: everyone drifts slowly and continuously around their own
 * spot, keeping their distance, the way a room full of people never quite
 * stands still. The chat bubble hops from member to member with their own
 * lines and follows whoever is speaking. Positions are written straight to
 * the DOM from one animation frame loop; React renders the cast once. Still
 * for users who prefer reduced motion.
 */
export function LobbyCast({
  cast,
  scale,
}: {
  cast: readonly LobbyMember[];
  scale: number;
}) {
  const avatars = useRef<(HTMLSpanElement | null)[]>([]);
  const bubble = useRef<HTMLDivElement>(null);
  const [chat, setChat] = useState({ line: 0, speaker: 0, up: true });
  const speakerRef = useRef(0);
  speakerRef.current = chat.speaker;

  // The chat: a line stays up, the bubble drops, the next member picks it up.
  useEffect(() => {
    let hop: ReturnType<typeof setTimeout> | undefined;
    const turn = setInterval(() => {
      setChat((c) => ({ ...c, up: false }));
      hop = setTimeout(() => {
        setChat((c) => {
          const speaker = (c.speaker + 1) % cast.length;
          const line = speaker === 0 ? c.line + 1 : c.line;
          return { line, speaker, up: true };
        });
      }, HOP_MS);
    }, LINE_MS);
    return () => {
      clearInterval(turn);
      clearTimeout(hop);
    };
  }, [cast.length]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const walkers = cast.map((m) => ({
      i: m.tile[0],
      j: m.tile[1],
      target: [m.tile[0], m.tile[1]] as [number, number],
    }));
    const othersOf = (index: number) =>
      walkers.filter((_, k) => k !== index).map((w) => w.target);
    walkers.forEach((w, index) => {
      w.target = pickTarget(cast[index].tile, othersOf(index));
    });
    let last = performance.now();
    let frame = 0;

    const place = (index: number) => {
      const el = avatars.current[index];
      const w = walkers[index];
      if (!el) {
        return;
      }
      const pos = standOn(w.i, w.j, cast[index].size, scale);
      el.style.left = pos.left;
      el.style.top = pos.top;
      el.style.zIndex = String(Math.round((w.i + w.j) * 10) + 1);
      if (index === speakerRef.current && bubble.current) {
        const b = speakFrom(w.i, w.j, cast[index].size, scale);
        bubble.current.style.left = b.left;
        bubble.current.style.bottom = b.bottom;
      }
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      walkers.forEach((w, index) => {
        const di = w.target[0] - w.i;
        const dj = w.target[1] - w.j;
        const dist = Math.hypot(di, dj);
        if (dist < 0.02) {
          w.target = pickTarget(cast[index].tile, othersOf(index));
          return;
        }
        // Ease in and out over the last stretch so arrivals are soft.
        const v = SPEED * Math.min(1, 0.35 + dist * 1.6);
        const step = Math.min(dist, v * dt);
        let ni = w.i + (di / dist) * step;
        let nj = w.j + (dj / dist) * step;
        // Personal space: ease away from anyone too close, and pick a new
        // spot if this one is crowded.
        let crowded = false;
        walkers.forEach((o, k) => {
          if (k === index) {
            return;
          }
          const oi = ni - o.i;
          const oj = nj - o.j;
          const d = Math.hypot(oi, oj) || 0.001;
          if (d < KEEP_APART) {
            const push = ((KEEP_APART - d) / KEEP_APART) * SPEED * 2 * dt;
            ni += (oi / d) * push;
            nj += (oj / d) * push;
            crowded = true;
          }
        });
        if (onFloor(ni, nj)) {
          w.i = ni;
          w.j = nj;
        }
        if (crowded) {
          w.target = pickTarget(cast[index].tile, othersOf(index));
        }
        place(index);
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [cast, scale]);

  return (
    <>
      {cast.map((member, index) => (
        <span
          className="lobby-avatar"
          key={member.kind}
          ref={(el) => {
            avatars.current[index] = el;
          }}
          style={{
            ...standOn(member.tile[0], member.tile[1], member.size, scale),
            zIndex: Math.round((member.tile[0] + member.tile[1]) * 10) + 1,
          }}
        >
          <span className="lobby-avatar-body">
            <span aria-hidden="true" className="lobby-avatar-shadow" />
            <LobbyMascot className="lobby-avatar-mark" kind={member.kind} />
          </span>
          <span className="lobby-avatar-tag">{member.name}</span>
        </span>
      ))}
      <div
        className="lobby-bubble"
        data-up={chat.up ? "true" : "false"}
        ref={bubble}
        style={speakFrom(
          cast[chat.speaker].tile[0],
          cast[chat.speaker].tile[1],
          cast[chat.speaker].size,
          scale
        )}
      >
        <span className="lobby-bubble-name">{cast[chat.speaker].name}</span>
        <Line
          text={
            cast[chat.speaker].lines[
              chat.line % cast[chat.speaker].lines.length
            ]
          }
        />
      </div>
    </>
  );
}
