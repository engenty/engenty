import net from "node:net";

const PORT_PROBE_TIMEOUT_MS = 500;

/**
 * Probe by connecting, not by binding: on macOS a `listen` on 127.0.0.1
 * succeeds even while a container holds the same port on 0.0.0.0 (SO_REUSEADDR
 * allows the narrower address), so a bind probe reported the running stack's
 * ports as free. A refused connection is the honest answer.
 */
export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const settle = (free: boolean) => {
      socket.destroy();
      resolve(free);
    };
    socket.setTimeout(PORT_PROBE_TIMEOUT_MS);
    socket.once("connect", () => settle(false));
    socket.once("timeout", () => settle(false));
    socket.once("error", () => settle(true));
    socket.connect(port, "127.0.0.1");
  });
}

export async function allPortsFree(ports: readonly number[]): Promise<boolean> {
  for (const port of ports) {
    if (!(await isPortFree(port))) {
      return false;
    }
  }
  return true;
}

export const PORT_BAND_STEP = 1000;
const MAX_PORT_BANDS = 10;

/**
 * A second stack needs a free band, not just a distinct id — the CLI refuses to
 * start when a port is taken. Bands are whole thousands so every service of one
 * stack stays readable together (54321 → 55321 → 56321), which is the offset
 * the worktree stacks were already shifted by hand.
 */
export async function findFreePortBand(
  ports: readonly number[]
): Promise<number> {
  for (let band = 1; band <= MAX_PORT_BANDS; band++) {
    const offset = band * PORT_BAND_STEP;
    if (await allPortsFree(ports.map((port) => port + offset))) {
      return offset;
    }
  }
  return PORT_BAND_STEP;
}
