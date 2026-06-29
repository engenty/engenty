import {
  claimsMatchWorkspaceTenant,
  getOptionalSupabaseAuthClient,
  readSupabaseAccessTokenClaims,
  refreshSupabaseAuthSession,
} from "@engenty/auth-ui";
import { useEffect, useState } from "react";

export interface SupabaseClaimsSyncState {
  inSync: boolean;
  ready: boolean;
}

export function useSupabaseClaimsInSync(
  tenantId: string | null | undefined
): SupabaseClaimsSyncState {
  const [state, setState] = useState<SupabaseClaimsSyncState>({
    ready: false,
    inSync: false,
  });

  useEffect(() => {
    if (!tenantId) {
      setState({ ready: true, inSync: false });
      return;
    }

    let cancelled = false;

    async function evaluateClaims() {
      const client = getOptionalSupabaseAuthClient();
      if (!client) {
        if (!cancelled) {
          setState({ ready: true, inSync: false });
        }
        return;
      }

      const readSessionClaims = async () => {
        const { data } = await client.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          return null;
        }
        return readSupabaseAccessTokenClaims(token);
      };

      let claims = await readSessionClaims();
      if (!claims) {
        if (!cancelled) {
          setState({ ready: true, inSync: false });
        }
        return;
      }

      if (!claimsMatchWorkspaceTenant(claims, tenantId)) {
        try {
          await refreshSupabaseAuthSession();
          claims = await readSessionClaims();
        } catch {
          if (!cancelled) {
            setState({ ready: true, inSync: false });
          }
          return;
        }
      }

      if (!cancelled) {
        setState({
          ready: true,
          inSync: claims ? claimsMatchWorkspaceTenant(claims, tenantId) : false,
        });
      }
    }

    void evaluateClaims();

    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  return state;
}
