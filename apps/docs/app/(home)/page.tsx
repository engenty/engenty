import Link from "next/link";
import { LobbyCast } from "@/components/brand/lobby-cast";
import { LobbyRoom } from "@/components/brand/lobby-room";
import { Mascot } from "@/components/brand/mascot";
import { pixelFloorDataUri } from "@/components/brand/pixel-floor";
import { ROOM_H, ROOM_W } from "@/components/brand/pixel-room-geometry";
import { GITHUB_URL } from "@/lib/layout.shared";

const SCALE = 3.3;

/** The founding five and their starting tiles; they wander from there.
 *  Named for what they do (like agents), never by silhouette. */
const CAST = [
  {
    kind: "oval",
    tile: [2, 2],
    size: 90,
    name: "Concierge",
    lines: [
      "Welcome! Pick a room below, or press ⌘K to search.",
      "Lost? Every page has a copy for your agent under Copy Markdown.",
    ],
  },
  {
    kind: "drop",
    tile: [1, 3],
    size: 78,
    name: "Planner",
    lines: [
      "Curious what is next? The roadmap is in room 04.",
      "Shipped things land in the changelog, top right.",
    ],
  },
  {
    kind: "dome",
    tile: [4, 2],
    size: 84,
    name: "Installer",
    lines: [
      "Your own instance? One command, then Coolify or Docker.",
      "Room 02 has the VPS guide and the settings you will need.",
    ],
  },
  {
    kind: "flame",
    tile: [2, 4],
    size: 76,
    name: "Developer",
    lines: [
      "Plugins, modules and the architecture live in room 03.",
      "Clone it, run pnpm dev, and you are in.",
    ],
  },
  {
    kind: "round",
    tile: [3, 4],
    size: 92,
    name: "User Guide",
    lines: [
      "New here? Getting started is the first door in room 01.",
      "Sign in, find the copilot, and run your first task.",
    ],
  },
] as const;

const ROOMS = [
  {
    href: "/docs/user/README",
    kicker: "room 01",
    title: "User Guide",
    body: "The copilot, agents, and modules — Engenty day to day.",
    tone: "cobalt",
    kind: "round",
    floor: ["#3b4f9a", "#2a3a78"],
  },
  {
    href: "/docs/setup/README",
    kicker: "room 02",
    title: "Installation",
    body: "Install and deploy your own instance. Coolify, settings, AI models.",
    tone: "moss",
    kind: "dome",
    floor: ["#3f7a4a", "#2d5c36"],
  },
  {
    href: "/docs/dev/README",
    kicker: "room 03",
    title: "Developer",
    body: "Architecture, the plugin system, building modules, running locally.",
    tone: "ember",
    kind: "flame",
    floor: ["#a94a2e", "#7c3320"],
  },
  {
    href: "/docs/roadmap/README",
    kicker: "room 04",
    title: "Roadmap",
    body: "What we're building next, and what is already on the way.",
    tone: "amber",
    kind: "drop",
    floor: ["#b8842e", "#8a6120"],
  },
] as const;

export default function HomePage() {
  return (
    <div className="docs-home">
      <section className="docs-hero">
        <div className="docs-hero-inner">
          <div className="docs-hero-copy">
            <p className="docs-kicker docs-kicker-on-dark">
              documentation · fair source · v0.x
            </p>
            <h1 className="docs-hero-title">
              Copilots and agents,
              <br />
              <em>built into your app.</em>
            </h1>
            <p className="docs-hero-sub">
              Guides for using, installing, and extending engenty. Fair source
              on GitHub, free to self-host.
            </p>
            <div className="docs-hero-actions">
              <Link className="hb-btn" href="/docs/user/README">
                Enter the hotel →
              </Link>
              <a
                className="hb-btn hb-btn-tone"
                href={GITHUB_URL}
                rel="noreferrer"
                target="_blank"
              >
                GitHub
              </a>
            </div>
            <div className="docs-hero-cmd">
              <span className="docs-hero-cmd-prompt">$</span>
              <span>npx engenty</span>
            </div>
          </div>

          {/* The lobby: a pixel-art room with the vector cast standing in it. */}
          <div
            className="docs-lobby"
            style={{ aspectRatio: `${ROOM_W} / ${ROOM_H}` }}
          >
            <LobbyRoom scale={SCALE} />
            <LobbyCast cast={CAST} scale={SCALE} />
          </div>
        </div>
      </section>

      <section className="docs-rooms">
        <p className="docs-kicker">rooms</p>
        <div className="docs-rooms-grid">
          {ROOMS.map((room) => (
            <Link
              className="docs-room hb-window"
              data-tone={room.tone}
              href={room.href}
              key={room.href}
            >
              <div className="hb-bar">
                <span className="hb-bar-title">{room.kicker}</span>
              </div>
              <span className="hb-body">
                <span className="docs-room-title">{room.title}</span>
                <span className="docs-room-body">{room.body}</span>
              </span>
              <span
                className="docs-room-floor"
                style={{
                  backgroundImage: pixelFloorDataUri(
                    room.floor[0],
                    room.floor[1],
                  ),
                }}
              >
                <Mascot kind={room.kind} size={64} />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="docs-strip">
        <span className="docs-strip-item">
          <span className="docs-kicker">for agents</span>
          <Link href="/llms-full.txt">llms-full.txt</Link>
        </span>
        <span className="docs-strip-item">
          <span className="docs-kicker">changes</span>
          <Link href="/changelog">Changelog</Link>
        </span>
        <span className="docs-strip-item">
          <span className="docs-kicker">license</span>
          <a href="https://fsl.software" rel="noreferrer" target="_blank">
            FSL-1.1-MIT
          </a>
        </span>
        <span className="docs-strip-item">
          <span className="docs-kicker">source</span>
          <a href={GITHUB_URL} rel="noreferrer" target="_blank">
            github.com/engenty/engenty
          </a>
        </span>
      </section>
    </div>
  );
}
