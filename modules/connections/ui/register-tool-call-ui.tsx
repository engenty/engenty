"use client";

import { registerToolCallUi } from "@engenty/ai-ui";
import {
  ConnectToolCallCard,
  matchesConnectRequestOutput,
} from "./components/copilot/connect-tool-call-card.js";

let registered = false;

export function registerConnectionsToolCallUi() {
  if (registered) {
    return;
  }
  registered = true;

  registerToolCallUi({
    id: "connections_request_connect",
    priority: 50,
    match: (ctx) => matchesConnectRequestOutput(ctx),
    Card: ConnectToolCallCard,
  });
}
