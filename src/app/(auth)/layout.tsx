import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { redirectIfSignedIn } from "@/server/session";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  await redirectIfSignedIn();
  const t = await getTranslations("common");
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-4 py-4 sm:px-8">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">B</span>
          <span className="font-semibold tracking-tight">{t("appName")}</span>
        </div>
        <LocaleSwitcher />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-16">{children}</main>
    </div>
  );
}
