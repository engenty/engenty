import {
  type AppBarPosition,
  AppBarPositionPicker,
  createDefaultShellAppBarPositionSnapshot,
  DEFAULT_APP_BAR_POSITION,
  readAppBarPositionFromStorage,
  SHELL_APP_BAR_POSITION_CHANGE_EVENT,
  SHELL_APP_BAR_POSITION_USER_SETTING_NAME,
  writeAppBarPositionToStorage,
} from "@engenty/app-shell";
import { useQueryClient } from "@engenty/query-client";
import { useCallback, useEffect, useState } from "react";
import { setUserSetting } from "../../lib/user-settings-api.js";

const QUERY_KEY = [
  "user-settings",
  SHELL_APP_BAR_POSITION_USER_SETTING_NAME,
] as const;

/**
 * Profile → Appearance control. Saves immediately (not the profile Save button).
 */
export function AppBarPositionField() {
  const queryClient = useQueryClient();
  const [position, setPosition] = useState<AppBarPosition>(
    () => readAppBarPositionFromStorage() ?? DEFAULT_APP_BAR_POSITION
  );

  useEffect(() => {
    const sync = () => {
      setPosition(readAppBarPositionFromStorage() ?? DEFAULT_APP_BAR_POSITION);
    };
    window.addEventListener(SHELL_APP_BAR_POSITION_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener(SHELL_APP_BAR_POSITION_CHANGE_EVENT, sync);
    };
  }, []);

  const handleChange = useCallback(
    (next: AppBarPosition) => {
      const body = {
        ...createDefaultShellAppBarPositionSnapshot(),
        position: next,
      };
      writeAppBarPositionToStorage(next);
      queryClient.setQueryData(QUERY_KEY, body);
      void setUserSetting(SHELL_APP_BAR_POSITION_USER_SETTING_NAME, {
        type: "json",
        value_jsonb: body,
      }).catch(() => {
        // Instant paint already applied; the next hydrate will restore.
      });
    },
    [queryClient]
  );

  return <AppBarPositionPicker onChange={handleChange} value={position} />;
}
