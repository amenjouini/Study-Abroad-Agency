import type { Metadata } from "next";
import { ReviewWorkspace } from "@/components/staff/review-workspace";
import { requireArea } from "@/server/session";

export const metadata: Metadata = { title: "Document review" };

export default async function AdminDocuments({ searchParams }: { searchParams: Promise<{ instance?: string; scope?: string }> }) {
  const user = await requireArea("admin");
  return <ReviewWorkspace user={user} area="admin" searchParams={await searchParams} />;
}
