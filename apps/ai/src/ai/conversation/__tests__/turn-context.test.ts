import { describe, expect, it } from "vitest";
import {
  MESSAGE_CONTEXT_KEY,
  turnContextFromRouteContext,
  turnContextMetadata,
} from "../turn-context.js";

const SPACE = "00000000-0000-4000-8000-000000000003";

describe("turnContextFromRouteContext", () => {
  it("reads the place the client sends with a run", () => {
    expect(
      turnContextFromRouteContext({
        moduleId: "offers",
        pathname: "/s/engrd/offers/ENG-041",
        routeKey: "detail",
        scope: { space_id: SPACE, ui_language: "de" },
        session_key: "x",
      })
    ).toEqual({
      module_id: "offers",
      pathname: "/s/engrd/offers/ENG-041",
      route_key: "detail",
      space_id: SPACE,
    });
  });

  it("stamps nothing for a run with no place behind it", () => {
    expect(turnContextFromRouteContext(null)).toBeNull();
    expect(turnContextFromRouteContext({})).toBeNull();
    expect(
      turnContextFromRouteContext({ session_key: "x", thread_id: "y" })
    ).toBeNull();
  });

  it("keeps a partial place — a space without a module is still a chapter", () => {
    expect(turnContextFromRouteContext({ scope: { space_id: SPACE } })).toEqual(
      {
        module_id: null,
        pathname: null,
        route_key: null,
        space_id: SPACE,
      }
    );
  });

  it("builds the metadata patch, empty when there is nothing to say", () => {
    expect(turnContextMetadata(null)).toEqual({});
    expect(
      turnContextMetadata({
        module_id: null,
        pathname: null,
        route_key: null,
        space_id: SPACE,
      })
    ).toEqual({
      [MESSAGE_CONTEXT_KEY]: {
        module_id: null,
        pathname: null,
        route_key: null,
        space_id: SPACE,
      },
    });
  });
});
