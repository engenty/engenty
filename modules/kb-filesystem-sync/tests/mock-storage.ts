/**
 * In-memory StorageService for tests. `list` returns every descendant of a
 * prefix as a file entry; since OKF keys all carry a `.md` extension, the
 * walker collects them in a single pass.
 */

import type { StorageService } from "@engenty/plugin-sdk";

export function createMemoryStorage(): StorageService & {
  keys(): string[];
} {
  const store = new Map<string, Uint8Array>();
  return {
    keys: () => [...store.keys()].sort(),
    upload(key, buffer) {
      const bytes =
        buffer instanceof Uint8Array
          ? buffer
          : new Uint8Array(buffer as ArrayBuffer);
      store.set(key, bytes);
      return Promise.resolve(undefined);
    },
    download(key) {
      return Promise.resolve(store.get(key) ?? null);
    },
    delete(key) {
      store.delete(key);
      return Promise.resolve();
    },
    getUrl(key) {
      return Promise.resolve(`memory://${key}`);
    },
    list(prefix) {
      const files = [...store.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, bytes]) => ({
          key,
          filename: key.split("/").pop() ?? key,
          size_bytes: bytes.byteLength,
        }));
      return Promise.resolve({ files, total: files.length });
    },
  };
}
