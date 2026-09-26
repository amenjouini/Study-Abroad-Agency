"use client";

import { CheckCircle2, FileUp, Info, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { EnumBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card } from "@/components/ui/primitives";
import { formatDate, formatDateTime } from "@/lib/format";
import type { DocumentCard } from "@/server/documents-queries";

/** One requirement instance as the student sees it: what, why, status, and the action to take. */
export function DocumentCardView({ card, maxMb, locale }: { card: DocumentCard; maxMb: number; locale: string }) {
  const t = useTranslations("student.documents");
  const te = useTranslations("enums");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const canUpload =
    card.kind === "DOCUMENT" && ["NOT_STARTED", "REQUESTED", "UPLOADED", "UNDER_REVIEW", "REJECTED", "NEEDS_CORRECTION", "EXPIRED"].includes(card.status);
  const hasVersion = card.versions.length > 0;

  async function send(file: File) {
    setBusy(true);
    setMessage(null);
    const body = new FormData();
    body.set("instanceId", card.id);
    body.set("file", file);
    try {
      const res = await fetch("/api/documents/upload", { method: "POST", body });
      if (res.ok) {
        setMessage({ tone: "success", text: t("uploaded") });
        router.refresh();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        setMessage({ tone: "danger", text: data.error === "validation" || data.error === "conflict" ? (data.message ?? t("uploadFailed")) : t("uploadFailed") });
      }
    } catch {
      setMessage({ tone: "danger", text: t("uploadFailed") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{card.name}</h3>
          {!card.mandatory ? <Badge className="mt-1">{t("optional")}</Badge> : null}
        </div>
        <EnumBadge enumName="RequirementStatus" value={card.status} />
      </div>

      {card.why ? (
        <p className="mt-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{t("why")}</span> {card.why}
        </p>
      ) : null}
      {card.deadline ? <p className="mt-1 text-xs text-muted-foreground">{t("deadline", { date: formatDate(card.deadline, locale) })}</p> : null}

      {card.requiredFormalities.length > 0 ? (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            {t("formalities")}: {card.requiredFormalities.map((f) => te(`Formality.${f}` as never)).join(", ")}
          </span>
        </p>
      ) : null}

      {card.calc ? <CalcBlock card={card} locale={locale} /> : null}

      {card.status === "REQUIRES_HUMAN_REVIEW" ? <Alert tone="info" className="mt-3">{t("humanReview")}</Alert> : null}

      {(card.status === "REJECTED" || card.status === "NEEDS_CORRECTION") && card.rejectionReason ? (
        <Alert tone="danger" title={t("correction")} className="mt-3">
          {t("reasonLabel")}: “{card.rejectionReason}”
        </Alert>
      ) : null}

      {card.blockedBy.length > 0 && card.kind === "DOCUMENT" ? (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-warning">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {t("needsFirst", { names: card.blockedBy.join(", ") })}
        </p>
      ) : null}

      {card.status === "APPROVED" && card.kind === "DOCUMENT" ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-success">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          {t("approvedNote")}
        </p>
      ) : null}

      {canUpload ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void send(f);
          }}
          className={`mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-dashed px-3 py-2 text-sm ${drag ? "border-primary bg-accent" : "border-input"}`}
        >
          <FileUp className="h-4 w-4 text-muted-foreground" aria-hidden />
          <p className="sr-only">{t("dropHere")}</p>
          <input
            ref={input}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            className="sr-only"
            aria-label={card.name}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void send(f);
              e.target.value = "";
            }}
          />
          <Button size="sm" variant={hasVersion ? "outline" : "default"} disabled={busy} onClick={() => input.current?.click()}>
            {busy ? t("uploading") : hasVersion ? t("uploadNew") : t("upload")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("accepted", { max: maxMb })} · {t("dropHint")}</p>
        </div>
      ) : null}

      {message ? (
        <Alert tone={message.tone} className="mt-3">
          {message.text}
        </Alert>
      ) : null}

      {hasVersion ? (
        <div className="mt-3 border-t border-border pt-2">
          <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setShowHistory((v) => !v)}>
            {t("history")} ({card.versions.length})
          </button>
          {showHistory ? (
            <ul className="mt-2 space-y-1.5">
              {card.versions.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span>
                    {t("version", { n: v.number })} · {formatDateTime(v.uploadedAt, locale)} · <EnumBadge enumName="DocumentVersionStatus" value={v.status} />
                    {v.reason ? <span className="block text-muted-foreground">{v.reason}</span> : null}
                  </span>
                  <a className="text-primary hover:underline" href={`/api/documents/${v.id}`} target="_blank" rel="noreferrer">
                    {t("view")}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function CalcBlock({ card, locale }: { card: DocumentCard; locale: string }) {
  const t = useTranslations("student.documents");
  const calc = card.calc!;
  if (calc.type === "passport" && calc.passport) {
    const p = calc.passport;
    return (
      <div className="mt-3 rounded-md bg-muted/60 p-3 text-sm">
        {p.requiredAfter ? (
          <p>{t("passportRule", { months: p.months, date: formatDate(p.requiredAfter, locale) })}</p>
        ) : (
          <p>{t("passportNoReference")}</p>
        )}
        {p.expiry ? <p className="mt-1 text-muted-foreground">{t("passportExpiry", { date: formatDate(p.expiry, locale) })}</p> : <p className="mt-1 text-warning">{t("passportMissing")}</p>}
        {p.referenceSource === "EFFECTIVE_APPOINTMENT_DEADLINE" ? <p className="mt-1 text-xs text-muted-foreground">{t("passportAssumed", { date: formatDate(p.referenceDate, locale) })}</p> : null}
        {calc.ok === false ? <p className="mt-1 font-medium text-danger">{t("passportFail")}</p> : null}
        {calc.ok === true ? <p className="mt-1 font-medium text-success">{t("passportOk")}</p> : null}
      </div>
    );
  }
  if (calc.type === "funding" && calc.funding) {
    const f = calc.funding;
    return (
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 rounded-md bg-muted/60 p-3 text-sm">
        <dt className="text-muted-foreground">{t("fundingRequired")}</dt>
        <dd className="text-end tabular-nums">{f.required}</dd>
        <dt className="text-muted-foreground">{t("fundingAvailable")}</dt>
        <dd className="text-end tabular-nums">{f.available}</dd>
        <dt className="font-medium">{t("fundingShortfall")}</dt>
        <dd className={`text-end font-medium tabular-nums ${calc.ok ? "text-success" : "text-danger"}`}>{f.shortfall}</dd>
        <dt className="text-muted-foreground">{t("fundingSurplus")}</dt>
        <dd className="text-end tabular-nums">{f.surplus}</dd>
      </dl>
    );
  }
  return null;
}
