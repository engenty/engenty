// The first-run wizard's words live in setup-wizard.en.ts and
// setup-wizard.de.ts. One title and one or two sentences per screen; the
// picture beside the form carries the rest.
//
// The team half is told in the order people meet it: the copilot (yours, live,
// everywhere), a space (one place per purpose), the engenty that stays in it
// (durable, owns recurring work), and the first apps in it.

import type { AuthLocale } from "./auth-i18n";
import type { AiProviderGateway } from "./initial-setup-checks";
import { setupCopyDe } from "./setup-wizard.de";
import { setupCopyEn } from "./setup-wizard.en";

export type SetupStage =
  | "welcome"
  | "admin"
  | "provider"
  | "copilot"
  | "space"
  | "engenty"
  | "setup"
  | "apps"
  | "ready";

interface StageCopy {
  lead: string;
  title: string;
}

export interface SetupCopy {
  admin: StageCopy & {
    busy: string;
    email: string;
    emailPlaceholder: string;
    errors: { email: string; name: string; password: string };
    hide: string;
    name: string;
    namePlaceholder: string;
    password: string;
    passwordPlaceholder: string;
    show: string;
    strength: { medium: string; strong: string; weak: string };
    submit: string;
  };
  apps: StageCopy & {
    busy: string;
    /** The choices, by card id: one app, or a group of them. */
    cards: Record<
      "build" | "knowledge" | "contacts" | "commercial",
      { hint: string; label: string }
    >;
    /** Wizard names for the apps behind the cards, by module id. */
    items: Record<string, string>;
    /** Under the grid, once the two are picked. */
    later: string;
    skip: string;
    submit: string;
  };
  copilot: StageCopy & {
    busy: string;
    /** Where it lives in the app. */
    find: string;
    greeting: (name: string) => string;
    /** Names the look picker for screen readers. */
    look: string;
    /** Next to the shortcut keys. */
    shortcut: string;
    /** Next to the voice shortcut keys. */
    voiceShortcut: string;
    submit: string;
  };
  engenty: StageCopy & {
    busy: string;
    defaultJob: string;
    defaultName: string;
    job: string;
    jobHint: string;
    look: string;
    name: string;
    required: string;
    skip: string;
    submit: string;
  };
  footer: string;
  progress: {
    platform: readonly [string, string];
    platformTitle: string;
    team: readonly [string, string, string, string, string];
    teamTitle: string;
  };
  provider: StageCopy & {
    blurbs: Record<AiProviderGateway, string>;
    busy: string;
    fewer: string;
    getKey: string;
    invalid: string;
    keyLabel: string;
    keyNote: string;
    more: (count: number) => string;
    needKey: string;
    pasteFirst: string;
    recommended: string;
    skip: string;
    submit: string;
    test: string;
    testing: string;
    valid: (models: number | null) => string;
  };
  ready: {
    copilotLater: string;
    copilotReady: string;
    copilotStarting: string;
    engentyRow: (name: string) => string;
    engentySkipped: string;
    leadWith: (engenty: string) => string;
    leadWithout: string;
    openSpace: string;
    signingIn: string;
    spaceRow: (name: string, path: string) => string;
    appsRow: (names: readonly string[]) => string;
    titleFor: (space: string) => string;
  };
  saving: string;
  scene: {
    admin: string;
    apps: string;
    captions: Record<SetupStage, { kicker: string; line: string }>;
    composer: string;
    /** The setup screen's computer: its terminal, and an approval ask. */
    /** The engenty's desk, as the app draws it. */
    desk: {
      open: string;
      role: string;
      readable: (space: string) => string;
      /** Under the composer: the effort, and the approval mode it follows. */
      effort: string;
      approval: (mode: string) => string;
      toolUsed: string;
    };
    computer: {
      /** The engenty's settings pane: its browser and its two grants. */
      screenCaption: (engenty: string) => string;
      autostart: string;
      unattended: string;
      routines: string;
      noRoutines: string;
      connections: string;
      connectionsHint: string;
      connect: string;
      noConnections: string;
      /** The full browser pane: its tab, address, and the take-over button. */
      tab: string;
      url: string;
      takeOver: string;
      /** Who drives the window. */
      driving: string;
      /** The site's sign-in form, and the address filled into it. */
      signIn: string;
      email: string;
      password: string;
      emailValue: string;
      /** The engenty in the space's chat, going to the web. */
      fetch: string;
      /**
       * The chat's credentials card: the values go straight into the page,
       * never to the engenty.
       */
      card: {
        title: string;
        goesTo: string;
        private: string;
        fill: string;
        decline: string;
      };
      askStart: string;
      start: string;
      notNow: string;
    };
    /** The engenty screen's artifact pane: the scope badge on the record. */
    scopeSpace: string;
    /**
     * The engenty Apps card's story: asked for a routine, the engenty shows
     * its workflow, a wizard runs it, and the result opens beside it.
     */
    build: {
      ask: string;
      reply: string;
      workflow: {
        title: string;
        schedule: string;
        steps: readonly string[];
        cancel: string;
        run: string;
      };
      wizard: { step: string; question: string; choices: readonly string[] };
      done: { title: string; summary: string; open: string };
      result: { title: string; badge: string };
    };
    /** The apps screen: the chosen app open, its own nav in the sidebar. */
    appView: {
      build: {
        nav: readonly string[];
        rows: readonly { by: string; name: string }[];
        newApp: string;
      };
      knowledge: { nav: readonly string[]; rows: readonly string[] };
      contacts: {
        nav: readonly string[];
        rows: readonly { company: string; name: string }[];
      };
      commercial: {
        nav: readonly string[];
        rows: readonly {
          amount: string;
          customer: string;
          number: string;
          status: "draft" | "sent" | "accepted";
        }[];
        status: Record<"draft" | "sent" | "accepted", string>;
      };
    };
    composerTo: (engenty: string) => string;
    copilot: string;
    engenties: string;
    engentyGreeting: (engenty: string, space: string) => string;
    /** The engenty screen's sidebar: what it is asked, and its answer. */
    engentyAsk: string;
    engentyDone: string;
    noModel: string;
    live: string;
    /** Full screen: what the person asked, and the copilot's answer. */
    openAsk: string;
    opened: string;
    paneBadge: string;
    paneTitle: string;
    /** Voice: the live caption of what the person just said. */
    voiceSaid: string;
    /** The copilot's layouts, as the picture cycles through them. */
    modes: Record<"window" | "sidebar" | "full" | "voice", string>;
    runsOn: (label: string) => string;
    spaceFallback: string;
    /** The space sidebar's tabs. */
    tabs: Record<"work" | "data", string>;
  };
  setup: StageCopy & {
    /** The browser card, as the agent settings pane draws it. */
    browserHint: string;
    caption: string;
    autostart: string;
    unattended: string;
    /** Under the card: what the two switches mean as they stand. */
    autostartState: { off: string; on: string };
    unattendedState: { off: string; on: string };
    approval: string;
    approvalChoice: Record<
      "manual" | "auto" | "pass-all",
      { hint: string; label: string }
    >;
    busy: string;
    submit: string;
  };
  space: StageCopy & {
    busy: string;
    color: string;
    icon: string;
    /** Names the initials choice for screen readers. */
    initials: string;
    name: string;
    namePlaceholder: string;
    /** Who may open the space: the choices, and one line on each. */
    privacy: string;
    visibility: Record<"open" | "private", { hint: string; label: string }>;
    required: string;
    submit: string;
  };
  theme: { dark: string; light: string };
  welcome: StageCopy & {
    allGood: (count: number) => string;
    checking: string;
    details: string;
    hideDetails: string;
    needsYou: (count: number) => string;
    polling: string;
    readFailed: string;
    recheck: string;
    rowStatus: { blocks: string; later: string; ok: string };
    start: string;
  };
}

export const SETUP_COPY: Record<AuthLocale, SetupCopy> = {
  de: setupCopyDe,
  en: setupCopyEn,
};
