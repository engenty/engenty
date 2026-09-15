import { useCallback } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  buildAgentActivityPath,
  buildAgentCapabilitiesPath,
  buildAgentDetailPath,
  buildAgentFilesPath,
  buildAgentInstructionsPath,
  buildAgentMemoryPath,
  buildAgentSessionDetailPath,
  buildAgentSessionsPath,
  buildAgentsWorkspacePath,
  buildAgentWorkspacePath,
  buildSkillDetailPath,
  parseAgentsWorkspaceSection,
  withWorkspaceParam,
} from "./agent-workspace-url-state";

function buildCurrentPath(pathname: string, searchParams: URLSearchParams) {
  const suffix = searchParams.size > 0 ? `?${searchParams.toString()}` : "";
  return `${pathname}${suffix}`;
}

export function useAgentsWorkspaceNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{
    agentId?: string;
    threadId?: string;
  }>();
  const [searchParams] = useSearchParams();

  const activeSection =
    parseAgentsWorkspaceSection(location.pathname) ?? "landing";
  const selectedAgentId = params.agentId ?? "";
  const selectedThreadId = params.threadId ?? "";
  const selectedKey = searchParams.get("file") ?? "";
  const sessionsFilter = searchParams.get("filter") ?? "";

  const replaceSearchParam = useCallback(
    (key: string, value: string | null) => {
      const next = withWorkspaceParam(searchParams, key, value);
      navigate(buildCurrentPath(location.pathname, next), { replace: true });
    },
    [location.pathname, navigate, searchParams]
  );

  const navigateToAgent = useCallback(
    (agentId: string) => {
      navigate(buildAgentDetailPath(agentId), { replace: true });
    },
    [navigate]
  );

  const navigateToAgentCapabilities = useCallback(
    (agentId: string) => {
      navigate(buildAgentCapabilitiesPath(agentId), { replace: true });
    },
    [navigate]
  );

  const navigateToAgentActivity = useCallback(
    (agentId: string) => {
      navigate(buildAgentActivityPath(agentId), { replace: true });
    },
    [navigate]
  );

  const navigateToAgentWorkspace = useCallback(
    (agentId: string) => {
      navigate(buildAgentWorkspacePath(agentId), { replace: true });
    },
    [navigate]
  );

  const navigateToAgentMemory = useCallback(
    (agentId: string) => {
      navigate(buildAgentMemoryPath(agentId), { replace: true });
    },
    [navigate]
  );

  const navigateToAgentFiles = useCallback(
    (agentId: string) => {
      navigate(buildAgentFilesPath(agentId), { replace: true });
    },
    [navigate]
  );

  const navigateToAgentInstructions = useCallback(
    (agentId: string, file?: string | null) => {
      navigate(buildAgentInstructionsPath(agentId, { file }), {
        replace: true,
      });
    },
    [navigate]
  );

  const navigateToAgentSessions = useCallback(
    (agentId: string, filter?: string | null) => {
      navigate(buildAgentSessionsPath(agentId, { filter }), { replace: true });
    },
    [navigate]
  );

  const navigateToAgentSession = useCallback(
    (agentId: string, threadId: string, filter?: string | null) => {
      navigate(buildAgentSessionDetailPath(agentId, threadId, { filter }), {
        replace: true,
      });
    },
    [navigate]
  );

  const navigateToAgentsLanding = useCallback(() => {
    navigate(buildAgentsWorkspacePath(), { replace: true });
  }, [navigate]);

  const navigateToSkill = useCallback(
    (skillId: string) => {
      const onSkillDetail = /^\/admin\/agents\/skills\/[^/]+$/.test(
        location.pathname
      );
      const keepCodeView =
        onSkillDetail && searchParams.get("view") === "code" ? "code" : null;
      navigate(
        buildSkillDetailPath(skillId, {
          view: keepCodeView,
        }),
        {
          replace: true,
        }
      );
    },
    [location.pathname, navigate, searchParams]
  );

  return {
    activeSection,
    searchParams,
    selectedAgentId,
    selectedKey,
    selectedThreadId,
    sessionsFilter,
    navigateToAgent,
    navigateToAgentActivity,
    navigateToAgentCapabilities,
    navigateToAgentFiles,
    navigateToAgentInstructions,
    navigateToAgentMemory,
    navigateToAgentSession,
    navigateToAgentSessions,
    navigateToAgentsLanding,
    navigateToAgentWorkspace,
    navigateToSkill,
    setFileParam(file: string | null) {
      replaceSearchParam("file", file);
    },
    setSessionsFilterParam(filter: string | null) {
      replaceSearchParam("filter", filter);
    },
  };
}
