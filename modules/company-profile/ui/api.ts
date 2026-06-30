import { requestApiJson } from "@engenty/api-client";

export type CompanyType =
  | "sole_proprietorship"
  | "company"
  | "association"
  | "public";

export interface CompanyProfileSettings {
  address_city?: string | null;
  address_country?: string | null;
  address_street?: string | null;
  address_street_2?: string | null;
  address_zip?: string | null;
  bank_account_name?: string | null;
  bank_bic?: string | null;
  bank_iban?: string | null;
  bank_name?: string | null;
  brand_name?: string | null;
  company_registration_number?: string | null;
  company_type?: CompanyType | null;
  email?: string | null;
  imprint_url?: string | null;
  logo_url?: string | null;
  managing_director?: string | null;
  name?: string | null;
  owner?: string | null;
  phone?: string | null;
  tag_line?: string | null;
  tax_number?: string | null;
  vat_id?: string | null;
  website?: string | null;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  return await requestApiJson<T>(path, init);
}

export async function getCompanyProfileSettings(signal?: AbortSignal) {
  return request<CompanyProfileSettings>("/api/company-profile/settings", {
    method: "GET",
    signal,
  });
}

export async function setCompanyProfileSettings(input: CompanyProfileSettings) {
  return request<CompanyProfileSettings>("/api/company-profile/settings", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function uploadCompanyLogo(
  file: File
): Promise<{ logo_url: string }> {
  const formData = new FormData();
  formData.append("file", file);
  return await requestApiJson<{ logo_url: string }>(
    "/api/company-profile/logo-upload",
    {
      method: "POST",
      body: formData,
    }
  );
}
