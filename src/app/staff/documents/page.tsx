import type { Metadata } from "next";
import { ReviewWorkspace } from "@/components/staff/review-workspace";
import { requireArea } from "@/server/session";

export const metadata: Metadata = { title: "Document review" };

export default async function StaffDocuments({ searchParams }: { searchParams: Promise<{ instance?: string; scope?: string }> }) {
  const user = await requireArea("staff");
  return <ReviewWorkspace user={user} area="staff" searchParams={await searchParams} />;
}
