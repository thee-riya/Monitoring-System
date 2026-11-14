export type Role =
  | "department"
  | "admin"
  | "super_admin"
  | "hq"
  | "committee"
  | "tec"
  | "tac"
  | "ia"
  | "as_ia"
  | "dgs_ia"
  | "cfa"
  | "vendor";
export type Stage = string;
export interface User {
  id: string;
  name: string;
  role: Role;
  username: string;
}
export interface Event {
  id: string;
  type: string;
  actor: User;
  text: string;
  at: string;
}
export interface Reply {
  id: string;
  actor: User;
  text: string;
  at: string;
}
export interface Query {
  id: string;
  actor: User;
  text: string;
  status: string;
  at: string;
  replies: Reply[];
}
export interface DocumentRecord {
  id: string;
  category: string;
  name: string;
  mimeType: string;
  content: string;
  uploadedBy: User;
  at: string;
}
export interface TSCReport {
  id: string;
  version: number;
  title: string;
  content: string;
  status: string;
  submittedAt: string;
  submittedBy: User;
}
export interface WorkflowRecord {
  id: string;
  kind: string;
  data: Record<string, unknown>;
  actor: User;
  at: string;
}
export interface Bid {
  id: string;
  vendor: User;
  reference: string;
  amount: number;
  note: string;
  at: string;
}
export interface Project {
  id: string;
  title: string;
  description: string;
  estimatedValue: number;
  deadline: string;
  stage: Stage;
  stageLabel: string;
  owner: User;
  createdAt: string;
  events: Event[];
  queries: Query[];
  bids: Bid[];
  reports: TSCReport[];
  documents: DocumentRecord[];
  workflowRecords: WorkflowRecord[];
}
export interface StageInfo {
  id: string;
  label: string;
}
export interface Person {
  id: string;
  name: string;
  designation: string;
  department_id: string;
  department_name: string;
  department_code: string;
  employee_id?: string;
  contact?: string;
  expertise?: string;
  active: number;
}
export interface Vendor {
  id: string;
  name: string;
  registration_no: string;
  contact: string;
  email: string;
  active: number;
}
export interface Committee {
  id: string;
  project_id: string;
  type: string;
  version: number;
  status: string;
  constitution_date: string;
  valid_until?: string;
  terms: string;
  chairman: Person | null;
  secretary: Person | null;
  userRepresentative: Person | null;
  members: Array<Person & { role: string }>;
  approvals: Array<Record<string, string>>;
}
export interface Reports {
  projectCounts: Array<{ stage: string; count: number }>;
  pendingQueries: number;
  delayedMilestones: number;
  pendingCommittees: number;
}
export interface Bootstrap {
  projects: Project[];
  stages: StageInfo[];
  users: User[];
  people: Person[];
  departments: Array<{
    id: string;
    name: string;
    code: string;
    active: number;
  }>;
  vendors: Vendor[];
  committees: Committee[];
  reports: Reports;
}
