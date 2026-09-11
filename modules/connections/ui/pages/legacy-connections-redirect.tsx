import { Navigate, useLocation, useParams } from "react-router-dom";
import { CONNECTIONS_SETTINGS_PATH } from "./connections-settings-page.js";

export function LegacyConnectionsSettingsRedirect() {
  const { hash, search } = useLocation();
  return (
    <Navigate replace to={`${CONNECTIONS_SETTINGS_PATH}${search}${hash}`} />
  );
}

export function LegacyConnectionsDetailRedirect() {
  const { connectorId } = useParams<{ connectorId: string }>();
  const { hash, search } = useLocation();
  return (
    <Navigate
      replace
      to={`${CONNECTIONS_SETTINGS_PATH}/${connectorId ?? ""}${search}${hash}`}
    />
  );
}
