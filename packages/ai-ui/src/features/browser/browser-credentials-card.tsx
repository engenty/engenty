"use client";

// The card a run parks on for `browser_request_credentials`: the page with
// the login fields marked, the site the values go to, and the form. Submit
// posts the values to the fill route — not to the run — and only then
// answers the card with the "filled" choice, which carries no value. The
// decision card's free-text answer is deliberately absent: a password typed
// there would go to the model.
import type { AgUiBrowserPreview } from "@engenty/ag-ui-bridge";
import { useTranslation } from "@engenty/i18n/ui";
import { useMutation } from "@engenty/query-client";
import { Button, Input } from "@engenty/ui-core";
import { Lock } from "lucide-react";
import { type FormEvent, useState } from "react";
import { InterruptCardDismissButton } from "../../components/copilot/interrupts/interrupt-card-dismiss-button.js";
import { BrowserScreenshot } from "./browser-chat-widget.js";
import { fillUserBrowserCredentials } from "./user-browser-api.js";

type CredentialsPreview = Extract<
  AgUiBrowserPreview,
  { kind: "browser_credentials" }
>;

const AUTOCOMPLETE: Record<
  CredentialsPreview["fields"][number]["kind"],
  string
> = {
  otp: "one-time-code",
  password: "current-password",
  text: "off",
  username: "username",
};

const ERROR_CODES = new Set([
  "expired",
  "field_missing",
  "fill_failed",
  "not_a_password_field",
  "not_an_input",
  "not_found",
  "origin_changed",
]);

function errorKey(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  const suffix = typeof code === "string" ? (code.split(".").at(-1) ?? "") : "";
  return ERROR_CODES.has(suffix) ? suffix : "fill_failed";
}

export function BrowserCredentialsCard({
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
  preview: CredentialsPreview;
  title: string;
}) {
  const { t } = useTranslation("ai-ui");
  const [values, setValues] = useState<Record<string, string>>({});
  const fill = useMutation({
    mutationFn: () =>
      fillUserBrowserCredentials(
        { spaceId: preview.space_id },
        preview.request_id,
        values
      ),
    onSuccess: () => {
      // The values are in the page; drop them from memory before resuming.
      setValues({});
      onChoose(
        artifactId,
        preview.filled_choice_id,
        t("browser.credentials.filled")
      );
    },
  });
  const ready = preview.fields.some((field) => values[field.id]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (ready && !fill.isPending) {
      fill.mutate();
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
            disabled={fill.isPending}
            onDismiss={onDismiss}
          />
        ) : null}
      </div>
      {preview.screenshot ? (
        <BrowserScreenshot
          preview={{
            ...preview.screenshot,
            agent_id: preview.agent_id,
            kind: "browser_screenshot",
            space_id: preview.space_id,
            url: preview.origin,
          }}
        />
      ) : null}
      <form autoComplete="on" className="space-y-2" onSubmit={submit}>
        <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <Lock aria-hidden className="size-3 shrink-0" />
          <span>
            {t("browser.credentials.goesTo")}{" "}
            <strong className="font-medium text-foreground">
              {preview.origin}
            </strong>
          </span>
        </p>
        {preview.fields.map((field) => (
          <div className="space-y-1" key={field.id}>
            <label
              className="block text-xs"
              htmlFor={`${preview.request_id}-${field.id}`}
            >
              {field.label}
            </label>
            <Input
              autoComplete={AUTOCOMPLETE[field.kind]}
              className="h-8 text-sm"
              disabled={fill.isPending}
              id={`${preview.request_id}-${field.id}`}
              inputMode={field.kind === "otp" ? "numeric" : undefined}
              name={field.kind === "text" ? field.id : field.kind}
              onChange={(event) =>
                setValues((prev) => ({
                  ...prev,
                  [field.id]: event.target.value,
                }))
              }
              spellCheck={false}
              type={field.kind === "password" ? "password" : "text"}
              value={values[field.id] ?? ""}
            />
          </div>
        ))}
        <p className="text-muted-foreground text-xs">
          {t("browser.credentials.private")}
        </p>
        {fill.isError ? (
          <p className="text-destructive text-xs">
            {t(`browser.credentials.errors.${errorKey(fill.error)}`)}
          </p>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          {declineChoiceId ? (
            <Button
              className="h-7 text-xs"
              disabled={fill.isPending}
              onClick={() =>
                onChoose(
                  artifactId,
                  declineChoiceId,
                  t("browser.credentials.decline")
                )
              }
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("browser.credentials.decline")}
            </Button>
          ) : null}
          <Button
            className="h-7 text-xs"
            disabled={!ready || fill.isPending}
            size="sm"
            type="submit"
          >
            {fill.isPending
              ? t("browser.credentials.filling")
              : t("browser.credentials.fill")}
          </Button>
        </div>
      </form>
    </section>
  );
}
