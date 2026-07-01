import { useTranslation } from "@engenty/i18n/ui";
import { Textarea } from "@engenty/ui-core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUpdateContactMutation } from "../queries.js";

interface ContactNotesFieldProps {
  contactId: string;
  initialValue: string;
}

function todayDateLine(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `--- ${yyyy}-${mm}-${dd} ---`;
}

export function ContactNotesField({
  contactId,
  initialValue,
}: ContactNotesFieldProps) {
  const { t } = useTranslation("contacts");
  const [value, setValue] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const updateMutation = useUpdateContactMutation(contactId);
  const lastSavedRef = useRef(initialValue);

  useEffect(() => {
    setValue(initialValue);
    lastSavedRef.current = initialValue;
  }, [initialValue]);

  const save = useCallback(
    (text: string) => {
      if (text === lastSavedRef.current) {
        return;
      }
      lastSavedRef.current = text;
      updateMutation.mutate({ notes: text || null });
    },
    [updateMutation]
  );

  const handleFocus = useCallback(() => {
    const today = todayDateLine();
    if (value.includes(today)) {
      return;
    }

    const prefix = value.trim()
      ? `${value.trim()}\n\n${today}\n`
      : `${today}\n`;
    setValue(prefix);

    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) {
        return;
      }
      el.selectionStart = prefix.length;
      el.selectionEnd = prefix.length;
    });
  }, [value]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const next = e.target.value;
      setValue(next);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => save(next), 1200);
    },
    [save]
  );

  const handleBlur = useCallback(() => {
    clearTimeout(debounceRef.current);
    save(value);
  }, [save, value]);

  return (
    <Textarea
      className="min-h-[140px] resize-y text-sm"
      onBlur={handleBlur}
      onChange={handleChange}
      onFocus={handleFocus}
      placeholder={t("detail.notesPlaceholder")}
      ref={textareaRef}
      value={value}
    />
  );
}
