import { toast } from "sonner";

const TASK_SAVE_ERROR_KEYS: Record<string, string> = {
  task_checkout_required: "errors.taskCheckoutRequired",
  task_status_invalid: "errors_task_status_invalid",
  task_status_transition_denied: "errors.taskStatusTransitionDenied",
  task_terminal_immutable: "errors.taskTerminalImmutable",
};

export function resolveTaskSaveErrorMessage(
  err: unknown,
  translate: (key: string) => string,
  fallbackKey: string
): string {
  const code = err instanceof Error ? err.message.trim() : "";
  const mappedKey = TASK_SAVE_ERROR_KEYS[code];
  if (mappedKey) {
    return translate(mappedKey);
  }
  if (code && !code.startsWith("task_")) {
    return code;
  }
  return translate(fallbackKey);
}

export function showTaskSaveErrorToast(
  err: unknown,
  translate: (key: string) => string,
  fallbackKey = "edit.saveFailed"
) {
  toast.error(resolveTaskSaveErrorMessage(err, translate, fallbackKey));
}
