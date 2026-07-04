import { downloadOfferPdf } from "../api.js";

/** Open the offer PDF in a new browser tab. */
export async function viewOfferPdf(id: string): Promise<void> {
  const blob = await downloadOfferPdf(id);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Trigger a download of the offer PDF. */
export async function saveOfferPdf(
  id: string,
  fileName: string
): Promise<void> {
  const blob = await downloadOfferPdf(id);
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = fileName;
  window.document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 100);
}
