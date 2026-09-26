import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { createStaffAction } from "@/app/admin/actions";
import { ActiveToggle, PermissionEditor, type PermissionRow } from "@/components/admin/admin-widgets";
import { ConfigForm } from "@/components/config-form";
import { Badge, Card, CardBody, CardHeader, CardTitle, PageHeader } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { OWNER_ONLY_KEYS, PERMISSIONS } from "@/lib/permissions";
import { requirePermission } from "@/server/authz";
import { requireArea } from "@/server/session";

export const metadata: Metadata = { title: "Staff" };

export default async function AdminStaff() {
  const user = await requireArea("admin");
  await requirePermission(user, "staff.manage");
  const t = await getTranslations("admin.staff");
  const users = await db.user.findMany({
    where: { role: { key: { in: ["OWNER", "ADMIN", "STAFF"] } } },
    include: { role: { include: { permissions: { include: { permission: true } } } }, extraPerms: { include: { permission: true } }, _count: { select: { assignments: { where: { active: true } } } } },
    orderBy: [{ role: { key: "asc" } }, { name: "asc" }],
  });
  const catalog = PERMISSIONS.filter((p) => !p.key.startsWith("self.") && !OWNER_ONLY_KEYS.has(p.key));

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Card className="mb-6">
        <CardHeader><CardTitle>{t("add")}</CardTitle></CardHeader>
        <CardBody>
          <ConfigForm
            action={createStaffAction}
            submitLabel={t("create")}
            resetOnSuccess
            initial={{ name: "", email: "", password: "", role: "STAFF", title: "" }}
            fields={[
              { name: "name", label: t("name"), type: "text", required: true },
              { name: "email", label: t("email"), type: "email", required: true },
              { name: "password", label: t("password"), type: "text", required: true, hint: t("passwordHint") },
              { name: "title", label: t("jobTitle"), type: "text" },
              { name: "role", label: t("role"), type: "select", required: true, options: [{ value: "STAFF", label: "STAFF" }, ...(user.roleKey === "OWNER" ? [{ value: "ADMIN", label: "ADMIN" }] : [])] },
            ]}
          />
        </CardBody>
      </Card>
      <div className="space-y-3">
        {users.map((u) => {
          const rolePerms = new Set(u.role.permissions.map((rp) => rp.permission.key));
          const rows: PermissionRow[] = catalog.map((p) => {
            const extra = u.extraPerms.find((e) => e.permission.key === p.key);
            return { key: p.key, area: p.area, description: p.description, fromRole: rolePerms.has(p.key), state: !extra ? "inherit" : !extra.granted ? "revoke" : extra.allCases ? "grant_all" : "grant" };
          });
          const protectedTarget = u.role.key === "OWNER" ? user.roleKey !== "OWNER" : u.role.key === "ADMIN" ? user.roleKey !== "OWNER" : false;
          return (
            <Card key={u.id}>
              <CardBody>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{u.name} {!u.active ? <Badge tone="danger">{t("inactive")}</Badge> : null}</p>
                    <p className="text-xs text-muted-foreground">{u.email} · {u.role.key} · {t("cases", { n: u._count.assignments })}</p>
                  </div>
                  <ActiveToggle userId={u.id} active={u.active} disabled={protectedTarget || u.id === user.id} />
                </div>
                {u.role.key === "STAFF" ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-primary">{t("permissions")}</summary>
                    <PermissionEditor userId={u.id} rows={rows} editable={!protectedTarget} />
                  </details>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">{t("fullAccess")}</p>
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>
    </>
  );
}
