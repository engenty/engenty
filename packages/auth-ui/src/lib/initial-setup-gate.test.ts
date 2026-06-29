import {
  createApiError,
  ENGENTY_SERVICE_ERROR_CODES,
} from "@engenty/api-contracts";
import { describe, expect, it, vi } from "vitest";
import {
  evaluateInitialSetupGate,
  gateFailureToNavigationState,
} from "./initial-setup-gate";

const API_BASE = "http://127.0.0.1:8787";

vi.mock("./api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api-client")>();
  return {
    ...actual,
    getApiBaseUrl: () => API_BASE,
  };
});

describe("evaluateInitialSetupGate", () => {
  it("returns ready when API reports setup envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: { initialSetupRequired: true, usersCount: 0 },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const gate = await evaluateInitialSetupGate();
    expect(gate.status).toBe("ready");
    if (gate.status === "ready") {
      expect(gate.initial_setup_required).toBe(true);
    }
  });

  it("returns database_unavailable on 503 with DB_UNAVAILABLE code", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify(
          createApiError({
            code: ENGENTY_SERVICE_ERROR_CODES.DB_UNAVAILABLE,
            message: "Database is not reachable.",
            details: { supabase_host: "db.example.test" },
          })
        ),
        {
          status: 503,
          headers: { "content-type": "application/json" },
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const gate = await evaluateInitialSetupGate();
    expect(gate.status).toBe("database_unavailable");
    if (gate.status === "database_unavailable") {
      expect(gate.error_code).toBe(ENGENTY_SERVICE_ERROR_CODES.DB_UNAVAILABLE);
      expect(gate.details?.supabase_host).toBe("db.example.test");
    }
  });

  it("returns api_unreachable when fetch throws", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    const gate = await evaluateInitialSetupGate();
    expect(gate.status).toBe("api_unreachable");
    if (gate.status === "api_unreachable") {
      expect(gate.error_code).toBe(ENGENTY_SERVICE_ERROR_CODES.API_UNREACHABLE);
      expect(gate.api_base_url).toBe(API_BASE);
    }
  });
});

describe("gateFailureToNavigationState", () => {
  it("maps api_unreachable failures", () => {
    const nav = gateFailureToNavigationState({
      status: "api_unreachable",
      error_code: ENGENTY_SERVICE_ERROR_CODES.API_UNREACHABLE,
      message: "boom",
      api_base_url: "http://localhost:1",
    });
    expect(nav.reason).toBe("api_unreachable");
    expect(nav.api_base_url).toBe("http://localhost:1");
  });
});
