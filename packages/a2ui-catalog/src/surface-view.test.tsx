// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { EngentyA2uiHostProvider } from "./catalog.js";
import { buildEngentyA2uiMessages } from "./spec.js";
import {
  type EngentyA2uiAction,
  EngentyA2uiSurfaceView,
  type EngentyA2uiSurfaceViewProps,
} from "./surface-view.js";

/**
 * Round-trip tests for the step contract: inputs write through their
 * bindings into the data model, a submit hands the model to `onSubmit` under
 * the event name, required inputs hold the submit back, `initialData`
 * prefills, and `open_object` keeps going to `onAction`.
 */

const roots: { el: HTMLElement; root: Root }[] = [];

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  for (const { el, root } of roots.splice(0)) {
    await act(async () => {
      root.unmount();
    });
    el.remove();
  }
});

async function mount(
  props: EngentyA2uiSurfaceViewProps,
  host?: Parameters<typeof EngentyA2uiHostProvider>[0]["value"]
) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push({ el, root });
  await act(async () => {
    root.render(
      host ? (
        <EngentyA2uiHostProvider value={host}>
          <EngentyA2uiSurfaceView {...props} />
        </EngentyA2uiHostProvider>
      ) : (
        <EngentyA2uiSurfaceView {...props} />
      )
    );
  });
  return {
    el,
    rerender: (next: EngentyA2uiSurfaceViewProps) =>
      act(async () => {
        root.render(<EngentyA2uiSurfaceView {...next} />);
      }),
  };
}

const valueSetter = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  "value"
)?.set as (this: HTMLInputElement, value: string) => void;

