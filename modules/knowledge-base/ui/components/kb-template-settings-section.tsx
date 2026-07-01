import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  Button,
  SettingsFormSection,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@engenty/ui-core";
import { Edit, FileText, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { kbNewTemplatePath, kbTemplatePath } from "../kb-paths.js";
import { isKbTemplateRouteIdValid } from "../lib/kb-template-route-id.js";
import { kbTemplatesQueryOptions, useKbTemplateMutations } from "../queries.js";

export function KbTemplateSettingsSection({
  kbId,
  kbSlug,
}: {
  kbId: string;
  kbSlug: string;
}) {
  const { t } = useTranslation("kb");
  const { data: templates = [], isLoading } = useQuery(
    kbTemplatesQueryOptions(kbId)
  );
  const mutations = useKbTemplateMutations(kbId);

  return (
    <section className="scroll-mt-6" id="kb-article-templates">
      <SettingsFormSection
        cardVariant="compact"
        description={t("templates.settings_description")}
        title={t("templates.settings_title")}
      >
        <div className="flex flex-wrap items-center justify-end gap-2 pb-2">
          <Button asChild size="sm" variant="outline">
            <Link to={kbNewTemplatePath(kbSlug)}>
              <Plus className="mr-1.5 h-4 w-4" />
              {t("templates.new_template")}
            </Link>
          </Button>
        </div>

        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : templates.length === 0 ? (
          <div className="flex min-h-32 flex-col items-center justify-center gap-2 py-4 text-center">
            <FileText className="h-7 w-7 text-muted-foreground" />
            <div>
              <p className="font-medium text-sm">
                {t("templates.empty_title", "No templates yet")}
              </p>
              <p className="text-muted-foreground text-sm">
                {t(
                  "templates.empty_description",
                  "Create a property-focused template for article metadata extraction."
                )}
              </p>
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("templates.name")}</TableHead>
                <TableHead>{t("templates.properties")}</TableHead>
                <TableHead>{t("templates.content_structure")}</TableHead>
                <TableHead className="w-28 text-right">
                  {t("settings.kbs.column_actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates
                .filter((template) => isKbTemplateRouteIdValid(template.id))
                .map((template) => (
                  <TableRow key={template.id}>
                    <TableCell>
                      <Link
                        className="font-medium hover:underline"
                        to={kbTemplatePath(kbSlug, template.id)}
                      >
                        {template.name}
                      </Link>
                      {template.description ? (
                        <p className="line-clamp-1 text-muted-foreground text-xs">
                          {template.description}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {template.property_definitions.length}
                    </TableCell>
                    <TableCell>
                      {template.content_markdown?.trim() ||
                      template.content_json
                        ? t("templates.has_content", "Defined")
                        : t("templates.no_content", "None")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="icon" variant="ghost">
                        <Link to={kbTemplatePath(kbSlug, template.id)}>
                          <Edit className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        onClick={() =>
                          mutations.delete.mutate(template.id, {
                            onSuccess: () =>
                              toast.success(
                                t("templates.deleted", "Template deleted")
                              ),
                          })
                        }
                        size="icon"
                        variant="ghost"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}
      </SettingsFormSection>
    </section>
  );
}
