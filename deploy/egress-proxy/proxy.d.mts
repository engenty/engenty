import type { Server } from "node:http";
import type { Socket } from "node:net";

export function createEgressProxy(options: {
  connect?: (port: number, host: string) => Socket;
  filterPath: string;
  log?: (line: string) => void;
  spacesDir: string;
}): Server;
