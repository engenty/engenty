import { DocsLayoutShell } from "@/components/docs-layout-shell";
import { internalSource, source } from "@/lib/source";

export default function Layout({ children }: LayoutProps<"/docs">) {
  return (
    <DocsLayoutShell
      internalTree={internalSource.getPageTree()}
      tree={source.getPageTree()}
    >
      {children}
    </DocsLayoutShell>
  );
}
