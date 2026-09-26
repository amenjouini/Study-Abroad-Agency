import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { TaskStatusButtons } from "@/app/staff/students/[id]/forms";
import { EnumBadge } from "@/components/status-badge";
import { EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { caseAccessWhere } from "@/server/authz";
import { requireArea } from "@/server/session";

export const metadata: Metadata = { title: "Tasks" };

export default async function StaffTasks({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const user = await requireArea("staff");
  const locale = await getLocale();
  const t = await getTranslations("staff.tasks");
  const sp = await searchParams;
  const mineOnly = user.roleKey === "STAFF" || sp.all !== "1";
  const tasks = await db.task.findMany({
    where: {
      status: { in: ["OPEN", "IN_PROGRESS"] },
      OR: [{ caseId: null }, { case: await caseAccessWhere(user, "tasks.manage") }],
      ...(mineOnly ? { assignee: { userId: user.id } } : {}),
    },
    orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
    include: { case: { include: { student: true } }, assignee: { include: { user: { select: { name: true } } } } },
  });
  return (
    <>
      <PageHeader title={t("title")} description={mineOnly ? t("mine") : t("all")} actions={user.roleKey !== "STAFF" ? <Link className="text-sm text-primary hover:underline" href={mineOnly ? "/staff/tasks?all=1" : "/staff/tasks"}>{mineOnly ? t("showAll") : t("showMine")}</Link> : undefined} />
      {tasks.length === 0 ? (
        <EmptyState title={t("none")} />
      ) : (
        <Table>
          <thead>
            <tr><Th>{t("task")}</Th><Th>{t("student")}</Th><Th>{t("assignee")}</Th><Th>{t("due")}</Th><Th>{t("priority")}</Th><Th /></tr>
          </thead>
          <tbody>
            {tasks.map((k) => (
              <tr key={k.id}>
                <Td className="font-medium">{k.title}</Td>
                <Td>{k.case ? <Link className="text-primary hover:underline" href={`/staff/students/${k.caseId}?tab=review`}>{k.case.student.firstName} {k.case.student.lastName}</Link> : "—"}</Td>
                <Td className="text-xs">{k.assignee?.user.name ?? "—"}</Td>
                <Td className="text-xs">{k.dueDate ? formatDate(k.dueDate, locale) : "—"}</Td>
                <Td><EnumBadge enumName="Priority" value={k.priority} /></Td>
                <Td><TaskStatusButtons id={k.id} status={k.status} /></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
