"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";
import { db } from "@/lib/db";
import { CodedError } from "@/lib/errors";
import { isLocale, LOCALE_COOKIE, type AppLocale } from "@/i18n/config";
import { loginSchema, registerSchema } from "@/lib/validation/auth";
import { getRequestIp, runAction, type ActionResult } from "@/server/action";
import { writeAudit } from "@/server/audit";
import { auth } from "@/server/auth";
import { createCaseForStudent } from "@/server/cases";
import { rateLimit } from "@/server/rate-limit";
import { getCurrentUser } from "@/server/session";

async function setLocaleCookie(locale: AppLocale) {
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: false });
}

export async function loginAction(input: unknown): Promise<ActionResult<{ next: string }>> {
  const result = await runAction(async () => {
    const data = loginSchema.parse(input);
    const ip = (await getRequestIp()) ?? "unknown";
    // Server-side calls bypass the HTTP rate limiter, so limit here as well.
    await rateLimit(`login:ip:${ip}`, { limit: 30, windowSeconds: 60 });
    await rateLimit(`login:acct:${data.email}:${ip}`, { limit: 5, windowSeconds: 60 });
    try {
      await auth.api.signInEmail({ body: { email: data.email, password: data.password }, headers: await headers() });
    } catch (e) {
      if (e instanceof APIError) {
        await writeAudit({ action: "auth.login_failed", entity: "User", ip, metadata: { email: data.email } });
        throw new CodedError("invalid_credentials", "Invalid e-mail or password");
      }
      throw e;
    }
    const user = await db.user.findUnique({ where: { email: data.email }, include: { role: true } });
    if (!user) throw new CodedError("invalid_credentials", "Invalid e-mail or password");
    await setLocaleCookie(user.locale);
    const next = user.role.key === "STUDENT" ? "/student/dashboard" : user.role.key === "STAFF" ? "/staff/dashboard" : "/admin/dashboard";
    return { next };
  });
  return result;
}

export async function registerAction(input: unknown): Promise<ActionResult<{ next: string }>> {
  const result = await runAction(async () => {
    const data = registerSchema.parse(input);
    const ip = (await getRequestIp()) ?? "unknown";
    await rateLimit(`register:ip:${ip}`, { limit: 5, windowSeconds: 300 });

    let userId: string;
    try {
      const res = await auth.api.signUpEmail({
        body: { email: data.email, password: data.password, name: `${data.firstName} ${data.lastName}` },
        headers: await headers(),
      });
      userId = res.user.id;
    } catch (e) {
      if (e instanceof APIError) throw new CodedError("email_taken", "An account with this e-mail already exists");
      throw e;
    }

    try {
      await db.$transaction(async (tx) => {
        await tx.user.update({ where: { id: userId }, data: { locale: data.locale, phone: data.phone ?? null } });
        const student = await tx.student.create({
          data: { userId, firstName: data.firstName, lastName: data.lastName, phone: data.phone ?? null },
        });
        await tx.consent.createMany({
          data: ["PRIVACY_POLICY", "DATA_PROCESSING"].map((type) => ({
            userId,
            type,
            policyVersion: process.env.POLICY_VERSION ?? "2026-09",
            ipAddress: ip === "unknown" ? null : ip,
          })),
        });
        await createCaseForStudent(tx, student.id, { actorId: userId });
        await writeAudit({ userId, action: "auth.register", entity: "User", entityId: userId, ip }, tx);
      });
    } catch (e) {
      // Do not leave an account without a student record behind
      await db.user.delete({ where: { id: userId } }).catch(() => undefined);
      throw e;
    }
    await setLocaleCookie(data.locale);
    return { next: "/student/onboarding" };
  });
  return result;
}

export async function logoutAction(): Promise<void> {
  const user = await getCurrentUser();
  if (user) await writeAudit({ userId: user.id, action: "auth.logout", entity: "User", entityId: user.id, ip: await getRequestIp() });
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}

export async function setLocaleAction(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  await setLocaleCookie(locale);
  const user = await getCurrentUser();
  if (user) await db.user.update({ where: { id: user.id }, data: { locale } });
}
