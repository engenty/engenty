import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex flex-col justify-center text-center flex-1 gap-2 px-4">
      <h1 className="text-2xl font-bold">Engenty documentation</h1>
      <p className="text-fd-muted-foreground max-w-md mx-auto">
        Developer guides for the monorepo: plugins, sync, security, UI patterns,
        and architecture.
      </p>
      <p>
        <Link href="/docs" className="font-medium text-fd-primary underline">
          Browse the docs
        </Link>
      </p>
    </div>
  );
}
