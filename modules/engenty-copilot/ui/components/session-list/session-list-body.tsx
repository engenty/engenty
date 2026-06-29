import { useSessionList } from "./session-list-context.js";
import { SessionListError } from "./session-list-error.js";
import { SessionListList } from "./session-list-list.js";
import { SessionListMessage } from "./session-list-message.js";

export function SessionListBody() {
  const list = useSessionList();

  if (!list.isTransportReady) {
    return (
      <SessionListMessage>
        {list.serviceBaseUrlPresent
          ? list.labels.missingScope
          : list.labels.missingService}
      </SessionListMessage>
    );
  }

  if (list.isError && list.listErrorTitle && list.listErrorDescription) {
    return (
      <SessionListError
        description={list.listErrorDescription}
        onRetry={list.onRetryList}
        retryLabel={list.labels.retry}
        title={list.listErrorTitle}
      />
    );
  }

  if (list.isLoading) {
    return <SessionListMessage>{list.labels.loading}</SessionListMessage>;
  }

  if (list.sessions.length === 0) {
    return (
      <SessionListMessage>
        {list.isSearchActive
          ? list.labels.noSearchResults
          : list.labels.noSessions}
      </SessionListMessage>
    );
  }

  return <SessionListList />;
}
