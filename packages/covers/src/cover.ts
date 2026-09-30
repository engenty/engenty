/**
 * A cover: the band of colour, gradient or image at the top of a page
 * (knowledge bases, their categories, projects, …).
 *
 * "color": solid hex / oklch / `var(--token)`; "gradient": a CSS gradient;
 * "image": an HTTPS URL, or a file-storage object key the UI resolves to a
 * signed URL.
 */
import { z } from "zod";

export interface CoverImageSourceUnsplash {
  kind: "unsplash";
  photo_url: string;
  photographer_name: string;
  photographer_url: string;
}

export type CoverImageSource = CoverImageSourceUnsplash;

export type Cover =
  | { type: "color"; value: string }
  | { type: "gradient"; value: string }
  | { type: "image"; value: string; source?: CoverImageSource };

const coverImageSourceSchema = z.object({
  kind: z.literal("unsplash"),
  photo_url: z.string().min(1).max(512),
  photographer_name: z.string().min(1).max(128),
  photographer_url: z.string().min(1).max(512),
});

export const coverSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("color"), value: z.string().max(128) }),
  z.object({ type: z.literal("gradient"), value: z.string().max(512) }),
  z.object({
    type: z.literal("image"),
    value: z.string().min(1).max(2048),
    source: coverImageSourceSchema.optional(),
  }),
]);

export function isHttpImageUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

/** Minimum height of a cover band with its title block. */
export const COVER_H = 260;
/** Height when no cover is set — room for the topbar overlap and a title row. */
export const COVER_H_EMPTY = 132;

export const COVER_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
export const MAX_COVER_IMAGE_BYTES = 12 * 1024 * 1024;
