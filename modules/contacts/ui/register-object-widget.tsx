"use client";

import { registerObjectWidget } from "@engenty/ai-ui";
import {
  ContactObjectCard,
  ContactObjectPanel,
} from "./components/copilot/contact-object-card.js";

const UUID_PATTERN =
  /^\/mdl\/contacts\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

let registered = false;

export function registerContactsObjectWidget() {
  if (registered) {
    return;
  }
  registered = true;

  registerObjectWidget({
    id: "contacts.contact",
    module: "contacts",
    entity: "contact",
    card: ContactObjectCard,
    panel: ContactObjectPanel,
    getHref: (ref) => `/mdl/contacts/${ref.id}`,
    matchHref: (pathname) => {
      const match = pathname.match(UUID_PATTERN);
      return match
        ? { module: "contacts", entity: "contact", id: match[1] }
        : null;
    },
  });
}
