/** Topbar Save registration for KB module settings dirty state. */
export interface KbSettingsToolbarSaveSlot {
  disabled: boolean;
  onSave: () => void;
  pending: boolean;
}
