// Tenant setup – a signed-in person sets up their team, told in the order
// they meet it:
//
//   1 copilot   says hello; the person picks its face
//   2 space     its name, colour and icon; renames and re-keys the default space
//   3 engenty   hires the space's first engenty (skippable)
//   4 setup     what engenties may do with the space's browser; when they ask
//   5 apps      one or two apps for the space; the tenant takes the wizard's
//               language
//   ready       what now exists, and the way in
//
// The screen is `?step=` in the URL, so the browser's back button and the
// progress go back; only screens already reached open, and the engenty screen
// closes once one is hired. The copilot's conversation opens in the background
// on the first screen, so its welcome is there when the person arrives. Every
// outside call goes through `api`; the preview page runs these screens on an
// in-memory backend.

import type { AgentEngentyKind } from "@engenty/ai-core/browser";
import { pickRandomSpaceColor } from "@engenty/app-shell";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  type AppCardId,
  AppsStep,
  cardModules,
  offeredCards,
} from "../components/setup/setup-apps-step";
import { ErrorLine } from "../components/setup/setup-bits";
import { CopilotStep } from "../components/setup/setup-copilot-step";
import {
  EngentyStep,
  engentyFace,
} from "../components/setup/setup-engenty-step";
import { SetupFrame } from "../components/setup/setup-frame";
import { ReadyStep } from "../components/setup/setup-ready-step";
import type { SetupStory } from "../components/setup/setup-scene";
import {
  type SpaceLook,
  SpaceStep,
} from "../components/setup/setup-space-step";
import { WorkStep } from "../components/setup/setup-work-step";
import { type AuthLocale, detectAuthLocale } from "../lib/auth-i18n";
import type {
  FirstEngentyChoice,
  SetupCatalog,
  SpaceVisibility,
  SpaceWorkRules,
} from "../lib/initial-setup-workspace";
import { SETUP_COPY, type SetupStage } from "../lib/setup-wizard-i18n";
import type {
  SetupSpace,
  TenantSetupApi,
  TenantSetupContext,
} from "../lib/tenant-setup-api";

type TenantStage = Extract<
  SetupStage,
  "copilot" | "space" | "engenty" | "setup" | "apps" | "ready"
>;

const ORDER: readonly TenantStage[] = [
  "copilot",
  "space",
  "engenty",
  "setup",
  "apps",
  "ready",
];

function isTenantStage(value: string | null): value is TenantStage {
  return ORDER.includes(value as TenantStage);
}

/** The name a tenant is created with, which nobody should keep. */
const PLACEHOLDER_TENANT_NAME = "Default Tenant";

