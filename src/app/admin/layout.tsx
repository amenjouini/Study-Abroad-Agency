import { StaffShell } from "@/components/shell/shells";
import { requireArea } from "@/server/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireArea("admin");
  return <StaffShell user={user} area="admin">{children}</StaffShell>;
}
