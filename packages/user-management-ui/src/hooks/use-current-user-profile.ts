import { useCoreAuthSession } from "@engenty/auth-ui";
import { useEffect, useState } from "react";
import type { UserRecord } from "../lib/schemas.js";
import { getUser } from "../lib/user-management-api.js";

/**
 * Returns current user profile (display_name, initials) from core.users,
 * with loading and fallback to auth session when profile is unavailable.
 */
export function useCurrentUserProfile(): {
  profile: UserRecord | null;
  loading: boolean;
  displayName: string;
  initials: string;
  email: string;
} {
  const { session } = useCoreAuthSession();
  const userId = session?.user?.id;
  const authUser = session?.user;
  const authEmail = authUser?.email ?? "";
  const authDisplayName =
    (authUser?.user_metadata?.full_name as string | undefined) ??
    (authUser?.user_metadata?.display_name as string | undefined) ??
    authEmail.split("@")[0] ??
    "";
  const authInitials = (
    authDisplayName?.[0] ??
    authEmail?.[0] ??
    "?"
  ).toUpperCase();

  const [profile, setProfile] = useState<UserRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    getUser(userId)
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, [userId, refreshTrigger]);

  useEffect(() => {
    const handler = () => setRefreshTrigger((t) => t + 1);
    window.addEventListener("profile-updated", handler);
    return () => window.removeEventListener("profile-updated", handler);
  }, []);

  const displayName =
    profile?.display_name?.trim() || authDisplayName || authEmail || "";
  const initials =
    (profile?.initials?.trim() || displayName?.[0] || authEmail?.[0] || "?")
      .slice(0, 4)
      .toUpperCase() || "?";

  return {
    profile,
    loading,
    displayName,
    initials,
    email: profile?.email ?? authEmail,
  };
}
