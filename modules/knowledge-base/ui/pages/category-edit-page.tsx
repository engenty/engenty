/** Category edit route — `/mdl/knowledge-base/kb/:kbSlug/c/:catSlug/edit`. */

import { CategoryDetailPage } from "./category-detail.js";

export function CategoryEditPage() {
  return <CategoryDetailPage mode="edit" />;
}
