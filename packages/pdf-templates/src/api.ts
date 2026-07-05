import {
  getApiBaseUrl,
  getCurrentAccessToken,
  requestApiEnvelope,
  requestApiJson,
} from "@engenty/api-client";
import type {
  PdfTemplateInput,
  PdfTemplateListItem,
  PdfTemplatePreviewRequest,
  PdfTemplatePreviewResponse,
  PdfTemplateUpdateInput,
} from "./types.js";

export async function listPdfTemplates(
  moduleKey: string,
  signal?: AbortSignal
): Promise<PdfTemplateListItem[]> {
  const query = new URLSearchParams({ module_key: moduleKey });
  const result = await requestApiEnvelope<PdfTemplateListItem[]>(
    `/api/pdf-templates/templates?${query.toString()}`,
    { method: "GET", signal }
  );
  return result.data;
}

export async function createPdfTemplate(input: PdfTemplateInput) {
  return requestApiJson<PdfTemplateListItem>("/api/pdf-templates/templates", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updatePdfTemplate(
  id: string,
  patch: PdfTemplateUpdateInput
) {
  return requestApiJson<PdfTemplateListItem>(
    `/api/pdf-templates/templates/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    }
  );
}

export async function deletePdfTemplate(id: string) {
  return requestApiJson<{ ok: boolean; id: string }>(
    `/api/pdf-templates/templates/${id}`,
    { method: "DELETE" }
  );
}

export async function previewPdfTemplateData(
  input: PdfTemplatePreviewRequest
): Promise<PdfTemplatePreviewResponse> {
  return requestApiJson<PdfTemplatePreviewResponse>(
    "/api/pdf-templates/preview/data",
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  );
}

export async function previewPdfTemplatePdf(input: PdfTemplatePreviewRequest) {
  const token = (await getCurrentAccessToken()) ?? "";
  const response = await fetch(
    `${getApiBaseUrl()}/api/pdf-templates/preview/pdf`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token.trim() ? { authorization: `Bearer ${token.trim()}` } : {}),
      },
      body: JSON.stringify(input),
    }
  );
  if (!response.ok) {
    throw new Error(`PDF preview failed: ${response.status}`);
  }
  return response.blob();
}

export async function uploadPdfTemplateAsset(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return requestApiJson<{ asset_url: string }>(
    "/api/pdf-templates/assets/upload",
    {
      method: "POST",
      body: formData,
    }
  );
}
