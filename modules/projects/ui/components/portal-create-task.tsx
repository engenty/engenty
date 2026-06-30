import { useTranslation } from "@engenty/i18n/ui";
import { Button, Input, Label } from "@engenty/ui-core";
import { ArrowLeft } from "lucide-react";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPortalRequest } from "../api.js";

interface PortalCreateTaskProps {
  projectId: string;
}

export function PortalCreateTask({ projectId }: PortalCreateTaskProps) {
  const { t } = useTranslation("projects");
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!title.trim() || loading) {
        return;
      }
      setLoading(true);
      setError(null);
      try {
        await createPortalRequest(projectId, {
          title: title.trim(),
          content: content.trim() || undefined,
        });
        navigate(`/portal/${projectId}`);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to create request"
        );
      } finally {
        setLoading(false);
      }
    },
    [projectId, title, content, loading, navigate]
  );

  return (
    <div className="space-y-4">
      <Button
        onClick={() => navigate(`/portal/${projectId}`)}
        size="sm"
        variant="ghost"
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        {t("portal.back")}
      </Button>
      <div className="mx-auto max-w-md rounded-lg border bg-card p-6">
        <h2 className="font-semibold text-lg">{t("portal.newRequest")}</h2>
        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <div>
            <Label htmlFor="portal-request-title">
              {t("portal.requestTitle")}
            </Label>
            <Input
              className="mt-1"
              id="portal-request-title"
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("portal.requestTitlePlaceholder")}
              required
              value={title}
            />
          </div>
          <div>
            <Label htmlFor="portal-request-content">
              {t("portal.requestContent")}
            </Label>
            <Input
              className="mt-1"
              id="portal-request-content"
              onChange={(e) => setContent(e.target.value)}
              placeholder={t("portal.requestContentPlaceholder")}
              value={content}
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <Button className="w-full" disabled={loading} type="submit">
            {loading ? t("portal.submitting") : t("portal.submit")}
          </Button>
        </form>
      </div>
    </div>
  );
}
