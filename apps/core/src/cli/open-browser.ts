import { spawn } from "node:child_process";

/** Best-effort browser open (darwin/linux); the URL is always printed anyway. */
export function openInBrowser(url: string): void {
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  const child = spawn(opener, [url], { detached: true, stdio: "ignore" });
  child.on("error", () => {
    // ignore — caller printed the URL
  });
  child.unref();
}
