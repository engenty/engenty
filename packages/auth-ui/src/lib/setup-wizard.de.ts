// Wizard copy, German.

import type { SetupCopy } from "./setup-wizard-i18n";

export const setupCopyDe: SetupCopy = {
  saving: "Wird gespeichert…",
  footer: `© ${new Date().getFullYear()} Engenty`,
  theme: { light: "Heller Modus", dark: "Dunkler Modus" },
  progress: {
    platformTitle: "Plattform",
    platform: ["Konto", "KI"],
    teamTitle: "Erste Schritte",
    team: ["Copilot", "Space", "Engenty", "Setup", "Apps"],
  },
  welcome: {
    title: "Willkommen bei engenty",
    lead: "Zwei kurze Schritte, bevor dein Team einzieht: das Administrator-Konto und die KI, mit der jeder Engenty denkt.",
    checking: "Installation wird geprüft…",
    allGood: (count) => `Installation bereit · ${count} Prüfungen ok`,
    needsYou: (count) =>
      count === 1
        ? "Eine Sache braucht dein Terminal"
        : `${count} Sachen brauchen dein Terminal`,
    polling:
      "Führ den Befehl unten aus. Die Seite prüft alle paar Sekunden neu.",
    readFailed: "Die Installation lässt sich gerade nicht prüfen.",
    details: "Prüfungen anzeigen",
    hideDetails: "Prüfungen ausblenden",
    recheck: "Neu prüfen",
    rowStatus: { ok: "ok", blocks: "blockiert", later: "später" },
    start: "Los geht's",
  },
  admin: {
    title: "Superadmin Konto anlegen",
    lead: "Du bist die erste Person hier und kümmerst dich um die Installation.",
    name: "Dein Name",
    namePlaceholder: "Erika Muster",
    email: "E-Mail",
    emailPlaceholder: "erika@firma.at",
    password: "Passwort",
    passwordPlaceholder: "Mindestens 6 Zeichen",
    show: "Passwort anzeigen",
    hide: "Passwort verbergen",
    strength: { weak: "Schwach", medium: "Mittel", strong: "Stark" },
    submit: "Konto anlegen",
    busy: "Konto wird angelegt…",
    errors: {
      name: "Gib deinen Namen ein.",
      email: "Gib eine gültige E-Mail-Adresse ein.",
      password: "Nimm mindestens 6 Zeichen.",
    },
  },
  provider: {
    title: "Verbinde die KI",
    lead: "Jeder Engenty denkt mit den Modellen hinter diesem Schlüssel. Er bleibt auf dem Server.",
    recommended: "Empfohlen",
    more: (count) => `${count} weitere Anbieter`,
    fewer: "Weniger Anbieter",
    keyLabel: "API-Schlüssel",
    getKey: "Schlüssel holen",
    keyNote:
      "Wird als Plattform-Einstellung gespeichert und nie wieder angezeigt.",
    test: "Testen",
    testing: "Wird getestet…",
    valid: (models) =>
      models
        ? `Schlüssel funktioniert: ${models} Modelle verfügbar`
        : "Schlüssel funktioniert",
    invalid:
      "Dieser Schlüssel funktioniert nicht. Prüf ihn und versuch es nochmal.",
    submit: "Weiter",
    busy: "Wird verbunden…",
    skip: "Später einrichten. Bis dahin können deine Engenties nicht antworten.",
    needKey: "Füg einen Schlüssel ein oder richte ihn später ein.",
    pasteFirst: "Füg zuerst den Schlüssel ein.",
    blurbs: {
      vercel:
        "Ein Schlüssel für alle Modelle: Chat, Suche, Bilder und Sprache.",
      openrouter:
        "Chat-Modelle aller Anbieter. Suche und Sprache brauchen Vercel.",
      opper: "Gateway mit Sitz in der EU, für Chat-Modelle.",
      openai: "OpenAI-Chat-Modelle auf deinem eigenen Konto.",
      anthropic: "Claude-Modelle auf deinem eigenen Konto.",
    },
  },
  copilot: {
    title: "Dein Copilot",
    lead: "Immer an deiner Seite. Dein persönlicher Assistent. Zeigt dir alles. Erledigt, was du ihm gibst.",
    look: "Sein Aussehen",
    find: "Du findest ihn immer in der App-Bar.",
    shortcut: "von überall öffnen",
    voiceShortcut: "mit ihm sprechen",
    greeting: (name) =>
      `Hallo ${name}! Ich bin dein Copilot. Du findest mich in der App-Bar, egal wo du bist.`,
    submit: "Weiter",
    busy: "Wird gespeichert…",
  },
  space: {
    title: "Dein erster Space",
    lead: "Organisiere deine Arbeit in Spaces: ein Kunde, ein Team, ein Thema. Dein Team, Engenties und Apps arbeiten dort zusammen.",
    name: "Name",
    namePlaceholder: "z. B. Kunden, Marketing, Recherche",
    color: "Farbe",
    icon: "Icon",
    initials: "Initialen",
    privacy: "Wer ihn sieht",
    visibility: {
      open: { label: "Offen", hint: "Alle in deinem Team sehen den Space." },
      private: {
        label: "Privat",
        hint: "Nur Mitglieder, die du hinzufügst, sehen den Space.",
      },
    },
    required: "Gib dem Space einen Namen.",
    submit: "Space anlegen",
    busy: "Wird angelegt…",
  },
  engenty: {
    title: "Dein erster Engenty",
    lead: "Ein Engenty bleibt im Space: Für alle im Space sichtbar, immer verfügbar. Er übernimmt die wiederkehrende Arbeit und macht weiter, auch wenn du weg bist.",
    look: "Aussehen",
    name: "Name",
    defaultName: "Chief of Staff",
    job: "Was soll er tun?",
    defaultJob:
      "Richtet den Space ein, verteilt die Arbeit und holt Verstärkung, wenn eine Aufgabe eine eigene Zuständigkeit braucht.",
    jobHint: "Ein, zwei Sätze. In die Rolle wächst er dann hinein.",
    required: "Gib deinem Engenty einen Namen.",
    submit: "Erstellen",
    busy: "Wird erstellt…",
    skip: "Später erstellen",
  },
  setup: {
    title: "Der Computer des Space",
    lead: "Jeder Space hat seinen eigenen Computer, mit Browser. Leg fest, was seine Engenties dort dürfen.",
    browserHint:
      "Hier arbeiten Engenties im Web. Du siehst live zu und kannst jederzeit übernehmen.",
    caption: "Browser des Space · Anmeldungen bleiben im Space",
    autostart: "Ohne Nachfrage starten",
    unattended: "Unbeaufsichtigt nutzbar",
    autostartState: {
      on: "Engenties starten ihn selbst.",
      off: "Engenties fragen, bevor sie ihn starten.",
    },
    unattendedState: {
      on: "Routinen nutzen ihn auch ohne dich.",
      off: "Routinen halten an und fragen.",
    },
    approval: "Freigaben",
    approvalChoice: {
      manual: {
        label: "Manuell",
        hint: "Sie fragen vor allem Riskanten und immer, wenn eine Aktion ein Ja braucht.",
      },
      auto: {
        label: "Auto",
        hint: "Kleines läuft durch. Alles Riskante wartet auf dein Ja.",
      },
      "pass-all": {
        label: "Alles durchlassen",
        hint: "Sie fragen nie und tun trotzdem nur, was sie dürfen.",
      },
    },
    submit: "Weiter",
    busy: "Wird gespeichert…",
  },
  apps: {
    title: "Deine ersten Apps",
    lead: "Apps bringen Werkzeuge in den Space, für dich, dein Team und deine Engenties. Wähl eine für den Anfang.",
    cards: {
      build: {
        label: "Engenty Apps",
        hint: "Mach etwas anderes. Lass Engenties deine Workflows und Apps bauen.",
      },
      knowledge: {
        label: "Wissensdatenbank",
        hint: "Artikel, Anleitungen und Antworten, die alle nutzen.",
      },
      contacts: {
        label: "Kontakte",
        hint: "Kunden, Partner und Lieferanten an einem Ort.",
      },
      commercial: {
        label: "Kaufmännisch",
        hint: "Angebote, Rechnungen und Belege.",
      },
    },
    items: {
      "engenty-apps": "Engenty Apps",
      "knowledge-base": "Wissensdatenbank",
      contacts: "Kontakte",
      offers: "Angebote",
      invoices: "Rechnungen",
      expenses: "Belege",
    },
    later: "Weitere Apps fügst du jederzeit in den Space-Einstellungen hinzu.",
    submit: "App hinzufügen",
    busy: "Wird hinzugefügt…",
    skip: "Ohne Apps weiter",
  },
  ready: {
    titleFor: (space) => `${space} ist bereit`,
    leadWith: (engenty) => `${engenty} hat dich im Space schon begrüßt.`,
    leadWithout: "Dein Copilot wartet auf dich.",
    appsRow: (names) =>
      names.length === 0 ? "Noch keine Apps" : `Apps: ${names.join(", ")}`,
    spaceRow: (name, path) => `${name} · ${path}`,
    engentyRow: (name) => `${name} arbeitet im Space`,
    engentySkipped: "Noch kein Engenty. Erstell einen im Space.",
    copilotStarting: "Dein Copilot macht sich bereit…",
    copilotReady: "Dein Copilot ist bereit",
    copilotLater: "Dein Copilot startet, sobald du ihn öffnest",
    openSpace: "Space öffnen",
    signingIn: "Du wirst angemeldet…",
  },
  scene: {
    captions: {
      welcome: {
        kicker: "engenty",
        line: "Teams & Engenties arbeiten zusammen.",
      },
      admin: {
        kicker: "Plattform",
        line: "Engenty ist eine Multi-User Plattform. Als Superadmin verwaltest du die Installation.",
      },
      provider: {
        kicker: "Die KI",
        line: "Jeder Engenty denkt mit den Modellen hinter diesem Schlüssel.",
      },
      copilot: {
        kicker: "Copilot",
        line: "Nur deiner. Live, wenn du da bist.\nIn jedem Space.",
      },
      space: {
        kicker: "Spaces",
        line: "Ein Ort pro Zweck.\nNur seine Apps, nur seine Menschen.",
      },
      engenty: {
        kicker: "Engenties",
        line: "Sie bleiben im Space und arbeiten weiter, wenn du offline bist.",
      },
      setup: {
        kicker: "Computer",
        line: "Ein eigener Computer, mit Browser.\nAnmeldungen bleiben im Space.",
      },
      apps: {
        kicker: "Apps",
        line: "Nur die Apps, die er braucht.\nFür Menschen und Engenties.",
      },
      ready: {
        kicker: "Bereit",
        line: "Dein Space steht.\nUnd jemand wartet schon.",
      },
    },
    tabs: { work: "Arbeit", data: "Daten" },
    apps: "Apps",
    engenties: "Engenties",
    copilot: "Copilot",
    admin: "Admin",
    runsOn: (label) => `über ${label}`,
    live: "live · überall dabei",
    openAsk: "Zeig mir das Q4-Angebot für ACME",
    opened: "Hier ist es, rechts geöffnet.",
    paneTitle: "Angebot Q4 · ACME",
    paneBadge: "Entwurf",
    voiceSaid: "„Was steht heute an?“",
    modes: {
      window: "Fenster",
      sidebar: "Seitenleiste",
      full: "Vollbild",
      voice: "Sprache",
    },
    noModel: "schläft · noch kein Modell",
    composer: "Nachricht…",
    computer: {
      screenCaption: (engenty) => `Browser von ${engenty}`,
      autostart: "Ohne Nachfrage starten",
      unattended: "Unbeaufsichtigt nutzbar",
      routines: "Routinen",
      noRoutines: "Keine Routinen. Er arbeitet, wenn du mit ihm sprichst.",
      connections: "Verbindungen",
      connectionsHint: "Externe Dienste, die dieser Agent erreichen kann.",
      connect: "Verbinden",
      noConnections: "Keine Verbindungen.",
      tab: "mywebsite.com",
      url: "https://mywebsite.com/",
      takeOver: "Übernehmen",
      driving: "Ein Engenty steuert",
      signIn: "Anmelden",
      email: "E-Mail",
      password: "Passwort",
      emailValue: "alex@kaiser.design",
      fetch: "Ich schaue, was es Neues auf mywebsite.com gibt.",
      card: {
        title: "Bei mywebsite.com anmelden",
        goesTo: "Geht direkt in die Seite auf",
        private:
          "Was du eingibst, landet nur in der Seite. Der Engenty sieht es nie, und es wird nicht gespeichert.",
        fill: "In die Seite eintragen",
        decline: "Nicht jetzt",
      },
      askStart: "Darf ich dafür den Browser starten?",
      start: "Starten",
      notNow: "Nicht jetzt",
    },
    scopeSpace: "Space",
    desk: {
      open: "Offen",
      role: "Koordinator: berichtet an niemanden, darf einstellen und einrichten",
      readable: (space) => `Für alle in ${space} lesbar.`,
      effort: "Normal",
      approval: (mode) => `Standard: ${mode}`,
      toolUsed: "1 Tool verwendet",
    },
    build: {
      ask: "Erstell mir eine Routine: jeden Montag einen Wochenbericht fürs Team.",
      reply: "Gern. So würde sie laufen.",
      workflow: {
        title: "Wochenbericht",
        schedule: "Routine · jeden Montag, 8:00",
        steps: [
          "Aufgaben der Woche sammeln",
          "Dich fragen, was rein soll",
          "Bericht schreiben",
          "Ans Team senden",
        ],
        cancel: "Abbrechen",
        run: "Jetzt ausprobieren",
      },
      wizard: {
        step: "1 / 2",
        question: "Was soll in den Bericht dieser Woche?",
        choices: ["Alles Erledigte", "Nur Kundenprojekte"],
      },
      done: {
        title: "Erledigt",
        summary: "Der Wochenbericht ist geschrieben und daneben offen.",
        open: "Routine öffnen",
      },
      result: { title: "Wochenbericht · KW 40", badge: "Entwurf" },
    },
    appView: {
      build: {
        nav: ["Apps", "Workflows"],
        rows: [
          { name: "Urlaubsplaner", by: "Chief of Staff" },
          { name: "Angebotsrechner", by: "Chief of Staff" },
          { name: "Wochenbericht", by: "Chief of Staff" },
        ],
        newApp: "Neue App: frag einen Engenty",
      },
      knowledge: {
        nav: ["Artikel", "Kategorien", "FAQ"],
        rows: [
          "Kunden-Onboarding",
          "Angebotsprozess",
          "Styleguide",
          "Urlaub & Abwesenheit",
        ],
      },
      contacts: {
        nav: ["Alle", "Kunden", "Partner", "Lieferanten"],
        rows: [
          { name: "Julia Berger", company: "ACME GmbH" },
          { name: "Tom Weiss", company: "Nordwind AG" },
          { name: "Sara Klein", company: "Studio Blau" },
          { name: "Max Huber", company: "Huber & Söhne" },
        ],
      },
      commercial: {
        nav: ["Angebote", "Rechnungen", "Belege"],
        rows: [
          {
            number: "AN-014",
            customer: "ACME GmbH",
            amount: "€ 12.400",
            status: "draft",
          },
          {
            number: "AN-013",
            customer: "Nordwind AG",
            amount: "€ 3.850",
            status: "sent",
          },
          {
            number: "AN-012",
            customer: "Studio Blau",
            amount: "€ 7.200",
            status: "accepted",
          },
        ],
        status: {
          draft: "Entwurf",
          sent: "Versendet",
          accepted: "Angenommen",
        },
      },
    },
    composerTo: (engenty) => `Nachricht an ${engenty}…`,
    engentyAsk: "Erstell das Q4-Angebot für ACME.",
    engentyDone: "Erledigt. Der Entwurf ist daneben offen.",
    engentyGreeting: (engenty, space) =>
      `Hallo, ich bin ${engenty}, neu in ${space}. Erzähl mir, was ansteht, ich kümmere mich darum.`,
    spaceFallback: "Dein Space",
  },
};
