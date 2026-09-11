import { registerConnectorConnectButton } from "@engenty/connections/ui/extensions";
import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { LocalFilesConnectButton } from "./components/local-files-connect-button.js";

export default function plugin(_engenty: EngentyPluginContext) {
  // The claim/heartbeat loop lives on files surfaces (FileManager, Data tree
  // folder expansion, connect-folder dialog) — not as a background poller.
  registerConnectorConnectButton("local-files", LocalFilesConnectButton);
}
