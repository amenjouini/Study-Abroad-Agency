"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { assignPlanAction } from "@/app/staff/actions";
import { useActionRunner } from "@/components/forms";
import { Button } from "@/components/ui/button";

export function AssignPlanButton({ caseId }: { caseId: string }) {
  const t = useTranslations("staff.case");
  const router = useRouter();
  const { run, pending, error } = useActionRunner();
  return (
    <div>
      {error ? <p className="mb-2 text-xs text-danger">{error}</p> : null}
      <Button size="sm" disabled={pending} onClick={() => run(() => assignPlanAction(caseId), () => router.refresh())}>
        {t("assignPlan")}
      </Button>
    </div>
  );
}
