import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import {
  createPdfTemplate,
  deletePdfTemplate,
  listPdfTemplates,
  previewPdfTemplateData,
  previewPdfTemplatePdf,
  updatePdfTemplate,
  uploadPdfTemplateAsset,
} from "./api.js";
import type {
  PdfTemplateInput,
  PdfTemplatePreviewRequest,
  PdfTemplateUpdateInput,
} from "./types.js";

export const pdfTemplateKeys = {
  all: ["pdf-templates"] as const,
  moduleTemplates: (moduleKey: string) =>
    [...pdfTemplateKeys.all, "module", moduleKey] as const,
};

export function pdfTemplatesOptions(moduleKey: string) {
  return queryOptions({
    queryKey: pdfTemplateKeys.moduleTemplates(moduleKey),
    queryFn: ({ signal }) => listPdfTemplates(moduleKey, signal),
    enabled: Boolean(moduleKey),
  });
}

export function usePdfTemplatesQuery(moduleKey: string) {
  return useQuery(pdfTemplatesOptions(moduleKey));
}

export function useCreatePdfTemplateMutation(moduleKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PdfTemplateInput) => createPdfTemplate(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: pdfTemplateKeys.moduleTemplates(moduleKey),
      });
    },
  });
}

export function useUpdatePdfTemplateMutation(
  moduleKey: string,
  templateId: string | null
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: PdfTemplateUpdateInput) =>
      updatePdfTemplate(templateId ?? "", patch),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: pdfTemplateKeys.moduleTemplates(moduleKey),
      });
    },
  });
}

export function useDeletePdfTemplateMutation(moduleKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePdfTemplate(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: pdfTemplateKeys.moduleTemplates(moduleKey),
      });
    },
  });
}

export function usePreviewPdfTemplateDataMutation() {
  return useMutation({
    mutationFn: (input: PdfTemplatePreviewRequest) =>
      previewPdfTemplateData(input),
  });
}

export function usePreviewPdfTemplatePdfMutation() {
  return useMutation({
    mutationFn: (input: PdfTemplatePreviewRequest) =>
      previewPdfTemplatePdf(input),
  });
}

export function useUploadPdfTemplateAssetMutation() {
  return useMutation({
    mutationFn: uploadPdfTemplateAsset,
  });
}
