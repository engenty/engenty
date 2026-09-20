"use client";

import { createContext, type RefObject } from "react";

/**
 * Per-surface input state shared between the surface view (which owns the
 * submit path) and the catalog inputs (which render inside it). Inputs
 * register their required/empty state by component id; the view consults the
 * registry at submit time and publishes the ids that block it.
 */

export interface RequiredFieldState {
  empty: boolean;
  required: boolean;
}

export interface SurfaceFormContextValue {
  readOnly: boolean;
  register: (
    componentId: string,
    state: RefObject<RequiredFieldState>
  ) => () => void;
  requiredErrors: ReadonlySet<string>;
}

const EMPTY_ERRORS: ReadonlySet<string> = new Set();

export const SurfaceFormContext = createContext<SurfaceFormContextValue>({
  readOnly: false,
  register: () => () => {
    // Surfaces rendered outside a form-aware view never block a submit.
  },
  requiredErrors: EMPTY_ERRORS,
});
