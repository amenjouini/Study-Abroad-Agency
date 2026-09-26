/**
 * Permission catalog and the pure authorization decision.
 * Permissions are data (role → permissions, plus per-user grants); the catalog below is only the seed source
 * and the list of keys the server checks. The decision function has no I/O so it is unit-testable.
 */

export type RoleKey = "OWNER" | "ADMIN" | "STAFF" | "STUDENT";

export const PERMISSIONS: Array<{ key: string; area: string; description: string }> = [
  { key: "students.read", area: "students", description: "View students and their cases" },
  { key: "students.write", area: "students", description: "Edit student profiles and cases" },
  { key: "cases.assign", area: "students", description: "Assign staff to cases" },
  { key: "documents.read", area: "documents", description: "View case documents" },
  { key: "documents.review", area: "documents", description: "Approve / reject documents" },
  { key: "payments.read", area: "payments", description: "View payments" },
  { key: "payments.write", area: "payments", description: "Record payments and transactions" },
  { key: "payments.plans", area: "payments", description: "Configure payment plans" },
  { key: "applications.read", area: "applications", description: "View university applications" },
  { key: "applications.write", area: "applications", description: "Edit university applications" },
  { key: "appointments.read", area: "appointments", description: "View agency appointments" },
  { key: "appointments.write", area: "appointments", description: "Manage agency appointments" },
  { key: "appointments.settings", area: "appointments", description: "Configure appointment availability" },
  { key: "scholarships.read", area: "scholarships", description: "View scholarships" },
  { key: "scholarships.write", area: "scholarships", description: "Manage scholarship applications" },
  { key: "scholarships.manage", area: "scholarships", description: "Manage scholarships and versions" },
  { key: "visa.read", area: "visa", description: "View visa and Universitaly cases" },
  { key: "visa.write", area: "visa", description: "Manage visa and Universitaly cases" },
  { key: "funding.write", area: "funding", description: "Edit sponsors and funding sources" },
  { key: "leads.read", area: "leads", description: "View leads" },
  { key: "leads.write", area: "leads", description: "Manage leads" },
  { key: "tasks.manage", area: "tasks", description: "Create and complete tasks" },
  { key: "messages.read", area: "messages", description: "Read case messages" },
  { key: "messages.write", area: "messages", description: "Send case messages" },
  { key: "humanreview.resolve", area: "humanreview", description: "Resolve human-review items" },
  { key: "procedures.manage", area: "procedures", description: "Manage procedure versions, requirements, rules" },
  { key: "document_rules.manage", area: "procedures", description: "Manage document rules and dependencies" },
  { key: "universities.manage", area: "academic", description: "Manage universities and programs" },
  { key: "knowledge_base.manage", area: "knowledge_base", description: "Manage knowledge-base articles" },
  { key: "settings.manage", area: "settings", description: "Change critical settings" },
  { key: "staff.manage", area: "settings", description: "Manage staff and permissions" },
  { key: "owner.manage", area: "settings", description: "Change the owner account" },
  { key: "analytics.view", area: "analytics", description: "View analytics" },
  { key: "audit.view", area: "audit", description: "View the audit log" },
  { key: "exports.run", area: "exports", description: "Export data as CSV" },
  { key: "self.profile", area: "self", description: "Student: manage own profile" },
  { key: "self.documents", area: "self", description: "Student: upload and replace own documents" },
  { key: "self.appointments", area: "self", description: "Student: book agency appointments" },
  { key: "self.messages", area: "self", description: "Student: message assigned staff" },
  { key: "self.help", area: "self", description: "Student: request help" },
];

export const STAFF_DEFAULT_PERMISSIONS = [
  "students.read",
  "students.write",
  "documents.read",
  "documents.review",
  "applications.read",
  "applications.write",
  "appointments.read",
  "appointments.write",
  "scholarships.read",
  "payments.read",
  "visa.read",
  "visa.write",
  "funding.write",
  "leads.read",
  "tasks.manage",
  "messages.read",
  "messages.write",
  "humanreview.resolve",
  "exports.run",
];

export const STUDENT_PERMISSIONS = PERMISSIONS.filter((p) => p.area === "self").map((p) => p.key);
export const ALL_PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

export interface PermissionDecisionInput {
  roleKey: RoleKey;
  /** Effective permission keys: role permissions + user grants − user revokes */
  effective: ReadonlySet<string>;
  /** Permission keys granted to this user for every case (wider than assigned cases) */
  allCasesKeys: ReadonlySet<string>;
  key: string;
  scope?: {
    /** Is the target case assigned to the acting staff member? */
    caseAssigned?: boolean;
    /** Does the target case belong to the acting student? */
    caseOwnedByUser?: boolean;
    /** Case-scoped check requested */
    caseScoped?: boolean;
  };
}

export function decidePermission(input: PermissionDecisionInput): boolean {
  const { roleKey, effective, allCasesKeys, key, scope } = input;
  if (!effective.has(key)) return false;

  if (roleKey === "OWNER" || roleKey === "ADMIN") return true;

  if (roleKey === "STUDENT") {
    // Students only ever get "self.*" permissions, and only on their own case.
    if (!key.startsWith("self.")) return false;
    return scope?.caseScoped ? scope.caseOwnedByUser === true : true;
  }

  // STAFF
  if (key.startsWith("self.")) return false;
  if (!scope?.caseScoped) return true; // list-level: queries must still be filtered with caseAccessWhere
  return scope.caseAssigned === true || allCasesKeys.has(key);
}

/** Owner-only permissions can never be effective for non-owners, whatever grants exist. */
export const OWNER_ONLY_KEYS: ReadonlySet<string> = new Set(["owner.manage"]);
