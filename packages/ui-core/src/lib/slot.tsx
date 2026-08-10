import {
  cloneElement,
  type HTMLAttributes,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";

import { cn } from "./utils";

// Lightweight Radix Slot replacement for FormControl and sidebar asChild composition.
const Slot = ({
  children,
  className,
  ref,
  ...props
}: HTMLAttributes<HTMLElement> & {
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
}) => {
  if (!isValidElement(children)) {
    return null;
  }

  const child = children as ReactElement<{
    className?: string;
    ref?: Ref<HTMLElement>;
  }>;

  return cloneElement(child, {
    ...props,
    ...child.props,
    className: cn(className, child.props.className),
    ref: ref ?? child.props.ref,
  });
};
Slot.displayName = "Slot";

export { Slot };
