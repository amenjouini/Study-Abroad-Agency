import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const t = await getTranslations("auth");
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{t("loginTitle")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("loginSubtitle")}</p>
      <div className="mt-6 rounded-lg border border-border bg-card p-5 shadow-sm">
        <LoginForm />
      </div>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        {t("noAccount")}{" "}
        <Link href="/register" className="font-medium text-primary hover:underline">
          {t("registerTitle")}
        </Link>
      </p>
      <p className="mt-2 text-center text-xs text-muted-foreground">{t("staffHint")}</p>
    </div>
  );
}
