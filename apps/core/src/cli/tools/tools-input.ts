import fs from "node:fs";

/**
 * Resolve the --input value for `engenty tools call`:
 * a JSON literal, `@path/to/file.json`, or `-` for stdin.
 */
export async function readToolInput(raw: string): Promise<unknown> {
  let text = raw;
  if (raw === "-") {
    text = await readStdin();
  } else if (raw.startsWith("@")) {
    text = fs.readFileSync(raw.slice(1), "utf8");
  }
  const trimmed = text.trim();
  if (trimmed === "") {
    return {};
  }
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    throw new Error(
      `--input is not valid JSON (${err instanceof Error ? err.message : String(err)}). Pass a JSON object, @file.json, or - for stdin.`
    );
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}