async function typeInto(input: HTMLInputElement, value: string) {
  await act(async () => {
    valueSetter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function click(el: Element | null) {
  if (!el) {
    throw new Error("element not found");
  }
  await act(async () => {
    (el as HTMLElement).click();
  });
}

function formSurface(options?: {
  required?: boolean;
  data?: Record<string, unknown>;
}) {
  return buildEngentyA2uiMessages({
    components: [
      {
        id: "root",
        component: "Form",
        children: ["name", "acts"],
        submit: { event: { name: "next" } },
      },
      {
        id: "name",
        component: "TextField",
        label: "Name",
        value: { path: "/name" },
        required: options?.required === true,
      },
      { id: "acts", component: "Actions", children: ["go", "back"] },
      {
        id: "go",
        component: "Button",
        label: "Next",
        action: { event: { name: "next" } },
      },
      {
        id: "back",
        component: "Button",
        label: "Revise",
        action: { event: { name: "revise" } },
      },
    ],
    data: options?.data,
    surfaceId: "step",
  }).messages;
}

const buttonByText = (el: HTMLElement, text: string) =>
  Array.from(el.querySelectorAll("button")).find(
    (b) => b.textContent === text
  ) ?? null;

describe("EngentyA2uiSurfaceView step mode", () => {
  it("a typed TextField reaches onSubmit under the button's event name", async () => {
    const submits: [string, Record<string, unknown>][] = [];
    const actions: EngentyA2uiAction[] = [];
    const { el } = await mount({
      messages: formSurface(),
      onAction: (a) => actions.push(a),
      onSubmit: (event, data) => submits.push([event, data]),
      surfaceId: "step",
    });
    const input = el.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("");
    await typeInto(input, "x");
    expect(input.value).toBe("x");
    await click(buttonByText(el, "Next"));
    expect(submits).toEqual([["next", { name: "x" }]]);
    await click(buttonByText(el, "Revise"));
    expect(submits[1]).toEqual(["revise", { name: "x" }]);
    expect(actions).toEqual([]);
  });

  it("a repeated row edits the array it was rendered from", async () => {
    const submits: [string, Record<string, unknown>][] = [];
    const messages = buildEngentyA2uiMessages({
      components: [
        {
          id: "root",
          component: "Form",
          children: ["rows", "acts"],
          submit: { event: { name: "next" } },
        },
        {
          id: "rows",
          component: "Column",
          children: { componentId: "row", path: "/offer/blocks" },
        },
        { id: "row", component: "Column", children: ["rowTitle"] },
        {
          id: "rowTitle",
          component: "TextField",
          label: "Position",
          value: { path: "content_json/title" },
        },
        { id: "acts", component: "Actions", children: ["go"] },
        {
          id: "go",
          component: "Button",
          label: "Next",
          action: { event: { name: "next" } },
        },
      ],
      data: {
        offer: {
          blocks: [
            { type: "line_item", content_json: { title: "Konzept" } },
            { type: "line_item", content_json: { title: "Umsetzung" } },
          ],
        },
      },
      surfaceId: "step",
    }).messages;
    const { el } = await mount({
      messages,
      onSubmit: (event, data) => submits.push([event, data]),
      surfaceId: "step",
    });
    const inputs = Array.from(
      el.querySelectorAll("input")
    ) as HTMLInputElement[];
    expect(inputs.map((input) => input.value)).toEqual([
      "Konzept",
      "Umsetzung",
    ]);
    await typeInto(inputs[1] as HTMLInputElement, "Umsetzung Phase 2");
    await click(buttonByText(el, "Next"));
    expect(submits).toEqual([
      [
        "next",
        {
          offer: {
            blocks: [
              { type: "line_item", content_json: { title: "Konzept" } },
              {
                type: "line_item",
                content_json: { title: "Umsetzung Phase 2" },
              },
            ],
          },
        },
      ],
    ]);
  });

  it("Enter in the form dispatches the Form's submit action", async () => {
    const submits: [string, Record<string, unknown>][] = [];
    const { el } = await mount({
      messages: formSurface({ data: { name: "Anna" } }),
      onSubmit: (event, data) => submits.push([event, data]),
      surfaceId: "step",
    });
    const form = el.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });
    expect(submits).toEqual([["next", { name: "Anna" }]]);
  });

  it("an empty required input blocks the submit and shows an error until filled", async () => {
    const submits: string[] = [];
    const { el } = await mount({
      messages: formSurface({ required: true }),
      onSubmit: (event) => submits.push(event),
      surfaceId: "step",
    });
    await click(buttonByText(el, "Next"));
    expect(submits).toEqual([]);
    const input = el.querySelector("input") as HTMLInputElement;
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(el.querySelector('[role="alert"]')?.textContent).toBe("Required");
    await typeInto(input, "filled");
    await click(buttonByText(el, "Next"));
    expect(submits).toEqual(["next"]);
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it("initialData prefills the model over the surface data and is compared by content", async () => {
    const submits: Record<string, unknown>[] = [];
    const messages = formSurface({ data: { name: "Anna" } });
    const { el, rerender } = await mount({
      initialData: { extra: 1, name: "Berta" },
      messages,
      onSubmit: (_event, data) => submits.push(data),
      surfaceId: "step",
    });
    const input = el.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("Berta");
    await typeInto(input, "Carla");
    // Same content, new reference: the surface (and the typed value) survive.
    await rerender({
      initialData: { extra: 1, name: "Berta" },
      messages,
      onSubmit: (_event, data) => submits.push(data),
      surfaceId: "step",
    });
    expect((el.querySelector("input") as HTMLInputElement).value).toBe("Carla");
    await click(buttonByText(el, "Next"));
    expect(submits).toEqual([{ extra: 1, name: "Carla" }]);
  });

  it("readOnly disables the inputs", async () => {
    const { el } = await mount({
      messages: formSurface(),
      onSubmit: () => undefined,
      readOnly: true,
      surfaceId: "step",
    });
    expect((el.querySelector("input") as HTMLInputElement).disabled).toBe(true);
  });

  it("open_object still reaches onAction while other actions submit", async () => {
    const submits: string[] = [];
    const actions: EngentyA2uiAction[] = [];
    const messages = buildEngentyA2uiMessages({
      components: [
        { id: "root", component: "List", children: ["row", "acts"] },
        {
          id: "row",
          component: "Row",
          title: "Anna",
          action: {
            event: {
              name: "open_object",
              context: { ref: "contacts:contact:1" },
            },
          },
        },
        { id: "acts", component: "Actions", children: ["go"] },
        {
          id: "go",
          component: "Button",
          label: "OK",
          action: { event: { name: "ok" } },
        },
      ],
      surfaceId: "s",
    }).messages;
    const { el } = await mount({
      messages,
      onAction: (a) => actions.push(a),
      onSubmit: (event) => submits.push(event),
      surfaceId: "s",
    });
    await click(
      Array.from(el.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Anna")
      ) ?? null
    );
    expect(actions).toEqual([
      {
        context: { ref: "contacts:contact:1" },
        name: "open_object",
        sourceComponentId: "row",
        surfaceId: "s",
      },
    ]);
    await click(buttonByText(el, "OK"));
    expect(submits).toEqual(["ok"]);
  });

  it("without onSubmit every action reaches onAction (chat card behaviour)", async () => {
    const actions: EngentyA2uiAction[] = [];
    const { el } = await mount({
      messages: formSurface(),
      onAction: (a) => actions.push(a),
      surfaceId: "step",
    });
    await click(buttonByText(el, "Next"));
    expect(actions.map((a) => a.name)).toEqual(["next"]);
  });

  it("ObjectPicker and Document render through the host seams", async () => {
    const submits: Record<string, unknown>[] = [];
    const messages = buildEngentyA2uiMessages({
      components: [
        { id: "root", component: "Column", children: ["pick", "doc", "go"] },
        {
          id: "pick",
          component: "ObjectPicker",
          entity: "contact",
          label: "Contact",
          value: { path: "/contact" },
        },
        { id: "doc", component: "Document", artifactRef: "art-7" },
        {
          id: "go",
          component: "Button",
          label: "Go",
          action: { event: { name: "next" } },
        },
      ],
      surfaceId: "s",
    }).messages;
    const { el } = await mount(
      {
        messages,
        onSubmit: (_event, data) => submits.push(data),
        surfaceId: "s",
      },
      {
        renderArtifact: (id) => <div data-testid="artifact">doc {id}</div>,
        renderObjectPicker: ({ entity, onChange }) => (
          <button
            onClick={() => onChange(`contacts:${entity}:9`)}
            type="button"
          >
            pick {entity}
          </button>
        ),
      }
    );
    expect(el.querySelector('[data-testid="artifact"]')?.textContent).toBe(
      "doc art-7"
    );
    await click(buttonByText(el, "pick contact"));
    await click(buttonByText(el, "Go"));
    expect(submits).toEqual([{ contact: "contacts:contact:9" }]);
  });
});
