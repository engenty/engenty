/**
 * KB switcher for the shell breadcrumb (when the secondary column is collapsed).
 */

import type { PageBreadcrumb } from "@engenty/ui-plugin-sdk";
import { Link } from "react-router-dom";
import type { KnowledgeBase } from "../../src/schema/types.js";
import { kbDisplayName } from "../kb-display-name.js";
import { KB_MODULE_BASE } from "../kb-paths.js";
import { KbSwitcherPopover } from "./kb-switcher-popover.js";

export interface KbBreadcrumbPickerProps {
  kbId: string;
  kbs: KnowledgeBase[];
  onSelect: (nextKbId: string) => void;
}

export function kbPickerBreadcrumbSegment(props: {
  kbId: string;
  kbs: KnowledgeBase[];
  onSelect: (nextKbId: string) => void;
  t: (key: string, defaultValue?: string) => string;
}): PageBreadcrumb | null {
  const { kbId, kbs, onSelect, t } = props;
  if (!kbId || kbs.length === 0) {
    return null;
  }
  const kb = kbs.find((k) => k.id === kbId);
  const name = kb ? kbDisplayName(kb, t) : "";
  return {
    compactKept: true,
    label: <KbBreadcrumbPicker kbId={kbId} kbs={kbs} onSelect={onSelect} />,
    menuLabel: name,
    to: KB_MODULE_BASE,
  };
}

const renderLink: Parameters<typeof KbSwitcherPopover>[0]["renderLink"] = ({
  to,
  className,
  onClick,
  children,
}) => (
  <Link className={className} onClick={onClick} to={to}>
    {children}
  </Link>
);

export function KbBreadcrumbPicker({
  kbId,
  kbs,
  onSelect,
}: KbBreadcrumbPickerProps) {
  if (kbs.length === 0) {
    return null;
  }

  return (
    <KbSwitcherPopover
      activeKbId={kbId}
      kbs={kbs}
      onSelect={onSelect}
      openOn="hover"
      renderLink={renderLink}
    />
  );
}
