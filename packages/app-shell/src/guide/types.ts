export type UiGuidePlacement = "auto" | "top" | "bottom" | "left" | "right";

/** How the guide attaches to the page. */
export type UiGuidePresentation = "spotlight" | "highlight" | "modal";

export type UiGuideActionVariant = "primary" | "secondary" | "ghost";

export type UiGuideInputType = "text" | "textarea";

export interface UiGuideAction {
  id: string;
  label: string;
  variant?: UiGuideActionVariant;
}

/** Single text field in the action area (legacy-friendly). */
export interface UiGuideInputConfig {
  default_value?: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  submit_action_id?: string;
  type?: UiGuideInputType;
}

/** Named field when the action area needs several inputs. */
export interface UiGuideInputField {
  default_value?: string;
  id: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  type?: UiGuideInputType;
}

export interface UiGuideTarget {
  field_id?: string;
  region?: string;
  selector?: string;
}

export interface UiGuideShowConfig {
  actions?: UiGuideAction[];
  allow_target_interaction?: boolean;
  body?: string;
  input?: UiGuideInputConfig;
  /** Prefer over {@link input} when several fields are needed. */
  inputs?: UiGuideInputField[];
  placement?: UiGuidePlacement;
  /**
   * `spotlight` (default): dimmed backdrop + cutout + anchored popout.
   * `highlight`: ring around target, no dimming, anchored popout.
   * `modal`: centered dialog + full backdrop; `target` optional.
   */
  presentation?: UiGuidePresentation;
  /** Hide the built-in Dismiss control (e.g. force prev/next). Default true. */
  show_dismiss?: boolean;
  /**
   * Required for `spotlight` / `highlight`. Optional for `modal`
   * (still used to scroll/soft-highlight when provided).
   */
  target?: UiGuideTarget;
  title: string;
  wait?: boolean;
}

export interface UiGuideUpdateConfig {
  actions?: UiGuideAction[];
  allow_target_interaction?: boolean;
  body?: string | null;
  input?: UiGuideInputConfig | null;
  inputs?: UiGuideInputField[] | null;
  placement?: UiGuidePlacement;
  presentation?: UiGuidePresentation;
  show_dismiss?: boolean;
  target?: UiGuideTarget;
  title?: string;
  wait?: boolean;
}

export interface UiGuideSession {
  actions: UiGuideAction[];
  allow_target_interaction: boolean;
  body?: string;
  guide_id: string;
  input?: UiGuideInputConfig;
  inputs?: UiGuideInputField[];
  placement: UiGuidePlacement;
  presentation: UiGuidePresentation;
  show_dismiss: boolean;
  /** Null only for target-less modal. */
  target_element: HTMLElement | null;
  title: string;
  wait: boolean;
}

export interface UiGuideShownResult {
  guide_id: string;
  ok: true;
  status: "shown";
}

export interface UiGuideResolvedResult {
  action_id?: string;
  guide_id: string;
  /** Single-field value when only one input is present. */
  input_value?: string;
  /** Named values when `inputs` (or multi) is used. */
  input_values?: Record<string, string>;
  ok: true;
  status: "resolved" | "dismissed";
}

export type UiGuideShowResult = UiGuideShownResult | UiGuideResolvedResult;

export const DEFAULT_UI_GUIDE_ACTIONS: UiGuideAction[] = [
  { id: "ok", label: "OK", variant: "primary" },
];

export const UI_GUIDE_SPOTLIGHT_PADDING_PX = 8;
