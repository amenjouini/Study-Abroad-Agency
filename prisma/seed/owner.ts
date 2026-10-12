/**
 * Production bootstrap: if OWNER_EMAIL and OWNER_PASSWORD are set and no account with that e-mail exists,
 * create the OWNER account. This is how a fresh deployment (SEED_DEMO=false, no demo accounts) gets its
 * first login, without any password ever being hard-coded.
 */
import { hashPassword } from "better-auth/crypto";
import type { PrismaClient } from "../../src/generated/prisma/client";

export async function seedOwnerFromEnv(db: PrismaClient): Promise<void> {
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
  const password = process.env.OWNER_PASSWORD;
  if (!email || !password) return;
  if (password.length < 10) throw new Error("OWNER_PASSWORD must be at least 10 characters");
  if (await db.user.findUnique({ where: { email } })) {
    console.log(`Owner account ${email} already exists — skipping.`);
    return;
  }
  const role = await db.role.findUniqueOrThrow({ where: { key: "OWNER" } });
  const user = await db.user.create({
    data: { email, name: process.env.OWNER_NAME?.trim() || "Owner", emailVerified: true, roleId: role.id, locale: "fr", active: true },
  });
  await db.account.create({ data: { accountId: user.id, providerId: "credential", userId: user.id, password: await hashPassword(password) } });
  console.log(`Owner account created: ${email}`);
}
