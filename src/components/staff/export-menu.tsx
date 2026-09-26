import { Download } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EXPORT_KINDS } from "@/server/exports";

/** CSV exports, scoped server-side to the cases the user can access. */
export async function ExportMenu() {
  const t = await getTranslations("staff.exports");
  return (
    <details className="relative">
      <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-2 rounded-md border border-input bg-card px-3 text-sm hover:bg-muted">
        <Download className="h-4 w-4" aria-hidden />
        {t("title")}
      </summary>
      <ul className="absolute end-0 z-30 mt-2 w-56 rounded-lg border border-border bg-card p-1 shadow-lg">
        {EXPORT_KINDS.map((k) => (
          <li key={k}>
            <a href={`/api/export/${k}`} className="block rounded px-3 py-1.5 text-sm hover:bg-muted">
              {t(k)}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
