import { registerConnectorConnectButton } from "@engenty/connections/ui/extensions";
import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { LocalFilesBridge } from "./components/local-files-bridge.js";
import { LocalFilesConnectButton } from "./components/local-files-connect-button.js";

export default function plugin(engenty: EngentyPluginContext) {
  // The bridge stays mounted for the whole authenticated session so it can
  // answer file-read requests whenever a granted tab is open.
  engenty.UI.registerBackgroundComponent({
    id: "local-files-bridge",
    component: LocalFilesBridge,
  });

  // Replace the OAuth connect button for this browser-auth connector.
  registerConnectorConnectButton("local-files", LocalFilesConnectButton);
}
