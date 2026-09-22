// "Matthias' Copilot": how a person's copilot is named where others read it.
//
// English wants the possessive; a name ending in a sibilant takes the bare
// apostrophe. Both forms are translations, so German gets "Matthias' Copilot"
// and "Annas Copilot" by the same rule.

export function alterEgoLabel(
  userName: string,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  const name = userName.trim();
  const sibilant = /[sxzß]$/i.test(name);
  return t(sibilant ? "alterEgo.labelSibilant" : "alterEgo.label", { name });
}
