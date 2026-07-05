import type { RealtimeVoiceTenantPrefs } from "./provider.js";

/**
 * Regional German voice registers — word choice, not accent. Accent is a TTS
 * concern (voice selection); these instructions steer the LLM's vocabulary
 * and conventions, so they work on every provider. Kept short and curated:
 * long vocabulary dumps degrade fluency — this is register guidance, not a
 * dictionary.
 */

export type VoiceRegister = NonNullable<
  RealtimeVoiceTenantPrefs["voice_register"]
>;

const VOICE_REGISTER_INSTRUCTIONS: Record<VoiceRegister, string> = {
  "de-AT": [
    "Sprich österreichisches Deutsch (de-AT), nicht bundesdeutsches Hochdeutsch.",
    "Verwende österreichische Begriffe: Jänner (nicht Januar), Feber, heuer,",
    "Sackerl, Erdäpfel, Paradeiser, Topfen, Stiege.",
    "Begrüßung: 'Grüß Gott' oder 'Servus'. Höflichkeitsform 'Sie' als Standard.",
    "Datumsformat TT.MM.JJJJ. Keine übertriebene Mundart — gehobenes",
    "Umgangsdeutsch, regional gefärbt.",
  ].join(" "),
  "de-CH": [
    "Sprich Schweizer Hochdeutsch (de-CH). Verwende Schweizer Begriffe:",
    "Velo, Trottoir, parkieren, grillieren. Kein ß — immer ss.",
    "Begrüßung: 'Grüezi'. Höflichkeitsform 'Sie' als Standard.",
  ].join(" "),
  "de-DE": [
    "Sprich bundesdeutsches Hochdeutsch (de-DE) mit standardsprachlicher",
    "Wortwahl. Höflichkeitsform 'Sie' als Standard.",
  ].join(" "),
};

export function voiceRegisterInstructions(
  register: RealtimeVoiceTenantPrefs["voice_register"]
): string | null {
  if (!register) {
    return null;
  }
  return VOICE_REGISTER_INSTRUCTIONS[register] ?? null;
}

/** Compose base instructions with the tenant's regional register, if any. */
export function composeVoiceInstructions(
  instructions: string | undefined,
  register: RealtimeVoiceTenantPrefs["voice_register"]
): string | undefined {
  const registerInstructions = voiceRegisterInstructions(register);
  if (!registerInstructions) {
    return instructions;
  }
  return instructions
    ? `${instructions}\n\n${registerInstructions}`
    : registerInstructions;
}
