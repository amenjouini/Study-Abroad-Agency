import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { ForbiddenError } from "@/lib/errors";
import {
  decidePermission,
  OWNER_ONLY_KEYS,
  type PermissionDecisionInput,
  type RoleKey,
} from "@/lib/permissions";

/** The authenticated actor, as resolved server-side from the session. Never trust anything sent by the client. */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  roleKey: RoleKey;
  locale: "fr" | "en" | "ar" | "it";
  studentId: string | null;
}

export interface PermissionScope {
  caseId?: string;
}

export async function loadEffectivePermissions(
  userId: string,
  roleId: string,
  roleKey: RoleKey,
): Promise<{ effective: Set<string>; allCases: Set<string> }> {
  const [rolePerms, userPerms] = await Promise.all([
    db.rolePermission.findMany({ where: { roleId }, include: { permission: true } }),
    db.userPermission.findMany({ where: { userId }, include: { permission: true } }),
  ]);
  const effective = new Set(rolePerms.map((rp) => rp.permission.key));
  const allCases = new Set<string>();
  for (const up of userPerms) {
    if (up.granted) {
      effective.add(up.permission.key);
      if (up.allCases) allCases.add(up.permission.key);
    } else {
      effective.delete(up.permission.key);
    }
  }
  if (roleKey !== "OWNER") for (const k of OWNER_ONLY_KEYS) effective.delete(k);
  return { effective, allCases };
}

async function buildDecisionInput(user: AuthUser, key: string, scope?: PermissionScope): Promise<PermissionDecisionInput> {
  const row = await db.user.findUnique({ where: { id: user.id }, select: { roleId: true, active: true } });
  if (!row || !row.active) {
    return { roleKey: user.roleKey, effective: new Set(), allCasesKeys: new Set(), key };
  }
  const { effective, allCases } = await loadEffectivePermissions(user.id, row.roleId, user.roleKey);
  const input: PermissionDecisionInput = { roleKey: user.roleKey, effective, allCasesKeys: allCases, key };
  if (scope?.caseId) {
    let caseAssigned = false;
    let caseOwnedByUser = false;
    if (user.roleKey === "STUDENT") {
      caseOwnedByUser = !!(await db.case.findFirst({
        where: { id: scope.caseId, student: { userId: user.id } },
        select: { id: true },
      }));
    } else if (user.roleKey === "STAFF") {
      caseAssigned = !!(await db.caseAssignment.findFirst({
        where: { caseId: scope.caseId, userId: user.id, active: true },
        select: { id: true },
      }));
    }
    input.scope = { caseScoped: true, caseAssigned, caseOwnedByUser };
  }
  return input;
}

export async function hasPermission(user: AuthUser, key: string, scope?: PermissionScope): Promise<boolean> {
  return decidePermission(await buildDecisionInput(user, key, scope));
}

/**
 * The single server-side authorization entry point, e.g.
 *   await requirePermission(user, "documents.review", { caseId });
 * Throws ForbiddenError. Frontend checks are cosmetic only.
 */
export async function requirePermission(user: AuthUser, key: string, scope?: PermissionScope): Promise<void> {
  if (!(await hasPermission(user, key, scope))) throw new ForbiddenError(`Missing permission: ${key}`);
}

/**
 * Prisma `where` restricting cases to those the user may access for a permission.
 * Admin/owner: all. Staff: assigned cases, or all when the permission was granted for all cases. Student: own case.
 * Use this in EVERY list query so that a missing scope can never leak other students' data.
 */
export async function caseAccessWhere(user: AuthUser, key: string): Promise<Prisma.CaseWhereInput> {
  if (user.roleKey === "OWNER" || user.roleKey === "ADMIN") return {};
  if (user.roleKey === "STUDENT") return { student: { userId: user.id } };
  const input = await buildDecisionInput(user, key);
  if (!input.effective.has(key)) return { id: "__no_access__" };
  if (input.allCasesKeys.has(key)) return {};
  return { assignments: { some: { userId: user.id, active: true } } };
}

/** Case-level access check that also returns the case id of a student's own case (for /student routes). */
export async function requireStudentCase(user: AuthUser): Promise<{ caseId: string; studentId: string }> {
  if (user.roleKey !== "STUDENT" || !user.studentId) throw new ForbiddenError("Student account required");
  const c = await db.case.findFirst({
    where: { studentId: user.studentId, status: { not: "CLOSED" } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!c) throw new ForbiddenError("No active case");
  return { caseId: c.id, studentId: user.studentId };
}

export function isStaffLike(user: AuthUser): boolean {
  return user.roleKey === "OWNER" || user.roleKey === "ADMIN" || user.roleKey === "STAFF";
}

export function isAdmin(user: AuthUser): boolean {
  return user.roleKey === "OWNER" || user.roleKey === "ADMIN";
}
