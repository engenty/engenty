import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "../cn";

/** Scroll entrance. Visible without JS; arms a fade-up only after mount. */
export function Reveal({
  children,
  className,
  delay = 0,
  travel = 20,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  travel?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setInView(true);
      return;
    }
    setArmed(true);
    let done = false;
    const show = () => {
      if (!done) {
        done = true;
        setInView(true);
      }
    };
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          show();
          io.disconnect();
        }
      },
      { threshold: 0.18 }
    );
    io.observe(el);
    const safety = window.setTimeout(show, 900);
    return () => {
      window.clearTimeout(safety);
      io.disconnect();
    };
  }, []);

  return (
    <div
      className={cn("www-reveal", armed && "www-reveal-armed", className)}
      data-in={inView ? "1" : undefined}
      ref={ref}
      style={
        {
          "--www-reveal-delay": `${delay}ms`,
          "--www-reveal-travel": `${travel}px`,
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}
