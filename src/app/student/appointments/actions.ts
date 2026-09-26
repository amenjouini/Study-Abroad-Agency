"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/server/action";
import { availableSlots, bookAppointment, cancelOwnAppointment } from "@/server/appointments";
import { requireUser } from "@/server/session";

export async function slotsAction(date: string): Promise<ActionResult<Array<{ startsAt: string; label: string }>>> {
  return runAction(async () => {
    await requireUser();
    const slots = await availableSlots(date);
    return slots.map((s) => ({ startsAt: s.startsAt.toISOString(), label: s.label }));
  });
}

export async function bookAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const id = await bookAppointment(user, input);
    revalidatePath("/student/appointments");
    return { id };
  });
}

export async function cancelAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await cancelOwnAppointment(user, id);
    revalidatePath("/student/appointments");
  });
}
