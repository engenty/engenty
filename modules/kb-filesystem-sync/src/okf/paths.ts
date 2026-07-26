/**
 * Storage key construction for the OKF tree. All keys hang off a per-KB base
 * prefix (see `kbBasePrefix`).
 */

/** Root KB metadata file: `<base>/index.md`. */
export function kbRootKey(base: string): string {
  return `${base}/index.md`;
}

/** Folder path for a category given its slug chain: `<base>/a/b/c`. */
export function categoryDirPath(base: string, slugChain: string[]): string {
  return [base, ...slugChain].join("/");
}

/** Category metadata file: `<base>/a/b/c/index.md`. */
export function categoryIndexKey(base: string, slugChain: string[]): string {
  return `${categoryDirPath(base, slugChain)}/index.md`;
}

/** Article file: `<base>/a/b/c/<article-slug>.md`. */
export function articleKey(
  base: string,
  categorySlugChain: string[],
  articleSlug: string
): string {
  return `${categoryDirPath(base, categorySlugChain)}/${articleSlug}.md`;
}

/** True for a `…/index.md` metadata key (KB root or category). */
export function isIndexKey(key: string): boolean {
  return key.endsWith("/index.md");
}
