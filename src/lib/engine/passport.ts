import { addMonths, type ISODate } from "../dates";
import { PARAM } from "./constants";
import type { PassportCalculation } from "./types";

export interface PassportInput {
  passportExpiry?: ISODate | null;
  appointmentDate?: ISODate | null;
  plannedSubmissionDate?: ISODate | null;
  /** Last-resort reference when nothing else is known (effective visa appointment deadline). */
  fallbackReferenceDate?: ISODate | null;
}

/**
 * satisfied when: passport_expiry_date > reference_date + N months
 * reference_date = visa appointment date if known, otherwise planned submission date.
 * N comes from the procedure version, never from a constant.
 */
export function calculatePassport(
  input: PassportInput,
  params: Record<string, unknown>,
): PassportCalculation | null {
  const months = params[PARAM.PASSPORT_MIN_VALIDITY_MONTHS];
  if (typeof months !== "number") return null;

  let referenceDate: ISODate | null = null;
  let referenceSource: PassportCalculation["referenceSource"] = null;
  if (input.appointmentDate) {
    referenceDate = input.appointmentDate.slice(0, 10);
    referenceSource = "VISA_APPOINTMENT";
  } else if (input.plannedSubmissionDate) {
    referenceDate = input.plannedSubmissionDate.slice(0, 10);
    referenceSource = "PLANNED_SUBMISSION";
  } else if (input.fallbackReferenceDate) {
    referenceDate = input.fallbackReferenceDate.slice(0, 10);
    referenceSource = "EFFECTIVE_APPOINTMENT_DEADLINE";
  }

  const expiry = input.passportExpiry ? input.passportExpiry.slice(0, 10) : null;
  const requiredValidUntilAfter = referenceDate ? addMonths(referenceDate, months) : null;
  const satisfied = expiry && requiredValidUntilAfter ? expiry > requiredValidUntilAfter : null;

  return {
    applicable: true,
    satisfied,
    passportExpiry: expiry,
    referenceDate,
    referenceSource,
    requiredValidUntilAfter,
    monthsRequired: months,
  };
}
