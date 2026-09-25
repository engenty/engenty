import { Navigate } from "react-router-dom";

/** Default Setup landing — plugins is the first Setup nav child. */
const SETUP_PLUGINS_PATH = "/setup/plugins";

export function SetupIndexRedirect() {
  return <Navigate replace to={SETUP_PLUGINS_PATH} />;
}
