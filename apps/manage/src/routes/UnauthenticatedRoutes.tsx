import {
  AuthRedirect,
  CallbackPage,
  DevLoginPage,
  LoginPage,
  ServiceUnavailablePage,
} from "@engenty/auth-ui";
import { Route, Routes } from "react-router-dom";

export function UnauthenticatedRoutes() {
  return (
    <Routes>
      <Route element={<DevLoginPage />} path="/auth/dev-login" />
      <Route element={<LoginPage />} path="/auth/login" />
      <Route element={<CallbackPage />} path="/auth/callback" />
      <Route element={<ServiceUnavailablePage />} path="/service_unavailable" />
      <Route element={<AuthRedirect />} path="*" />
    </Routes>
  );
}
