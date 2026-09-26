import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { MessageForm } from "@/components/post-form";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/format";
import { ownCaseId } from "@/server/case-access";
import { getThread } from "@/server/messaging";
import { requireArea } from "@/server/session";

export const metadata: Metadata = { title: "Messages" };

export default async function StudentMessages() {
  const user = await requireArea("student");
  const locale = await getLocale();
  const t = await getTranslations("student.messages");
  const thread = await getThread(user, await ownCaseId(user));
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("title")} description={t("description")} />
      <div className="mb-4 space-y-3">
        {thread.length === 0 ? (
          <EmptyState title={t("empty")} />
        ) : (
          thread.map((m) => (
            <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.mine ? "bg-primary text-primary-foreground" : "border border-border bg-card"}`}>
                {!m.mine ? <p className="mb-0.5 text-xs font-medium text-muted-foreground">{m.senderName}</p> : null}
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                {m.attachments.map((a) =>
                  a.isDocumentRef ? (
                    <p key={a.id} className="mt-1 text-xs opacity-80">📄 {a.filename}</p>
                  ) : (
                    <a key={a.id} href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer" className="mt-1 block text-xs underline">
                      📎 {a.filename}
                    </a>
                  ),
                )}
                <p className={`mt-1 text-[10px] ${m.mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{formatDateTime(m.createdAt, locale)}</p>
              </div>
            </div>
          ))
        )}
      </div>
      <MessageForm placeholder={t("placeholder")} sendLabel={t("send")} attachLabel={t("attach")} />
    </div>
  );
}
