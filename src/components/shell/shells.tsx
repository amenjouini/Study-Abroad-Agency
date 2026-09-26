import { LogOut } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { logoutAction } from "@/app/(auth)/actions";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notification-bell";
import { Badge } from "@/components/ui/primitives";
import type { AuthUser } from "@/server/authz";
import { BottomNav, SideNav, type NavItem } from "./nav-items";

function Brand({ href }: { href: string }) {
  return (
    <Link href={href} className="flex items-center gap-2">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">B</span>
      <span className="font-semibold tracking-tight">Bon Ita</span>
    </Link>
  );
}

function LogoutButton({ label }: { label: string }) {
  return (
    <form action={logoutAction}>
      <Button type="submit" variant="ghost" size="sm" aria-label={label} title={label}>
        <LogOut className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">{label}</span>
      </Button>
    </form>
  );
}

/** Student space: mobile-first, bottom tab bar on phones, sidebar on larger screens. */
export async function StudentShell({ user, children }: { user: AuthUser; children: React.ReactNode }) {
  const t = await getTranslations("nav.student");
  const tc = await getTranslations("common");
  const all: NavItem[] = [
    { href: "/student/dashboard", label: t("dashboard"), icon: "home" },
    { href: "/student/documents", label: t("documents"), icon: "documents" },
    { href: "/student/payments", label: t("payments"), icon: "payments" },
    { href: "/student/appointments", label: t("appointments"), icon: "appointments" },
    { href: "/student/applications", label: t("applications"), icon: "applications" },
    { href: "/student/scholarships", label: t("scholarships"), icon: "scholarships" },
    { href: "/student/visa", label: t("visa"), icon: "visa" },
    { href: "/student/messages", label: t("messages"), icon: "messages" },
    { href: "/student/case", label: t("case"), icon: "case" },
    { href: "/student/profile", label: t("profile"), icon: "profile" },
    { href: "/student/help", label: t("help"), icon: "help" },
  ];
  const bottom = all.filter((i) => ["/student/dashboard", "/student/documents", "/student/payments", "/student/messages", "/student/help"].includes(i.href));
  return (
    <div className="min-h-dvh md:flex">
      <aside className="hidden w-60 shrink-0 flex-col gap-4 border-e border-border bg-card p-4 md:flex">
        <Brand href="/student/dashboard" />
        <SideNav items={all} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-border bg-card/95 px-4 py-2.5 backdrop-blur">
          <div className="md:hidden">
            <Brand href="/student/dashboard" />
          </div>
          <div className="hidden text-sm text-muted-foreground md:block">{tc("welcome", { name: user.name.split(" ")[0] })}</div>
          <div className="flex items-center gap-2">
            <NotificationBell user={user} />
            <LocaleSwitcher />
            <LogoutButton label={tc("logout")} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-24 pt-5 md:pb-10">{children}</main>
        <BottomNav items={bottom} />
      </div>
    </div>
  );
}

/** Staff and admin: desktop-first with a sidebar and a search box, responsive down to tablets. */
export async function StaffShell({
  user,
  area,
  children,
}: {
  user: AuthUser;
  area: "staff" | "admin";
  children: React.ReactNode;
}) {
  const t = await getTranslations(`nav.${area}`);
  const ts = await getTranslations("nav.sections");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");

  const groups: Array<{ title: string; items: NavItem[] }> =
    area === "staff"
      ? [
          {
            title: ts("work"),
            items: [
              { href: "/staff/dashboard", label: t("dashboard"), icon: "dashboard" },
              { href: "/staff/students", label: t("students"), icon: "students" },
              { href: "/staff/documents", label: t("documents"), icon: "documents" },
              { href: "/staff/payments", label: t("payments"), icon: "payments" },
              { href: "/staff/appointments", label: t("appointments"), icon: "appointments" },
              { href: "/staff/tasks", label: t("tasks"), icon: "tasks" },
              { href: "/staff/messages", label: t("messages"), icon: "messages" },
            ],
          },
        ]
      : [
          {
            title: ts("work"),
            items: [
              { href: "/admin/dashboard", label: t("dashboard"), icon: "dashboard" },
              { href: "/admin/students", label: t("students"), icon: "students" },
              { href: "/admin/leads", label: t("leads"), icon: "leads" },
              { href: "/admin/documents", label: t("documents"), icon: "documents" },
              { href: "/admin/payments", label: t("payments"), icon: "payments" },
              { href: "/admin/appointments", label: t("appointments"), icon: "appointments" },
            ],
          },
          {
            title: ts("agency"),
            items: [
              { href: "/admin/staff", label: t("staff"), icon: "staff" },
              { href: "/admin/universities", label: t("universities"), icon: "universities" },
              { href: "/admin/programs", label: t("programs"), icon: "programs" },
              { href: "/admin/scholarships", label: t("scholarships"), icon: "scholarships" },
              { href: "/admin/knowledge-base", label: t("knowledgeBase"), icon: "knowledgeBase" },
            ],
          },
          {
            title: ts("configuration"),
            items: [
              { href: "/admin/procedures", label: t("procedures"), icon: "procedures" },
              { href: "/admin/document-rules", label: t("documentRules"), icon: "documentRules" },
              { href: "/admin/settings", label: t("settings"), icon: "settings" },
              { href: "/admin/audit-logs", label: t("auditLogs"), icon: "audit" },
            ],
          },
        ];

  const home = `/${area}/dashboard`;
  return (
    <div className="min-h-dvh lg:flex">
      <aside className="hidden w-64 shrink-0 flex-col gap-5 border-e border-border bg-card p-4 lg:flex">
        <Brand href={home} />
        {groups.map((g) => (
          <div key={g.title}>
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.title}</p>
            <SideNav items={g.items} />
          </div>
        ))}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-card/95 px-4 py-2.5 backdrop-blur">
          <div className="lg:hidden">
            <Brand href={home} />
          </div>
          <form action={`/${area}/students`} className="ms-auto max-w-md flex-1 lg:ms-0">
            <input
              type="search"
              name="q"
              placeholder={tn("search")}
              aria-label={tc("search")}
              className="h-9 w-full rounded-md border border-input bg-muted/40 px-3 text-sm"
            />
          </form>
          <div className="flex items-center gap-2">
            <Badge tone={area === "admin" ? "primary" : "neutral"}>{user.roleKey}</Badge>
            <span className="hidden text-sm sm:inline">{user.name}</span>
            <NotificationBell user={user} />
            <LocaleSwitcher />
            <LogoutButton label={tc("logout")} />
          </div>
        </header>
        {/* Collapsed navigation for narrower screens */}
        <nav className="flex gap-1 overflow-x-auto border-b border-border bg-card px-3 py-1.5 lg:hidden" aria-label="Sections">
          {groups.flatMap((g) => g.items).map((item) => (
            <Link key={item.href} href={item.href} className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted">
              {item.label}
            </Link>
          ))}
        </nav>
        <main className="flex-1 px-4 py-5 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
