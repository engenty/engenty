import {
  buildAgentUiPageBrief,
  useRegisterAgentUiSlice,
} from "@engenty/app-shell";
import { useMemo } from "react";

/**
 * Vault page brief — metadata only.
 * Never include secret names, keys, values, URLs, or descriptions.
 */
export function useSecretsVaultAgentUiSlice(input?: { secretCount?: number }) {
  const slice = useMemo(() => {
    const count = input?.secretCount;
    const hasCount = typeof count === "number" && Number.isFinite(count);
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "list",
          page_title: "Secrets vault",
          page_description: hasCount
            ? `Secrets vault (metadata only; ${count} secret(s) visible). Values and keys are redacted.`
            : "Secrets vault (metadata only). Values and keys are redacted.",
          ...(hasCount ? { list_total: count } : {}),
        }),
      },
    };
  }, [input?.secretCount]);

  useRegisterAgentUiSlice("secrets.vault", slice);
}

export function useSecretsImportAgentUiSlice() {
  const slice = useMemo(
    () => ({
      page: {
        ...buildAgentUiPageBrief({
          page_type: "import",
          page_title: "Import secrets",
          page_description:
            "CSV import wizard for secrets (metadata only; values are not exposed to the agent).",
        }),
      },
    }),
    []
  );

  useRegisterAgentUiSlice("secrets.import", slice);
}
