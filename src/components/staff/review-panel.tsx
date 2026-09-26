"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useActionRunner } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { reviewAction, startReviewAction } from "@/app/staff/actions";

const FORMALITIES = ["originalPresented", "signed", "stamped", "translated", "legalized", "apostilled"] as const;

/** Approve, reject (reason required), request replacement, comment; formalities are tracked per version. */
export function ReviewPanel({
  versionId,
  versionStatus,
  instanceId,
  requiredFormalities,
  current,
  nextHref,
  canApprove,
}: {
  versionId: string;
  versionStatus: string;
  instanceId: string;
  requiredFormalities: string[];
  current: Record<string, boolean>;
  nextHref: string;
  canApprove: boolean;
}) {
  const t = useTranslations("staff.review");
  const te = useTranslations("enums");
  const router = useRouter();
  const { run, pending, error } = useActionRunner();
  const [formalities, setFormalities] = useState<Record<string, boolean>>(current);
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [internal, setInternal] = useState(true);
  const superseded = versionStatus === "SUPERSEDED";

  const submit = (decision: "APPROVE" | "REJECT" | "REQUEST_REPLACEMENT" | "COMMENT") =>
    run(
      () => reviewAction({ versionId, decision, reason: reason || undefined, comment: comment || undefined, internal: decision === "COMMENT" ? internal : undefined, formalities }),
      () => {
        setReason("");
        setComment("");
        if (decision === "COMMENT") router.refresh();
        else router.push(nextHref);
      },
    );

  return (
    <div className="space-y-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <fieldset>
        <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("formalities")}</legend>
        <div className="grid grid-cols-2 gap-1.5">
          {FORMALITIES.map((f) => (
            <label key={f} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!formalities[f]} onChange={(e) => setFormalities({ ...formalities, [f]: e.target.checked })} className="accent-[var(--primary)]" />
              <span className={requiredFormalities.includes(f) ? "font-medium" : ""}>
                {te(`Formality.${f}`)}
                {requiredFormalities.includes(f) ? " *" : ""}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {versionStatus === "UPLOADED" ? (
        <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => startReviewAction(instanceId), () => router.refresh())}>
          {t("takeForReview")}
        </Button>
      ) : null}

      <div>
        <label htmlFor="reason" className="mb-1 block text-xs font-medium">
          {t("reason")}
        </label>
        <Textarea id="reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPlaceholder")} />
      </div>
      <div className="grid grid-cols-1 gap-2">
        <Button variant="success" disabled={pending || superseded || !canApprove} onClick={() => submit("APPROVE")}>
          {t("approve")}
        </Button>
        <Button variant="danger" disabled={pending || superseded || reason.trim().length < 3} onClick={() => submit("REJECT")}>
          {t("reject")}
        </Button>
        <Button variant="outline" disabled={pending || superseded || reason.trim().length < 3} onClick={() => submit("REQUEST_REPLACEMENT")}>
          {t("requestReplacement")}
        </Button>
      </div>

      <div className="border-t border-border pt-3">
        <label htmlFor="comment" className="mb-1 block text-xs font-medium">
          {t("comment")}
        </label>
        <Textarea id="comment" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
        <div className="mt-2 flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="accent-[var(--primary)]" />
            {t("internalOnly")}
          </label>
          <Button size="sm" variant="secondary" disabled={pending || !comment.trim()} onClick={() => submit("COMMENT")}>
            {t("addComment")}
          </Button>
        </div>
      </div>
    </div>
  );
}
