// Inline translations for auth pages (login + setup wizard).
// Default is the browser language; a pick on the switch wins for the rest of
// the tab. The setup wizard saves its pick as the tenant's language, which is
// what the app reads after setup.

export const AUTH_TRANSLATIONS = {
  en: {
    tagline: "Your Work Horse Harness",
    taglineLead: "Teams & Agents working together",
    taglineAside: "side by side with your apps",
    features: [
      {
        num: "01",
        label: "Everything connected",
        desc: "Contacts, tasks, files, and knowledge — one workspace.",
      },
      {
        num: "02",
        label: "AI that works with you",
        desc: "Agents that draft, plan, and act alongside you.",
      },
      {
        num: "03",
        label: "Grows with your team",
        desc: "Modular, multi-tenant, and plugin-ready.",
      },
    ],
    login: {
      welcomeBack: "Welcome back",
      signInDesc: "Sign in to your workspace.",
      signIn: "Sign in",
      continueTo: (name: string) => `Continue to ${name}`,
      createAccount: "Create account",
      createAccountDesc: "Create a team member account.",
      resetPassword: "Reset password",
      resetPasswordDesc: "Enter your email and we'll send you a reset link.",
      initialSetup: "Initial Setup",
      initialSetupDesc: "Create the first administrator account.",
      checkingSetup: "Checking workspace setup...",
    },
    mcpConsent: {
      loading: "Loading authorization…",
      unavailable: "Authorization unavailable",
      missingRequest: "Missing authorization request.",
      invalidRequest: "Invalid authorization request.",
      loadFailed: "Could not load authorization.",
      retry: "Sign in and retry",
      eyebrow: "Connect MCP client",
      title: "Approve access",
      request: (client: string, email: string) =>
        `${client} wants to use Engenty as an agent acting for ${email}.`,
      via: (host: string) => `via ${host}`,
      spaces: "Spaces",
      spacesHelp:
        "Choose where this client may work. Every call stays inside one selected Space.",
      noSpaces: "No accessible Spaces are available.",
      risk: "Maximum risk",
      riskHelp:
        "Operations above this level are blocked. Approval cannot override this limit.",
      riskOptions: {
        low: {
          label: "Low",
          description:
            "Read and search records, list projects, or check statuses.",
        },
        medium: {
          label: "Medium",
          description:
            "Create and update routine records, log time, or change statuses.",
        },
        high: {
          label: "High",
          description:
            "Change sensitive settings, reveal secrets, or manage team access.",
        },
        critical: {
          label: "Critical",
          description:
            "Permanently delete records or perform irreversible business actions.",
        },
      },
      approvalNote:
        "Allowed operations still follow the Space's Auto or Manual approval mode.",
      selectSpace: "Select at least one Space.",
      approve: "Approve",
      approving: "Approving…",
      deny: "Deny",
      saveFailed: "Could not save MCP access.",
      approvalFailed: "Approval failed.",
      consentFailed: "Authorization failed.",
    },
    footer: `© ${new Date().getFullYear()} Engenty. All rights reserved.`,
    language: "Language",
    languageName: "English",
  },

  de: {
    tagline: "Your Work Horse Harness",
    taglineLead: "Teams & Agenten arbeiten zusammen",
    taglineAside: "Seite an Seite mit deinen Apps",
    features: [
      {
        num: "01",
        label: "Alles verbunden",
        desc: "Kontakte, Aufgaben, Dateien und Wissen — ein Workspace.",
      },
      {
        num: "02",
        label: "KI, die mit dir arbeitet",
        desc: "Agenten, die entwerfen, planen und handeln.",
      },
      {
        num: "03",
        label: "Wächst mit deinem Team",
        desc: "Modular, mandantenfähig und erweiterbar.",
      },
    ],
    login: {
      welcomeBack: "Willkommen zurück",
      signInDesc: "Melde dich bei deinem Workspace an.",
      signIn: "Anmeldung",
      continueTo: (name: string) => `Weiter zu ${name}`,
      createAccount: "Konto erstellen",
      createAccountDesc: "Erstelle ein Teammitglied-Konto.",
      resetPassword: "Passwort zurücksetzen",
      resetPasswordDesc:
        "Gib deine E-Mail ein und wir senden dir einen Reset-Link.",
      initialSetup: "Ersteinrichtung",
      initialSetupDesc: "Erstelle das erste Administratorkonto.",
      checkingSetup: "Workspace wird geprüft…",
    },
    mcpConsent: {
      loading: "Autorisierung wird geladen…",
      unavailable: "Autorisierung nicht verfügbar",
      missingRequest: "Autorisierungsanfrage fehlt.",
      invalidRequest: "Ungültige Autorisierungsanfrage.",
      loadFailed: "Autorisierung konnte nicht geladen werden.",
      retry: "Anmelden und erneut versuchen",
      eyebrow: "MCP-Client verbinden",
      title: "Zugriff erlauben",
      request: (client: string, email: string) =>
        `${client} möchte Engenty als Agent für ${email} verwenden.`,
      via: (host: string) => `über ${host}`,
      spaces: "Spaces",
      spacesHelp:
        "Wähle, wo dieser Client arbeiten darf. Jeder Aufruf bleibt in genau einem ausgewählten Space.",
      noSpaces: "Keine zugänglichen Spaces verfügbar.",
      risk: "Maximales Risiko",
      riskHelp:
        "Operationen oberhalb dieser Stufe werden blockiert. Eine Freigabe kann dieses Limit nicht aufheben.",
      riskOptions: {
        low: {
          label: "Niedrig",
          description:
            "Datensätze lesen und suchen, Projekte auflisten oder Status prüfen.",
        },
        medium: {
          label: "Mittel",
          description:
            "Alltägliche Datensätze anlegen und ändern, Zeiten erfassen oder Status ändern.",
        },
        high: {
          label: "Hoch",
          description:
            "Sensible Einstellungen ändern, Geheimnisse anzeigen oder Teamzugriffe verwalten.",
        },
        critical: {
          label: "Kritisch",
          description:
            "Datensätze endgültig löschen oder unumkehrbare Geschäftsaktionen ausführen.",
        },
      },
      approvalNote:
        "Erlaubte Operationen folgen weiterhin dem Auto- oder Manuell-Modus des Space.",
      selectSpace: "Wähle mindestens einen Space.",
      approve: "Erlauben",
      approving: "Wird erlaubt…",
      deny: "Ablehnen",
      saveFailed: "MCP-Zugriff konnte nicht gespeichert werden.",
      approvalFailed: "Freigabe fehlgeschlagen.",
      consentFailed: "Autorisierung fehlgeschlagen.",
    },
    footer: `© ${new Date().getFullYear()} Engenty. Alle Rechte vorbehalten.`,
    language: "Sprache",
    languageName: "Deutsch",
  },
} as const;

