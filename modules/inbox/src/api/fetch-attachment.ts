import type {
  ConnectionsModuleClient,
  ConnectorDefinition,
} from "@engenty/connections-sdk";
import type { PluginAuthContext } from "@engenty/plugin-sdk";
import type { InboxRepo } from "../dal/contracts.js";

const MAX_PREVIEW_BYTES = 1_048_576;

interface AttachmentFetchResult {
  data_base64: string;
  filename: string | null;
  mime_type: string | null;
}

export async function fetchInboxAttachment(params: {
  attachmentId: string;
  auth: PluginAuthContext;
  connectionsClient: ConnectionsModuleClient;
  getConnector: (connectorId: string) => ConnectorDefinition | undefined;
  messageId: string;
  repo: InboxRepo;
}): Promise<AttachmentFetchResult> {
  const message = await params.repo.messages.getById(params.messageId);
  if (!message) {
    throw new Error("inbox: message not found");
  }

  const attachment = message.attachments_json.find(
    (entry) => entry.attachment_id === params.attachmentId
  );
  if (!attachment?.attachment_id) {
    throw new Error("inbox: attachment not found");
  }
  if (attachment.size != null && attachment.size > MAX_PREVIEW_BYTES) {
    throw new Error("inbox: attachment too large for preview");
  }

  const connections = await params.connectionsClient.listConnections({
    tenantId: params.auth.tenantId,
  });
  const connection = connections.find(
    (entry) => entry.id === message.connection_id
  );
  const connector = connection
    ? params.getConnector(connection.connector_id)
    : undefined;
  if (connector?.id !== "google-gmail") {
    throw new Error("inbox: attachment preview is only supported for Gmail");
  }

  const result = (await params.connectionsClient.callAction({
    actionId: "get_attachment",
    connectionId: message.connection_id,
    input: {
      attachment_id: attachment.attachment_id,
      message_id: message.provider_message_id,
    },
    isAutonomous: true,
    principal: {
      principalId: params.auth.principalId,
      principalType: params.auth.principalType ?? "user",
    },
    tenantId: params.auth.tenantId,
  })) as { data_base64?: string; size?: number | null };

  if (!result.data_base64) {
    throw new Error("inbox: attachment fetch returned no data");
  }
  if (result.size != null && result.size > MAX_PREVIEW_BYTES) {
    throw new Error("inbox: attachment too large for preview");
  }

  return {
    data_base64: result.data_base64,
    filename: attachment.filename,
    mime_type: attachment.mime_type,
  };
}
