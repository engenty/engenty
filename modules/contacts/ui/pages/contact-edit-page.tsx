import type { JsonPatchOperation, JsonValue } from "@engenty/ag-ui-bridge";
import { useEngentyFrontendTool } from "@engenty/ai-ui";
import {
  createFrontendToolDefinition,
  useRegisterAgentUiField,
} from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { Button, Form } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { ContactFormFields } from "../components/contact-form-fields.jsx";
import { applyContactsSuggestions } from "../copilot-contribution.js";
import { setContactsDraftApplyHandler } from "../copilot-draft-bridge.js";
import { useContactsEditAgentUiSlice } from "../hooks/use-contacts-agent-ui-slice.js";
import { useContactsModuleSecondaryShellNav } from "../hooks/use-contacts-module-secondary-shell-nav.js";
import { previewDisplayNameFromForm } from "../lib/contact-profile-name-form.js";
import {
  useAddContactRoleMutation,
  useContactDetailQuery,
  useRemoveContactRoleMutation,
  useUpdateContactMutation,
} from "../queries.js";
import {
  type ContactCreateFormValues,
  createContactCreateFormSchema,
  defaultContactCreateFormValues,
  entityToFormValues,
  formValuesToPatch,
} from "./contact-form.js";
import { applySuggestionPatchToContactFormValues } from "./contact-form-suggestion-patch.js";

const CONTACT_AGENT_UI_FIELDS = [
  "name_prefix",
  "first_name",
  "middle_name",
  "last_name",
  "name_suffix",
  "phonetic_name",
  "birth_name",
  "display_name_override",
  "legal_name",
  "display_name",
  "email",
  "billing_email",
  "contact_name",
  "phone",
  "address_street",
  "address_zip",
  "address_city",
  "vat_id",
  "tax_id",
] as const satisfies Array<keyof ContactCreateFormValues>;

const CONTACTS_APPLY_DRAFT_PATCH_TOOL = createFrontendToolDefinition({
  availability: "enabled",
  description:
    "Apply a JSON Patch to the current Contacts edit form draft. This changes browser form fields only; the user still saves explicitly.",
  parameters: {
    additionalProperties: false,
    properties: {
      patch: {
        items: { type: "object" },
        type: "array",
      },
    },
    required: ["patch"],
    type: "object",
  },
  name: "contacts_apply_draft_patch",
  owner_module_id: "contacts",
  title: "Apply Contact Draft Patch",
});