export function TenantSetupWizard({
  api,
  onComplete,
  toolbar,
}: {
  api: TenantSetupApi;
  /** Called with the path to open when the person is done. */
  onComplete: (path: string) => void;
  toolbar?: ReactNode;
}) {
  const [locale, setLocale] = useState<AuthLocale>(detectAuthLocale);
  const copy = SETUP_COPY[locale];
  const [params, setParams] = useSearchParams();
  /** The furthest screen reached; nothing past it opens. */
  const [furthest, setFurthest] = useState(0);
  const [context, setContext] = useState<TenantSetupContext | null>(null);
  const [catalog, setCatalog] = useState<SetupCatalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [spaceName, setSpaceName] = useState("");
  const [spaceLook, setSpaceLook] = useState<SpaceLook>(() => ({
    color: pickRandomSpaceColor(),
    icon: null,
  }));
  const [visibility, setVisibility] = useState<SpaceVisibility>("open");
  const [space, setSpace] = useState<SetupSpace | null>(null);
  const [choice, setChoice] = useState<FirstEngentyChoice>(() => ({
    engenty: engentyFace("round"),
    job: SETUP_COPY[locale].engenty.defaultJob,
    name: SETUP_COPY[locale].engenty.defaultName,
  }));
  const [hired, setHired] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(false);
  // The platform's defaults: Auto, and a browser that asks first.
  const [rules, setRules] = useState<SpaceWorkRules>({
    approvalMode: "auto",
    browser: { autostart: false, unattended: false },
  });
  const [picked, setPicked] = useState<AppCardId | null>(null);
  /** The apps the space got; null until the apps screen is done. */
  const [added, setAdded] = useState<string[] | null>(null);
  const [copilot, setCopilot] = useState<SetupStory["copilot"]>("idle");
  /** The copilot's face as built today; the person picks their own. */
  const [look, setLook] = useState<AgentEngentyKind>("round");

  useEffect(() => {
    let live = true;
    Promise.all([api.readContext(), api.readCatalog()])
      .then(([nextContext, nextCatalog]) => {
        if (!live) {
          return;
        }
        setContext(nextContext);
        setCatalog(nextCatalog);
        // The first card this installation offers is the default.
        setPicked(offeredCards(nextCatalog)[0]?.id ?? null);
        // The team's name is the first space's name until the person says otherwise.
        if (nextContext.tenant.name !== PLACEHOLDER_TENANT_NAME) {
          setSpaceName(nextContext.tenant.name);
        }
      })
      .catch((err) => {
        if (live) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      live = false;
    };
  }, [api]);

  // The copilot's conversation opens while the person answers its question.
  const copilotOpened = useRef(false);
  useEffect(() => {
    if (copilotOpened.current || !context) {
      return;
    }
    copilotOpened.current = true;
    setCopilot("starting");
    api
      .openCopilot(locale)
      .then(() => setCopilot("ready"))
      .catch(() => setCopilot("failed"));
  }, [api, context, locale]);

  const opens = (target: TenantStage): boolean =>
    ORDER.indexOf(target) <= furthest && !(target === "engenty" && hired);

  // The screen the URL asks for, or the nearest one before it that opens.
  const asked = params.get("step");
  let stage: TenantStage = "copilot";
  for (const candidate of ORDER.slice(
    0,
    (isTenantStage(asked) ? ORDER.indexOf(asked) : 0) + 1
  )) {
    if (opens(candidate)) {
      stage = candidate;
    }
  }

  const go = (next: TenantStage, replace = false) => {
    setFurthest((value) => Math.max(value, ORDER.indexOf(next)));
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        updated.set("step", next);
        return updated;
      },
      { replace }
    );
  };

  // A URL that asks for a screen that does not open yet shows the right one.
  useEffect(() => {
    if (asked !== null && asked !== stage) {
      setParams(
        (current) => {
          const updated = new URLSearchParams(current);
          updated.set("step", stage);
          return updated;
        },
        { replace: true }
      );
    }
  }, [asked, setParams, stage]);

  const engentyInStory =
    stage === "engenty" || hired
      ? { job: choice.job, kind: choice.engenty, name: hired ?? choice.name }
      : null;

  const appLabel = (id: string) =>
    copy.apps.items[id] ??
    catalog?.modules.find((m) => m.id === id)?.name ??
    id;
  const storyApps = catalog
    ? cardModules(picked, catalog).map((id) => ({ id, label: appLabel(id) }))
    : [];

  const story: SetupStory = {
    admin: context?.personName ?? "",
    appCard: picked,
    apps: storyApps,
    copilot,
    copilotLook: look,
    engenty: skipped ? null : engentyInStory,
    provider: "",
    space: spaceName,
    spaceLook,
    work: rules,
  };

  const screen: Record<TenantStage, { lead: string; title: string }> = {
    copilot: copy.copilot,
    space: copy.space,
    engenty: copy.engenty,
    setup: copy.setup,
    apps: copy.apps,
    ready: {
      lead: hired ? copy.ready.leadWith(hired) : copy.ready.leadWithout,
      title: copy.ready.titleFor(space?.name ?? spaceName),
    },
  };

  let body: ReactNode;
  if (loadError) {
    body = <ErrorLine message={loadError} />;
  } else if (!(context && catalog)) {
    body = <AnimatedLoaderIcon play="always" size="sm" />;
  } else if (stage === "copilot") {
    body = (
      <CopilotStep
        copy={copy.copilot}
        look={look}
        onLookChange={setLook}
        save={async () => {
          await api.saveCopilotLook(look);
          if (choice.engenty === look) {
            setChoice({ ...choice, engenty: engentyFace(look) });
          }
          go("space");
        }}
      />
    );
  } else if (stage === "space") {
    body = (
      <SpaceStep
        api={api}
        catalog={catalog}
        copy={copy.space}
        fallback={copy.scene.spaceFallback}
        look={spaceLook}
        name={spaceName}
        onComplete={(next) => {
          setSpace(next);
          go(hired ? "setup" : "engenty");
        }}
        onLookChange={setSpaceLook}
        onNameChange={setSpaceName}
        onVisibilityChange={setVisibility}
        userId={context.userId}
        visibility={visibility}
      />
    );
  } else if (stage === "engenty" && space) {
    body = (
      <EngentyStep
        choice={choice}
        copilotLook={look}
        copy={copy.engenty}
        hire={async () => {
          const result = await api.hireEngenty({
            choice,
            language: locale,
            space,
          });
          setHired(result.name);
          setSkipped(false);
          // The engenty screen closes behind it: back skips to the space.
          go("setup", true);
        }}
        onChange={setChoice}
        onSkip={() => {
          setSkipped(true);
          go("setup");
        }}
      />
    );
  } else if (stage === "setup" && space) {
    body = (
      <WorkStep
        copy={copy.setup}
        onChange={setRules}
        rules={rules}
        save={async () => {
          await api.saveWorkRules({ rules, space });
          go("apps");
        }}
      />
    );
  } else if (stage === "apps" && space) {
    const finish = async (modules: string[]) => {
      if (modules.length > 0) {
        await api.addApps({ modules, space });
      }
      await api.finish(locale);
      setAdded(modules);
      go("ready");
    };
    body = (
      <AppsStep
        add={finish}
        catalog={catalog}
        color={spaceLook.color}
        copy={copy.apps}
        onPickedChange={setPicked}
        onSkip={() => {
          setPicked(null);
          return finish([]);
        }}
        picked={picked}
      />
    );
  } else if (stage === "ready" && space) {
    body = (
      <ReadyStep
        apps={(added ?? [])
          .filter((id) => copy.apps.items[id] !== undefined)
          .map(appLabel)}
        copilot={copilot}
        copy={copy.ready}
        engenty={hired}
        onOpen={onComplete}
        space={space}
      />
    );
  }

  return (
    <SetupFrame
      lead={screen[stage].lead}
      locale={locale}
      onLocaleChange={stage === "ready" ? undefined : setLocale}
      onStep={(target) => go(target as TenantStage)}
      opens={(target) => isTenantStage(target) && opens(target)}
      stage={stage}
      story={story}
      title={screen[stage].title}
      toolbar={toolbar}
    >
      {body}
    </SetupFrame>
  );
}
