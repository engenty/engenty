/**
 * HTML → PDF via Gotenberg Chromium (same GOTENBERG_URL as vault office previews).
 * @see https://gotenberg.dev/docs/convert-with-chromium/convert-html-to-pdf
 */

function gotenbergBaseUrl(): string {
  const raw = process.env.GOTENBERG_URL?.trim() ?? "";
  return raw.replace(/\/+$/, "");
}

export function isGotenbergHtmlToPdfConfigured(): boolean {
  return gotenbergBaseUrl().length > 0;
}

export async function convertHtmlToPdf(html: string): Promise<Uint8Array> {
  const base = gotenbergBaseUrl();
  if (!base) {
    throw new Error("GOTENBERG_URL is not configured");
  }

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const form = new FormData();
  form.append("files", blob, "index.html");

  const res = await fetch(`${base}/forms/chromium/convert/html`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const msg = detail
      ? `${res.status} ${detail.slice(0, 500)}`
      : String(res.status);
    throw new Error(`Gotenberg HTML→PDF failed: ${msg}`);
  }

  return new Uint8Array(await res.arrayBuffer());
}
