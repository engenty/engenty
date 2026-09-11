// Adapted from https://github.com/pqoqubbw/icons (MIT) — lucide-animated "loader"
import type { Variants } from "motion/react";
import { motion } from "motion/react";
import type { Ref } from "react";
import { AnimatedIcon } from "../animated-icon";
import { AnimatedIconSvg } from "../animated-icon-svg";
import type { AnimatedIconBaseProps, AnimatedIconHandle } from "../types";

const G_VARIANTS: Variants = {
  normal: { rotate: 0 },
  animate: {
    rotate: 360,
    transition: {
      repeat: Number.POSITIVE_INFINITY,
      duration: 0.8,
      ease: "linear",
    },
  },
};

export type AnimatedLoaderIconProps = AnimatedIconBaseProps & {
  ref?: Ref<AnimatedIconHandle>;
};

/** Spinner; use `play="always"` for in-flight work (replaces `Loader2` + `animate-spin`). */
export function AnimatedLoaderIcon({
  play = "always",
  ref,
  ...props
}: AnimatedLoaderIconProps) {
  return (
    <AnimatedIcon play={play} ref={ref} {...props}>
      {({ pixelSize, controls, motionDisabled }) => (
        <AnimatedIconSvg
          fill="none"
          height={pixelSize}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width={pixelSize}
          xmlns="http://www.w3.org/2000/svg"
        >
          <motion.g
            animate={
              motionDisabled
                ? "normal"
                : play === "always"
                  ? "animate"
                  : controls
            }
            // Always mount at "normal": framer only plays a transition when the
            // value CHANGES, so `initial="animate"` (rotate already 360) made
            // the infinite spin a no-op and every always-on loader sat still.
            initial="normal"
            style={{ transformOrigin: "12px 12px" }}
            variants={G_VARIANTS}
          >
            <path d="M12 2v4" />
            <path d="m16.2 7.8 2.9-2.9" />
            <path d="M18 12h4" />
            <path d="m16.2 16.2 2.9 2.9" />
            <path d="M12 18v4" />
            <path d="m4.9 19.1 2.9-2.9" />
            <path d="M2 12h4" />
            <path d="m4.9 4.9 2.9 2.9" />
          </motion.g>
        </AnimatedIconSvg>
      )}
    </AnimatedIcon>
  );
}
