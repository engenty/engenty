import { request } from "./request";

export interface DocConverterAvailability {
  gemini: boolean;
  llamaparse: boolean;
}

export async function getDocConverterAvailability(
  signal?: AbortSignal
): Promise<DocConverterAvailability> {
  return await request<DocConverterAvailability>(
    "/api/ai/doc-converter/availability",
    { signal }
  );
}
