"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useActionRunner } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Card, CardBody } from "@/components/ui/primitives";
import { bookAction, slotsAction } from "./actions";

const TYPES = ["GENERAL_CONSULTATION", "DOCUMENT_PROBLEM", "VISA_PROBLEM", "UNIVERSITY_PROBLEM", "SCHOLARSHIP_PROBLEM", "EMERGENCY", "OTHER"] as const;

/** Book a meeting with the agency: date → available slot → reason, description, urgency. */
export function BookingForm({ minDate }: { minDate: string }) {
  const t = useTranslations("student.appointments");
  const te = useTranslations("enums");
  const router = useRouter();
  const slotsRunner = useActionRunner();
  const bookRunner = useActionRunner();
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<Array<{ startsAt: string; label: string }> | null>(null);
  const [slot, setSlot] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]>("GENERAL_CONSULTATION");
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState("NORMAL");

  function pickDate(value: string) {
    setDate(value);
    setSlot("");
    setSlots(null);
    if (value) slotsRunner.run(() => slotsAction(value), (s) => setSlots(s));
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        <Alert tone="info">{t("agencyNote")}</Alert>
        {bookRunner.error ? <Alert tone="danger">{bookRunner.error}</Alert> : null}
        <Field label={t("date")} htmlFor="date">
          <Input id="date" type="date" min={minDate} value={date} onChange={(e) => pickDate(e.target.value)} />
        </Field>
        {slotsRunner.error ? <Alert tone="danger">{slotsRunner.error}</Alert> : null}
        {date && slots ? (
          slots.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noSlots")}</p>
          ) : (
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">{t("slot")}</legend>
              <div className="flex flex-wrap gap-2">
                {slots.map((s) => (
                  <label key={s.startsAt} className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm tabular-nums ${slot === s.startsAt ? "border-primary bg-accent text-primary" : "border-input bg-card"}`}>
                    <input type="radio" name="slot" value={s.startsAt} checked={slot === s.startsAt} onChange={() => setSlot(s.startsAt)} className="sr-only" />
                    {s.label}
                  </label>
                ))}
              </div>
            </fieldset>
          )
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("type")} htmlFor="type">
            <Select id="type" value={type} onChange={(e) => setType(e.target.value as (typeof TYPES)[number])}>
              {TYPES.map((v) => (
                <option key={v} value={v}>
                  {te(`AppointmentType.${v}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("urgency")} htmlFor="urgency">
            <Select id="urgency" value={urgency} onChange={(e) => setUrgency(e.target.value)}>
              {(["NORMAL", "HIGH", "URGENT"] as const).map((v) => (
                <option key={v} value={v}>
                  {te(`Priority.${v}`)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={t("reason")} htmlFor="reason">
          <Input id="reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Field label={t("descriptionLabel")} htmlFor="desc">
          <Textarea id="desc" rows={3} value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Button
          disabled={bookRunner.pending || !slot || reason.trim().length < 3}
          onClick={() =>
            bookRunner.run(
              () => bookAction({ date, slotStart: slot, type, reason, description: description || undefined, urgency }),
              () => {
                setDate("");
                setSlot("");
                setSlots(null);
                setReason("");
                setDescription("");
                router.refresh();
              },
            )
          }
        >
          {t("book")}
        </Button>
      </CardBody>
    </Card>
  );
}
