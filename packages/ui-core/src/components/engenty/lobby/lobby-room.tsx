"use client";

import { useEffect, useRef, useState } from "react";
import { EMBER_ROOM, PixelRoom, type RoomPalette } from "./pixel-room";
import { ROOM_H, ROOM_W } from "./pixel-room-geometry";

/**
 * The lobby room: the live 3D scene from `lobby-room-3d.ts`, loaded on
 * demand. Without WebGL it falls back to the pixel-art canvas. The scene only
 * animates while it is on screen and the tab is visible.
 */
export function LobbyRoom({
  palette = EMBER_ROOM,
  scale = 3,
}: {
  palette?: RoomPalette;
  scale?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) {
      return;
    }
    let cancelled = false;
    let handle: import("./lobby-room-3d").LobbyRoomHandle | null = null;
    let seen = false;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      handle?.setPlaying(seen && !document.hidden);
    };
    const io = new IntersectionObserver(([entry]) => {
      seen = entry?.isIntersecting ?? false;
      sync();
    });
    document.addEventListener("visibilitychange", sync);

    import("./lobby-room-3d")
      .then((mod) => {
        if (cancelled) {
          return;
        }
        try {
          handle = mod.mountLobbyRoom(canvas, palette, !reduced.matches);
        } catch {
          setFallback(true);
          return;
        }
        io.observe(canvas);
        sync();
      })
      .catch(() => setFallback(true));

    return () => {
      cancelled = true;
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      handle?.dispose();
      handle = null;
    };
  }, [palette]);

  return (
    <>
      {fallback ? <PixelRoom palette={palette} scale={scale} /> : null}
      <canvas
        height={ROOM_H}
        ref={ref}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          imageRendering: "pixelated",
          display: fallback ? "none" : "block",
        }}
        width={ROOM_W}
      />
    </>
  );
}
