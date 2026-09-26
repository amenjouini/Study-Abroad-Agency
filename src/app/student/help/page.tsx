import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Alert, PageHeader } from "@/components/ui/primitives";
import { requireArea } from "@/server/session";
import { HelpForm } from "./help-form";

export const metadata: Metadata = { title: "I need help" };

export default async function HelpPage() {
  await requireArea("student");
  const t = await getTranslations("student.help");
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={t("title")} description={t("description")} />
      <HelpForm />
      <Alert tone="info" className="mt-5">
        {t("note")}
      </Alert>
    </div>
  );
}
