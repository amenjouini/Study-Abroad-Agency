import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { RegisterForm } from "./register-form";

export default async function RegisterPage() {
  const t = await getTranslations("auth");
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{t("registerTitle")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("registerSubtitle")}</p>
      <div className="mt-6 rounded-lg border border-border bg-card p-5 shadow-sm">
        <RegisterForm />
      </div>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        {t("haveAccount")}{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          {t("loginTitle")}
        </Link>
      </p>
    </div>
  );
}
