"use client";

import { useTranslations } from "next-intl";
import { Badge, type Tone } from "@/components/ui/primitives";

const TONES: Record<string, Record<string, Tone>> = {
  RequirementStatus: {
    NOT_STARTED: "warning",
    REQUESTED: "warning",
    UPLOADED: "info",
    UNDER_REVIEW: "info",
    APPROVED: "success",
    REJECTED: "danger",
    NEEDS_CORRECTION: "danger",
    EXPIRED: "danger",
    NOT_APPLICABLE: "neutral",
    REQUIRES_HUMAN_REVIEW: "primary",
  },
  DocumentVersionStatus: { UPLOADED: "info", UNDER_REVIEW: "info", APPROVED: "success", REJECTED: "danger", NEEDS_CORRECTION: "danger", SUPERSEDED: "neutral" },
  ApplicationStatus: { PLANNED: "neutral", PREPARING: "warning", SUBMITTED: "info", UNDER_EVALUATION: "info", ADDITIONAL_DOCUMENTS: "warning", ACCEPTED: "success", REJECTED: "danger", WITHDRAWN: "neutral", ENROLLED: "success" },
  VisaStage: { APPROVED: "success", REFUSED: "danger", PASSPORT_RETURNED: "success", APPOINTMENT_PENDING: "warning", ADDITIONAL_DOCUMENTS: "warning" },
  UniversitalyStatus: { VALIDATED: "success", TRANSMITTED_TO_EMBASSY: "success", CORRECTIONS_REQUESTED: "warning" },
  PaymentStatus: { PENDING: "neutral", PARTIALLY_PAID: "warning", PAID: "success", LATE: "danger", CANCELLED: "neutral" },
  AppointmentStatus: { REQUESTED: "warning", CONFIRMED: "success", RESCHEDULED: "info", COMPLETED: "neutral", CANCELLED: "neutral", NO_SHOW: "danger" },
  ScholarshipApplicationStatus: { AWARDED: "success", REJECTED: "danger", SUBMITTED: "info", UNDER_EVALUATION: "info" },
  Priority: { NORMAL: "neutral", HIGH: "warning", URGENT: "danger" },
  HumanReviewStatus: { OPEN: "warning", IN_REVIEW: "info", RESOLVED: "success" },
  TaskStatus: { OPEN: "warning", IN_PROGRESS: "info", DONE: "success", CANCELLED: "neutral" },
  LeadStatus: { NEW: "info", CONTACTED: "info", CONSULTATION: "primary", INTERESTED: "primary", REGISTERED: "success", CONVERTED: "success", LOST: "neutral" },
};

/** A translated status badge; the label comes from the `enums` catalog so every enum reads the same everywhere. */
export function EnumBadge({ enumName, value, className }: { enumName: string; value: string; className?: string }) {
  const te = useTranslations("enums");
  return (
    <Badge tone={TONES[enumName]?.[value] ?? "neutral"} className={className}>
      {te(`${enumName}.${value}` as never)}
    </Badge>
  );
}
