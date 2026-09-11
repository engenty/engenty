// Inline translations for auth pages (login + setup wizard).
// Language is detected from navigator.language — no manual switch yet.
// Add more locales here as needed; fallback is always "en".

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
    setup: {
      heading: "Let's get you set up.",
      desc: "Create your administrator account and first workspace — takes less than a minute.",
      step1Label: "Create super admin",
      step1Sublabel: "Administrator account",
      step2Label: "First workspace",
      step2Sublabel: "Company & URL",
      step1CardTitle: "Create super admin",
      step1CardDesc:
        "This account will have full system access. Choose a strong password.",
      step2CardTitle: "Set up your workspace",
      step2CardDesc:
        "Create your first tenant workspace. You can add more later from the admin panel.",
    },
    login: {
      welcomeBack: "Welcome back",
      signInDesc: "Sign in to your workspace.",
      createAccount: "Create account",
      createAccountDesc: "Create a team member account.",
      resetPassword: "Reset password",
      resetPasswordDesc: "Enter your email and we'll send you a reset link.",
      initialSetup: "Initial Setup",
      initialSetupDesc: "Create the first administrator account.",
      checkingSetup: "Checking workspace setup...",
    },
    footer: `© ${new Date().getFullYear()} Engenty. All rights reserved.`,
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
    setup: {
      heading: "Gleich startklar.",
      desc: "Erstelle dein Administratorkonto und deinen ersten Workspace — dauert weniger als eine Minute.",
      step1Label: "Super-Admin anlegen",
      step1Sublabel: "Administratorkonto",
      step2Label: "Erster Workspace",
      step2Sublabel: "Firma & URL",
      step1CardTitle: "Super-Admin anlegen",
      step1CardDesc:
        "Dieses Konto hat vollen Systemzugriff. Wähle ein sicheres Passwort.",
      step2CardTitle: "Workspace einrichten",
      step2CardDesc:
        "Erstelle deinen ersten Mandanten-Workspace. Weitere lassen sich später hinzufügen.",
    },
    login: {
      welcomeBack: "Willkommen zurück",
      signInDesc: "Melde dich bei deinem Workspace an.",
      createAccount: "Konto erstellen",
      createAccountDesc: "Erstelle ein Teammitglied-Konto.",
      resetPassword: "Passwort zurücksetzen",
      resetPasswordDesc:
        "Gib deine E-Mail ein und wir senden dir einen Reset-Link.",
      initialSetup: "Ersteinrichtung",
      initialSetupDesc: "Erstelle das erste Administratorkonto.",
      checkingSetup: "Workspace wird geprüft…",
    },
    footer: `© ${new Date().getFullYear()} Engenty. Alle Rechte vorbehalten.`,
  },
} as const;

export type AuthLocale = keyof typeof AUTH_TRANSLATIONS;

/** Detects the browser locale and returns the closest supported language. */
export function detectAuthLocale(): AuthLocale {
  if (typeof navigator === "undefined") {
    return "en";
  }
  const lang = navigator.language.split("-")[0].toLowerCase();
  return (lang in AUTH_TRANSLATIONS ? lang : "en") as AuthLocale;
}

export type AuthTranslations = (typeof AUTH_TRANSLATIONS)["en"];
