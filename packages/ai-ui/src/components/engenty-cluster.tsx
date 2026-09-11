// A room's face: its agents' engenties as ONE mark, the way a group chat's
// avatar is a cluster, not a row. One agent is itself; two sit side by side;
// three or more make a triangle — one on top, two below — which is what
// reads as "a group" at sidebar size, where a row of three blobs stretched
// wider than the column allowed and clipped to two.
import type { AgentEngentyKind } from "@engenty/ai-core/browser";
import { cn, Engenty } from "@engenty/ui-core";

/** How many engenties the cluster draws; the rest are implied. */
export const ENGENTY_CLUSTER_MAX = 3;

export function EngentyCluster({
  animated = false,
  className,
  kinds,
  size,
}: {
  animated?: boolean;
  className?: string;
  /** The room's agents' engenties, host first. Empty draws a placeholder. */
  kinds: readonly AgentEngentyKind[];
  /** The cluster's edge in px — each engenty is drawn smaller to fit. */
  size: number;
}) {
  const shown = kinds.slice(0, ENGENTY_CLUSTER_MAX);
  if (shown.length <= 1) {
    return (
      <span
        aria-hidden
        className={cn("grid shrink-0 place-items-center", className)}
        style={{ height: size, width: size }}
      >
        <Engenty
          animated={animated}
          className="[&_.e-shadow]:hidden"
          kind={shown[0] ?? "round"}
          size={size}
        />
      </span>
    );
  }
  // Each blob is a little over half the edge, so two overlap in the middle
  // and three overlap along the triangle's sides.
  const blob = Math.round(size * 0.62);
  const positions: Array<{ left: number; top: number }> =
    shown.length === 2
      ? [
          { left: 0, top: (size - blob) / 2 },
          { left: size - blob, top: (size - blob) / 2 },
        ]
      : [
          { left: (size - blob) / 2, top: 0 },
          { left: 0, top: size - blob },
          { left: size - blob, top: size - blob },
        ];
  return (
    <span
      aria-hidden
      className={cn("relative block shrink-0", className)}
      style={{ height: size, width: size }}
    >
      {shown.map((kind, index) => {
        const at = positions[index] as { left: number; top: number };
        return (
          <span
            // No backing disc: the blobs overlap as shapes, the way a group
            // avatar does — a disc behind each one punched a hole in the next.
            className="absolute grid place-items-center"
            key={`${kind}:${index}`}
            style={{
              height: blob,
              left: at.left,
              top: at.top,
              width: blob,
              // The top blob sits over the two below it, the left over the right.
              zIndex: ENGENTY_CLUSTER_MAX - index,
            }}
          >
            <Engenty
              animated={animated}
              className="[&_.e-shadow]:hidden"
              kind={kind}
              size={blob}
            />
          </span>
        );
      })}
    </span>
  );
}