export type AuthLocale = keyof typeof AUTH_TRANSLATIONS;

export const AUTH_LOCALES = ["en", "de"] as const;

/**
 * Session storage, not local: a value kept across days outlived database
 * resets and pinned a German browser's first-run wizard to English.
 */
export const AUTH_LOCALE_STORAGE_KEY = "engenty.auth_locale";

function normalizeAuthLocale(
  value: string | null | undefined
): AuthLocale | null {
  const lang = value?.split("-")[0]?.toLowerCase();
  return lang && lang in AUTH_TRANSLATIONS ? (lang as AuthLocale) : null;
}

function readPick(): string | null {
  try {
    return sessionStorage.getItem(AUTH_LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** This tab's pick, then the browser language, then English. */
export function detectAuthLocale(): AuthLocale {
  const picked = normalizeAuthLocale(readPick());
  if (picked) {
    return picked;
  }
  if (typeof navigator !== "undefined") {
    const fromBrowser = normalizeAuthLocale(navigator.language);
    if (fromBrowser) {
      return fromBrowser;
    }
  }
  return "en";
}

/** Remember the pick for the rest of this tab. */
export function setAuthLocalePreference(locale: AuthLocale): void {
  try {
    sessionStorage.setItem(AUTH_LOCALE_STORAGE_KEY, locale);
  } catch {
    // Private mode / tests without storage.
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
  }
}

export type AuthTranslations = (typeof AUTH_TRANSLATIONS)["en"];
