// Pairing claim page: a messenger user got a pairing link (…/pair?code=XYZ)
// from the bot; after signing in here they confirm the link and the external
// identity is bound to their engenty account (remote_pairing_claim).
import { requestApiJson } from "@engenty/api-client";
import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery } from "@engenty/query-client";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@engenty/ui-core";
import { CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

type RemotePlatform = "slack" | "telegram" | "whatsapp" | "teams";

interface PairingInfo {
  request: {
    claimed: boolean;
    display_name: string | null;
    expired: boolean;
    platform: RemotePlatform;
  } | null;
}

async function invokeOp<T>(operationId: string, input: unknown): Promise<T> {
  const result = await requestApiJson<{ data?: T } & Record<string, unknown>>(
    `/api/tools/${operationId}/invoke`,
    { body: { input }, method: "POST" }
  );
  return (result.data ?? result) as T;
}

export function RemotePairPage() {
  const { t } = useTranslation("engenty-remote");
  const [searchParams] = useSearchParams();
  const code = searchParams.get("code")?.trim() ?? "";

  const infoQuery = useQuery({
    enabled: code.length > 0,
    queryFn: () => invokeOp<PairingInfo>("remote_pairing_info", { code }),
    queryKey: ["engenty-remote", "pairing", code],
  });

  const claim = useMutation({
    mutationFn: () => invokeOp("remote_pairing_claim", { code }),
  });

  const request = infoQuery.data?.request ?? null;
  const platformLabel = request ? t(`platform.${request.platform}`) : "";

  let body: ReactNode;
  if (!code) {
    body = <StatusNote text={t("pair.missingCode")} />;
  } else if (infoQuery.isPending) {
    body = <StatusNote text={t("pair.loading")} />;
  } else if (infoQuery.isError) {
    body = <StatusNote text={t("pair.loadError")} />;
  } else if (!request) {
    body = <StatusNote text={t("pair.unknownCode")} />;
  } else if (claim.isSuccess) {
    body = (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <CheckCircle2 className="size-10 text-emerald-500" />
        <p className="font-medium text-sm">{t("pair.successTitle")}</p>
        <p className="text-muted-foreground text-sm">
          {t("pair.successBody", { platform: platformLabel })}
        </p>
      </div>
    );
  } else if (request.claimed) {
    body = <StatusNote text={t("pair.alreadyClaimed")} />;
  } else if (request.expired) {
    body = <StatusNote text={t("pair.expired")} />;
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <p className="text-sm">
          {t("pair.prompt", {
            name: request.display_name ?? t("pair.unknownSender"),
            platform: platformLabel,
          })}
        </p>
        {claim.isError ? (
          <p className="text-destructive text-sm">{t("pair.claimError")}</p>
        ) : null}
        <Button
          className="self-start"
          disabled={claim.isPending}
          onClick={() => claim.mutate()}
        >
          {t("pair.confirm")}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col px-4 py-12 sm:px-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("pair.title")}</CardTitle>
          <CardDescription>{t("pair.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>{body}</CardContent>
      </Card>
    </div>
  );
}

function StatusNote({ text }: { text: string }) {
  return <p className="text-muted-foreground text-sm">{text}</p>;
}
