"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useActionRunner } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { cancelAction } from "./actions";

export function CancelButton({ id }: { id: string }) {
  const t = useTranslations("student.appointments");
  const router = useRouter();
  const { run, pending } = useActionRunner();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (window.confirm(t("confirmCancel"))) run(() => cancelAction(id), () => router.refresh());
      }}
    >
      {t("cancel")}
    </Button>
  );
}
