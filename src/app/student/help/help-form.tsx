"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePostForm } from "@/components/post-form";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { Alert, Card, CardBody } from "@/components/ui/primitives";

export function HelpForm() {
  const t = useTranslations("student.help");
  const te = useTranslations("enums");
  const { submit, pending, error, done } = usePostForm("/api/help");
  return (
    <Card>
      <CardBody>
        {done ? (
          <Alert tone="success" title={t("sentTitle")}>
            {t("sentBody")}{" "}
            <Link href="/student/appointments" className="font-medium text-primary hover:underline">
              {t("bookAppointment")}
            </Link>
          </Alert>
        ) : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(e.currentTarget);
          }}
          className="mt-1 space-y-4"
        >
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Field label={t("describe")} htmlFor="description" hint={t("describeHint")}>
            <Textarea id="description" name="description" required minLength={5} maxLength={4000} rows={6} />
          </Field>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">{t("priority")}</legend>
            <div className="grid grid-cols-3 gap-2">
              {(["NORMAL", "HIGH", "URGENT"] as const).map((p) => (
                <label key={p} className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-card p-2.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent">
                  <input type="radio" name="priority" value={p} defaultChecked={p === "NORMAL"} className="accent-[var(--primary)]" />
                  {te(`Priority.${p}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label={t("attach")} htmlFor="files" hint={t("attachHint")}>
            <input id="files" name="files" type="file" multiple accept=".pdf,.jpg,.jpeg,.png" className="block w-full text-sm file:me-3 file:rounded-md file:border file:border-input file:bg-muted file:px-3 file:py-1.5" />
          </Field>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? t("sending") : t("send")}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
