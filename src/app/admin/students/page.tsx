import type { Metadata } from "next";
import { StudentsList } from "@/components/staff/students-list";
import { requireArea } from "@/server/session";

export const metadata: Metadata = { title: "Students" };

export default async function AdminStudents({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireArea("admin");
  return <StudentsList user={user} area="admin" searchParams={await searchParams} />;
}
