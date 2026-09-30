/**
 * Where a signed-in person sets up their team. A standalone page (apps/ui
 * `isStandalonePublicPath`), so it renders without the app shell.
 */
export const TENANT_SETUP_PATH = "/welcome";

/**
 * The tenant setting the wizard's last step writes. Until it is true, the app
 * sends the team's admins here instead of into the shell.
 */
export const TENANT_SETUP_DONE_SETTING = "setup.tenant_done";
