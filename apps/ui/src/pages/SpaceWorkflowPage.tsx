/**
 * `/s/<key>/workflows/<workflowId>[/runs/<runId>]` — a wizard, full screen.
 *
 * The page is the whole task: the shell drops its rail, sidebar and topbar
 * here (app-location-chrome), and what is left is one question at a time
 * and, once the run presents one, its artifact in the end pane. The address
 * is the wizard's: copy it, send it to a member of the space, and they walk
 * the same wizard as a run of their own.
 *
 * Without a run the page is page 0: the workflow's input, derived from its
 * schema; submitting starts the run and lands here with its id.
 */
import {
  inputSchemaIsEmpty,
  spaceWorkflowPath,
  spaceWorkflowRunPath,
  useWizardInputSchema,
  WIZARD_BAND_CREAM,
  WizardBackdrop,
  WizardBandEngenty,
  WizardRunner,
  WizardStart,
  wizardBand,
  wizardBandTokens,
} from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Link2, X } from "lucide-react";
import { type ReactNode, useCallback, useMemo } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { SpaceNavTile } from "@/components/spaces/SpaceNavHeader";
import { spaceRootPath } from "@/lib/space-routes";
import { useSpacesQuery } from "@/lib/spaces-queries";
import { useSpaceMentionRefSearch } from "@/lib/use-space-mention-ref-search";

/** Host key for the run's artifact pane — one pane per run, not per page. */
export function wizardArtifactPaneHostKey(runId: string): string {
  return `wizard:${runId}`;
}

/** A quiet control on the band: white, lighter on hover. */
const BAND_BUTTON_CLASSNAME =
  "text-white hover:bg-white/10 hover:text-white dark:hover:bg-white/10";

/**
 * The screen's frame: the wizard's band, a quiet bar on top, the step set on
 * the band below it.
 */
function WizardFrame({
  bar,
  children,
  color,
  seed,
}: {
  bar: ReactNode;
  children: ReactNode;
  color?: string | null;
  seed: string;
}) {
  const band = useMemo(() => wizardBand(seed, color), [color, seed]);
  return (
    <div className="relative isolate flex h-full min-h-0 flex-col">
      <WizardBackdrop band={band} className="-z-10" />
      <header className="flex h-14 shrink-0 items-center gap-2 px-4 text-white sm:px-6">
        {bar}
      </header>
      <main
        className="relative min-h-0 flex-1 overflow-y-auto"
        style={wizardBandTokens(band)}
      >
        <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center px-6 pt-4 pb-[12vh] sm:px-10">
          {children}
        </div>
      </main>
      <WizardBandEngenty
        band={band}
        className="absolute right-8 bottom-6 -z-10 hidden lg:flex"
      />
    </div>
  );
}

export function SpaceWorkflowPage() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const location = useLocation();
  const {
    runId = "",
    spaceKey = "",
    workflowId = "",
  } = useParams<{ runId?: string; spaceKey: string; workflowId: string }>();
  const spacesQuery = useSpacesQuery();
  const space = useMemo(
    () => spacesQuery.data?.find((candidate) => candidate.key === spaceKey),
    [spaceKey, spacesQuery.data]
  );
  const mentionRefSearch = useSpaceMentionRefSearch(space);
  const {
    loading: inputLoading,
    schema,
    title,
  } = useWizardInputSchema(workflowId);

  // The band runs under the artifact pane too: the shell paints nothing.
  usePageConfig({ contentStackBackground: "none" });

  const toPageZero = useCallback(
    () => navigate(spaceWorkflowPath(spaceKey, workflowId)),
    [navigate, spaceKey, workflowId]
  );
  // Back where the wizard was opened from; a link opened cold has no such
  // place, and lands on the space.
  const close = useCallback(() => {
    if (location.key === "default") {
      navigate(spaceRootPath(spaceKey));
      return;
    }
    navigate(-1);
  }, [location.key, navigate, spaceKey]);
  // The wizard's address, never the run's: whoever opens it starts their own.
  const copyLink = useCallback(() => {
    const href = new URL(
      spaceWorkflowPath(spaceKey, workflowId),
      window.location.origin
    ).href;
    void navigator.clipboard.writeText(href).then(
      () => toast.success(t("spaces.workflows.linkCopied")),
      () => toast.error(t("spaces.workflows.linkCopyFailed"))
    );
  }, [spaceKey, t, workflowId]);

  const closeButton = (
    <Button
      aria-label={t("spaces.workflows.close")}
      className={BAND_BUTTON_CLASSNAME}
      onClick={close}
      size="icon"
      type="button"
      variant="ghost"
    >
      <X aria-hidden className="size-4" />
    </Button>
  );

  if (spacesQuery.isSuccess && !space) {
    return (
      <WizardFrame
        bar={
          <>
            <span className="flex-1" />
            {closeButton}
          </>
        }
        seed={workflowId}
      >
        <div className="space-y-4" role="alert">
          <h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">
            {t("spaces.workflows.noAccess")}
          </h1>
          <p className="text-base text-muted-foreground">
            {t("spaces.workflows.noAccessBody")}
          </p>
        </div>
      </WizardFrame>
    );
  }

  if (!(space?.id && workflowId)) {
    return null;
  }

  return (
    <WizardFrame
      bar={
        <>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Link
              className="flex min-w-0 items-center gap-1.5 rounded-[6px] font-medium text-sm text-white hover:text-white/85"
              to={spaceRootPath(spaceKey)}
            >
              <SpaceNavTile
                color={space.color}
                icon={space.icon}
                name={space.name}
                size="sm"
              />
              <span className="truncate">{space.name}</span>
            </Link>
            {title ? (
              <>
                <span aria-hidden className="text-white/40">
                  /
                </span>
                <span
                  className="min-w-0 truncate text-sm"
                  style={{ color: WIZARD_BAND_CREAM }}
                >
                  {title}
                </span>
              </>
            ) : null}
          </div>
          <Button
            className={BAND_BUTTON_CLASSNAME}
            onClick={copyLink}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Link2 aria-hidden className="size-4 sm:mr-1.5" />
            <span className="sr-only sm:not-sr-only">
              {t("spaces.workflows.copyLink")}
            </span>
          </Button>
          {closeButton}
        </>
      }
      color={space.color}
      seed={workflowId}
    >
      {runId ? (
        <WizardRunner
          artifactPaneHostKey={wizardArtifactPaneHostKey(runId)}
          key={runId}
          objectSearch={mentionRefSearch}
          onExit={close}
          onRestart={toPageZero}
          runId={runId}
          stepNumberOffset={inputLoading || inputSchemaIsEmpty(schema) ? 0 : 1}
        />
      ) : (
        <WizardStart
          key={workflowId}
          objectSearch={mentionRefSearch}
          onStarted={(run) =>
            navigate(spaceWorkflowRunPath(spaceKey, workflowId, run.run_id), {
              replace: true,
            })
          }
          spaceId={space.id}
          workflowId={workflowId}
        />
      )}
    </WizardFrame>
  );
}
