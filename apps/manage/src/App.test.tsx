/** @vitest-environment happy-dom */
import { EngentyQueryProvider } from "@engenty/query-client";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

// Stand in for the heavy app shell: render only the nav so we test OUR gate +
// section wiring, not app-shell internals (covered by its own tests). The
// copilot provider/constant are pass-throughs — manage only needs them to
// satisfy the layout's context requirement.
vi.mock("@engenty/app-shell", () => ({
  COPILOT_LAYOUT_NOOP: {},
  CopilotShellProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  AppLayout: ({
    sections,
  }: {
    sections: Array<{ items: Array<{ to: string; label: string }> }>;
  }) => (
    <nav>
      {sections
        .flatMap((section) => section.items)
        .map((item) => (
          <a href={item.to} key={item.to}>
            {item.label}
          </a>
        ))}
    </nav>
  ),
}));

const authState = { isAuthenticated: true, loading: false, error: null };
vi.mock("@engenty/auth-ui", () => ({
  useCoreAuthSession: () => authState,
  getSupabaseAuthClient: () => ({ auth: { signOut: vi.fn() } }),
  AuthRedirect: () => null,
  CallbackPage: () => null,
  DevLoginPage: () => null,
  LoginPage: () => null,
  ServiceUnavailablePage: () => null,
}));

const getWorkspaceContext = vi.fn();
vi.mock("@/lib/api/workspace", () => ({
  getWorkspaceContext: () => getWorkspaceContext(),
}));

// Imported after mocks so the mocked modules are in place.
const { default: App } = await import("./App");

function workspace(isSuperAdmin: boolean) {
  return {
    canSwitchTenant: false,
    currentTenant: null,
    currentUser: {
      display_name: "Admin",
      email: "admin@engenty.test",
      id: "u1",
      initials: "AD",
      role: "admin" as const,
    },
    isSuperAdmin,
    isTenantAdmin: false,
    onboarded: true,
    tenantRole: null,
    tenants: [],
    userId: "u1",
  };
}

function renderApp() {
  return render(
    <EngentyQueryProvider>
      <MemoryRouter initialEntries={["/tenants"]}>
        <App />
      </MemoryRouter>
    </EngentyQueryProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("manage access gate", () => {
  it("shows the management navigation for a super admin", async () => {
    getWorkspaceContext.mockResolvedValue(workspace(true));
    renderApp();

    expect(await screen.findByText("Tenants")).toBeTruthy();
    expect(screen.getByText("Users")).toBeTruthy();
    expect(screen.getByText("Modules")).toBeTruthy();
    expect(screen.getByText("Feature flags")).toBeTruthy();
  });

  it("blocks a non-super-admin with an access-denied card and no navigation", async () => {
    getWorkspaceContext.mockResolvedValue(workspace(false));
    renderApp();

    expect(await screen.findByText("Super admin required")).toBeTruthy();
    expect(screen.queryByText("Tenants")).toBeNull();
  });
});
