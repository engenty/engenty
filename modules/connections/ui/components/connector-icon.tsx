import { connectorLogoSvg } from "@engenty/ui-icons";
import { Cable } from "lucide-react";

export function ConnectorIcon({ icon }: { icon: string | null }) {
  // Connector `icon` hints, in precedence order: `logo:<slug>` for a bundled
  // brand SVG, an emoji (render it), or anything else (icon NAMES would
  // render as raw text) falls back to the generic glyph.
  const logoSvg = connectorLogoSvg(icon);
  const isEmoji = Boolean(icon) && !/[\w\s-]/u.test(icon ?? "");
  return (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 text-lg">
      {logoSvg ? (
        <img
          alt=""
          className="size-5 object-contain"
          height={20}
          src={`data:image/svg+xml;utf8,${encodeURIComponent(logoSvg)}`}
          width={20}
        />
      ) : isEmoji ? (
        <span aria-hidden>{icon}</span>
      ) : (
        <Cable aria-hidden className="h-5 w-5 text-muted-foreground" />
      )}
    </div>
  );
}
