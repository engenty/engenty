import type { EngentyPluginFactory } from "@engenty/plugin-sdk";

const specialistsPlugin: EngentyPluginFactory = () => {
  // Specialists module: a builtin code home for hired engenties. apps/ai
  // imports its floor, playbooks and appendix directly; core has nothing to
  // register — no operations, no UI, no schema.
};

export default specialistsPlugin;
