import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import { writeAudit } from "@/server/audit";

const isProd = process.env.NODE_ENV === "production";

/**
 * Better Auth: e-mail + password, database sessions, secure HTTP-only cookies.
 * Every new account is a STUDENT; staff/admin roles are only ever assigned by server code (never by client input).
 */
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  trustedOrigins: [process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    autoSignIn: true,
    requireEmailVerification: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  user: {
    additionalFields: {
      roleId: { type: "string", required: false, input: false },
      locale: { type: "string", required: false, input: false, defaultValue: "fr" },
      phone: { type: "string", required: false, input: false },
      active: { type: "boolean", required: false, input: false, defaultValue: true },
    },
  },
  advanced: {
    cookiePrefix: "bonita",
    useSecureCookies: isProd,
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: isProd },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    modelName: "rateLimit",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 300, max: 5 },
      "/forget-password": { window: 300, max: 3 },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const student = await db.role.findUnique({ where: { key: "STUDENT" } });
          if (!student) throw new Error("Roles are not seeded (run `npm run db:seed`)");
          return { data: { ...user, roleId: student.id } };
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          const user = await db.user.findUnique({ where: { id: session.userId }, select: { active: true } });
          if (!user?.active) return false;
          return { data: session };
        },
        after: async (session) => {
          await writeAudit({
            userId: session.userId,
            action: "auth.login",
            entity: "User",
            entityId: session.userId,
            ip: session.ipAddress ?? null,
          });
        },
      },
    },
  },
  plugins: [nextCookies()],
});
