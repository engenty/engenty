// Account – the superadmin, part of the server setup. Creates the account,
// then signs it in on a detached client (see ServerSetupApi.signIn); the
// shared client signs in only when the server setup ends. A failed sign-in
// retries only the sign-in.

import { Input, PasswordInput } from "@engenty/ui-core";
import { type FormEvent, useState } from "react";
import type {
  AdminValues,
  ServerSetupApi,
  SetupSession,
} from "../../lib/setup-api";
import type { SetupCopy } from "../../lib/setup-wizard-i18n";
import {
  ErrorLine,
  Field,
  SETUP_INPUT_CLASS,
  SubmitButton,
} from "./setup-bits";

export function AdminStep({
  api,
  copy,
  onComplete,
  onNameChange,
}: {
  api: ServerSetupApi;
  copy: SetupCopy["admin"];
  onComplete: (values: AdminValues, session: SetupSession) => void;
  /** The name as it is typed, for the picture. */
  onNameChange: (name: string) => void;
}) {
  const [values, setValues] = useState<AdminValues>({
    name: "",
    email: "",
    password: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  const set = (key: keyof AdminValues, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setError(null);
    if (key === "name") {
      onNameChange(value);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!values.name.trim()) {
      setError(copy.errors.name);
      return;
    }
    if (!(values.email.trim() && values.email.includes("@"))) {
      setError(copy.errors.email);
      return;
    }
    if (values.password.length < 6) {
      setError(copy.errors.password);
      return;
    }
    setSubmitting(true);
    try {
      if (!created) {
        await api.createAdmin(values);
        setCreated(true);
      }
      onComplete(values, await api.signIn(values));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  const locked = submitting || created;

  return (
    <form className="flex flex-col gap-5" noValidate onSubmit={submit}>
      <Field htmlFor="setup-name" label={copy.name}>
        <Input
          autoComplete="name"
          autoFocus
          className={SETUP_INPUT_CLASS}
          disabled={locked}
          id="setup-name"
          onChange={(e) => set("name", e.target.value)}
          placeholder={copy.namePlaceholder}
          value={values.name}
        />
      </Field>
      <Field htmlFor="setup-email" label={copy.email}>
        <Input
          autoComplete="email"
          className={SETUP_INPUT_CLASS}
          disabled={locked}
          id="setup-email"
          onChange={(e) => set("email", e.target.value)}
          placeholder={copy.emailPlaceholder}
          type="email"
          value={values.email}
        />
      </Field>
      <Field htmlFor="setup-password" label={copy.password}>
        <PasswordInput
          autoComplete="new-password"
          className={SETUP_INPUT_CLASS}
          disabled={locked}
          id="setup-password"
          labels={{
            hide: copy.hide,
            medium: copy.strength.medium,
            show: copy.show,
            strong: copy.strength.strong,
            weak: copy.strength.weak,
          }}
          onChange={(e) => set("password", e.target.value)}
          placeholder={copy.passwordPlaceholder}
          showGenerate={false}
          value={values.password}
        />
      </Field>
      <ErrorLine message={error} />
      <SubmitButton
        busy={submitting}
        busyLabel={copy.busy}
        label={copy.submit}
      />
    </form>
  );
}
