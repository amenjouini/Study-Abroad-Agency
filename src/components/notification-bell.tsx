import { Bell } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { markAllReadAction } from "@/app/notifications/actions";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import type { AuthUser } from "@/server/authz";

/** In-app notifications: unread badge and the latest entries, translated per type in the user's language. */
export async function NotificationBell({ user }: { user: AuthUser }) {
  const locale = await getLocale();
  const t = await getTranslations("notifications");
  const tc = await getTranslations("common");
  const [items, unread] = await Promise.all([
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 8 }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  const text = (n: (typeof items)[number]) => {
    const data = (n.data && typeof n.data === "object" && !Array.isArray(n.data) ? n.data : {}) as Record<string, string | number>;
    const params = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, k === "startsAt" ? formatDateTime(String(v), locale) : v]));
    return t.has(`types.${n.type}` as never) ? t(`types.${n.type}` as never, params as never) : n.title;
  };
  return (
    <details className="relative">
      <summary className="relative grid h-9 w-9 cursor-pointer list-none place-items-center rounded-md hover:bg-muted" aria-label={tc("notifications")}>
        <Bell className="h-4 w-4" aria-hidden />
        {unread > 0 ? <span className="absolute -end-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">{unread > 9 ? "9+" : unread}</span> : null}
      </summary>
      <div className="absolute end-0 z-40 mt-2 w-80 max-w-[90vw] rounded-lg border border-border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-semibold">{tc("notifications")}</p>
          {unread > 0 ? (
            <form action={markAllReadAction}>
              <button type="submit" className="text-xs text-primary hover:underline">{tc("markAllRead")}</button>
            </form>
          ) : null}
        </div>
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">{tc("noNotifications")}</p>
        ) : (
          <ul className="max-h-96 divide-y divide-border overflow-y-auto">
            {items.map((n) => {
              const inner = (
                <>
                  <span className={`block text-sm ${n.readAt ? "" : "font-medium"}`}>{text(n)}</span>
                  <span className="block text-xs text-muted-foreground">{formatDateTime(n.createdAt, locale)}</span>
                </>
              );
              return (
                <li key={n.id} className={n.readAt ? "" : "bg-accent/40"}>
                  {n.link ? <Link href={n.link} className="block px-3 py-2 hover:bg-muted/50">{inner}</Link> : <div className="px-3 py-2">{inner}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </details>
  );
}
