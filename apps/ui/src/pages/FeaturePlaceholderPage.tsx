import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@engenty/ui-core";

interface FeaturePlaceholderPageProps {
  description: string;
  title: string;
}

export function FeaturePlaceholderPage({
  title,
  description,
}: FeaturePlaceholderPageProps) {
  return (
    <section className="p-page">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            This view is a layout placeholder so navigation mirrors the target
            admin UI.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
