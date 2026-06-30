import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@engenty/ui-core";
import { Eye, EyeOff, GripVertical, Minus } from "lucide-react";
import type { ProjectTab, ProjectTabMeta } from "../hooks/use-project-tabs.js";

interface ProjectTabsConfigDialogProps {
  /** Native + contributed tabs currently resolvable for this project. */
  availableTabs: ProjectTabMeta[];
  enabledTabs: ProjectTab[];
  onClose: () => void;
  onTabsChange: (tabs: ProjectTab[]) => void;
  open: boolean;
}

function tabLabel(tab: ProjectTabMeta, t: (key: string) => string) {
  return tab.label ?? (tab.labelKey ? t(tab.labelKey) : tab.id);
}

interface SortableTabItemProps {
  onToggle: () => void;
  t: (key: string) => string;
  tab: ProjectTabMeta;
}

function SortableTabItem({ tab, onToggle, t }: SortableTabItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.id, disabled: tab.required });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      className="group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50"
      ref={setNodeRef}
      style={style}
    >
      <div className="text-muted-foreground/30">
        {tab.required ? (
          <Minus className="h-4 w-4" />
        ) : (
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab touch-none active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </div>
        )}
      </div>
      <span className="flex-1 text-sm">{tabLabel(tab, t)}</span>
      {!tab.required && (
        <button
          aria-label={t("detail.tabs.hideTab")}
          className="text-muted-foreground transition-colors hover:text-foreground"
          onClick={onToggle}
          title={t("detail.tabs.hideTab")}
          type="button"
        >
          <Eye className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function ProjectTabsConfigDialog({
  open,
  onClose,
  availableTabs,
  enabledTabs,
  onTabsChange,
}: ProjectTabsConfigDialogProps) {
  const { t } = useTranslation("projects");

  const requiredTabs = availableTabs.filter((tab) => tab.required);
  const optionalEnabled = enabledTabs.filter(
    (id) => !availableTabs.find((tab) => tab.id === id)?.required
  );
  const enabledTabsList = [
    ...requiredTabs,
    ...optionalEnabled
      .map((id) => availableTabs.find((t) => t.id === id))
      .filter((t): t is NonNullable<typeof t> => Boolean(t)),
  ];
  const disabledTabsList = availableTabs.filter(
    (tab) => !(enabledTabs.includes(tab.id) || tab.required)
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const oldIdx = optionalEnabled.indexOf(active.id as ProjectTab);
    const newIdx = optionalEnabled.indexOf(over.id as ProjectTab);
    if (oldIdx === -1 || newIdx === -1) {
      return;
    }
    const next = [...optionalEnabled];
    next.splice(oldIdx, 1);
    next.splice(newIdx, 0, active.id as ProjectTab);
    onTabsChange([...requiredTabs.map((t) => t.id), ...next]);
  };

  const handleToggle = (tabId: ProjectTab) => {
    const tab = availableTabs.find((item) => item.id === tabId);
    if (tab?.required) {
      return;
    }

    if (enabledTabs.includes(tabId)) {
      onTabsChange(enabledTabs.filter((id) => id !== tabId));
    } else {
      onTabsChange([...enabledTabs, tabId]);
    }
  };

  const handleShowAll = () => {
    onTabsChange(availableTabs.map((tab) => tab.id));
  };

  const handleHideAll = () => {
    onTabsChange(availableTabs.filter((t) => t.required).map((t) => t.id));
  };

  return (
    <Dialog onOpenChange={(o) => !o && onClose()} open={open}>
      <DialogContent className="max-w-[280px]">
        <DialogHeader>
          <DialogTitle>{t("detail.tabs.configure")}</DialogTitle>
        </DialogHeader>

        {/* Displayed Tabs Section */}
        <div className="py-1.5">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-medium text-muted-foreground text-xs">
              {t("detail.tabs.displayed")}
            </p>
            {enabledTabsList.length > 1 && (
              <button
                className="text-primary text-xs hover:underline"
                onClick={handleHideAll}
                type="button"
              >
                {t("detail.tabs.hideAll")}
              </button>
            )}
          </div>
          <DndContext
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleDragEnd}
            sensors={sensors}
          >
            <SortableContext
              items={enabledTabsList.map((tab) => tab.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-0.5">
                {enabledTabsList.map((tab) => (
                  <SortableTabItem
                    key={tab.id}
                    onToggle={() => handleToggle(tab.id)}
                    t={t}
                    tab={tab}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        {/* Hidden Tabs Section */}
        {disabledTabsList.length > 0 && (
          <>
            <div className="border-t" />
            <div className="py-1.5">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-medium text-muted-foreground text-xs">
                  {t("detail.tabs.hidden")}
                </p>
                <button
                  className="text-primary text-xs hover:underline"
                  onClick={handleShowAll}
                  type="button"
                >
                  {t("detail.tabs.showAll")}
                </button>
              </div>
              <div className="space-y-0.5">
                {disabledTabsList.map((tab) => (
                  <div
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50"
                    key={tab.id}
                  >
                    <div className="text-muted-foreground/30">
                      <Minus className="h-4 w-4" />
                    </div>
                    <span className="flex-1 text-sm">{tabLabel(tab, t)}</span>
                    <button
                      aria-label={t("detail.tabs.showTab")}
                      className="text-muted-foreground transition-colors hover:text-foreground"
                      onClick={() => handleToggle(tab.id)}
                      title={t("detail.tabs.showTab")}
                      type="button"
                    >
                      <EyeOff className="h-4 w-4 opacity-50" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
