import Database from "better-sqlite3";
import crypto from "node:crypto";
import path from "node:path";

export const stages = [
  ["demand_submission", "Department demand submission"],
  ["committee_pending", "TSC committee approval"],
  ["tsc_report", "TSC specification report"],
  ["admin_report_review", "Admin report review"],
  ["as_review", "AS (IA) report approval"],
  ["admin_after_as", "Admin review after AS (IA)"],
  ["hq_review", "Admin HQ routes report to DGS"],
  ["dgs_ia_review", "DGS report review"],
  ["tender_draft", "Admin HQ draft tender"],
  ["ia_tender_review", "IA final tender review"],
  ["admin_issue_tender", "Admin issues final tender"],
  ["bid_submission", "Admin confirms bid receipt"],
  ["opening_board_formation", "Bid opening board formation"],
  ["tec_formation", "TEC formation"],
  ["tec_approval", "SS approval of TEC"],
  ["tec_review", "TEC evaluation"],
  ["x_formation", "X committee formation"],
  ["price_opening", "Price bid opening"],
  ["tac_formation", "TAC formation"],
  ["tac_review", "TAC final vendor selection"],
  ["cfa_approval", "CFA fund release approval"],
  ["ifd_review", "CFA fund release through IFD"],
  ["completed", "Completed"],
] as const;

export const users = [
  {
    id: "u-department",
    name: "User Department (ARC)",
    role: "department",
    username: "department",
    password: "department123",
  },
  {
    id: "u-admin",
    name: "System Admin",
    role: "admin",
    username: "admin",
    password: "admin123",
  },
  {
    id: "u-super",
    name: "Super Admin",
    role: "super_admin",
    username: "superadmin",
    password: "admin123",
  },
  {
    id: "u-dgs",
    name: "DGS",
    role: "dgs_ia",
    username: "dgs",
    password: "dgs123",
  },
  {
    id: "u-hq",
    name: "HQ Officer",
    role: "hq",
    username: "hq",
    password: "hq123",
  },
  {
    id: "u-tsc",
    name: "TSC Member",
    role: "committee",
    username: "tsc",
    password: "tsc123",
  },
  {
    id: "u-tec",
    name: "Technical Evaluation Committee",
    role: "tec",
    username: "tec",
    password: "tec123",
  },
  {
    id: "u-tac",
    name: "Tender Acceptance Committee",
    role: "tac",
    username: "tac",
    password: "tac123",
  },
  {
    id: "u-as",
    name: "AS (IA)",
    role: "as_ia",
    username: "AS",
    password: "AS123",
  },
  {
    id: "u-dgs-ia",
    name: "DGS",
    role: "dgs_ia",
    username: "DGS",
    password: "DGS123",
  },
  {
    id: "u-ia",
    name: "IA Wing",
    role: "ia",
    username: "ia",
    password: "ia123",
  },
  {
    id: "u-cfa",
    name: "Competent Financial Authority",
    role: "cfa",
    username: "cfa",
    password: "cfa123",
  },
  {
    id: "u-vendor",
    name: "Demo Vendor",
    role: "vendor",
    username: "vendor",
    password: "vendor123",
  },
] as const;

