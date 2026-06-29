import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";

export interface AsChildProps {
  asChild?: boolean;
  children?: ReactNode;
}

// Maps Radix-style asChild to Base UI render for triggers and polymorphic wrappers.
export function resolveAsChildRender<P extends AsChildProps>(
  props: P
): Omit<P, "asChild"> {
  const { asChild, children, ...rest } = props;

  if (asChild && isValidElement(children)) {
    return {
      ...(rest as Omit<P, "asChild">),
      render: children,
      children: undefined,
    };
  }

  return { ...(rest as Omit<P, "asChild">), children };
}

export function mergeClassNameOntoRender(
  render: ReactElement<{ className?: string }>,
  className: string | undefined
): ReactElement<{ className?: string }> {
  if (!className) {
    return render;
  }

  return cloneElement(render, {
    className: [render.props.className, className].filter(Boolean).join(" "),
  });
}

export function isButtonLike(element: ReactNode): boolean {
  if (!isValidElement(element)) {
    return false;
  }
  const type = element.type as any;
  if (type === "button") {
    return true;
  }

  if (typeof type === "function") {
    const name = type.displayName || type.name;
    if (typeof name === "string" && name.endsWith("Button")) {
      return true;
    }
  }

  if (typeof type === "object" && type !== null) {
    const render = type.render;
    if (render) {
      const name = render.displayName || render.name;
      if (typeof name === "string" && name.endsWith("Button")) {
        return true;
      }
    }
  }

  return false;
}
