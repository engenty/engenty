/** React Router `location.state` flags for agents workspace / skills UI. */
export const ENGENTY_OPEN_SKILL_CREATE_MODAL =
  "engentyOpenSkillCreate" as const;
export const ENGENTY_OPEN_SKILL_DETAIL_EDIT = "engentyOpenSkillEdit" as const;

export interface EngentySkillsLocationState {
  [ENGENTY_OPEN_SKILL_CREATE_MODAL]?: boolean;
  [ENGENTY_OPEN_SKILL_DETAIL_EDIT]?: boolean;
}
