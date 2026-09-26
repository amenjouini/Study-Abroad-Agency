import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { MessageForm } from "@/components/post-form";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { caseAccessWhere } from "@/server/authz";
import { getThread } from "@/server/messaging";
import { requireArea } from "@/server/session";

export const metadata: Metadata = { title: "Messages" };

export default async function StaffMessages({ searchParams }: { searchParams: Promise<{ case?: string }> }) {
  const user = await requireArea("staff");
  const locale = await getLocale();
  const t = await getTranslations("staff.messages");
  const sp = await searchParams;
  const where = await caseAccessWhere(user, "messages.read");
  const threads = await db.case.findMany({
    where: { AND: [where, { messages: { some: {} } }] },
    include: { student: true, messages: { orderBy: { createdAt: "desc" }, take: 1 }, _count: { select: { messages: { where: { readAt: null, senderId: { not: user.id } } } } } },
    take: 50,
  });
  threads.sort((a, b) => +b.messages[0].createdAt - +a.messages[0].createdAt);
  const selectedId = sp.case ?? threads[0]?.id;
  const selected = threads.find((c) => c.id === selectedId) ?? (selectedId ? await db.case.findFirst({ where: { AND: [where, { id: selectedId }] }, include: { student: true, messages: { take: 1 }, _count: { select: { messages: true } } } }) : null);
  const thread = selected ? await getThread(user, selected.id) : [];

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      {threads.length === 0 && !selected ? (
        <EmptyState title={t("none")} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {threads.map((c) => (
              <li key={c.id}>
                <Link href={`/staff/messages?case=${c.id}`} className={`block px-4 py-3 text-sm hover:bg-muted/50 ${c.id === selected?.id ? "bg-accent" : ""}`}>
                  <span className="flex items-center justify-between gap-2 font-medium">
                    {c.student.firstName} {c.student.lastName}
                    {c._count.messages > 0 ? <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{c._count.messages}</span> : null}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{c.messages[0].body}</span>
                </Link>
              </li>
            ))}
          </ul>
          {selected ? (
            <div>
              <p className="mb-3 text-sm">
                <Link className="font-medium text-primary hover:underline" href={`/staff/students/${selected.id}`}>{selected.student.firstName} {selected.student.lastName}</Link>
              </p>
              <div className="mb-4 space-y-3">
                {thread.map((m) => (
                  <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.mine ? "bg-primary text-primary-foreground" : "border border-border bg-card"}`}>
                      {!m.mine ? <p className="mb-0.5 text-xs font-medium text-muted-foreground">{m.senderName}</p> : null}
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      {m.attachments.map((a) => (a.isDocumentRef ? <p key={a.id} className="mt-1 text-xs opacity-80">📄 {a.filename}</p> : <a key={a.id} href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer" className="mt-1 block text-xs underline">📎 {a.filename}</a>))}
                      <p className={`mt-1 text-[10px] ${m.mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{formatDateTime(m.createdAt, locale)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <MessageForm caseId={selected.id} placeholder={t("placeholder")} sendLabel={t("send")} attachLabel={t("attach")} />
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
