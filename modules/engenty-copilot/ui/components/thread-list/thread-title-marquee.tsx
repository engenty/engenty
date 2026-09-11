import { SidebarRowTitleMarquee } from "@engenty/ui-core";

/** Truncated title that scrolls the full string into view on hover. */
export function ThreadTitleMarquee(props: {
  className?: string;
  text: string;
}) {
  return (
    <SidebarRowTitleMarquee
      className={props.className}
      text={props.text}
      textClassName="text-[13px] leading-none"
    />
  );
}
