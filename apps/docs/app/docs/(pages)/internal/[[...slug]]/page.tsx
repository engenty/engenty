// Internal docs route (/docs/internal/*). Mirrors the published docs page but
// reads from `internalSource` (docs/internal). Local-only: in the published
// build docs/internal is empty, so these routes have no pages.

import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page";
import { createRelativeLink } from "fumadocs-ui/mdx";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { internalSource } from "@/lib/source";
import { getMDXComponents } from "@/mdx-components";

export default async function Page(
  props: PageProps<"/docs/internal/[[...slug]]">,
) {
  const params = await props.params;
  const slug = params.slug;
  // /docs/internal → land on the internal README.
  if (!slug || slug.length === 0) {
    redirect("/docs/internal/README");
  }
  const page = internalSource.getPage(slug);
  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} tableOfContent={{ style: "clerk" }}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            a: createRelativeLink(internalSource, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return internalSource.generateParams();
}

export async function generateMetadata(
  props: PageProps<"/docs/internal/[[...slug]]">,
): Promise<Metadata> {
  const params = await props.params;
  const slug = params.slug;
  if (!slug || slug.length === 0) {
    return { title: "Internal docs" };
  }
  const page = internalSource.getPage(slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
  };
}
