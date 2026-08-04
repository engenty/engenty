import { Navigate } from "react-router-dom";
import { useCompanyProfileRootAgentUiSlice } from "../hooks/use-company-profile-agent-ui-slice.js";

export function CompanyProfileRootPage() {
  useCompanyProfileRootAgentUiSlice();
  return <Navigate replace to="/mdl/company-profile/settings" />;
}
