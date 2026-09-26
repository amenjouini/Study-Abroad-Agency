import { StaffShell } from "@/components/shell/shells";
import { requireArea } from "@/server/session";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await requireArea("staff");
  return <StaffShell user={user} area="staff">{children}</StaffShell>;
}
