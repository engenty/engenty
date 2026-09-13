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
      desc: "An administrator account, the team it belongs to, and the space the work starts in.",
      step1Label: "Administrator",
      step1Sublabel: "Your account",
      step2Label: "Your team",
      step2Sublabel: "Team or organization",
      step3Label: "First space",
      step3Sublabel: "Where work happens",
      step1CardTitle: "Create the administrator",
      step1CardDesc:
        "This account will have full system access. Choose a strong password.",
      step2CardTitle: "Name your team",
      step2CardDesc:
        "A team, a department, or a whole organization — whatever this installation is for.",
      step3CardTitle: "Your first space",
      step3CardDesc:
        "A space holds the agents, apps and knowledge for one piece of work. You pick its modules and hire its first engenty right after this.",
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
      desc: "Ein Administratorkonto, das Team dahinter und der Space, in dem die Arbeit beginnt.",
      step1Label: "Administrator",
      step1Sublabel: "Dein Konto",
      step2Label: "Dein Team",
      step2Sublabel: "Team oder Organisation",
      step3Label: "Erster Space",
      step3Sublabel: "Hier läuft die Arbeit",
      step1CardTitle: "Administrator anlegen",
      step1CardDesc:
        "Dieses Konto hat vollen Systemzugriff. Wähle ein sicheres Passwort.",
      step2CardTitle: "Team benennen",
      step2CardDesc:
        "Ein Team, eine Abteilung oder eine ganze Organisation — wofür diese Installation da ist.",
      step3CardTitle: "Dein erster Space",
      step3CardDesc:
        "Ein Space bündelt Agenten, Apps und Wissen für eine Aufgabe. Module und die erste Engenty wählst du direkt danach.",
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
