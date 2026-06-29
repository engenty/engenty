"use client";

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";

import { type AsChildProps, resolveAsChildRender } from "../../lib/as-child";

function Collapsible({
  onOpenChange,
  ...props
}: CollapsiblePrimitive.Root.Props & {
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <CollapsiblePrimitive.Root
      data-slot="collapsible"
      onOpenChange={(open) => {
        onOpenChange?.(open);
      }}
      {...props}
    />
  );
}

function CollapsibleTrigger(
  props: CollapsiblePrimitive.Trigger.Props & AsChildProps,
) {
  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      {...resolveAsChildRender(props)}
    />
  );
}

function CollapsibleContent({ ...props }: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-content"
      {...props}
    />
  );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
