import { StudentShell } from "@/components/shell/shells";
import { requireArea } from "@/server/session";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireArea("student");
  return <StudentShell user={user}>{children}</StudentShell>;
}
