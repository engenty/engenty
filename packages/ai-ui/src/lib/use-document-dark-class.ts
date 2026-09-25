import { useEffect, useState } from "react";

/** Whether the app renders dark: the `dark` class on <html>, followed live. */
export function useDocumentDarkClass(): boolean {
  const [isDark, setIsDark] = useState(() =>
    typeof document === "undefined"
      ? false
      : document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setIsDark(root.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}
