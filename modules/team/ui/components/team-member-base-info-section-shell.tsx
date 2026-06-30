export function TeamMemberBaseInfoSectionShell({
  children,
  t,
}: {
  children: React.ReactNode;
  t: (key: string) => string;
}) {
  return (
    <section className="space-y-2">
      <h2 className="font-medium text-lg">{t("baseInfo")}</h2>
      <p className="text-muted-foreground text-sm">
        {t("baseInfoDescription")}
      </p>
      {children}
    </section>
  );
}
