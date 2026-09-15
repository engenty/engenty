// Inline translations for auth pages (login + setup wizard).
// Default is the browser language; a stored preference (same key i18next
// uses) wins after the person picks one on the first setup screen.

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
      desc: "An administrator account, the team it belongs to, a model provider, and the spaces the work starts in.",
      gateLabel: "Installation",
      gateSublabel: "Checks before anything is created",
      gateCardTitle: "Almost installed",
      gateCardDesc:
        "engenty checks the installation before it creates anything. A red row needs the terminal; the page re-checks on its own.",
      gateAllPassed: "All checks passed",
      gateNeedYou: (n: number) =>
        n === 1 ? "1 check needs you" : `${n} checks need you`,
      gateCheckAgain: "Check again",
      gateContinue: "Continue",
      step1Label: "Administrator",
      step1Sublabel: "Your account",
      step2Label: "Your team",
      step2Sublabel: "Team or organization",
      step3Label: "AI provider",
      step3Sublabel: "Which models",
      step4Label: "First space",
      step4Sublabel: "Where work happens",
      step5Label: "Personal space",
      step5Sublabel: "Optional — yours alone",
      step6Label: "Ready",
      step6Sublabel: "Open your space",
      step1CardTitle: "Create the administrator",
      step1CardDesc:
        "This account will have full system access. Choose a strong password.",
      step2CardTitle: "Name your team",
      step2CardDesc:
        "A team, a department, or a whole organization — whatever this installation is for.",
      step3CardTitle: "Connect a model provider",
      step3CardDesc:
        "Your agents run on the models behind this key. It is stored as a platform setting — it never leaves the server, and it takes effect right away.",
      step4CardTitle: "Your first space",
      step4CardDesc:
        "A space is where a team and its agents work. This one starts with the team's name; you can add more later.",
      step5CardTitle: "Your personal space",
      step5CardDesc:
        "A private space only you can see — your own notes, files and agents. It already exists; give it a name, or keep the one it has.",
      step5NameLabel: "Name",
      step5NameHint:
        "Reached at /s/me. Private: no members, and it cannot be opened to the team — sharing something means moving it to a shared space.",
      step5SaveName: "Save name",
      step5Saving: "Saving…",
      step5KeepName: (name: string) => `Keep “${name}”`,
      step6CardTitle: (name: string) => `${name} is ready`,
      step6CardDesc:
        "You are signed in as the administrator once you open a space.",
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
    setup: {
      heading: "Gleich startklar.",
      desc: "Ein Administratorkonto, das Team dahinter, ein Modellanbieter und die Spaces, in denen die Arbeit beginnt.",
      gateLabel: "Installation",
      gateSublabel: "Prüfungen, bevor etwas angelegt wird",
      gateCardTitle: "Fast installiert",
      gateCardDesc:
        "engenty prüft die Installation, bevor es etwas anlegt. Eine rote Zeile braucht das Terminal; die Seite prüft von selbst nach.",
      gateAllPassed: "Alle Prüfungen bestanden",
      gateNeedYou: (n: number) =>
        n === 1 ? "1 Prüfung braucht dich" : `${n} Prüfungen brauchen dich`,
      gateCheckAgain: "Erneut prüfen",
      gateContinue: "Weiter",
      step1Label: "Administrator",
      step1Sublabel: "Dein Konto",
      step2Label: "Dein Team",
      step2Sublabel: "Team oder Organisation",
      step3Label: "KI-Anbieter",
      step3Sublabel: "Welche Modelle",
      step4Label: "Erster Space",
      step4Sublabel: "Hier läuft die Arbeit",
      step5Label: "Persönlicher Space",
      step5Sublabel: "Optional — nur für dich",
      step6Label: "Fertig",
      step6Sublabel: "Space öffnen",
      step1CardTitle: "Administrator anlegen",
      step1CardDesc:
        "Dieses Konto hat vollen Systemzugriff. Wähle ein sicheres Passwort.",
      step2CardTitle: "Team benennen",
      step2CardDesc:
        "Ein Team, eine Abteilung oder eine ganze Organisation — wofür diese Installation da ist.",
      step3CardTitle: "Modellanbieter verbinden",
      step3CardDesc:
        "Deine Agenten laufen auf den Modellen hinter diesem Schlüssel. Er wird als Plattform-Einstellung gespeichert — er verlässt den Server nie und gilt sofort.",
      step4CardTitle: "Dein erster Space",
      step4CardDesc:
        "Ein Space ist der Ort, an dem ein Team und seine Agenten arbeiten. Dieser trägt zunächst den Namen des Teams; weitere kommen später.",
      step5CardTitle: "Dein persönlicher Space",
      step5CardDesc:
        "Ein privater Space, den nur du siehst — deine Notizen, Dateien und Agenten. Er existiert schon; gib ihm einen Namen oder behalte den bisherigen.",
      step5NameLabel: "Name",
      step5NameHint:
        "Erreichbar unter /s/me. Privat: keine Mitglieder, und er lässt sich nicht fürs Team öffnen — etwas teilen heißt, es in einen gemeinsamen Space zu legen.",
      step5SaveName: "Namen speichern",
      step5Saving: "Speichern…",
      step5KeepName: (name: string) => `„${name}“ behalten`,
      step6CardTitle: (name: string) => `${name} ist bereit`,
      step6CardDesc:
        "Sobald du einen Space öffnest, bist du als Administrator angemeldet.",
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
    language: "Sprache",
    languageName: "Deutsch",
  },
} as const;

export type AuthLocale = keyof typeof AUTH_TRANSLATIONS;

export const AUTH_LOCALES = ["en", "de"] as const;

/** Same key i18next-browser-languagedetector writes, so the app keeps the pick. */
export const AUTH_LOCALE_STORAGE_KEY = "i18nextLng";

function normalizeAuthLocale(
  value: string | null | undefined
): AuthLocale | null {
  const lang = value?.split("-")[0]?.toLowerCase();
  return lang && lang in AUTH_TRANSLATIONS ? (lang as AuthLocale) : null;
}

/** Stored preference, then the browser language, then English. */
export function detectAuthLocale(): AuthLocale {
  if (typeof localStorage !== "undefined") {
    const stored = normalizeAuthLocale(
      localStorage.getItem(AUTH_LOCALE_STORAGE_KEY)
    );
    if (stored) {
      return stored;
    }
  }
  if (typeof navigator !== "undefined") {
    const fromBrowser = normalizeAuthLocale(navigator.language);
    if (fromBrowser) {
      return fromBrowser;
    }
  }
  return "en";
}

/** Remember the pick for the rest of this browser and for i18next after setup. */
export function setAuthLocalePreference(locale: AuthLocale): void {
  try {
    localStorage.setItem(AUTH_LOCALE_STORAGE_KEY, locale);
  } catch {
    // Private mode / tests without storage.
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
  }
}

export type AuthTranslations = (typeof AUTH_TRANSLATIONS)["en"];
