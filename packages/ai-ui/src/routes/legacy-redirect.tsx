/**
 * LegacyRedirect — helper used by plugin.tsx to define legacy URL redirects.
 *
 * @param to          Target path, may contain `:paramKey` placeholders.
 * @param paramKeys   Route params to substitute into `to`.
 * @param appendSplat Append the `*` splat segment to the target.
 * @param reservedGuard  If the first param value is in this list, render null
 *                       (let a later, more-specific route handle it).
 */

import { Navigate, useParams } from "react-router-dom";

interface LegacyRedirectProps {
  appendSplat?: boolean;
  paramKeys?: string[];
  reservedGuard?: string[];
  to: string;
}

export function LegacyRedirect({
  to,
  paramKeys = [],
  appendSplat = false,
  reservedGuard,
}: LegacyRedirectProps) {
  const params = useParams<Record<string, string>>();
  const splat = params["*"];

  // Guard: if the first captured param is a reserved section name, this
  // redirect does not apply — fall through to the real route.
  if (reservedGuard && paramKeys[0]) {
    const firstValue = params[paramKeys[0]];
    if (firstValue && reservedGuard.includes(firstValue)) {
      return null;
    }
  }

  let target = to;
  for (const key of paramKeys) {
    const value = params[key];
    if (value) {
      target = target.replace(`:${key}`, encodeURIComponent(value));
    }
  }
  if (appendSplat && splat) {
    target = `${target}/${splat}`;
  }

  return <Navigate replace to={target} />;
}
