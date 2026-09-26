"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { registerSchema, type RegisterInput } from "@/lib/validation/auth";
import { registerAction } from "../actions";

export function RegisterForm() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const locale = useLocale() as RegisterInput["locale"];
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { firstName: "", lastName: "", email: "", phone: "", password: "", confirmPassword: "", locale, consent: undefined },
  });

  const fieldError = (name: keyof RegisterInput) => {
    const e = errors[name];
    if (!e) return undefined;
    return e.message === "passwords_mismatch" ? tc("errors.passwords_mismatch") : tc("errors.validation");
  };

  const onSubmit = handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const res = await registerAction({ ...values, locale });
      if (res.ok) {
        router.push(res.data.next);
        router.refresh();
      } else {
        setError(tc(`errors.${res.code}` as never));
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("firstName")} htmlFor="firstName" error={fieldError("firstName")}>
          <Input id="firstName" autoComplete="given-name" aria-invalid={!!errors.firstName} {...register("firstName")} />
        </Field>
        <Field label={t("lastName")} htmlFor="lastName" error={fieldError("lastName")}>
          <Input id="lastName" autoComplete="family-name" aria-invalid={!!errors.lastName} {...register("lastName")} />
        </Field>
      </div>
      <Field label={t("email")} htmlFor="email" error={fieldError("email")}>
        <Input id="email" type="email" autoComplete="email" inputMode="email" aria-invalid={!!errors.email} {...register("email")} />
      </Field>
      <Field label={t("phone")} htmlFor="phone" error={fieldError("phone")}>
        <Input id="phone" type="tel" autoComplete="tel" inputMode="tel" aria-invalid={!!errors.phone} {...register("phone")} />
      </Field>
      <Field label={t("password")} htmlFor="password" hint={t("passwordHint")} error={fieldError("password")}>
        <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...register("password")} />
      </Field>
      <Field label={t("confirmPassword")} htmlFor="confirmPassword" error={fieldError("confirmPassword")}>
        <Input id="confirmPassword" type="password" autoComplete="new-password" aria-invalid={!!errors.confirmPassword} {...register("confirmPassword")} />
      </Field>
      <div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--primary)]" {...register("consent")} />
          <span>{t("consent")}</span>
        </label>
        {errors.consent ? (
          <p role="alert" className="mt-1 text-xs text-danger">
            {tc("errors.validation")}
          </p>
        ) : null}
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t("submitting") : tc("signUp")}
      </Button>
    </form>
  );
}
