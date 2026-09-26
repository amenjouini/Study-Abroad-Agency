import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { UnauthenticatedError } from "@/lib/errors";
import type { RoleKey } from "@/lib/permissions";
import { auth } from "@/server/auth";
import { isStaffLike, type AuthUser } from "@/server/authz";

/** Resolve the signed-in user from the database session. Inactive accounts are treated as signed out. */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { role: { select: { key: true } }, student: { select: { id: true } } },
  });
  if (!user || !user.active) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roleKey: user.role.key as RoleKey,
    locale: user.locale,
    studentId: user.student?.id ?? null,
  };
});

/** For server actions / route handlers: throws if not signed in. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthenticatedError();
  return user;
}

export function homeFor(user: AuthUser): string {
  if (user.roleKey === "STUDENT") return "/student/dashboard";
  if (user.roleKey === "STAFF") return "/staff/dashboard";
  return "/admin/dashboard";
}

/** For layouts/pages: redirects to /login when signed out, and away from areas the role may not enter. */
export async function requireArea(area: "student" | "staff" | "admin"): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const ok =
    area === "student"
      ? user.roleKey === "STUDENT"
      : area === "staff"
        ? isStaffLike(user)
        : user.roleKey === "ADMIN" || user.roleKey === "OWNER";
  if (!ok) redirect(homeFor(user));
  return user;
}

/** For the login/register pages: signed-in users go straight to their area. */
export async function redirectIfSignedIn(): Promise<void> {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user));
}
