/**
 * One Data-tab root type as a Work-tab-shaped section: uppercase heading,
 * chevron to collapse, hover "+" to add. The tree rows live inside.
 *
 * Children stay unmounted while collapsed so a closed Contacts does not fetch
 * every person — the same lazy contract the folder rows used to honour.
 */
import { Collapsible, CollapsibleContent } from "@engenty/ui-core";
import { type ReactNode, useEffect, useRef } from "react";
import {
  type SpaceSectionAddItem,
  SpaceSectionAddMenu,
  SpaceSectionHeading,
} from "@/components/spaces/space-section-heading";
import {
  SPACE_SECTION_OPEN_KEYS,
  useSpaceSectionOpen,
} from "@/lib/use-space-section-open";

export function SpaceDataRootSection({
  addDisabled = false,
  addItems = [],
  addLabel,
  containsSelection,
  headingActive,
  label,
  sectionId,
  spaceKey,
  to,
  children,
}: {
  addDisabled?: boolean;
  addItems?: readonly SpaceSectionAddItem[];
  addLabel: string;
  children: ReactNode;
  containsSelection: boolean;
  headingActive?: boolean;
  label: string;
  sectionId: string;
  spaceKey: string;
  to?: string;
}) {
  const [open, setOpen] = useSpaceSectionOpen(
    SPACE_SECTION_OPEN_KEYS.data,
    `${spaceKey}::${sectionId}`,
    containsSelection
  );
  const wasSelected = useRef(containsSelection);

  useEffect(() => {
    if (containsSelection && !wasSelected.current) {
      setOpen(true);
    }
    wasSelected.current = containsSelection;
  }, [containsSelection, setOpen]);

  return (
    <Collapsible
      className="group/section flex flex-col"
      onOpenChange={setOpen}
      open={open}
    >
      <SpaceSectionHeading
        action={
          <SpaceSectionAddMenu
            disabled={addDisabled}
            items={addItems}
            label={addLabel}
          />
        }
        active={headingActive}
        onOpenChange={setOpen}
        open={open}
        {...(to ? { to } : {})}
      >
        {label}
      </SpaceSectionHeading>
      {open ? <CollapsibleContent>{children}</CollapsibleContent> : null}
    </Collapsible>
  );
}
