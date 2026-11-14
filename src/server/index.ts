import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import crypto from "node:crypto";
import { z } from "zod";
import {
  addEvent,
  db,
  listCommittees,
  listDepartments,
  listPeople,
  listVendors,
  now,
  projectView,
  reportSummary,
  safeUser,
  seed,
  stageInfo,
  stages,
  uid,
  users,
} from "./db.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const sessions = new Map<string, string>();
app.use(express.json({ limit: "12mb" }));
app.use(cookieParser());
seed();

const userFor = (req: express.Request) =>
  users.find((u) => u.id === sessions.get(req.cookies.session));
const auth = (req: express.Request, res: express.Response) => {
  const user = userFor(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  return user;
};
const project = (id: string) =>
  db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as any;
const queryResponderRoles: Record<string, string[]> = {
  demand_submission: ["admin"],
  tsc_approval: ["as_ia", "admin"],
  as_review: ["as_ia", "admin"],
  dgs_ia_review: ["hq", "admin"],
  hq_review: ["hq", "admin"],
  hq_after_dgs: ["hq", "admin"],
  cs_sr_review: ["hq", "admin"],
  tec_approval: ["admin", "hq"],
};
const formationDocumentHandoffs: Record<
  string,
  {
    category: string;
    nextStage: string;
    uploaderRole: "admin" | "hq";
    description: string;
  }
> = {
  tsc_formation_document: {
    category: "tsc_formation_support",
    nextStage: "tsc_approval",
    uploaderRole: "admin",
    description: "TSC formation supporting document",
  },
  tec_formation_document: {
    category: "tec_formation_support",
    nextStage: "tec_approval",
    uploaderRole: "hq",
    description: "TEC formation supporting document",
  },
  tac_formation_document: {
    category: "tac_formation_support",
    nextStage: "tac_review",
    uploaderRole: "hq",
    description: "TAC formation supporting document",
  },
};
const signedApprovalHandoffs: Record<
  string,
  {
    nextStage: string;
    approval: string;
    uploaderRole: "admin" | "hq";
    completion?: string;
  }
> = {
  admin_tsc_signature: {
    nextStage: "tsc_report",
    approval: "AS (IA) TSC formation approval",
    uploaderRole: "admin",
  },
  admin_as_signature: {
    nextStage: "admin_after_as",
    approval: "AS (IA) TSC report approval",
    uploaderRole: "admin",
  },
  dgs_ia_review: {
    nextStage: "hq_after_dgs",
    approval: "DGS offline TSC report approval",
    uploaderRole: "hq",
    completion: "Admin HQ can now send the report to CS/SR for offline approval",
  },
  cs_sr_review: {
    nextStage: "tender_draft",
    approval: "CS/SR offline TSC report approval",
    uploaderRole: "hq",
    completion: "Tender processing can begin",
  },
  admin_tec_signature: {
    nextStage: "tec_review",
    approval: "SS TEC approval",
    uploaderRole: "hq",
  },
  admin_cfa_signature: {
    nextStage: "ifd_review",
    approval: "CFA fund release approval",
    uploaderRole: "hq",
    completion: "After IFD approval, Admin HQ must upload the final acceptance document",
  },
};
const queryParticipant = (user: (typeof users)[number], query: any) =>
  user.id === query.actor_id ||
  (queryResponderRoles[query.stage] ?? []).includes(user.role);
const workflowRecords = db.prepare(
  "INSERT INTO workflow_records VALUES (?, ?, ?, ?, ?, ?)",
);
const saveWorkflowRecord = (
  projectId: string,
  kind: string,
  data: Record<string, unknown>,
  actorId: string,
) =>
  workflowRecords.run(
    uid("workflow"),
    projectId,
    kind,
    JSON.stringify(data),
    actorId,
    now(),
  );

app.post("/api/login", (req, res) => {
  const input = z
    .object({ username: z.string(), password: z.string() })
    .safeParse(req.body);
  const user =
    input.success &&
    users.find(
      (u) =>
        ["admin", "as_ia", "hq"].includes(u.role) &&
        u.username === input.data.username &&
        u.password === input.data.password,
    );
  if (!user)
    return res.status(401).json({ error: "Invalid username or password" });
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, user.id);
  res.cookie("session", token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 86400000,
  });
  return res.json({ user: safeUser(user) });
});
app.post("/api/logout", (req, res) => {
  sessions.delete(req.cookies.session);
  res.clearCookie("session");
  res.json({ ok: true });
});
app.get("/api/me", (req, res) => {
  const user = userFor(req);
  return user
    ? res.json({ user: safeUser(user) })
    : res.status(401).json({ error: "Not authenticated" });
});
app.get("/api/bootstrap", (req, res) => {
  const user = auth(req, res);
  if (!user) return;
  const rows = db
    .prepare("SELECT * FROM projects ORDER BY created_at DESC")
    .all();
  res.json({
    projects: rows.map((row) => projectView(row, user.id)),
    stages: stageInfo,
    users: users.map(safeUser),
    people: listPeople(),
    departments: listDepartments(),
    vendors: listVendors(),
    committees: listCommittees(),
    reports: reportSummary(),
  });
});
app.get("/api/people", (req, res) => {
  if (!auth(req, res)) return;
  res.json({ people: listPeople(), departments: listDepartments() });
});
app.get("/api/vendors", (req, res) => {
  if (!auth(req, res)) return;
  res.json({ vendors: listVendors() });
});
app.get("/api/committees", (req, res) => {
  if (!auth(req, res)) return;
  res.json({
    committees: listCommittees(
      typeof req.query.projectId === "string" ? req.query.projectId : undefined,
    ),
  });
});
app.get("/api/reports/summary", (req, res) => {
  if (!auth(req, res)) return;
  res.json(reportSummary());
});
app.get("/api/projects/:id/logs", (req, res) => {
  const user = auth(req, res);
  if (!user) return;
  const row = project(req.params.id);
  if (!row) return res.status(404).json({ error: "Project not found" });
  const view = projectView(row, user.id);
  return res.json({ project: view, logs: view.events });
});
app.post("/api/projects/:id/committees", (req, res) => {
  const user = auth(req, res);
  const row = project(req.params.id);
  if (!user || !row)
    return res
      .status(403)
      .json({ error: "A signed-in user and valid project are required" });
  const committeeWorkflow: Record<
    string,
    {
      type: string;
      next: string;
      requiresIa?: boolean;
      requiresApproval?: boolean;
      approvalAuthority?: string;
    }
  > = {
    committee_pending: {
      type: "Technical Scrutiny Committee",
      next: "tsc_formation_document",
      requiresApproval: true,
      approvalAuthority: "AS (IA)",
    },
    tec_formation: {
      type: "Technical Evaluation Committee",
      next: "tec_formation_document",
      requiresApproval: true,
      approvalAuthority: "SS",
    },
    tac_formation: {
      type: "Tender Acceptance Committee (TAC)",
      next: "tac_formation_document",
      requiresIa: true,
    },
  };
  const workflow = committeeWorkflow[row.stage];
  if (!workflow)
    return res.status(400).json({ error: "A committee cannot be formed at this stage" });
  const requiredRole = row.stage === "committee_pending" ? "admin" : "hq";
  if (user.role !== requiredRole)
    return res.status(403).json({
      error:
        requiredRole === "admin"
          ? "Only Admin (IA) can form the TSC"
          : "Only Admin HQ can form committees from the Bid Opening Board stage onward",
    });
  const parsed = z
    .object({
      chairmanId: z.string().min(1),
      memberIds: z.array(z.string()).length(3),
      constitutionDate: z.string().min(1),
      validUntil: z.string().optional(),
      terms: z.string().min(3).default("Constitute the board and complete its assigned procurement review."),
    })
    .safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: "Select exactly three members and one chairperson" });
  if (
    new Set(parsed.data.memberIds).size !== 3 ||
    !parsed.data.memberIds.includes(parsed.data.chairmanId)
  ) {
    return res
      .status(400)
      .json({
        error:
          "A committee must contain exactly three unique people, including the chairperson",
      });
  }
  const selectedPeople = db
    .prepare(
      `SELECT p.id, d.code department_code FROM people p
       JOIN departments d ON d.id = p.department_id
       WHERE p.active = 1 AND p.id IN (${parsed.data.memberIds.map(() => "?").join(",")})`,
    )
    .all(...parsed.data.memberIds) as Array<{
      id: string;
      department_code: string;
    }>;
  if (selectedPeople.length !== 3)
    return res.status(400).json({ error: "All committee members must be active personnel" });
  if (
    workflow.requiresIa &&
    !selectedPeople.some((person) => person.department_code === "IA")
  )
    return res.status(400).json({
      error: "TAC must include at least one member from the Inspection & Audit department",
    });
  const existing = db
    .prepare(
      "SELECT MAX(version) version FROM committees WHERE project_id = ? AND type = ?",
    )
    .get(row.id, workflow.type) as { version: number | null };
  const previousTsc =
    workflow.type === "Technical Scrutiny Committee"
      ? (db
          .prepare(
            "SELECT id, status FROM committees WHERE project_id = ? AND type = ? ORDER BY version DESC LIMIT 1",
          )
          .get(row.id, workflow.type) as
          | { id: string; status: string }
          | undefined)
      : undefined;
  const isTscRevision =
    row.stage === "committee_pending" &&
    previousTsc?.status === "changes_requested";
  const committeeId = uid("committee");
  const createCommittee = db.transaction(() => {
    db.prepare(
      "INSERT INTO committees VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      committeeId,
      row.id,
      workflow.type,
      (existing.version ?? 0) + 1,
      parsed.data.chairmanId,
      null,
      null,
      parsed.data.constitutionDate,
      parsed.data.validUntil ?? null,
      parsed.data.terms,
      workflow.requiresApproval ? "pending" : "approved",
    );
    const addMember = db.prepare(
      "INSERT INTO committee_members VALUES (?, ?, ?)",
    );
    parsed.data.memberIds.forEach((memberId) =>
      addMember.run(
        committeeId,
        memberId,
        memberId === parsed.data.chairmanId ? "Chairperson" : "Member",
      ),
    );
    db.prepare("INSERT INTO committee_approvals VALUES (?, ?, ?, ?, ?, ?)").run(
      uid("approval"),
      committeeId,
      user.id,
      isTscRevision ? "resubmitted" : workflow.requiresApproval ? "submitted" : "formed",
      isTscRevision
        ? "Revised TSC membership submitted in response to AS (IA)'s request"
        : workflow.requiresApproval
          ? `Committee composition submitted for ${workflow.approvalAuthority} approval`
          : "Committee constituted",
      now(),
    );
    db.prepare("UPDATE projects SET stage = ? WHERE id = ?").run(
      workflow.next,
      row.id,
    );
    addEvent(
      row.id,
      "committee",
      user.id,
      isTscRevision
        ? `Admin (IA) updated the TSC membership and submitted revision ${(existing.version ?? 0) + 1} for AS (IA) approval`
        : `${workflow.type} constituted (version ${(existing.version ?? 0) + 1})`,
    );
  });
  createCommittee();
  res.status(201).json({ committee: listCommittees(row.id)[0] });
});
app.post("/api/committees/:id/decision", (req, res) => {
  const user = auth(req, res);
  if (!user) return;
  const committee = db
    .prepare("SELECT * FROM committees WHERE id = ?")
    .get(req.params.id) as any;
  if (!committee) return res.status(404).json({ error: "Committee not found" });
  const projectStage = project(committee.project_id)?.stage;
  const isTscApproval =
    committee.type === "Technical Scrutiny Committee" &&
    committee.status === "pending" &&
    projectStage === "tsc_approval" &&
    user.role === "as_ia";
  const isTecApproval =
    committee.type === "Technical Evaluation Committee" &&
    committee.status === "pending" &&
    projectStage === "tec_approval" &&
    user.role === "hq";
  if (!isTscApproval && !isTecApproval)
    return res.status(403).json({
      error: "This committee has no pending approval for your role",
    });
  const approvalAuthority = isTscApproval ? "AS (IA)" : "SS";
  const approvalStage = isTscApproval ? "tsc_approval" : "tec_approval";
  const nextStage = isTscApproval
    ? "admin_tsc_signature"
    : "admin_tec_signature";
  const parsed = z
    .object({
      action: z.enum(["approve", "query", "request_changes"]),
      remarks: z.string().min(2),
    })
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Decision and remarks are required" });
  if (parsed.data.action === "request_changes" && !isTscApproval)
    return res
      .status(400)
      .json({ error: "Only AS (IA) can request changes to TSC members" });
  if (parsed.data.action === "request_changes") {
    const requestChanges = db.transaction(() => {
      db.prepare("UPDATE committees SET status = 'changes_requested' WHERE id = ?").run(
        committee.id,
      );
      db.prepare("INSERT INTO committee_approvals VALUES (?, ?, ?, ?, ?, ?)").run(
        uid("approval"),
        committee.id,
        user.id,
        parsed.data.action,
        parsed.data.remarks,
        now(),
      );
      db.prepare("UPDATE projects SET stage = 'committee_pending' WHERE id = ?").run(
        committee.project_id,
      );
      addEvent(
        committee.project_id,
        "committee_changes_requested",
        user.id,
        `AS (IA) returned the proposed TSC to Admin (IA) for member changes: ${parsed.data.remarks}`,
      );
    });
    requestChanges();
  } else if (parsed.data.action === "query") {
    const recordQuery = db.transaction(() => {
      db.prepare(
        "INSERT INTO queries (id, project_id, actor_id, text, status, at, stage) VALUES (?, ?, ?, ?, 'open', ?, ?)",
      ).run(
        uid("qry"),
        committee.project_id,
        user.id,
        parsed.data.remarks,
        now(),
        approvalStage,
      );
      addEvent(
        committee.project_id,
        "committee_query",
        user.id,
        `${approvalAuthority} queried the proposed ${committee.type}: ${parsed.data.remarks}`,
      );
    });
    recordQuery();
  } else {
    const approveCommittee = db.transaction(() => {
      db.prepare("UPDATE committees SET status = 'approved' WHERE id = ?").run(
        committee.id,
      );
      db.prepare("INSERT INTO committee_approvals VALUES (?, ?, ?, ?, ?, ?)").run(
        uid("approval"),
        committee.id,
        user.id,
        parsed.data.action,
        parsed.data.remarks,
        now(),
      );
      db.prepare("UPDATE projects SET stage = ? WHERE id = ?").run(
        nextStage,
        committee.project_id,
      );
      addEvent(
        committee.project_id,
        "committee_approval",
        user.id,
        isTscApproval
          ? "AS (IA) approved the TSC as final; Admin must upload the signed approval before the workflow continues"
          : "SS approved the TEC; Admin HQ must upload the signed approval before technical bid evaluation can begin",
      );
    });
    approveCommittee();
  }
  res.json({
    committee: listCommittees(committee.project_id)[0],
    project: projectView(project(committee.project_id), user.id),
  });
});
app.post("/api/projects", (req, res) => {
  const user = auth(req, res);
  if (!user || user.role !== "admin")
    return res
      .status(403)
      .json({ error: "Only Admin (IA) can create a procurement project" });
  const parsed = z
    .object({
      title: z.string().min(2),
      description: z.string().min(5),
      estimatedValue: z.coerce.number().min(0),
      deadline: z.string().min(1),
      requirementName: z.string().min(1).max(255),
      requirementPdf: z.string().min(1).max(11_200_000),
    })
    .safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: "Project details and the Department's letter are required" });
  const pdfData =
    /^data:application\/pdf;base64,([A-Za-z0-9+/]+={0,2})$/.exec(
      parsed.data.requirementPdf,
    );
  if (
    !pdfData ||
    !parsed.data.requirementName.toLowerCase().endsWith(".pdf")
  )
    return res
      .status(400)
      .json({ error: "Upload a valid PDF department letter" });
  const pdfBytes = Buffer.from(pdfData[1], "base64");
  if (
    pdfBytes.length === 0 ||
    pdfBytes.length > 8 * 1024 * 1024 ||
    pdfBytes.subarray(0, 5).toString() !== "%PDF-"
  )
    return res
      .status(400)
      .json({ error: "The department letter must be a PDF no larger than 8 MB" });
  const id = uid("PRJ");
  const documentId = uid("doc");
  const at = now();
  const stage = "committee_pending";
  const createDemand = db.transaction(() => {
    db.prepare("INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      id,
      parsed.data.title,
      parsed.data.description,
      parsed.data.estimatedValue,
      parsed.data.deadline,
      stage,
      user.id,
      at,
    );
    db.prepare(
      "INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      documentId,
      id,
      "department_letter",
      parsed.data.requirementName,
      `uploads/${documentId}-${parsed.data.requirementName.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 60)}`,
      user.id,
      at,
      "application/pdf",
      parsed.data.requirementPdf,
    );
    addEvent(
      id,
      "project_created",
      user.id,
      "Admin (IA) created the project and uploaded the Department's offline letter",
    );
  });
  createDemand();
  return res.status(201).json({ project: projectView(project(id), user.id) });
});
app.post("/api/projects/:id/workflow-action", (req, res) => {
  const user = auth(req, res);
  const row = project(req.params.id);
  if (!user || !row)
    return res.status(404).json({ error: "Project not found" });
  const parsed = z
    .object({
      action: z.string().min(1),
      data: z.record(z.unknown()).optional().default({}),
    })
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "A workflow action is required" });
  const { action, data } = parsed.data;
  const requireStageRole = (stage: string, role: string) =>
    row.stage === stage && user.role === role;
  const storePdf = (
    category: string,
    name: string,
    content: string,
  ) => {
    const pdf = /^data:application\/pdf;base64,([A-Za-z0-9+/]+={0,2})$/.exec(
      content,
    );
    if (!name.toLowerCase().endsWith(".pdf") || !pdf)
      throw new Error("Upload a valid PDF document");
    const bytes = Buffer.from(pdf[1], "base64");
    if (
      bytes.length === 0 ||
      bytes.length > 8 * 1024 * 1024 ||
      bytes.subarray(0, 5).toString() !== "%PDF-"
    )
      throw new Error("PDF must be valid and no larger than 8 MB");
    const id = uid("doc");
    db.prepare(
      "INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      id,
      row.id,
      category,
      name,
      `uploads/${id}-${name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 60)}`,
      user.id,
      now(),
      "application/pdf",
      content,
    );
  };
  const move = (target: string, type: string, message: string) => {
    db.prepare("UPDATE projects SET stage = ? WHERE id = ?").run(target, row.id);
    addEvent(row.id, type, user.id, message);
  };
  try {
    if (action === "forward_as" && requireStageRole("admin_report_review", "admin")) {
      move("as_review", action, "Admin sent the TSC specifications report to AS (IA)");
    } else if (
      action === "route_second_review" &&
      requireStageRole("admin_after_as", "admin")
    ) {
      move("hq_review", action, "Admin sent the report to Admin HQ for DGS review");
    } else if (
      action === "forward_to_dgs_review" &&
      requireStageRole("hq_review", "hq")
    ) {
      const input = z.object({ remarks: z.string().min(2) }).safeParse(data);
      if (!input.success)
        return res
          .status(400)
          .json({ error: "Add remarks before sending the report for offline DGS approval" });
      move(
        "dgs_ia_review",
        action,
        `Admin HQ sent the report to DGS for offline approval: ${input.data.remarks}`,
      );
    } else if (
      action === "forward_to_cs_sr_review" &&
      requireStageRole("hq_after_dgs", "hq")
    ) {
      const input = z.object({ remarks: z.string().min(2) }).safeParse(data);
      if (!input.success)
        return res
          .status(400)
          .json({ error: "Add remarks before sending the report for offline CS/SR approval" });
      move(
        "cs_sr_review",
        action,
        `Admin HQ sent the report to CS/SR for offline approval after DGS approval: ${input.data.remarks}`,
      );
    } else if (
      action === "submit_draft_tender" &&
      requireStageRole("tender_draft", "hq")
    ) {
      const input = z
        .object({
          name: z.string().min(1),
          content: z.string().min(1),
          remarks: z.string().min(2),
        })
        .safeParse(data);
      if (!input.success)
        return res.status(400).json({ error: "Upload the draft tender PDF and add remarks" });
      storePdf("draft_tender", input.data.name, input.data.content);
      move(
        "ia_tender_review",
        action,
        `Admin HQ uploaded the draft tender and sent it only to Admin (IA): ${input.data.remarks}`,
      );
    } else if (
      action === "submit_draft_suggestions" &&
      requireStageRole("ia_tender_review", "admin")
    ) {
      const input = z.object({ remarks: z.string().min(2) }).safeParse(data);
      if (!input.success)
        return res
          .status(400)
          .json({ error: "Enter suggestions for Admin HQ about the draft tender" });
      saveWorkflowRecord(row.id, "draft_tender_suggestions", input.data, user.id);
      addEvent(
        row.id,
        action,
        user.id,
        `Admin (IA) sent draft tender suggestions to Admin HQ: ${input.data.remarks}`,
      );
    } else if (
      action === "publish_final_tender" &&
      requireStageRole("ia_tender_review", "hq")
    ) {
      const input = z
        .object({
          name: z.string().min(1),
          content: z.string().min(1),
          deadline: z.string().min(1),
          remarks: z.string().min(2),
        })
        .safeParse(data);
      if (!input.success)
        return res.status(400).json({ error: "Final PDF, tender deadline and remarks are required" });
      if (Number.isNaN(Date.parse(input.data.deadline)))
        return res.status(400).json({ error: "Enter a valid tender deadline" });
      storePdf("final_tender", input.data.name, input.data.content);
      db.prepare("UPDATE projects SET deadline = ? WHERE id = ?").run(
        input.data.deadline,
        row.id,
      );
      move("admin_issue_tender", action, `Admin HQ published the final tender with deadline ${input.data.deadline}: ${input.data.remarks}`);
    } else if (
      action === "issue_tender" &&
      requireStageRole("admin_issue_tender", "hq")
    ) {
      move("bid_submission", action, `Admin HQ sent the final tender to vendors; bids due ${row.deadline}`);
    } else if (
      action === "confirm_bids" &&
      requireStageRole("bid_submission", "hq")
    ) {
      const input = z
        .object({ count: z.coerce.number().int().min(0), remarks: z.string().min(2) })
        .safeParse(data);
      if (!input.success)
        return res.status(400).json({ error: "Record the received bid count and remarks" });
      const tenderDeadline = Date.parse(row.deadline);
      if (!Number.isFinite(tenderDeadline) || tenderDeadline > Date.now())
        return res.status(400).json({ error: "Bid receipt can be recorded only after the tender deadline" });
      saveWorkflowRecord(row.id, "bid_receipt", input.data, user.id);
      move("opening_board_formation", action, `Admin HQ confirmed receipt of ${input.data.count} bids: ${input.data.remarks}`);
    } else if (
      action === "submit_tec_report" &&
      requireStageRole("tec_review", "hq")
    ) {
      const input = z
        .object({
          title: z.string().min(3),
          content: z.string().min(10),
          qualifiedVendorIds: z.array(z.string()).min(1),
        })
        .safeParse(data);
      if (!input.success)
        return res.status(400).json({ error: "Report details and at least one technically qualified vendor are required" });
      const vendors = db
        .prepare(`SELECT id FROM vendors WHERE active = 1 AND id IN (${input.data.qualifiedVendorIds.map(() => "?").join(",")})`)
        .all(...input.data.qualifiedVendorIds) as Array<{ id: string }>;
      if (vendors.length !== new Set(input.data.qualifiedVendorIds).size)
        return res.status(400).json({ error: "Select valid, unique active vendors" });
      saveWorkflowRecord(row.id, "tec_report", { ...input.data, qualifiedVendorIds: vendors.map((vendor) => vendor.id) }, user.id);
      move("price_opening", action, `TEC submitted its technical qualification report to Admin HQ: ${input.data.title}`);
    } else if (
      action === "submit_tec_financial_report" &&
      requireStageRole("price_opening", "hq")
    ) {
      const input = z
        .object({
          topVendorIds: z.array(z.string()).length(3),
          remarks: z.string().min(10),
        })
        .safeParse(data);
      if (!input.success || new Set(input.data.topVendorIds).size !== 3)
        return res.status(400).json({ error: "Select exactly three unique shortlisted vendors and include the evaluation report" });
      const technicalReport = db
        .prepare("SELECT data FROM workflow_records WHERE project_id = ? AND kind = 'tec_report' ORDER BY at DESC LIMIT 1")
        .get(row.id) as { data: string } | undefined;
      const qualified = technicalReport
        ? (JSON.parse(technicalReport.data).qualifiedVendorIds as string[])
        : [];
      if (!input.data.topVendorIds.every((id) => qualified.includes(id)))
        return res.status(400).json({ error: "Financial evaluation can only include technically qualified vendors" });
      saveWorkflowRecord(row.id, "tec_financial_report", input.data, user.id);
      move(
        "tac_formation",
        action,
        "TEC opened and evaluated financial bids, then submitted its top-three report to Admin HQ",
      );
    } else if (
      action === "submit_tac_report" &&
      requireStageRole("tac_review", "hq")
    ) {
      const input = z
        .object({
          vendorId: z.string().min(1),
          price: z.coerce.number().positive(),
          technicalSpecifications: z.string().min(10),
          remarks: z.string().min(10),
        })
        .safeParse(data);
      if (!input.success)
        return res.status(400).json({ error: "Selected vendor, positive price, technical specifications and report are required" });
      const shortlist = db
        .prepare("SELECT data FROM workflow_records WHERE project_id = ? AND kind IN ('tec_financial_report', 'x_report') ORDER BY at DESC LIMIT 1")
        .get(row.id) as { data: string } | undefined;
      const topVendorIds = shortlist
        ? (JSON.parse(shortlist.data).topVendorIds as string[])
        : [];
      if (!topVendorIds.includes(input.data.vendorId))
        return res.status(400).json({ error: "Select a vendor from the TEC financial shortlist" });
      const vendor = db.prepare("SELECT name FROM vendors WHERE id = ?").get(input.data.vendorId) as { name: string };
      saveWorkflowRecord(row.id, "tac_report", { ...input.data, vendorName: vendor.name }, user.id);
      move("cfa_approval", action, `TAC sent its recommendation to Admin HQ: ${vendor.name} at ${input.data.price} with technical specifications`);
    } else if (
      action === "cfa_release_funds" &&
      requireStageRole("cfa_approval", "hq")
    ) {
      const input = z
        .object({
          reference: z.string().min(2),
          amount: z.coerce.number().positive(),
          remarks: z.string().min(5),
        })
        .safeParse(data);
      if (!input.success)
        return res.status(400).json({ error: "CFA release reference, positive amount and remarks are required" });
      saveWorkflowRecord(row.id, "cfa_fund_release", input.data, user.id);
      move("admin_cfa_signature", action, `Admin HQ recorded CFA's offline approval through IFD for ${input.data.amount}: ${input.data.reference}; Admin HQ must upload the signed approval`);
    } else {
      return res.status(403).json({ error: "This action is not available for your role or the current project stage" });
    }
    return res.json({ project: projectView(project(row.id), user.id) });
  } catch (error) {
    if (error instanceof Error)
      return res.status(400).json({ error: error.message });
    throw error;
  }
});
app.post("/api/projects/:id/as-decision", (req, res) => {
  const user = auth(req, res);
  const row = project(req.params.id);
  if (!user || !row)
    return res.status(404).json({ error: "Project not found" });
  if (user.role !== "as_ia" || row.stage !== "as_review")
    return res
      .status(403)
      .json({ error: "Only AS (IA) can decide this report" });
  const parsed = z
    .object({
      action: z.enum(["approve", "query", "reject"]),
      remarks: z.string().min(2),
    })
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Decision and remarks are required" });
  if (parsed.data.action === "query") {
    db.prepare(
      "INSERT INTO queries (id, project_id, actor_id, text, status, at, stage) VALUES (?, ?, ?, ?, 'open', ?, 'as_review')",
    ).run(uid("qry"), row.id, user.id, parsed.data.remarks, now());
    addEvent(
      row.id,
      "as_query",
      user.id,
      "AS (IA) raised a query on the TSC report",
    );
  } else {
    db.prepare("UPDATE projects SET stage = ? WHERE id = ?").run(
      parsed.data.action === "approve" ? "admin_as_signature" : "admin_after_as",
      row.id,
    );
    db.prepare(
      "UPDATE tsc_reports SET status = ? WHERE project_id = ? AND status = 'submitted'",
    ).run(
      parsed.data.action === "approve"
        ? "approved_by_as"
        : "returned_to_admin",
      row.id,
    );
    addEvent(
      row.id,
      "as_decision",
      user.id,
      parsed.data.action === "approve"
        ? "AS (IA) approved the TSC report and returned it to Admin"
        : "AS (IA) returned the TSC report to Admin for review",
    );
  }
  res.json({ project: projectView(project(row.id), user.id) });
});
app.post("/api/projects/:id/hq-forward", (req, res) => {
  const user = auth(req, res);
  if (!user) return;
  const row = project(req.params.id);
  if (!row) return res.status(404).json({ error: "Project not found" });
  if (user.role !== "hq" || row.stage !== "hq_review")
    return res
      .status(403)
      .json({ error: "Only Admin HQ can forward this report for DGS review" });
  const parsed = z
    .object({ remarks: z.string().min(2) })
    .safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: "Forwarding remarks are required" });
  db.prepare("UPDATE projects SET stage = 'dgs_ia_review' WHERE id = ?").run(row.id);
  addEvent(
    row.id,
    "hq_forward",
    user.id,
    `Admin HQ sent the report to DGS for offline approval: ${parsed.data.remarks}`,
  );
  return res.json({ project: projectView(project(row.id), user.id) });
});
app.post("/api/projects/:id/close", (req, res) => {
  const user = auth(req, res);
  if (!user) return;
  const row = project(req.params.id);
  if (!row) return res.status(404).json({ error: "Project not found" });
  if (user.role !== "hq")
    return res
      .status(403)
      .json({ error: "Only Admin HQ can record the offline CFA approval" });
  if (row.stage !== "cfa_approval")
    return res
      .status(400)
      .json({ error: "CFA can only release funds after TAC submits its report" });
  const release = z.object({
    reference: z.string().min(2),
    amount: z.coerce.number().positive(),
    remarks: z.string().min(5),
  }).safeParse(req.body);
  if (!release.success)
    return res.status(400).json({ error: "Fund release details are required" });
  saveWorkflowRecord(row.id, "cfa_fund_release", release.data, user.id);
  db.prepare("UPDATE projects SET stage = 'admin_cfa_signature' WHERE id = ?").run(row.id);
  addEvent(
    row.id,
    "cfa_release_funds",
    user.id,
    `CFA approved release of ${release.data.amount} through IFD: ${release.data.reference}; Admin HQ must upload the signed approval`,
  );
  return res.json({ project: projectView(project(row.id), user.id) });
});
app.post("/api/projects/:id/documents", (req, res) => {
  const user = auth(req, res);
  const row = project(req.params.id);
  if (!user || !row)
    return res.status(404).json({ error: "Project not found" });
  const parsed = z
    .object({
      category: z.string().min(1),
      name: z.string().min(1).max(255),
      mimeType: z.literal("application/pdf"),
      content: z.string().min(1).max(11_200_000),
    })
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Document details are required" });
  const formationHandoff = formationDocumentHandoffs[row.stage];
  const signatureHandoff = signedApprovalHandoffs[row.stage];
  const isCommitteeFormationDocument =
    formationHandoff !== undefined &&
    parsed.data.category === formationHandoff.category &&
    user.role === formationHandoff.uploaderRole;
  const isBidOpeningBoardDocument =
    parsed.data.category === "bid_opening_board_formation" &&
    row.stage === "opening_board_formation" &&
    user.role === "hq";
  const isFinalAcceptanceDocument =
    parsed.data.category === "final_acceptance" &&
    row.stage === "ifd_review" &&
    user.role === "hq";
  const isTscReportUpload =
    parsed.data.category === "tsc_report" &&
    row.stage === "tsc_report" &&
    user.role === "admin";
  const isSignedApprovalUpload =
    parsed.data.category === "signed_approval" &&
    signatureHandoff !== undefined &&
    user.role === signatureHandoff.uploaderRole;
  if (
    !isTscReportUpload &&
    !isSignedApprovalUpload &&
    !isBidOpeningBoardDocument &&
    !isCommitteeFormationDocument &&
    !isFinalAcceptanceDocument
  )
    return res
      .status(403)
      .json({ error: "This role cannot upload this document at the current stage" });
  const pdfData = /^data:application\/pdf;base64,([A-Za-z0-9+/]+={0,2})$/.exec(
    parsed.data.content,
  );
  if (
    !parsed.data.name.toLowerCase().endsWith(".pdf") ||
    !pdfData ||
    Buffer.from(pdfData[1], "base64").subarray(0, 5).toString() !== "%PDF-"
  )
    return res.status(400).json({ error: "Upload a valid PDF document" });
  const documentId = uid("doc");
  const shortName = parsed.data.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 60) || "document";
  const uploadedAt = now();
  if (parsed.data.category === "tsc_report") {
    const latest = db
      .prepare(
        "SELECT MAX(version) version FROM tsc_reports WHERE project_id = ?",
      )
      .get(row.id) as { version: number | null };
    const version = (latest.version ?? 0) + 1;
    const reportId = uid("report");
    const uploadReport = db.transaction(() => {
      db.prepare(
        "INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        documentId,
        row.id,
        parsed.data.category,
        parsed.data.name,
        `uploads/${documentId}-${shortName}`,
        user.id,
        uploadedAt,
        parsed.data.mimeType,
        parsed.data.content,
      );
      db.prepare("INSERT INTO tsc_reports VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
        reportId,
        row.id,
        version,
        user.id,
        parsed.data.name.replace(/\.pdf$/i, ""),
        "Offline report provided by TSC and uploaded by Admin.",
        "submitted",
        uploadedAt,
      );
      db.prepare("UPDATE projects SET stage = 'admin_report_review' WHERE id = ?").run(
        row.id,
      );
      addEvent(
        row.id,
        "tsc_report",
        user.id,
        `Admin uploaded the offline TSC report (version ${version}) for review`,
      );
    });
    uploadReport();
  } else if (isCommitteeFormationDocument && formationHandoff) {
    const uploadFormationDocument = db.transaction(() => {
      db.prepare(
        "INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        documentId,
        row.id,
        parsed.data.category,
        parsed.data.name,
        `uploads/${documentId}-${shortName}`,
        user.id,
        uploadedAt,
        parsed.data.mimeType,
        parsed.data.content,
      );
      db.prepare("UPDATE projects SET stage = ? WHERE id = ?").run(
        formationHandoff.nextStage,
        row.id,
      );
      addEvent(
        row.id,
        "committee_formation_document",
        user.id,
        `${user.role === "hq" ? "Admin HQ" : "Admin (IA)"} uploaded the ${formationHandoff.description}`,
      );
    });
    uploadFormationDocument();
  } else if (isBidOpeningBoardDocument) {
    const uploadBoardFormation = db.transaction(() => {
      db.prepare(
        "INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        documentId,
        row.id,
        parsed.data.category,
        parsed.data.name,
        `uploads/${documentId}-${shortName}`,
        user.id,
        uploadedAt,
        parsed.data.mimeType,
        parsed.data.content,
      );
      db.prepare("UPDATE projects SET stage = 'tec_formation' WHERE id = ?").run(
        row.id,
      );
      addEvent(
        row.id,
        "bid_opening_board_formation",
        user.id,
        "Admin HQ uploaded the document confirming the Bid Opening Board was formed offline",
      );
    });
    uploadBoardFormation();
  } else if (isFinalAcceptanceDocument) {
    const uploadFinalAcceptance = db.transaction(() => {
      db.prepare(
        "INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        documentId,
        row.id,
        parsed.data.category,
        parsed.data.name,
        `uploads/${documentId}-${shortName}`,
        user.id,
        uploadedAt,
        parsed.data.mimeType,
        parsed.data.content,
      );
      db.prepare("UPDATE projects SET stage = 'completed' WHERE id = ?").run(
        row.id,
      );
      addEvent(
        row.id,
        "final_acceptance_upload",
        user.id,
        "Admin HQ uploaded the final acceptance document after offline IFD approval; the project is complete",
      );
    });
    uploadFinalAcceptance();
  } else if (signatureHandoff) {
    const uploadSignedApproval = db.transaction(() => {
      db.prepare(
        "INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        documentId,
        row.id,
        parsed.data.category,
        parsed.data.name,
        `uploads/${documentId}-${shortName}`,
        user.id,
        uploadedAt,
        parsed.data.mimeType,
        parsed.data.content,
      );
      db.prepare("UPDATE projects SET stage = ? WHERE id = ?").run(
        signatureHandoff.nextStage,
        row.id,
      );
      addEvent(
        row.id,
        "signed_approval_upload",
        user.id,
        `${signatureHandoff.uploaderRole === "hq" ? "Admin HQ" : "Admin"} uploaded the signed ${signatureHandoff.approval} document.${signatureHandoff.completion ? ` ${signatureHandoff.completion}.` : ""}`,
      );
    });
    uploadSignedApproval();
  }
  return res.json({ project: projectView(project(row.id), user.id) });
});
app.post("/api/projects/:id/bids", (req, res) => {
  const user = auth(req, res);
  const row = project(req.params.id);
  if (!user || !row)
    return res.status(404).json({ error: "Project not found" });
  if (user.role !== "vendor" || row.stage !== "bid_submission")
    return res
      .status(403)
      .json({
        error: "Bids are only accepted from vendors during bid submission",
      });
  return res.status(501).json({
    error: "Vendor bid submission is an offline process and is not implemented",
  });
});
app.post("/api/projects/:id/queries", (req, res) => {
  const user = auth(req, res);
  const row = project(req.params.id);
  if (!user || !row)
    return res.status(404).json({ error: "Project not found" });
  if (user.role === "vendor")
    return res.status(403).json({ error: "Vendor questions are handled offline" });
  const parsed = z.object({ text: z.string().min(2) }).safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Query text is required" });
  db.prepare(
    "INSERT INTO queries (id, project_id, actor_id, text, status, at, stage) VALUES (?, ?, ?, ?, 'open', ?, ?)",
  ).run(uid("qry"), row.id, user.id, parsed.data.text, now(), row.stage);
  addEvent(row.id, "query", user.id, "A query was raised");
  return res.json({ project: projectView(project(row.id), user.id) });
});
app.post("/api/projects/:id/queries/:queryId/replies", (req, res) => {
  const user = auth(req, res);
  const row = project(req.params.id);
  if (!user || !row)
    return res.status(404).json({ error: "Project not found" });
  const parsed = z.object({ text: z.string().min(2) }).safeParse(req.body);
  const queryRecord = db
    .prepare("SELECT * FROM queries WHERE id = ? AND project_id = ?")
    .get(req.params.queryId, row.id) as any;
  if (!parsed.success || !queryRecord || !queryParticipant(user, queryRecord))
    return res
      .status(403)
      .json({
        error: "This conversation is restricted to its approval participants",
      });
  db.prepare("INSERT INTO replies VALUES (?, ?, ?, ?, ?)").run(
    uid("reply"),
    req.params.queryId,
    user.id,
    parsed.data.text,
    now(),
  );
  db.prepare("UPDATE queries SET status = 'replied' WHERE id = ?").run(
    req.params.queryId,
  );
  return res.json({ project: projectView(project(row.id), user.id) });
});
app.use(express.static(path.resolve(process.cwd(), "dist/client")));
app.use((_req, res) =>
  res.sendFile(path.resolve(process.cwd(), "dist/client/index.html")),
);
app.listen(port, "0.0.0.0", () =>
  console.log(`ProcureFlow running on http://0.0.0.0:${port}`),
);