function normalizePatchPath(
  path: string
): keyof ContactCreateFormValues | null {
  const normalized = path.replace(/^\/fields\//, "/").replace(/^\//, "");
  return CONTACT_AGENT_UI_FIELDS.includes(
    normalized as (typeof CONTACT_AGENT_UI_FIELDS)[number]
  )
    ? (normalized as keyof ContactCreateFormValues)
    : null;
}

function toFormPatchValue(
  operation: JsonPatchOperation,
  current: ContactCreateFormValues[keyof ContactCreateFormValues]
) {
  if (operation.op === "remove") {
    return Array.isArray(current) ? [] : "";
  }
  if (!("value" in operation)) {
    throw new Error(`Unsupported draft patch operation: ${operation.op}`);
  }
  return operation.value;
}

export function ContactEditPage() {
  const { t, i18n } = useTranslation("contacts");
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [loaded, setLoaded] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const detailQuery = useContactDetailQuery(id ?? null);
  const updateMutation = useUpdateContactMutation(id ?? "");
  const addRoleMutation = useAddContactRoleMutation(id ?? "");
  const removeRoleMutation = useRemoveContactRoleMutation(id ?? "");
  const loading = detailQuery.isLoading;

  const schema = useMemo(
    () =>
      createContactCreateFormSchema({
        required: t("validationRequired"),
        invalidEmail: t("validationInvalidEmail"),
      }),
    [t]
  );
  const form = useForm<ContactCreateFormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultContactCreateFormValues,
  });

  // Bridge copilot apply-suggestions into the live edit form so a generated
  // patch updates form fields (user still saves explicitly).
  useEffect(() => {
    if (!id) {
      return;
    }
    const applySuggestionsToEditDraft = async (
      patch: Record<string, string | null>
    ) => {
      await applyContactsSuggestions(patch, { scope: { entityId: id } });
      const nextValues = applySuggestionPatchToContactFormValues(
        form.getValues(),
        patch
      );
      for (const [key, value] of Object.entries(nextValues)) {
        form.setValue(key as keyof ContactCreateFormValues, value, {
          shouldDirty: key === "roles",
        });
      }
    };
    setContactsDraftApplyHandler(applySuggestionsToEditDraft);
    return () => {
      setContactsDraftApplyHandler(null);
    };
  }, [id, form]);

  useEffect(() => {
    if (!id) {
      return;
    }
    if (!detailQuery.data || loaded) {
      return;
    }
    form.reset(entityToFormValues(detailQuery.data));
    setApiError(null);
    setLoaded(true);
  }, [id, detailQuery.data, loaded, form.reset]);

  useEffect(() => {
    if (detailQuery.error == null || loaded) {
      return;
    }
    setApiError(
      detailQuery.error instanceof Error
        ? detailQuery.error.message
        : t("loadFailed")
    );
    setLoaded(true);
  }, [detailQuery.error, loaded, t]);

  const handleSubmit = useCallback(
    async (values: ContactCreateFormValues) => {
      if (!id) {
        return;
      }
      setApiError(null);
      try {
        await updateMutation.mutateAsync(formValuesToPatch(values));
        const current = detailQuery.data;
        const currentRoles = current?.roles ?? [];
        const newRoles = values.roles ?? [];
        for (const role of currentRoles.filter((r) => !newRoles.includes(r))) {
          await removeRoleMutation.mutateAsync(role);
        }
        for (const role of newRoles.filter((r) => !currentRoles.includes(r))) {
          await addRoleMutation.mutateAsync(role);
        }
        form.reset(values);
        navigate(`/mdl/contacts/${id}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : t("saveFailed");
        setApiError(msg ?? t("saveFailed"));
      }
    },
    [
      form,
      id,
      navigate,
      t,
      updateMutation,
      detailQuery.data,
      removeRoleMutation,
      addRoleMutation,
    ]
  );

  const watchedValues = form.watch();
  const title =
    watchedValues.type === "person"
      ? previewDisplayNameFromForm(watchedValues) || t("client")
      : watchedValues.display_name?.trim() ||
        watchedValues.legal_name?.trim() ||
        t("client");
  const isDirty = form.formState.isDirty;
  const focusLegalName = useCallback(() => form.setFocus("legal_name"), [form]);
  const focusFirstName = useCallback(() => form.setFocus("first_name"), [form]);
  const focusDisplayName = useCallback(
    () =>
      form.setFocus(
        watchedValues.custom_display_name
          ? "display_name_override"
          : "last_name"
      ),
    [form, watchedValues.custom_display_name]
  );
  const focusEmail = useCallback(() => form.setFocus("email"), [form]);
  const focusBillingEmail = useCallback(
    () => form.setFocus("billing_email"),
    [form]
  );
  const focusPhone = useCallback(() => form.setFocus("phone"), [form]);
  const focusAddressCity = useCallback(
    () => form.setFocus("address_city"),
    [form]
  );
  const focusVatId = useCallback(() => form.setFocus("vat_id"), [form]);
  const focusTaxId = useCallback(() => form.setFocus("tax_id"), [form]);
  useContactsEditAgentUiSlice({
    draft: {
      dirty: isDirty,
      fields: Object.fromEntries(
        CONTACT_AGENT_UI_FIELDS.map((field) => [field, watchedValues[field]])
      ) as Record<string, JsonValue>,
    },
    entity: detailQuery.data ?? null,
    entityId: id,
    title,
    visibleFields: [...CONTACT_AGENT_UI_FIELDS],
  });
  useEngentyFrontendTool(
    CONTACTS_APPLY_DRAFT_PATCH_TOOL,
    useCallback(
      (input) => {
        const record =
          input && typeof input === "object" && !Array.isArray(input)
            ? input
            : {};
        const patch = Array.isArray(record.patch)
          ? (record.patch as JsonPatchOperation[])
          : [];
        if (patch.length === 0) {
          throw new Error("patch must contain at least one operation.");
        }
        for (const operation of patch) {
          const field = normalizePatchPath(operation.path);
          if (!field) {
            throw new Error(
              `Unsupported contact draft path: ${operation.path}`
            );
          }
          const current = form.getValues(field);
          form.setValue(field, toFormPatchValue(operation, current) as never, {
            shouldDirty: true,
            shouldTouch: true,
            shouldValidate: true,
          });
        }
        return { ok: true };
      },
      [form]
    )
  );
  useRegisterAgentUiField("contacts.legal_name", focusLegalName);
  useRegisterAgentUiField("contacts.first_name", focusFirstName);
  useRegisterAgentUiField("contacts.display_name", focusDisplayName);
  useRegisterAgentUiField("contacts.email", focusEmail);
  useRegisterAgentUiField("contacts.billing_email", focusBillingEmail);
  useRegisterAgentUiField("contacts.phone", focusPhone);
  useRegisterAgentUiField("contacts.address_city", focusAddressCity);
  useRegisterAgentUiField("contacts.vat_id", focusVatId);
  useRegisterAgentUiField("contacts.tax_id", focusTaxId);
  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useContactsModuleSecondaryShellNav();

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: title, to: id ? `/mdl/contacts/${id}` : "/mdl/contacts" },
      { label: t("edit") },
    ],
    [id, moduleRootCrumb, t, title]
  );
  const pageActions = useMemo(
    () =>
      loading ? null : (
        <div className="flex items-center gap-2">
          <Button onClick={() => navigate(-1)} size="sm" variant="outline">
            {t("cancel")}
          </Button>
          <Button
            disabled={!isDirty || form.formState.isSubmitting}
            onClick={() => {
              form.handleSubmit(handleSubmit)();
            }}
            size="sm"
          >
            {form.formState.isSubmitting ? t("saving") : t("save")}
          </Button>
        </div>
      ),
    [form, handleSubmit, isDirty, loading, navigate, t]
  );

  usePageConfig({
    actions: pageActions,
    breadcrumbs,
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
  });

  if (loading) {
    return (
      <div className="p-4 text-muted-foreground text-sm">{t("loading")}</div>
    );
  }
  if (!id) {
    return (
      <div className="p-4 text-muted-foreground text-sm">{t("notFound")}</div>
    );
  }
  if (!loaded) {
    return (
      <div className="p-4 text-muted-foreground text-sm">
        {apiError ?? t("notFound")}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl space-y-6 p-page pb-10">
        {apiError && (
          <div
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm"
            role="alert"
          >
            {apiError}
          </div>
        )}

        <h1 className="font-semibold text-xl">{t("edit")}</h1>

        <Form {...form}>
          <form
            className="space-y-6"
            onSubmit={form.handleSubmit(handleSubmit)}
          >
            <ContactFormFields form={form} showValidationOnOptional t={t} />
          </form>
        </Form>
      </div>
    </div>
  );
}
