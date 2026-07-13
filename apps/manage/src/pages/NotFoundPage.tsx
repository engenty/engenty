import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="p-page">
      <h1 className="font-semibold text-lg">Not found</h1>
      <Link className="text-link text-sm underline" to="/tenants">
        Back to tenants
      </Link>
    </div>
  );
}
