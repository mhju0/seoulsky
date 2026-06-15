import { redirect } from "next/navigation";

/**
 * `/diagnostics` is now the ground-station band of the single Descent page.
 * Keep the URL working as a deep link by redirecting to the merged page,
 * anchored at the diagnostics content (`#ground`, added in atmosphere/page.tsx).
 */
export default function DiagnosticsPage() {
  redirect("/atmosphere#ground");
}
