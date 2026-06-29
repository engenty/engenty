import type {
  AgentSessionDto,
  AgentSessionStatus,
} from "../../../src/lib/agent-session-types.js";
import type {
  SessionListGroup,
  SessionListOrganizationPrefs,
} from "./session-list-organization.js";

export interface AgentTypeOption {
  description?: string;
  id: string;
  name: string;
}

export interface SessionListLabels {
  activeChats: string;
  age: string;
  ageAll: string;
  ageLastSevenDays: string;
  ageLastThirtyDays: string;
  ageLastTwoDays: string;
  agent: string;
  allAgents: string;
  allChats: string;
  allStatuses: string;
  archivedChats: string;
  dateOlder: string;
  datePreviousSevenDays: string;
  dateToday: string;
  dateYesterday: string;
  deleteSession: string;
  draftSession: string;
  groupAgent: string;
  groupBy: string;
  groupDate: string;
  groupNone: string;
  groupNoneShort: string;
  groupStatus: string;
  groupType: string;
  listLoadFailedTitle: string;
  listSettings: string;
  loading: string;
  missingScope: string;
  missingService: string;
  moduleErrorDescription: string;
  moduleErrorReload: string;
  moduleErrorTitle: string;
  noSearchResults: string;
  noSessions: string;
  retry: string;
  searchPlaceholder: string;
  sessionMenu: string;
  sortAgent: string;
  sortAscending: string;
  sortBy: string;
  sortCreated: string;
  sortDescending: string;
  sortTitle: string;
  sortUpdated: string;
  status: string;
  statusCompleted: string;
  statusDraft: string;
  statusFailed: string;
  statusIdle: string;
  statusRunning: string;
  statusWaiting: string;
  typeFallback: string;
  visibility: string;
}

export interface SessionListState {
  agentOptions: AgentTypeOption[];
  deletePending: boolean;
  groups: SessionListGroup[];
  isError: boolean;
  isLoading: boolean;
  isSearchActive: boolean;
  isTransportReady: boolean;
  labels: SessionListLabels;
  listErrorDescription: string | null;
  listErrorTitle: string | null;
  onDeleteSession: (threadId: string) => void;
  onPrefsChange: (
    next:
      | SessionListOrganizationPrefs
      | ((prefs: SessionListOrganizationPrefs) => SessionListOrganizationPrefs)
  ) => void;
  onRetryList?: () => void;
  onSearchQueryChange: (query: string) => void;
  onSelectSession: (threadId: string) => void;
  prefs: SessionListOrganizationPrefs;
  searchQuery: string;
  selectedThreadId: string | null;
  serviceBaseUrlPresent: boolean;
  sessionAgentLabel: (row: AgentSessionDto) => string;
  sessionLabel: (row: AgentSessionDto) => string;
  sessions: AgentSessionDto[];
  statusOptions: { label: string; value: AgentSessionStatus }[];
}
