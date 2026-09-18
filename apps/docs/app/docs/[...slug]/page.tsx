import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page";
import { createRelativeLink } from "fumadocs-ui/mdx";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LLMCopyButton, ViewOptions } from "@/components/ai/page-actions";
import { DocsQuote } from "@/components/brand/docs-quote";
import { Mascot } from "@/components/brand/mascot";
import { sectionBrand } from "@/components/brand/section-tone";
import { githubUrlForPage } from "@/lib/docs-github-path";
import { getPageImage, source } from "@/lib/source";
import { getMDXComponents } from "@/mdx-components";

function StatusBadge({
  status,
}: {
  status: "draft" | "outdated" | "needs-work" | "approved";
}) {
  const styles = {
    draft:
      "bg-sky-100/80 text-sky-800 border-sky-200/30 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20",
    outdated:
      "bg-amber-100/80 text-amber-800 border-amber-200/30 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
    "needs-work":
      "bg-red-100/80 text-red-800 border-red-200/30 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20",
    approved:
      "bg-emerald-100/80 text-emerald-800 border-emerald-200/30 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
  };

  const labels = {
    draft: "Draft",
    outdated: "Outdated",
    "needs-work": "Needs Work",
    approved: "Approved",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium border rounded-full capitalize ${styles[status]}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          status === "approved"
            ? "bg-emerald-500 dark:bg-emerald-400"
            : status === "draft"
              ? "bg-sky-500 dark:bg-sky-400"
              : status === "outdated"
                ? "bg-amber-500 dark:bg-amber-400"
                : "bg-red-500 dark:bg-red-400"
        }`}
      />
      {labels[status]}
    </span>
  );
}

export default async function Page(props: PageProps<"/docs/[...slug]">) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;
  const brand = sectionBrand(page.url);

  return (
    <DocsPage
      toc={page.data.toc}
      tableOfContent={{
        style: "clerk",
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <DocsTitle className="docs-title mb-0">
          {page.data.title}
          {/* The section's engenty stands on the end of the title. */}
          <Mascot className="docs-title-mascot" kind={brand.kind} size={56} />
        </DocsTitle>
        {page.data.status && (
          <StatusBadge
            status={
              page.data.status as
                | "draft"
                | "outdated"
                | "needs-work"
                | "approved"
            }
          />
        )}
      </div>
      <DocsDescription className="mt-2 mb-0">
        {page.data.description}
      </DocsDescription>
      <div className="flex flex-row gap-2 items-center border-b pb-6">
        <LLMCopyButton markdownUrl={`${page.url}.mdx`} />
        <ViewOptions
          markdownUrl={`${page.url}.mdx`}
          githubUrl={githubUrlForPage(page.path)}
        />
      </div>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            // this allows you to link to other pages with relative file paths
            a: createRelativeLink(source, page),
            blockquote: (props) => <DocsQuote kind={brand.kind} {...props} />,
            // Every doc opens with an h1 that repeats the frontmatter title,
            // which DocsTitle already renders above the body.
            h1: () => null,
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(
  props: PageProps<"/docs/[...slug]">,
): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
    openGraph: {
      images: getPageImage(page).url,
    },
  };
}
