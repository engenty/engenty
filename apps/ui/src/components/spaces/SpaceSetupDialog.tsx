import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@engenty/ui-core";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Space } from "@/lib/api/spaces-client";
import { spaceAgentDeskPath, spaceRootPath } from "@/lib/space-routes";
import {
  useSaveSpaceSetupMutation,
  useSpaceSetupCatalogQuery,
} from "@/lib/spaces-queries";
import {
  SpaceAgentHireFields,
  useSpaceAgentHireForm,
} from "./SpaceAgentHireForm";
import {
  pickRandomSpaceColor,
  type SpaceAppearanceValue,
} from "./SpaceAppearanceFields";
import { SpaceBasicsStep } from "./SpaceBasicsStep";
import { SpaceCreateProgress } from "./SpaceCreateProgress";
import {
  SpaceCreateModulesStep,
  SpaceCreateOptionalStep,
} from "./SpaceCreateResourceSteps";
import { SpaceCreateReviewStep } from "./SpaceCreateReviewStep";
import { firstEngentyDraft } from "./space-agent-hire";
import {
  isModuleSkill,
  syncSpaceSkills,
} from "./space-capability-recommendations";
import {
  applyRecommendedModules,
  initialWizardSelection,
  nextWizardStep,
  optionalCount,
  previousWizardStep,
  type SpaceCreateStep,
  templateDefaultVisibility,
  templateRecommendationKeys,
} from "./space-create-wizard-state";
import { useSpaceMountCatalog } from "./space-mount-catalog";
import {
  closeModuleDependencies,
  moduleRequiresFromItems,
  type SpaceSelection,
  selectionToPayload,
  spaceKeyFromName,
} from "./space-setup-selection";

const NO_MOUNTS: never[] = [];
const NO_TEMPLATES: never[] = [];

