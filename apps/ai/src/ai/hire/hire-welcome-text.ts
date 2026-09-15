/** Stamped on the opening assistant message so the Space home can keep it a card. */
export const HIRE_WELCOME_SOURCE = "hire-welcome";

export interface HireWelcomeContext {
  connectors: readonly string[];
  description: string;
  locale: string;
  modules: readonly string[];
  name: string;
  spaceName: string;
}

function isGerman(locale: string): boolean {
  return locale.toLowerCase().startsWith("de");
}

function jobClause(description: string, german: boolean): string {
  const job = description.trim();
  if (!job) {
    return "";
  }
  const clipped = job.length > 180 ? `${job.slice(0, 179)}…` : job;
  return german
    ? ` Mein Auftrag hier: ${clipped}.`
    : ` My job here: ${clipped}.`;
}

function nextStep(context: HireWelcomeContext, german: boolean): string {
  const hasApps = context.modules.length > 0;
  const hasConnectors = context.connectors.length > 0;
  if (german) {
    if (!(hasApps || hasConnectors)) {
      return "Sag mir, was ich zuerst übernehmen soll — oder binde Files oder Connections ein, damit ich etwas zum Arbeiten habe.";
    }
    return "Sag mir, was ich zuerst übernehmen soll, oder ich schaue mir an, was hier schon liegt, und schlage den nächsten Schritt vor.";
  }
  if (!(hasApps || hasConnectors)) {
    return "Tell me what you want me to own first — or mount Files or Connections so I have something to work with.";
  }
  return "Tell me what you want me to own first, or I can look at what's already here and propose a next step.";
}

/** Used when the model is missing, times out, or returns nothing. */
export function fallbackHireWelcome(context: HireWelcomeContext): string {
  const german = isGerman(context.locale);
  const job = jobClause(context.description, german);
  const next = nextStep(context, german);
  if (german) {
    return `Hallo — ich bin ${context.name}. Ich habe gerade in ${context.spaceName} angefangen.${job} Einen ersten Schritt habe ich noch nicht gemacht. ${next}`;
  }
  return `Hi — I'm ${context.name}. I've just started in ${context.spaceName}.${job} I haven't taken a first step yet. ${next}`;
}

export function hireWelcomeSystemPrompt(locale: string): string {
  return [
    "You are an Engenty who was just hired into a space.",
    "Write your first message to the person who hired you.",
    `Write 2–4 short sentences in locale "${locale}".`,
    "Welcome them, restate your job in your own words, and suggest two concrete next steps they can take with you now.",
    "If nothing is mounted, say so and suggest mounting the apps you need or describing the first piece of work.",
    "Do not ask 'how can I help you today'. Do not mention being an AI. No markdown headings. No sign-off.",
  ].join(" ");
}

export function hireWelcomeUserPrompt(context: HireWelcomeContext): string {
  return [
    `Locale: ${context.locale}`,
    `Space: ${context.spaceName}`,
    `Name: ${context.name}`,
    `Job: ${context.description.trim() || "(none given)"}`,
    `Mounted modules: ${context.modules.join(", ") || "none"}`,
    `Mounted connectors: ${context.connectors.join(", ") || "none"}`,
  ].join("\n");
}
