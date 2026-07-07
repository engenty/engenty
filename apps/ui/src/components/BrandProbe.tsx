import type { UiBrandInfo, UiBrandSource } from "@engenty/ui-plugin-sdk";
import { useEffect } from "react";

interface BrandProbeProps {
  onChange: (brand: UiBrandInfo) => void;
  useBrand: UiBrandSource;
}

/**
 * Bridges a module-contributed brand-source hook (see `UiBrandSource`) up to the
 * app shell. Rendered only when a brand source exists, so the contributed hook
 * is always called for this component's whole lifetime — mounting/unmounting the
 * probe (rather than calling the hook conditionally in the parent) keeps the
 * parent's hook order stable when the contribution appears after plugins load.
 */
export function BrandProbe({ useBrand, onChange }: BrandProbeProps) {
  const brand = useBrand();
  const { name, logoUrl, tagLine } = brand;

  useEffect(() => {
    onChange({ name, logoUrl, tagLine });
  }, [name, logoUrl, tagLine, onChange]);

  return null;
}