const db = new Database(path.join(process.cwd(), "procureflow.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL,
    estimated_value REAL NOT NULL DEFAULT 0, deadline TEXT NOT NULL,
    stage TEXT NOT NULL, owner_id TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, type TEXT NOT NULL,
    actor_id TEXT NOT NULL, text TEXT NOT NULL, at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS queries (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, actor_id TEXT NOT NULL,
    text TEXT NOT NULL, status TEXT NOT NULL, at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tsc_reports (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, version INTEGER NOT NULL,
    submitted_by TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL,
    status TEXT NOT NULL, submitted_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS workflow_records (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, kind TEXT NOT NULL,
    data TEXT NOT NULL, actor_id TEXT NOT NULL, at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS replies (
    id TEXT PRIMARY KEY, query_id TEXT NOT NULL, actor_id TEXT NOT NULL,
    text TEXT NOT NULL, at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS bids (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, vendor_id TEXT NOT NULL,
    reference TEXT NOT NULL, amount REAL NOT NULL, note TEXT NOT NULL, at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS departments (
    id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, code TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS people (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, designation TEXT NOT NULL, department_id TEXT NOT NULL,
    employee_id TEXT, contact TEXT, expertise TEXT, active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS committees (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, type TEXT NOT NULL, version INTEGER NOT NULL,
    chairman_id TEXT, secretary_id TEXT, user_rep_id TEXT, constitution_date TEXT NOT NULL,
    valid_until TEXT, terms TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft'
  );
  CREATE TABLE IF NOT EXISTS committee_members (
    committee_id TEXT NOT NULL, person_id TEXT NOT NULL, role TEXT NOT NULL,
    PRIMARY KEY (committee_id, person_id)
  );
  CREATE TABLE IF NOT EXISTS committee_approvals (
    id TEXT PRIMARY KEY, committee_id TEXT NOT NULL, actor_id TEXT NOT NULL,
    action TEXT NOT NULL, remarks TEXT NOT NULL, at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, category TEXT NOT NULL,
    name TEXT NOT NULL, storage_path TEXT NOT NULL, uploaded_by TEXT NOT NULL, at TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
    content TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS vendors (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, registration_no TEXT NOT NULL UNIQUE,
    contact TEXT NOT NULL, email TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS bid_evaluations (
    id TEXT PRIMARY KEY, bid_id TEXT NOT NULL, evaluator_id TEXT NOT NULL,
    technical_status TEXT NOT NULL, observations TEXT NOT NULL, recommendation TEXT NOT NULL, at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS contracts (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, vendor_id TEXT NOT NULL,
    award_reference TEXT NOT NULL, approved_value REAL NOT NULL, validity_until TEXT,
    performance_security REAL NOT NULL DEFAULT 0, status TEXT NOT NULL, at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS milestones (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL,
    planned_start TEXT NOT NULL, planned_end TEXT NOT NULL, actual_start TEXT,
    actual_end TEXT, status TEXT NOT NULL, delay_reason TEXT NOT NULL DEFAULT '', remarks TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, project_id TEXT,
    type TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL,
    read_at TEXT, at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY, project_id TEXT, actor_id TEXT NOT NULL,
    entity_type TEXT NOT NULL, entity_id TEXT, action TEXT NOT NULL,
    details TEXT NOT NULL, at TEXT NOT NULL
  );
`);
const queryColumns = db.prepare("PRAGMA table_info(queries)").all() as Array<{
  name: string;
}>;
if (!queryColumns.some((column) => column.name === "stage"))
  db.exec(
    "ALTER TABLE queries ADD COLUMN stage TEXT NOT NULL DEFAULT 'general'",
  );

const now = () => new Date().toISOString();
const uid = (prefix: string) =>
  `${prefix}-${crypto.randomBytes(5).toString("hex")}`;
export const safeUser = (user: (typeof users)[number] | undefined) =>
  user && {
    id: user.id,
    name: user.name,
    role: user.role,
    username: user.username,
  };
export const stageInfo = stages.map(([id, label]) => ({ id, label }));
export function seed() {
  const departmentCount = (
    db.prepare("SELECT COUNT(*) count FROM departments").get() as {
      count: number;
    }
  ).count;
  if (departmentCount === 0) {
    db.prepare("INSERT INTO departments VALUES (?, ?, ?, 1)").run(
      "dept-user",
      "User Department",
      "USER",
    );
    db.prepare("INSERT INTO departments VALUES (?, ?, ?, 1)").run(
      "dept-ia",
      "Inspection & Audit",
      "IA",
    );
    db.prepare("INSERT INTO departments VALUES (?, ?, ?, 1)").run(
      "dept-hq",
      "Headquarters",
      "HQ",
    );
    const insertPerson = db.prepare(
      "INSERT INTO people VALUES (?, ?, ?, ?, ?, ?, ?, 1)",
    );
    insertPerson.run(
      "person-chair",
      "Dr. Anil Sharma",
      "Chief Engineer",
      "dept-user",
      "EMP-001",
      "Ext. 201",
      "Network infrastructure",
    );
    insertPerson.run(
      "person-secretary",
      "Meera Nair",
      "Deputy Director",
      "dept-hq",
      "EMP-002",
      "Ext. 202",
      "Procurement",
    );
    insertPerson.run(
      "person-member",
      "Rajiv Menon",
      "Technical Officer",
      "dept-ia",
      "EMP-003",
      "Ext. 203",
      "Cybersecurity",
    );
    insertPerson.run(
      "person-rep",
      "Nisha Kapoor",
      "User Department Representative",
      "dept-user",
      "EMP-004",
      "Ext. 204",
      "Operations",
    );
  }
  const vendorCount = (
    db.prepare("SELECT COUNT(*) count FROM vendors").get() as { count: number }
  ).count;
  if (vendorCount === 0) {
    db.prepare("INSERT INTO vendors VALUES (?, ?, ?, ?, ?, 1)").run(
      "vendor-demo",
      "Demo Infrastructure Pvt. Ltd.",
      "VEND-001",
      "Arjun Rao",
      "vendor@example.local",
    );
  }
  const extraVendors = [
    ["vendor-demo-2", "Northstar Systems Ltd.", "VEND-002", "Kavita Shah", "northstar@example.local"],
    ["vendor-demo-3", "Apex Medical Technologies", "VEND-003", "Rohan Das", "apex@example.local"],
    ["vendor-demo-4", "Cedar Infrastructure Pvt. Ltd.", "VEND-004", "Fatima Khan", "cedar@example.local"],
    ["vendor-demo-5", "BluePeak Engineering", "VEND-005", "Arun Nair", "bluepeak@example.local"],
  ];
  const insertVendor = db.prepare(
    "INSERT OR IGNORE INTO vendors VALUES (?, ?, ?, ?, ?, 1)",
  );
  extraVendors.forEach((vendor) => insertVendor.run(...vendor));
  db.exec(`
    UPDATE projects SET stage = 'tender_draft' WHERE stage IN ('arc_review', 'dgs_approval', 'admin_after_dgs', 'admin_hq_tender');
    UPDATE projects SET stage = 'hq_review' WHERE stage = 'admin_after_second_review';
    UPDATE projects SET stage = 'bid_submission' WHERE stage = 'tender_issued';
    UPDATE projects SET stage = 'ia_tender_review' WHERE stage = 'ia_review';
    UPDATE projects SET stage = 'tsc_report' WHERE stage = 'board_pending';
    UPDATE projects SET stage = 'tec_formation' WHERE stage = 'technical_opening';
    UPDATE projects
      SET stage = 'tsc_report'
      WHERE stage = 'committee_pending'
      AND EXISTS (
        SELECT 1 FROM committees
        WHERE committees.project_id = projects.id
          AND committees.type = 'Technical Scrutiny Committee'
          AND committees.status = 'approved'
      );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_events_project ON events(project_id, at);
    CREATE INDEX IF NOT EXISTS idx_queries_project ON queries(project_id, status);
    CREATE INDEX IF NOT EXISTS idx_bids_project ON bids(project_id, at);
    CREATE INDEX IF NOT EXISTS idx_committees_project ON committees(project_id, version);
    CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id, category);
    CREATE INDEX IF NOT EXISTS idx_workflow_records_project ON workflow_records(project_id, kind, at);
    CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id, planned_end);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);
    CREATE INDEX IF NOT EXISTS idx_audit_project ON audit_logs(project_id, at);
  `);
}
export function addEvent(
  projectId: string,
  type: string,
  actorId: string,
  text: string,
) {
  db.prepare("INSERT INTO events VALUES (?, ?, ?, ?, ?, ?)").run(
    uid("evt"),
    projectId,
    type,
    actorId,
    text,
    now(),
  );
}
export function projectView(row: any, viewerId?: string) {
  const viewerRole = users.find((user) => user.id === viewerId)?.role;
  const queryResponderRoles: Record<string, string[]> = {
    demand_submission: ["admin"],
    as_review: ["as_ia", "admin"],
    dgs_ia_review: ["dgs_ia", "hq"],
    hq_review: ["hq", "admin"],
    tec_approval: ["super_admin", "admin"],
  };
  const project = {
    id: row.id,
    title: row.title,
    description: row.description,
    estimatedValue: row.estimated_value,
    deadline: row.deadline,
    stage: row.stage,
    stageLabel: stageInfo.find((s) => s.id === row.stage)?.label ?? row.stage,
    owner: safeUser(users.find((u) => u.id === row.owner_id))!,
    createdAt: row.created_at,
  };
  const documents = db
    .prepare("SELECT * FROM documents WHERE project_id = ? ORDER BY at DESC")
    .all(row.id)
    .map((doc: any) => ({
      id: doc.id,
      category: doc.category,
      name: doc.name,
      mimeType: doc.mime_type,
      content: doc.content,
      uploadedBy: safeUser(users.find((u) => u.id === doc.uploaded_by))!,
      at: doc.at,
    }));
  const events = db
    .prepare("SELECT * FROM events WHERE project_id = ? ORDER BY at DESC")
    .all(row.id)
    .map((e: any) => ({
      id: e.id,
      type: e.type,
      actor: safeUser(users.find((u) => u.id === e.actor_id))!,
      text: e.text,
      at: e.at,
    }));
  const queries = db
    .prepare("SELECT * FROM queries WHERE project_id = ? ORDER BY at DESC")
    .all(row.id)
    .filter(
      (q: any) =>
        !viewerId ||
        q.actor_id === viewerId ||
        (queryResponderRoles[q.stage] ?? []).includes(viewerRole ?? "") ||
        db
          .prepare("SELECT 1 FROM replies WHERE query_id = ? AND actor_id = ?")
          .get(q.id, viewerId),
    )
    .map((q: any) => ({
      id: q.id,
      actor: safeUser(users.find((u) => u.id === q.actor_id))!,
      text: q.text,
      status: q.status,
      at: q.at,
      replies: db
        .prepare(
          "SELECT * FROM replies WHERE query_id = ? ORDER BY at",
        )
        .all(q.id)
        .map((r: any) => ({
          id: r.id,
          actor: safeUser(users.find((u) => u.id === r.actor_id))!,
          text: r.text,
          at: r.at,
        })),
    }));
  const bids = db
    .prepare("SELECT * FROM bids WHERE project_id = ? ORDER BY at DESC")
    .all(row.id)
    .map((b: any) => ({
      id: b.id,
      vendor: safeUser(users.find((u) => u.id === b.vendor_id))!,
      reference: b.reference,
      amount: b.amount,
      note: b.note,
      at: b.at,
    }));
  const reports = db
    .prepare(
      "SELECT * FROM tsc_reports WHERE project_id = ? ORDER BY version DESC",
    )
    .all(row.id)
    .map((report: any) => ({
      id: report.id,
      version: report.version,
      title: report.title,
      content: report.content,
      status: report.status,
      submittedAt: report.submitted_at,
      submittedBy: safeUser(users.find((u) => u.id === report.submitted_by)),
    }));
  const workflowRecords = db
    .prepare(
      "SELECT * FROM workflow_records WHERE project_id = ? ORDER BY at DESC",
    )
    .all(row.id)
    .map((record: any) => ({
      id: record.id,
      kind: record.kind,
      data: JSON.parse(record.data),
      actor: safeUser(users.find((u) => u.id === record.actor_id))!,
      at: record.at,
    }));
  return {
    ...project,
    events,
    queries,
    bids,
    reports,
    documents,
    workflowRecords,
  };
}
export { db, now, uid };

export function listPeople() {
  return db
    .prepare(
      `
    SELECT p.*, d.name department_name, d.code department_code
    FROM people p JOIN departments d ON d.id = p.department_id
    ORDER BY p.active DESC, p.name
  `,
    )
    .all();
}

export function listDepartments() {
  return db.prepare("SELECT * FROM departments ORDER BY name").all();
}

export function listVendors() {
  return db.prepare("SELECT * FROM vendors ORDER BY active DESC, name").all();
}

export function listCommittees(projectId?: string) {
  const rows = projectId
    ? db
        .prepare(
          "SELECT * FROM committees WHERE project_id = ? ORDER BY version DESC",
        )
        .all(projectId)
    : db
        .prepare("SELECT * FROM committees ORDER BY constitution_date DESC")
        .all();
  return rows.map((committee: any) => ({
    ...committee,
    chairman: safePerson(committee.chairman_id),
    secretary: safePerson(committee.secretary_id),
    userRepresentative: safePerson(committee.user_rep_id),
    members: db
      .prepare(
        `
      SELECT cm.role, p.id, p.name, p.designation, p.department_id
      FROM committee_members cm JOIN people p ON p.id = cm.person_id
      WHERE cm.committee_id = ? ORDER BY p.name
    `,
      )
      .all(committee.id),
    approvals: db
      .prepare(
        "SELECT * FROM committee_approvals WHERE committee_id = ? ORDER BY at DESC",
      )
      .all(committee.id),
  }));
}

function safePerson(id: string | null) {
  if (!id) return null;
  return (
    db
      .prepare(
        "SELECT p.id, p.name, p.designation, d.name department FROM people p JOIN departments d ON d.id = p.department_id WHERE p.id = ?",
      )
      .get(id) ?? null
  );
}

export function reportSummary() {
  const projectCounts = db
    .prepare("SELECT stage, COUNT(*) count FROM projects GROUP BY stage")
    .all();
  const pendingQueries = db
    .prepare("SELECT COUNT(*) count FROM queries WHERE status != 'resolved'")
    .get() as { count: number };
  const delayedMilestones = db
    .prepare(
      "SELECT COUNT(*) count FROM milestones WHERE planned_end < date('now') AND actual_end IS NULL",
    )
    .get() as { count: number };
  const pendingCommittees = db
    .prepare(
      "SELECT COUNT(*) count FROM committees WHERE status NOT IN ('approved', 'rejected')",
    )
    .get() as { count: number };
  return {
    projectCounts,
    pendingQueries: pendingQueries.count,
    delayedMilestones: delayedMilestones.count,
    pendingCommittees: pendingCommittees.count,
  };
}
