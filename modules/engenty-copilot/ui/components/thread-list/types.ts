import type {
  AgentThreadDto,
  AgentThreadStatus,
} from "../../../src/lib/agent-thread-types.js";
import type {
  ThreadListGroup,
  ThreadListOrganizationPrefs,
} from "./thread-list-organization.js";

export interface AgentTypeOption {
  description?: string;
  id: string;
  name: string;
}

export interface ThreadListLabels {
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

export interface ThreadListState {
  agentOptions: AgentTypeOption[];
  deletePending: boolean;
  groups: ThreadListGroup[];
  isError: boolean;
  isLoading: boolean;
  isSearchActive: boolean;
  isTransportReady: boolean;
  labels: ThreadListLabels;
  listErrorDescription: string | null;
  listErrorTitle: string | null;
  onDeleteThread: (threadId: string) => void;
  onPrefsChange: (
    next:
      | ThreadListOrganizationPrefs
      | ((prefs: ThreadListOrganizationPrefs) => ThreadListOrganizationPrefs)
  ) => void;
  onRetryList?: () => void;
  onSearchQueryChange: (query: string) => void;
  onSelectThread: (threadId: string) => void;
  prefs: ThreadListOrganizationPrefs;
  searchQuery: string;
  selectedThreadId: string | null;
  serviceBaseUrlPresent: boolean;
  statusOptions: { label: string; value: AgentThreadStatus }[];
  threadAgentLabel: (row: AgentThreadDto) => string;
  threadLabel: (row: AgentThreadDto) => string;
  threads: AgentThreadDto[];
}
