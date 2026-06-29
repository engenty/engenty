/**
 * Colocated human-in-the-loop hook (Enhancing Copilot Ch.5). One config object
 * declares the tool name, a typed zod schema, and an inline `render` that receives
 * `respond`. The agent calls the tool, the run suspends, the card renders inline,
 * and the user's answer resumes the run.
 *
 * Built on the Ch.1 frontend tool: a HITL tool is a `requires_confirmation`
 * frontend tool whose handler does not run automatically — it `await`s the answer
 * the card resolves. This reuses the existing frontend-tool suspend/resume path
 * (no new transport, no harness change).
 */
import type { JsonValue } from "@engenty/ag-ui-bridge";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import type { z } from "zod";
import {
  awaitHumanAnswer,
  type HumanInTheLoopRenderProps,
  registerHumanInTheLoopRender,
} from "../copilot/human-in-the-loop-registry.js";
import { useEngentyFrontendTool } from "./use-engenty-frontend-tool.js";

export interface EngentyHumanInTheLoopConfig<TSchema extends z.ZodType> {
  description: string;
  name: string;
  /** Module owner for tenant/effective-state gating; omitted for core tools. */
  owner_module_id?: string;
  /** Inline card; receives validated `input`, `status`, and `respond(answer)`. */
  render: (props: HumanInTheLoopRenderProps<z.infer<TSchema>>) => ReactNode;
  schema: TSchema;
  title?: string;
}

export function useEngentyHumanInTheLoop<TSchema extends z.ZodType>(
  config: EngentyHumanInTheLoopConfig<TSchema>
): void {
  // Register the tool the agent calls. `requires_confirmation` keeps it out of the
  // auto-resolve-safe path; the handler blocks on the user's answer rather than
  // running browser logic.
  useEngentyFrontendTool({
    name: config.name,
    title: config.title,
    description: config.description,
    safety: "requires_confirmation",
    ...(config.owner_module_id
      ? { owner_module_id: config.owner_module_id }
      : {}),
    schema: config.schema,
    handler: (_input, request) =>
      awaitHumanAnswer(request.call_id) as Promise<JsonValue>,
  });

  // Register the inline card (kept fresh via ref so closing over deps works).
  const renderRef = useRef(config.render);
  renderRef.current = config.render;
  useEffect(
    () =>
      registerHumanInTheLoopRender(config.name, {
        schema: config.schema,
        render: (props) =>
          renderRef.current(
            props as HumanInTheLoopRenderProps<z.infer<TSchema>>
          ),
      }),
    [config.name, config.schema]
  );
}
