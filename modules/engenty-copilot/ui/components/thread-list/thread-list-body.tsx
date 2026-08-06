import { useThreadList } from "./thread-list-context.js";
import { ThreadListError } from "./thread-list-error.js";
import { ThreadListList } from "./thread-list-list.js";
import { ThreadListMessage } from "./thread-list-message.js";

export function ThreadListBody() {
  const list = useThreadList();

  if (!list.isTransportReady) {
    return (
      <ThreadListMessage>
        {list.serviceBaseUrlPresent
          ? list.labels.missingScope
          : list.labels.missingService}
      </ThreadListMessage>
    );
  }

  if (list.isError && list.listErrorTitle && list.listErrorDescription) {
    return (
      <ThreadListError
        description={list.listErrorDescription}
        onRetry={list.onRetryList}
        retryLabel={list.labels.retry}
        title={list.listErrorTitle}
      />
    );
  }

  if (list.isLoading) {
    return <ThreadListMessage>{list.labels.loading}</ThreadListMessage>;
  }

  if (list.threads.length === 0) {
    return (
      <ThreadListMessage>
        {list.isSearchActive
          ? list.labels.noSearchResults
          : list.labels.noSessions}
      </ThreadListMessage>
    );
  }

  return <ThreadListList />;
}
