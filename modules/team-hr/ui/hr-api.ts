import { requestApiEnvelope, requestApiJson } from "@engenty/api-client";

export interface TeamMemberContract {
  file_name: string;
  file_path: string;
  file_size: number;
  id: string;
  profile_id: string;
  scope_id: string;
  tenant_id: string;
  uploaded_at: string;
  uploaded_by: string | null;
}

export interface TeamMemberGalleryPhoto {
  alt_text: string | null;
  copyright: string | null;
  created_at: string;
  id: string;
  profile_id: string;
  scope_id: string;
  sort_order: number;
  storage_key: string;
  tenant_id: string;
  title: string | null;
  updated_at: string;
}

export interface TeamMemberGalleryPhotoCreateInput {
  alt_text?: string | null;
  copyright?: string | null;
  sort_order?: number;
  storage_key: string;
  title?: string | null;
}

export type TeamMemberGalleryPhotoUpdateInput = Partial<
  Pick<
    TeamMemberGalleryPhoto,
    "title" | "alt_text" | "copyright" | "sort_order"
  >
>;

export async function getTeamMemberContracts(
  teamMemberId: string,
  signal?: AbortSignal
) {
  const response = await requestApiEnvelope<TeamMemberContract[]>(
    `/api/team/${teamMemberId}/contracts`,
    { method: "GET", signal }
  );
  return response.data;
}

export async function uploadTeamMemberContract(
  teamMemberId: string,
  file: File
) {
  const formData = new FormData();
  formData.append("file", file);
  return await requestApiJson<TeamMemberContract>(
    `/api/team/${teamMemberId}/contracts`,
    { method: "POST", body: formData }
  );
}

export async function deleteTeamMemberContract(
  teamMemberId: string,
  contractId: string
) {
  return await requestApiJson<{ ok: boolean }>(
    `/api/team/${teamMemberId}/contracts/${contractId}`,
    { method: "DELETE" }
  );
}

export async function getTeamMemberGalleryPhotos(
  teamMemberId: string,
  signal?: AbortSignal
) {
  const response = await requestApiEnvelope<TeamMemberGalleryPhoto[]>(
    `/api/team/${teamMemberId}/gallery-photos`,
    { method: "GET", signal }
  );
  return response.data;
}

export async function createTeamMemberGalleryPhoto(
  teamMemberId: string,
  input: TeamMemberGalleryPhotoCreateInput
) {
  return await requestApiJson<TeamMemberGalleryPhoto>(
    `/api/team/${teamMemberId}/gallery-photos`,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export async function updateTeamMemberGalleryPhoto(
  teamMemberId: string,
  photoId: string,
  patch: TeamMemberGalleryPhotoUpdateInput
) {
  return await requestApiJson<TeamMemberGalleryPhoto>(
    `/api/team/${teamMemberId}/gallery-photos/${photoId}`,
    { method: "PATCH", body: JSON.stringify(patch) }
  );
}

export async function deleteTeamMemberGalleryPhoto(
  teamMemberId: string,
  photoId: string
) {
  return await requestApiJson<{ ok: boolean }>(
    `/api/team/${teamMemberId}/gallery-photos/${photoId}`,
    { method: "DELETE" }
  );
}
