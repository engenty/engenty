import { HomeLayout } from "fumadocs-ui/layouts/home";
import HomePage from "@/app/(home)/page";
import { baseOptions } from "@/lib/layout.shared";

/** The dev gateway only forwards `/docs/*` to this app, so `/docs` shows the lobby too. */
export default function DocsIndexPage() {
  return (
    <HomeLayout {...baseOptions()}>
      <HomePage />
    </HomeLayout>
  );
}
