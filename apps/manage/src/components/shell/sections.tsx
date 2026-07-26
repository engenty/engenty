import type { NavigationSection } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  BrainCircuit,
  KeyRound,
  LayoutGrid,
  Package,
  Puzzle,
  Satellite as SatelliteIcon,
  ScrollText,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  ToggleRight,
  Users,
} from "lucide-react";

export function useManageSections(): NavigationSection[] {
  const { t } = useTranslation("common");
  return [
    {
      label: t("sidebar.sectionManage"),
      items: [
        { icon: LayoutGrid, label: t("navigation.tenants"), to: "/tenants" },
        { icon: Users, label: t("navigation.users"), to: "/users" },
        { icon: Puzzle, label: t("navigation.modules"), to: "/modules" },
        {
          icon: ToggleRight,
          label: t("navigation.featureFlags"),
          to: "/feature-flags",
        },
        { icon: Package, label: t("navigation.packages"), to: "/packages" },
        {
          icon: SatelliteIcon,
          label: t("navigation.satellites"),
          to: "/satellites",
        },
      ],
    },
    {
      label: t("sidebar.sectionObservability"),
      items: [
        { icon: ScrollText, label: t("navigation.logs"), to: "/logs" },
        { icon: ShieldCheck, label: t("navigation.audit"), to: "/audit" },
        {
          icon: ShieldAlert,
          label: t("navigation.approvals"),
          to: "/approvals",
        },
      ],
    },
    {
      label: t("sidebar.sectionPlatform"),
      items: [
        {
          icon: SlidersHorizontal,
          label: t("navigation.settings"),
          to: "/settings",
          children: [
            {
              to: "/settings/environment",
              label: t("settings.environment.menuLabel"),
              icon: Server,
            },
            {
              to: "/settings/setup",
              label: t("settings.setup.menuLabel"),
              icon: KeyRound,
            },
          ],
        },
        {
          icon: Search,
          label: t("navigation.searchIndex"),
          to: "/search-index",
        },
        {
          icon: BrainCircuit,
          label: t("navigation.aiModels"),
          to: "/ai-models",
        },
      ],
    },
  ];
}
