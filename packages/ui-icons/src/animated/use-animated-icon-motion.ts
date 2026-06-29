import { useAnimation } from "motion/react";
import {
  type MouseEvent,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import type { AnimatedIconHandle, AnimatedIconPlayMode } from "./types";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";

export function useAnimatedIconMotion(
  ref: Ref<AnimatedIconHandle> | undefined,
  play: AnimatedIconPlayMode = "hover"
) {
  const controls = useAnimation();
  const isControlledRef = useRef(false);
  const isMountedRef = useRef(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const motionDisabled = prefersReducedMotion;

  const startVariant = useCallback(
    (variant: "animate" | "normal") => {
      if (motionDisabled || !isMountedRef.current) {
        return;
      }
      try {
        if ("hasMounted" in controls && !(controls as any).hasMounted) {
          return;
        }
        void controls.start(variant);
      } catch {
        // Safe fallback in case it throws synchronously
      }
    },
    [controls, motionDisabled]
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useImperativeHandle(ref, () => {
    isControlledRef.current = true;
    return {
      startAnimation: () => {
        startVariant("animate");
      },
      stopAnimation: () => {
        startVariant("normal");
      },
    };
  });

  useEffect(() => {
    if (motionDisabled || play !== "always") {
      return;
    }
    let active = true;
    const start = async () => {
      // Wait for motion children to bind `animate={controls}` before starting.
      while (active && !(controls as any).hasMounted) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      if (active) {
        startVariant("animate");
      }
    };
    void start();
    return () => {
      active = false;
    };
  }, [motionDisabled, play, startVariant, controls]);

  const handleMouseEnter = useCallback(
    (
      e: MouseEvent<HTMLDivElement>,
      onMouseEnter?: (e: MouseEvent<HTMLDivElement>) => void
    ) => {
      onMouseEnter?.(e);
      if (play !== "hover" || isControlledRef.current) {
        return;
      }
      startVariant("animate");
    },
    [play, startVariant]
  );

  const handleMouseLeave = useCallback(
    (
      e: MouseEvent<HTMLDivElement>,
      onMouseLeave?: (e: MouseEvent<HTMLDivElement>) => void
    ) => {
      onMouseLeave?.(e);
      if (play !== "hover" || isControlledRef.current) {
        return;
      }
      startVariant("normal");
    },
    [play, startVariant]
  );

  return {
    controls,
    motionDisabled,
    handleMouseEnter,
    handleMouseLeave,
  };
}
