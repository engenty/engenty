import { keepPreviousData, queryOptions } from "@engenty/query-client";
import {
  getFilesExtract,
  listFiles,
  listFilesBuckets,
  listFilesChildren,
} from "./api.js";

export function filesChildrenQueryOptions(opts: {
  bucket: string;
  prefix?: string;
}) {
  return queryOptions({
    queryKey: ["files", "children", opts.bucket, opts.prefix ?? ""],
    queryFn: ({ signal }) => listFilesChildren(opts, signal),
    // Keep the current folder visible while the next one loads (no full reflow).
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}

export function filesQueryOptions(opts?: {
  bucket?: string;
  prefix?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  return queryOptions({
    queryKey: ["files", "list", opts?.bucket ?? "files", opts ?? {}],
    queryFn: ({ signal }) => listFiles(opts, signal),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}

export const filesBucketsQueryOptions = queryOptions({
  queryKey: ["files", "buckets"],
  queryFn: ({ signal }) => listFilesBuckets(signal),
  staleTime: 60_000,
});

export function filesExtractQueryOptions(key: string, bucket?: string) {
  return queryOptions({
    queryKey: ["files", "extract", bucket ?? "files", key],
    queryFn: ({ signal }) => getFilesExtract(key, bucket, signal),
    staleTime: 60_000,
    retry: false,
  });
}
