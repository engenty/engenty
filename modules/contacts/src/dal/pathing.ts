import path from "node:path";

export function contactFilePath(
  dataDir: string,
  contact: { id: string }
): string {
  return path.join(path.resolve(dataDir), `contact-${contact.id}.json`);
}
