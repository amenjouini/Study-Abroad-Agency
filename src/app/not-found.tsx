import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations("common");
  return (
    <div className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <p className="text-5xl font-semibold text-primary">404</p>
        <p className="mt-2 text-sm text-muted-foreground">{t("pageNotFound")}</p>
        <Link href="/" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
          {t("back")}
        </Link>
      </div>
    </div>
  );
}
