import {
  isEngentyDeveloperModeUiEnabled,
  subscribeDeveloperModePreference,
} from "@engenty/environment";
import { useEffect, useState } from "react";

/** Reactive developer-mode UI flag (dev ENV + user-menu toggle). */
export function useDeveloperModeEnabled() {
  const [enabled, setEnabled] = useState(isEngentyDeveloperModeUiEnabled);

  useEffect(
    () =>
      subscribeDeveloperModePreference(() => {
        setEnabled(isEngentyDeveloperModeUiEnabled());
      }),
    []
  );

  return enabled;
}
