import { getTranslations } from "next-intl/server";
import { EmptyState, PageHeader } from "@/components/ui/primitives";

/** Honest placeholder for a screen that is not built yet (no fake data, no dead buttons). */
export async function NotYetAvailable({ area, navKey }: { area: "student" | "staff" | "admin"; navKey: string }) {
  const t = await getTranslations(`nav.${area}`);
  const tc = await getTranslations("common");
  return (
    <>
      <PageHeader title={t(navKey as never)} />
      <EmptyState title={tc("notAvailable")} />
    </>
  );
}
