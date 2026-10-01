"use client";

// The card a run parks on when a host tool needs a secret (`secret_request`,
// e.g. git_remote's token). Submit posts the values to the secrets route — not
// to the run — and only then answers the card with the "entered" choice,
// which carries no value. There is no free-text answer: a token typed there
// would go to the model.
import type { AgUiBrowserPreview } from "@engenty/ag-ui-bridge";
import { useTranslation } from "@engenty/i18n/ui";
import { useMutation } from "@engenty/query-client";
import { Button, Input } from "@engenty/ui-core";
import { KeyRound } from "lucide-react";
import { type FormEvent, useState } from "react";
import { requestAiServiceJson } from "../../../lib/runtime/ai-service-client.js";
import { InterruptCardDismissButton } from "./interrupt-card-dismiss-button.js";

type SecretRequestPreview = Extract<
  AgUiBrowserPreview,
  { kind: "secret_request" }
>;

const ERROR_CODES = new Set(["expired", "missing_value", "not_found"]);

function errorKey(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  const suffix = typeof code === "string" ? (code.split(".").at(-1) ?? "") : "";
  return ERROR_CODES.has(suffix) ? suffix : "failed";
}

function submitSecret(
  preview: SecretRequestPreview,
  values: Record<string, string>
): Promise<{ ok: true }> {
  const query = new URLSearchParams({ space_id: preview.space_id });
  return requestAiServiceJson(
    `/ai/sandboxes/secrets/${encodeURIComponent(preview.request_id)}?${query}`,
    { body: JSON.stringify({ values }), method: "POST" }
  );
}

export function SecretRequestCard({
  artifactId,
  declineChoiceId,
  onChoose,
  onDismiss,
  preview,
  title,
}: {
  artifactId: string;
  declineChoiceId?: string;
  onChoose: (
    artifactId: string,
    choiceId: string,
    customLabel?: string
  ) => void;
  onDismiss?: () => void;
  preview: SecretRequestPreview;
  title: string;
}) {
  const { t } = useTranslation("ai-ui");
  const [values, setValues] = useState<Record<string, string>>({});
  const submit = useMutation({
    mutationFn: () => submitSecret(preview, values),
    onSuccess: () => {
      // The host keeps the value; drop it from memory before resuming.
      setValues({});
      onChoose(
        artifactId,
        preview.filled_choice_id,
        t("secretRequest.entered")
      );
    },
  });
  const ready = preview.fields.some(
    (field) => field.kind === "password" && values[field.id]
  );
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (ready && !submit.isPending) {
      submit.mutate();
    }
  };

  return (
    <section className="ui-card-panel space-y-3 p-3">
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 font-medium text-foreground text-sm">
          {title}
        </h3>
        {onDismiss ? (
          <InterruptCardDismissButton
            disabled={submit.isPending}
            onDismiss={onDismiss}
          />
        ) : null}
      </div>
      <form autoComplete="off" className="space-y-2" onSubmit={onSubmit}>
        <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <KeyRound aria-hidden className="size-3 shrink-0" />
          <span>
            {t("secretRequest.for")}{" "}
            <strong className="break-all font-medium text-foreground">
              {preview.target}
            </strong>
          </span>
        </p>
        {preview.fields.map((field) => (
          <div className="space-y-1" key={field.id}>
            <label
              className="block text-xs"
              htmlFor={`${preview.request_id}-${field.id}`}
            >
              {t(`secretRequest.field.${field.id}`, {
                defaultValue: field.label,
              })}
            </label>
            <Input
              autoComplete="off"
              className="h-8 text-sm"
              disabled={submit.isPending}
              id={`${preview.request_id}-${field.id}`}
              onChange={(event) =>
                setValues((prev) => ({
                  ...prev,
                  [field.id]: event.target.value,
                }))
              }
              placeholder={
                field.kind === "username"
                  ? t("secretRequest.usernameHint")
                  : undefined
              }
              spellCheck={false}
              type={field.kind === "password" ? "password" : "text"}
              value={values[field.id] ?? ""}
            />
          </div>
        ))}
        <p className="text-muted-foreground text-xs">
          {t("secretRequest.private")}
        </p>
        {submit.isError ? (
          <p className="text-destructive text-xs">
            {t(`secretRequest.errors.${errorKey(submit.error)}`)}
          </p>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          {declineChoiceId ? (
            <Button
              className="h-7 text-xs"
              disabled={submit.isPending}
              onClick={() =>
                onChoose(
                  artifactId,
                  declineChoiceId,
                  t("secretRequest.decline")
                )
              }
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("secretRequest.decline")}
            </Button>
          ) : null}
          <Button
            className="h-7 text-xs"
            disabled={!ready || submit.isPending}
            size="sm"
            type="submit"
          >
            {submit.isPending
              ? t("secretRequest.submitting")
              : t("secretRequest.submit")}
          </Button>
        </div>
      </form>
    </section>
  );
}
