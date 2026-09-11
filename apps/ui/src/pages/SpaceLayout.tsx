/**
 * Everything under `/s/<spaceKey>` (PLAN-spaces.md Phase 5).
 *
 * A pass-through, and deliberately nothing more.
 *
 * The space's sidebar — its switcher and its Work/Data/Plan tabs — is rendered
 * by the app shell's own secondary column via `secondaryNavHeaderOverride` /
 * `secondaryNavLeadingSlot` (wired in App.tsx), with the open module's nav
 * directly beneath it. Owning a second column here would produce exactly the two
 * sidebars the plan rules out, and would also lose the shell's collapse/pin,
 * resize and topbar toggle.
 *
 * It must not call `usePageConfig` either, which cost a debugging round to
 * learn: that store is last-writer-wins on ONE global, and a layout's effects
 * run AFTER its children's, so this component setting a breadcrumb also wrote
 * `secondaryNavAfterItems ?? null` — silently wiping the tasks and
 * knowledge-base sidebars the module below had just published. The space is
 * named by the switcher at the top of the column, which is where the breadcrumb
 * starts; the topbar continues it with whatever the module contributes.
 */
import { Outlet } from "react-router-dom";

export function SpaceLayout() {
  return <Outlet />;
}
