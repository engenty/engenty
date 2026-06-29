import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type ResolvedFlags = Record<string, boolean>;

interface FeatureFlagsContextValue {
  error: Error | null;
  isLoading: boolean;
  refetch: () => Promise<void>;
  resolved: ResolvedFlags;
}

const FeatureFlagsContext = createContext<FeatureFlagsContextValue | null>(
  null
);

export interface FeatureFlagsProviderProps {
  children: ReactNode;
  /** Fetches resolved flags for the current tenant */
  fetchResolved: () => Promise<ResolvedFlags>;
}

export function FeatureFlagsProvider({
  children,
  fetchResolved,
}: FeatureFlagsProviderProps) {
  const [resolved, setResolved] = useState<ResolvedFlags>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchResolved();
      setResolved(typeof data === "object" && data !== null ? data : {});
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setResolved({});
    } finally {
      setIsLoading(false);
    }
  }, [fetchResolved]);

  useEffect(() => {
    load();
  }, [load]);

  const value = useMemo<FeatureFlagsContextValue>(
    () => ({ resolved, isLoading, error, refetch: load }),
    [resolved, isLoading, error, load]
  );

  return (
    <FeatureFlagsContext.Provider value={value}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags() {
  const context = useContext(FeatureFlagsContext);
  if (!context) {
    throw new Error(
      "useFeatureFlags must be used within a FeatureFlagsProvider."
    );
  }
  return context;
}

export function useFeatureFlag(key: string): boolean | undefined {
  const { resolved, isLoading } = useFeatureFlags();
  if (isLoading) {
    return;
  }
  return resolved[key];
}

export function FeatureGate({
  flag,
  children,
  fallback = null,
}: {
  flag: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const enabled = useFeatureFlag(flag);
  if (enabled === undefined) {
    return fallback;
  }
  if (!enabled) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
}
