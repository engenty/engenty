import { getApiBaseUrl, getCurrentAccessToken } from "@engenty/api-client";

export interface UserSettingResponse {
  name: string;
  type: "string" | "numeric" | "boolean" | "json";
  value: string | number | boolean | Record<string, unknown> | null;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const token = await getCurrentAccessToken();
  if (!token) {
    throw new Error("Not authenticated.");
  }
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function getUserSetting(
  name: string,
  signal?: AbortSignal
): Promise<UserSettingResponse | { error: string }> {
  const token = await getCurrentAccessToken();
  if (!token) {
    throw new Error("Not authenticated.");
  }
  const response = await fetch(
    `${getApiBaseUrl()}/api/user-settings/${encodeURIComponent(name)}`,
    {
      headers: { authorization: `Bearer ${token}` },
      signal,
    }
  );
  if (!response.ok) {
    return { error: await response.text() };
  }
  return (await response.json()) as UserSettingResponse;
}

export async function setUserSetting(
  name: string,
  input: {
    type: "string" | "numeric" | "boolean" | "json";
    value_string?: string | null;
    value_jsonb?: unknown;
    value_numeric?: number | null;
    value_boolean?: boolean | null;
  }
): Promise<UserSettingResponse> {
  return request<UserSettingResponse>(
    "PATCH",
    `/api/user-settings/${encodeURIComponent(name)}`,
    input
  );
}

export interface UserSettingsListResponse {
  settings: UserSettingResponse[];
}

/** Read all (or prefix-filtered) user settings in one request. */
export async function getUserSettings(
  prefix?: string,
  signal?: AbortSignal
): Promise<UserSettingsListResponse> {
  const token = await getCurrentAccessToken();
  if (!token) {
    throw new Error("Not authenticated.");
  }
  const query = prefix ? `?prefix=${encodeURIComponent(prefix)}` : "";
  const response = await fetch(`${getApiBaseUrl()}/api/user-settings${query}`, {
    headers: { authorization: `Bearer ${token}` },
    signal,
  });
  if (!response.ok) {
    throw new Error(
      (await response.text()) || `Request failed with ${response.status}`
    );
  }
  return (await response.json()) as UserSettingsListResponse;
}

/** Upsert many user settings in one request. */
export async function setUserSettings(
  settings: Array<{
    name: string;
    type: "string" | "numeric" | "boolean" | "json";
    value_string?: string | null;
    value_jsonb?: unknown;
    value_numeric?: number | null;
    value_boolean?: boolean | null;
  }>
): Promise<UserSettingsListResponse> {
  return request<UserSettingsListResponse>("PATCH", "/api/user-settings", {
    settings,
  });
}

export async function deleteUserSetting(
  name: string
): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(
    "DELETE",
    `/api/user-settings/${encodeURIComponent(name)}`
  );
}

export async function getWorkspaceContext(): Promise<any> {
  const res = await request<{ data: any }>("GET", "/api/users/setup/context");
  return res?.data;
}
