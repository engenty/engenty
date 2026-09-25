import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

export interface ClientInteractionRecord {
  apiCompleteMs: number | null;
  apiCount: number;
  firstPaintMs: number | null;
  longTaskMaxMs: number;
  mode: "development" | "production";
  name: string;
  responseMs: number | null;
  starvedByReactExpiration: boolean;
}

export interface MeasuredInteraction {
  client: ClientInteractionRecord | null;
  name: string;
  wallMs: number;
}

const WINDOW_KEY = "__ENGENTY_INTERACTION__";

interface InteractionWindow {
  begin: (name: string) => void;
  end: () => ClientInteractionRecord | null;
}

export async function measureNamedInteraction(
  page: Page,
  name: string,
  run: () => Promise<void>
): Promise<MeasuredInteraction> {
  await page.evaluate(
    ({ key, interactionName }) => {
      const api = (
        window as unknown as Record<string, InteractionWindow | undefined>
      )[key];
      api?.begin(interactionName);
    },
    { interactionName: name, key: WINDOW_KEY }
  );
  const started = Date.now();
  await run();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );
  const wallMs = Date.now() - started;
  const client = await page.evaluate((key) => {
    const api = (
      window as unknown as Record<string, InteractionWindow | undefined>
    )[key];
    return api?.end() ?? null;
  }, WINDOW_KEY);
  return { client, name, wallMs };
}

export function responseMs(row: MeasuredInteraction): number {
  return row.client?.responseMs ?? row.wallMs;
}

export function paintMs(row: MeasuredInteraction): number {
  return row.client?.firstPaintMs ?? row.wallMs;
}

export function writeInteractionTimings(report: unknown): string {
  const dir = path.join(process.cwd(), "e2e/.results");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "interaction-timings.json");
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  return file;
}