export function SpaceSetupDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const catalogQuery = useSpaceSetupCatalogQuery(open);
  const catalog = useSpaceMountCatalog(NO_MOUNTS, open);
  const save = useSaveSpaceSetupMutation();
  const [step, setStep] = useState<SpaceCreateStep>("basics");
  /** Set once review created the space; the engenty step hires into it. */
  const [created, setCreated] = useState<Space | null>(null);
  const [name, setName] = useState("");
  const [appearance, setAppearance] = useState<SpaceAppearanceValue>({
    color: null,
    icon: null,
  });
  const [visibility, setVisibility] = useState<"open" | "private">("open");
  const [templateId, setTemplateId] = useState("client");
  const [selection, setSelection] = useState<SpaceSelection>(new Map());
  const [initialised, setInitialised] = useState(false);
  const appliedRecommendedRef = useRef<ReadonlySet<string>>(new Set());

  const baseline = useMemo(
    () => catalogQuery.data?.baseline ?? [],
    [catalogQuery.data?.baseline]
  );
  const templates = catalogQuery.data?.templates ?? NO_TEMPLATES;
  const template =
    templates.find((candidate) => candidate.id === templateId) ?? null;
  const firstEngenty = useMemo(
    () => (created ? firstEngentyDraft(created.name, template) : null),
    [created, template]
  );
  const hire = useSpaceAgentHireForm({
    active: created !== null,
    initial: firstEngenty,
    spaceId: created?.id ?? "",
  });
  const recommendedKeys = useMemo(
    () => templateRecommendationKeys(templateId, template?.featuredMountKeys),
    [template?.featuredMountKeys, templateId]
  );
  const agentCatalogFingerprint = catalog.agents
    .map((agent) => agent.id)
    .sort()
    .join("\0");
  const skillCatalogFingerprint = catalog.skills
    .map((skill) => skill.id)
    .sort()
    .join("\0");
  const catalogModuleIds = useMemo(
    () => new Set(catalog.modules.map((module) => module.id)),
    [catalog.modules]
  );

  const moduleRequires = useMemo(
    () => moduleRequiresFromItems(catalog.modules),
    [catalog.modules]
  );
  // A committed set is always closed over module dependencies: the picker
  // ticks them along, and a template's featured list is closed here in case
  // it names a module without the one it requires.
  const commitSelection = (next: SpaceSelection) => {
    setSelection(
      syncSpaceSkills(
        closeModuleDependencies(next, moduleRequires),
        catalog.skills,
        catalogModuleIds
      )
    );
  };

  const applyTemplateToSelection = (
    previous: SpaceSelection,
    nextTemplateId: string,
    featuredMountKeys?: readonly string[]
  ): SpaceSelection => {
    const applied = applyRecommendedModules(
      previous,
      templateRecommendationKeys(nextTemplateId, featuredMountKeys),
      appliedRecommendedRef.current
    );
    appliedRecommendedRef.current = applied.applied;
    return syncSpaceSkills(
      closeModuleDependencies(applied.selection, moduleRequires),
      catalog.skills,
      catalogModuleIds
    );
  };

  useEffect(() => {
    if (!open) {
      appliedRecommendedRef.current = new Set();
      setInitialised(false);
      setCreated(null);
      return;
    }
    if (initialised || baseline.length === 0) {
      return;
    }
    setStep("basics");
    setName("");
    setAppearance({ color: pickRandomSpaceColor(), icon: null });
    setVisibility("open");
    setTemplateId("client");
    const applied = applyRecommendedModules(
      initialWizardSelection(baseline),
      templateRecommendationKeys(
        "client",
        templates.find((candidate) => candidate.id === "client")
          ?.featuredMountKeys
      ),
      new Set()
    );
    appliedRecommendedRef.current = applied.applied;
    setSelection(
      syncSpaceSkills(
        closeModuleDependencies(applied.selection, moduleRequires),
        catalog.skills,
        catalogModuleIds
      )
    );
    setInitialised(true);
  }, [
    baseline,
    catalog.agents,
    catalog.skills,
    catalogModuleIds,
    initialised,
    moduleRequires,
    open,
    templates,
  ]);

  useEffect(() => {
    if (!(open && initialised)) {
      return;
    }
    setSelection((previous) =>
      applyTemplateToSelection(
        previous,
        templateId,
        template?.featuredMountKeys
      )
    );
  }, [
    agentCatalogFingerprint,
    catalog.agents,
    catalog.skills,
    catalogModuleIds,
    initialised,
    open,
    skillCatalogFingerprint,
  ]);

  const derivedKey = spaceKeyFromName(name);
  const loading = catalogQuery.isPending || catalog.isPending || !initialised;
  const isReview = step === "review";
  const isBasics = step === "basics";
  const isEngenty = step === "engenty";

  // Leaving the engenty step by any door lands in the new space: it exists
  // whether or not its first engenty was hired.
  const closeInto = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };
  const handleOpenChange = (next: boolean) => {
    if (!next && created) {
      closeInto(spaceRootPath(created.key));
      return;
    }
    onOpenChange(next);
  };
  const hireFirstEngenty = async () => {
    if (!created) {
      return;
    }
    const agentId = await hire.submit();
    if (agentId) {
      closeInto(spaceAgentDeskPath(created.key, agentId));
    }
  };
  const optionalIsEmpty =
    optionalCount(selection, baseline, "connection") === 0 &&
    ![...selection.values()].some(
      (entry) =>
        entry.resourceType === "skill" &&
        !isModuleSkill({ id: entry.resourceKey }, catalogModuleIds)
    );
  const error =
    save.error instanceof Error
      ? save.error.message
      : catalogQuery.error instanceof Error
        ? catalogQuery.error.message
        : null;

  const renderStep = () => {
    switch (step) {
      case "basics":
        return (
          <SpaceBasicsStep
            appearance={appearance}
            derivedKey={derivedKey}
            name={name}
            onAppearanceChange={setAppearance}
            onNameChange={setName}
            onTemplateChange={(nextTemplate) => {
              const outgoingKeys = templateRecommendationKeys(
                templateId,
                template?.featuredMountKeys
              );
              const featuredMountKeys = templates.find(
                (candidate) => candidate.id === nextTemplate
              )?.featuredMountKeys;
              setTemplateId(nextTemplate);
              setVisibility(templateDefaultVisibility(nextTemplate));
              setSelection((previous) => {
                // Replace this template's featured set even if init never
                // recorded it on the ref (catalog/init race).
                appliedRecommendedRef.current = outgoingKeys;
                return applyTemplateToSelection(
                  previous,
                  nextTemplate,
                  featuredMountKeys
                );
              });
            }}
            onVisibilityChange={setVisibility}
            templateId={templateId}
            templates={templates}
            visibility={visibility}
          />
        );
      case "modules":
        return (
          <SpaceCreateModulesStep
            baseline={baseline}
            catalog={catalog}
            onSelectionChange={commitSelection}
            recommendedKeys={recommendedKeys}
            selection={selection}
          />
        );
      case "capabilities":
        return (
          <SpaceCreateOptionalStep
            catalog={catalog}
            onSelectionChange={commitSelection}
            selection={selection}
          />
        );
      case "review":
        return (
          <SpaceCreateReviewStep
            baseline={baseline}
            catalog={catalog}
            name={name.trim()}
            selection={selection}
            visibility={visibility}
          />
        );
      case "engenty":
        return created ? (
          <div className="mx-auto max-w-lg py-2">
            <SpaceAgentHireFields form={hire} />
          </div>
        ) : null;
      default:
        return null;
    }
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="flex h-[min(90vh,42rem)] flex-col overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t("spaces.setup.createTitle")}</DialogTitle>
          <DialogDescription>
            {t(`spaces.createWizard.stepHints.${step}`)}
          </DialogDescription>
        </DialogHeader>
        <SpaceCreateProgress
          current={step}
          locked={created !== null}
          onSelect={setStep}
        />

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex items-center gap-2 py-12 text-muted-foreground text-sm">
              <Spinner className="size-4" />
              {t("spaces.setup.loadingCatalog")}
            </div>
          ) : (
            renderStep()
          )}
        </div>

        {error ? <p className="text-destructive text-xs">{error}</p> : null}
        <DialogFooter className="justify-between sm:justify-between">
          {isEngenty ? (
            <>
              <Button
                disabled={hire.isPending}
                onClick={() => created && closeInto(spaceRootPath(created.key))}
                type="button"
                variant="outline"
              >
                {t("spaces.createWizard.skipHire")}
              </Button>
              <Button
                disabled={!hire.canSubmit || hire.isPending}
                onClick={() => void hireFirstEngenty()}
                type="button"
              >
                {hire.isPending
                  ? t("spaces.createWizard.hiring")
                  : t("spaces.createWizard.hireAction")}
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={() =>
                  isBasics
                    ? onOpenChange(false)
                    : setStep(previousWizardStep(step))
                }
                type="button"
                variant="outline"
              >
                {isBasics ? t("actions.cancel") : t("actions.back")}
              </Button>
              <Button
                disabled={
                  loading ||
                  save.isPending ||
                  (isBasics && !(name.trim() && derivedKey))
                }
                onClick={() => {
                  if (!isReview) {
                    setStep(nextWizardStep(step));
                    return;
                  }
                  save.mutate(
                    {
                      color: appearance.color,
                      icon: appearance.icon,
                      key: derivedKey,
                      mounts: selectionToPayload(selection),
                      name: name.trim(),
                      visibility,
                    },
                    {
                      onSuccess: (result) => {
                        setCreated(result.space);
                        setStep("engenty");
                      },
                    }
                  );
                }}
                type="button"
              >
                {save.isPending
                  ? t("saving")
                  : isReview
                    ? t("spaces.setup.createAction")
                    : step === "capabilities" && optionalIsEmpty
                      ? t("spaces.createWizard.skip")
                      : t("actions.continue")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
