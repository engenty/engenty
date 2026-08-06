interface ThreadListMessageProps {
  children: string | null;
  tone?: "default" | "danger";
}

export function ThreadListMessage(props: ThreadListMessageProps) {
  return (
    <p
      className={
        props.tone === "danger"
          ? "pl-2 text-destructive text-xs leading-relaxed"
          : "pl-2 text-muted-foreground text-xs leading-relaxed"
      }
    >
      {props.children}
    </p>
  );
}
