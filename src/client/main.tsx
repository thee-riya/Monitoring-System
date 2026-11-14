import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  Bootstrap,
  Committee,
  Person,
  Project,
  User,
} from "../shared/types";
import "./styles.css";

const roles: Record<string, string> = {
  department: "Department (ARC)",
  admin: "Admin (IA)",
  super_admin: "Super Admin",
  hq: "Admin HQ",
  committee: "Committee Member",
  ia: "IA (historical record)",
  cfa: "Competent Financial Authority",
  vendor: "Vendor",
  as_ia: "AS (IA)",
  dgs_ia: "DGS",
};
const api = async <T,>(url: string, options?: RequestInit): Promise<T> => {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
};
const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
const pdfToDataUrl = async (file: File) => {
  if (!file.name.toLowerCase().endsWith(".pdf") || file.size > 8 * 1024 * 1024)
    throw new Error("Select a PDF no larger than 8 MB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
    throw new Error("The selected file is not a valid PDF");
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return `data:application/pdf;base64,${btoa(binary)}`;
};

const stageOrder = [
  "committee_pending", "tsc_formation_document", "tsc_approval",
  "admin_tsc_signature", "tsc_report",
  "admin_report_review", "as_review", "admin_as_signature", "admin_after_as",
  "hq_review", "dgs_ia_review", "hq_after_dgs", "cs_sr_review",
  "tender_draft", "ia_tender_review", "admin_issue_tender", "bid_submission",
  "opening_board_formation", "tec_formation", "tec_formation_document",
  "tec_approval", "admin_tec_signature", "tec_review",
  "price_opening", "tac_formation", "tac_formation_document", "tac_review",
  "cfa_approval", "admin_cfa_signature", "ifd_review", "completed",
  "terminated",
];
const committeeTypeByStage: Record<string, string> = {
  committee_pending: "Technical Scrutiny Committee",
  tsc_formation_document: "Technical Scrutiny Committee",
  tsc_approval: "Technical Scrutiny Committee",
  tec_formation: "Technical Evaluation Committee",
  tec_formation_document: "Technical Evaluation Committee",
  tec_approval: "Technical Evaluation Committee",
  tec_review: "Technical Evaluation Committee",
  price_opening: "Technical Evaluation Committee",
  tac_formation: "Tender Acceptance Committee (TAC)",
  tac_formation_document: "Tender Acceptance Committee (TAC)",
  tac_review: "Tender Acceptance Committee (TAC)",
};
const formationDocumentStages: Record<
  string,
  { category: string; label: string; uploaderRole: string }
> = {
  tsc_formation_document: {
    category: "tsc_formation_support",
    label: "TSC formation supporting document",
    uploaderRole: "admin",
  },
  tec_formation_document: {
    category: "tec_formation_support",
    label: "TEC formation supporting document",
    uploaderRole: "hq",
  },
  tac_formation_document: {
    category: "tac_formation_support",
    label: "TAC formation supporting document",
    uploaderRole: "hq",
  },
};
const legacyDocumentStageByCategory: Record<string, string> = {
  department_letter: "committee_pending",
  requirement: "committee_pending",
  tsc_formation_support: "tsc_formation_document",
  tec_formation_support: "tec_formation_document",
  tac_formation_support: "tac_formation_document",
  tsc_report: "tsc_report",
  draft_tender: "tender_draft",
  final_tender: "ia_tender_review",
  bid_opening_board_formation: "opening_board_formation",
  final_acceptance: "ifd_review",
};
const documentEventTypeByCategory: Record<string, string> = {
  department_letter: "project_created",
  requirement: "demand_submitted",
  tsc_formation_support: "committee_formation_document",
  tec_formation_support: "committee_formation_document",
  tac_formation_support: "committee_formation_document",
  tsc_report: "tsc_report",
  draft_tender: "submit_draft_tender",
  final_tender: "publish_final_tender",
  bid_opening_board_formation: "bid_opening_board_formation",
  signed_approval: "signed_approval_upload",
  final_acceptance: "final_acceptance_upload",
  approval_rejection: "project_rejected",
};
const signedApprovalStages: Record<string, string> = {
  admin_tsc_signature: "AS (IA) TSC formation approval",
  admin_as_signature: "AS (IA) TSC report approval",
  dgs_ia_review: "DGS offline TSC report approval",
  cs_sr_review: "CS/SR offline TSC report approval",
  admin_tec_signature: "SS TEC approval",
  admin_cfa_signature: "CFA fund release approval",
};
const rejectionApprovalByStage: Record<
  string,
  { role: "as_ia" | "hq"; authority: string }
> = {
  tsc_approval: { role: "as_ia", authority: "AS (IA)" },
  as_review: { role: "as_ia", authority: "AS (IA)" },
  dgs_ia_review: { role: "hq", authority: "DGS" },
  cs_sr_review: { role: "hq", authority: "CS/SR" },
  tec_approval: { role: "hq", authority: "SS" },
  cfa_approval: { role: "hq", authority: "CFA" },
  ifd_review: { role: "hq", authority: "IFD" },
};
const signedApprovalRoles: Record<string, string> = {
  admin_tsc_signature: "admin",
  admin_as_signature: "admin",
  dgs_ia_review: "hq",
  cs_sr_review: "hq",
  admin_tec_signature: "hq",
  admin_cfa_signature: "hq",
};
const stageNextStep = (stage: string) => {
  const steps: Record<string, string> = {
    committee_pending: "Next: Admin (IA) (admin / admin123) forms or revises the three-member TSC.",
    tsc_formation_document: "Next: Admin (IA) uploads the TSC formation supporting document before AS (IA) approval.",
    tsc_approval: "Next: AS (IA) (AS / AS123) reviews and approves the proposed TSC; AS may query Admin (IA).",
    admin_tsc_signature: "Next: Admin (IA) uploads AS (IA)'s signed TSC formation approval.",
    tsc_report: "Next: Admin (IA) (admin / admin123) uploads the specifications report provided offline by TSC.",
    admin_report_review: "Next: Admin (IA) (admin / admin123) sends the TSC report to AS (IA).",
    as_review: "Next: AS (IA) (AS / AS123) gives the first approval of the TSC report.",
    admin_as_signature: "Next: Admin (IA) uploads AS (IA)'s signed report approval.",
    admin_after_as: "Next: Admin (IA) (admin / admin123) sends the report to Admin HQ (hq / hq123).",
    hq_review: "Next: Admin HQ (hq / hq123) sends the report to DGS for offline approval.",
    dgs_ia_review: "DGS approval is offline. After the report returns to HQ, Admin HQ uploads the signed DGS approval PDF.",
    hq_after_dgs: "Admin HQ sends the report to CS/SR for offline approval after DGS approval.",
    cs_sr_review: "CS/SR approval is offline. After the report returns to HQ, Admin HQ uploads the signed approval PDF to begin tender processing.",
    tender_draft: "Next: Admin HQ (hq / hq123) uploads the draft tender and sends it only to Admin (IA) for review.",
    ia_tender_review: "Admin (IA) may review the draft and send suggestions if needed; Admin HQ (hq / hq123) publishes the final tender with a deadline.",
    admin_issue_tender: "Next: Admin HQ (hq / hq123) sends the final tender to vendors.",
    bid_submission: "After the due time, Admin HQ (hq / hq123) records bids received.",
    opening_board_formation: "The Bid Opening Board is formed offline; Admin HQ uploads its formation document to continue.",
    tec_formation: "The Bid Opening Board opens technical bids offline. Next: Admin HQ (hq / hq123) forms TEC.",
    tec_formation_document: "Next: Admin HQ uploads the TEC formation supporting document before recording SS's offline decision.",
    tec_approval: "Next: Admin HQ (hq / hq123) records SS's offline approval or query.",
    admin_tec_signature: "Next: Admin HQ uploads SS's signed TEC approval.",
    tec_review: "Next: Admin HQ (hq / hq123) records TEC's technical qualification report.",
    price_opening: "Next: Admin HQ (hq / hq123) records TEC's financial bid opening and evaluation for technically qualified vendors.",
    tac_formation: "Next: Admin HQ (hq / hq123) forms TAC, including a member from the Inspection & Audit department.",
    tac_formation_document: "Next: Admin HQ uploads the TAC formation supporting document.",
    tac_review: "Next: Admin HQ (hq / hq123) records the TAC recommendation.",
    cfa_approval: "Next: Admin HQ (hq / hq123) records CFA's offline approval through IFD.",
    admin_cfa_signature: "Next: Admin HQ uploads CFA's signed approval document.",
    ifd_review: "After offline IFD approval, Admin HQ (hq / hq123) uploads the final acceptance document.",
    completed: "Procurement workflow complete.",
    terminated: "A higher authority rejected the project; no further workflow actions are allowed.",
  };
  return steps[stage] ?? "";
};

const tenderDeadlineStages = new Set(["admin_issue_tender", "bid_submission"]);
const tenderDeadlineStatus = (project: Project, systemTime: number) => {
  if (!tenderDeadlineStages.has(project.stage)) return null;
  const deadline = Date.parse(project.deadline);
  if (!Number.isFinite(deadline)) return null;
  return {
    overdue: systemTime >= deadline,
    label: new Date(deadline).toLocaleString(),
  };
};

function TenderDeadline({
  project,
  systemTime,
}: {
  project: Project;
  systemTime: number;
}) {
  const deadline = tenderDeadlineStatus(project, systemTime);
  if (!deadline) return null;
  return (
    <p
      className={`tender-deadline${deadline.overdue ? " is-overdue" : ""}`}
      role="status"
      aria-live="polite"
    >
      {deadline.overdue
        ? `Overdue — bid deadline passed (${deadline.label})`
        : `Bids due by ${deadline.label}`}
    </p>
  );
}

function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [form, setForm] = useState({
    username: "admin",
    password: "admin123",
  });
  const [error, setError] = useState("");
  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand">
          <span className="logo">PF</span>
          <span>ProcureFlow</span>
        </div>
        <div className="eyebrow">LOCAL PROCUREMENT OPERATIONS</div>
        <h1>Tender command centre</h1>
        <p className="subtle">
          A secure, self-hosted workspace for every approval, query and bid.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const data = await api<{ user: User }>("/api/login", {
                method: "POST",
                body: JSON.stringify(form),
              });
              onLogin(data.user);
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          <label>
            Username
            <input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>
          {error && <div className="error">{error}</div>}
          <button className="button primary wide">Sign in</button>
        </form>
        <div className="demo">
          <b>Demo users</b>
          <br />
          admin / admin123 · AS / AS123 · hq / hq123
        </div>
      </section>
    </main>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<Bootstrap | null>(null);
  const [systemTime, setSystemTime] = useState(() => Date.now());
  const [view, setView] = useState("overview");
  const [selected, setSelected] = useState<Project | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const refresh = async () => {
    const next = await api<Bootstrap>("/api/bootstrap");
    setData(next);
    return next;
  };
  useEffect(() => {
    api<{ user: User }>("/api/me")
      .then((x) => {
        setUser(x.user);
        return refresh();
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setSystemTime(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  if (!user)
    return (
      <Login
        onLogin={(u) => {
          setUser(u);
          void refresh();
        }}
      />
    );
  if (!data) return <div className="loading">Loading workspace…</div>;
  const active = data.projects.filter(
    (p) => !["completed", "terminated"].includes(p.stage),
  ).length;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">PF</span>
          <span>ProcureFlow</span>
        </div>
        <div className="workspace">
          <span className="status-dot" /> LAN workspace
        </div>
        <nav>
          <button
            className={view === "overview" ? "nav-active" : ""}
            onClick={() => setView("overview")}
          >
            ◈ <span>Overview</span>
          </button>
          <button
            className={view === "projects" ? "nav-active" : ""}
            onClick={() => setView("projects")}
          >
            ▤ <span>All projects</span>
            <b>{active}</b>
          </button>
          {user.role === "admin" && (
            <button onClick={() => setShowCreate(true)}>
              ＋ <span>New project</span>
            </button>
          )}
          <button
            className={view === "workflow" ? "nav-active" : ""}
            onClick={() => setView("workflow")}
          >
            ◌ <span>Workflow map</span>
          </button>
          <button
            className={view === "people" ? "nav-active" : ""}
            onClick={() => setView("people")}
          >
            ◉ <span>People master</span>
            <b>{data.people.length}</b>
          </button>
          <button
            className={view === "committees" ? "nav-active" : ""}
            onClick={() => setView("committees")}
          >
            ◫ <span>Committee register</span>
            <b>{data.committees.length}</b>
          </button>
          <button
            className={view === "reports" ? "nav-active" : ""}
            onClick={() => setView("reports")}
          >
            ▥ <span>Reports</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="profile">
            <div className="avatar">
              {user.name
                .split(" ")
                .map((x) => x[0])
                .join("")}
            </div>
            <div>
              <b>{user.name}</b>
              <small>{roles[user.role]}</small>
            </div>
          </div>
          <button
            className="signout"
            onClick={async () => {
              await api("/api/logout", { method: "POST" });
              setUser(null);
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">
        <header className="topbar">
          <div>
            <div className="eyebrow">OPERATIONS / {view.toUpperCase()}</div>
            <h1>
              {view === "overview"
                ? "Hello " + user.name.split(" ")[0]
                : view === "projects"
                  ? "All projects"
                  : view === "workflow"
                    ? "Workflow map"
                    : view === "people"
                      ? "People master"
                      : view === "committees"
                        ? "Committee register"
                        : "Reports & monitoring"}
            </h1>
          </div>
          <div className="top-actions">
            <span className="network">
              <span className="status-dot" /> System online
            </span>
            {user.role === "admin" && (
              <button
                className="button primary"
                onClick={() => setShowCreate(true)}
              >
                ＋ New project
              </button>
            )}
          </div>
        </header>
        {view === "overview" && (
          <Overview
            data={data}
            onOpen={setSelected}
            onProjects={() => setView("projects")}
            systemTime={systemTime}
          />
        )}
        {view === "projects" && (
          <Projects
            data={data}
            onOpen={setSelected}
            systemTime={systemTime}
          />
        )}
        {view === "workflow" && <Workflow data={data} />}
        {view === "people" && (
          <PeopleView
            people={data.people}
            departments={data.departments}
            vendors={data.vendors}
          />
        )}
        {view === "committees" && (
          <CommitteeView
            committees={data.committees}
            projects={data.projects}
          />
        )}
        {view === "reports" && <ReportsView data={data} />}
      </main>
      {selected && (
        <ProjectDrawer
          project={selected}
          data={data}
          user={user}
          systemTime={systemTime}
          onClose={() => setSelected(null)}
          onRefresh={async () => {
            const latest = await refresh();
            const next = latest.projects.find((p) => p.id === selected.id);
            if (next) setSelected(next);
          }}
        />
      )}
      {showCreate && (
        <CreateDialog
          onClose={() => setShowCreate(false)}
          onCreated={async (p) => {
            await refresh();
            setShowCreate(false);
            setSelected(p);
          }}
        />
      )}
    </div>
  );
}

function Overview({
  data,
  onOpen,
  onProjects,
  systemTime,
}: {
  data: Bootstrap;
  onOpen: (p: Project) => void;
  onProjects: () => void;
  systemTime: number;
}) {
  const openQueries = data.projects.reduce(
    (n, p) => n + p.queries.filter((q) => q.status === "open").length,
    0,
  );
  const bids = data.projects.reduce((n, p) => n + p.bids.length, 0);
  return (
    <>
      <section className="metric-grid overview-metric-grid">
        <Metric
          label="Active projects"
          value={
            data.projects.filter(
              (p) => !["completed", "terminated"].includes(p.stage),
            ).length
          }
          detail="Across all workstreams"
        />
        <Metric
          label="Open queries"
          value={openQueries}
          detail="Need a response"
          tone="orange"
        />
        <Metric
          label="Vendor bids"
          value={bids}
          detail="Received submissions"
          tone="green"
        />
        <Metric
          label="Completed"
          value={data.projects.filter((p) => p.stage === "completed").length}
          detail="Successfully closed"
        />
        <Metric
          label="Terminated"
          value={data.projects.filter((p) => p.stage === "terminated").length}
          detail="Rejected by authority"
          tone="orange"
        />
      </section>
      <section className="section-head">
        <div>
          <h2>Priority workstreams</h2>
          <p className="subtle">Your current tender pipeline at a glance.</p>
        </div>
        <button className="text-button" onClick={onProjects}>
          View all projects →
        </button>
      </section>
      <div className="project-grid">
        {data.projects.slice(0, 6).map((p) => (
          <ProjectCard
            key={p.id}
            project={p}
            onOpen={onOpen}
            systemTime={systemTime}
          />
        ))}
      </div>
    </>
  );
}
function Metric({
  label,
  value,
  detail,
  tone = "",
}: {
  label: string;
  value: number;
  detail: string;
  tone?: string;
}) {
  return (
    <div className="metric-card">
      <div className={`metric-icon ${tone}`}>◈</div>
      <span className="subtle">{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
function Projects({
  data,
  onOpen,
  systemTime,
}: {
  data: Bootstrap;
  onOpen: (p: Project) => void;
  systemTime: number;
}) {
  return (
    <div className="project-grid">
      {data.projects.map((p) => (
        <ProjectCard
          key={p.id}
          project={p}
          onOpen={onOpen}
          systemTime={systemTime}
        />
      ))}
    </div>
  );
}
function ProjectCard({
  project,
  onOpen,
  systemTime,
}: {
  project: Project;
  onOpen: (p: Project) => void;
  systemTime: number;
}) {
  const percent =
    project.stage === "completed" || project.stage === "terminated"
      ? 100
      : Math.round(
          (Math.max(0, stageOrder.indexOf(project.stage)) /
            Math.max(1, stageOrder.length - 1)) *
            100,
        );
  return (
    <article className="project-card">
      <div className="card-top">
        <span className="project-id">{project.id}</span>
        <span
          className={`pill${project.stage === "terminated" ? " pill-terminated" : ""}`}
        >
          {project.stage === "terminated"
            ? "Project terminated"
            : `${percent}% complete`}
        </span>
      </div>
      <h3>{project.title}</h3>
      <p className="subtle clamp">{project.description}</p>
      <div className="progress">
        <i style={{ width: `${percent}%` }} />
      </div>
      <div className="card-meta">
        <span>
          <b>{project.stageLabel}</b>
          <small>Current stage</small>
          <small className="stage-next-hint">
            {stageNextStep(project.stage)}
          </small>
        </span>
        <span>
          <b>{money(project.estimatedValue)}</b>
          <small>Estimated value</small>
        </span>
      </div>
      <TenderDeadline project={project} systemTime={systemTime} />
      <button className="button secondary wide" onClick={() => onOpen(project)}>
        Open workspace <span>→</span>
      </button>
    </article>
  );
}
function Workflow({ data }: { data: Bootstrap }) {
  return (
    <section className="workflow-card">
      <h2>Procurement workflow</h2>
      <p className="subtle">Every project follows this controlled sequence.</p>
      <div className="workflow-list">
        {data.stages.map((s, i) => (
          <div className="workflow-step" key={s.id}>
            <div className="step-number">{String(i + 1).padStart(2, "0")}</div>
            <div>
              <b>{s.label}</b>
              <small>
                {data.projects.filter((p) => p.stage === s.id).length}{" "}
                project(s) at this stage
              </small>
              <small className="stage-next-hint">
                {stageNextStep(s.id)}
              </small>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PeopleView({
  people,
  departments,
  vendors,
}: {
  people: Person[];
  departments: Bootstrap["departments"];
  vendors: Bootstrap["vendors"];
}) {
  return (
    <div className="management-grid">
      <section className="workflow-card management-card">
        <div className="section-head">
          <div>
            <h2>People master</h2>
            <p className="subtle">
              Active personnel available for committee constitution.
            </p>
          </div>
          <span className="pill">
            {people.filter((p) => p.active).length} active
          </span>
        </div>
        <div className="data-table">
          {people.map((person) => (
            <div className="data-row" key={person.id}>
              <div>
                <b>{person.name}</b>
                <small>
                  {person.designation} ·{" "}
                  {person.employee_id ?? "No employee ID"}
                </small>
              </div>
              <span>{person.department_code}</span>
              <small>{person.expertise || person.contact || "—"}</small>
            </div>
          ))}
        </div>
      </section>
      <section className="workflow-card management-card">
        <div className="section-head">
          <div>
            <h2>Departments</h2>
            <p className="subtle">Organisational directory</p>
          </div>
        </div>
        <div className="data-table">
          {departments.map((d) => (
            <div className="data-row" key={d.id}>
              <div>
                <b>{d.name}</b>
                <small>{d.code}</small>
              </div>
              <span>{d.active ? "Active" : "Inactive"}</span>
            </div>
          ))}
        </div>
        <h3 className="subsection-title">Vendors ({vendors.length})</h3>
        {vendors.map((v) => (
          <div className="compact-item" key={v.id}>
            <b>{v.name}</b>
            <small>
              {v.registration_no} · {v.email}
            </small>
          </div>
        ))}
      </section>
    </div>
  );
}

function CommitteeView({
  committees,
  projects,
}: {
  committees: Committee[];
  projects: Project[];
}) {
  const projectName = (id: string) =>
    projects.find((p) => p.id === id)?.title ?? id;
  return (
    <section className="workflow-card management-card wide-card">
      <div className="section-head">
        <div>
          <h2>Committee register</h2>
          <p className="subtle">
            Constitution, membership and approval status by project.
          </p>
        </div>
        <span className="pill">
          {committees.filter((c) => c.status === "pending").length} pending
        </span>
      </div>
      {committees.length === 0 ? (
        <p className="subtle empty-state">
          No committees have been constituted yet.
        </p>
      ) : (
        <div className="committee-grid">
          {committees.map((c) => (
            <article className="committee-card" key={c.id}>
              <div className="card-top">
                <span className="project-id">
                  {c.type} · v{c.version}
                </span>
                <span className="pill">{c.status}</span>
              </div>
              <h3>{projectName(c.project_id)}</h3>
              <div className="committee-meta">
                <b>Chairman</b>
                <span>{c.chairman?.name ?? "—"}</span>
                <b>Members</b>
                <span>
                  {c.members.length
                    ? c.members.map((m) => m.name).join(", ")
                    : "—"}
                </span>
                <b>Constituted</b>
                <span>{c.constitution_date}</span>
              </div>
              {c.terms && <p className="subtle clamp">{c.terms}</p>}
              <small className="subtle">
                {c.approvals.length} approval event(s)
              </small>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ReportsView({ data }: { data: Bootstrap }) {
  const report = data.reports;
  return (
    <div className="reports-view">
      <section className="metric-grid">
        <Metric
          label="Pending committees"
          value={report.pendingCommittees}
          detail="Awaiting action"
          tone="orange"
        />
        <Metric
          label="Open queries"
          value={report.pendingQueries}
          detail="Need a response"
          tone="orange"
        />
        <Metric
          label="Delayed milestones"
          value={report.delayedMilestones}
          detail="Past planned end"
          tone="orange"
        />
        <Metric
          label="Tracked projects"
          value={data.projects.length}
          detail="All workstreams"
        />
      </section>
      <section className="workflow-card management-card wide-card">
        <div className="section-head">
          <div>
            <h2>Stage monitoring</h2>
            <p className="subtle">
              Current project distribution across the procurement workflow.
            </p>
          </div>
        </div>
        <div className="report-bars">
          {data.stages.map((stage) => {
            const count =
              report.projectCounts.find((x) => x.stage === stage.id)?.count ??
              0;
            const max = Math.max(
              1,
              ...report.projectCounts.map((x) => x.count),
            );
            return (
              <div className="report-bar" key={stage.id}>
                <div>
                  <span>{stage.label}</span>
                  <b>{count}</b>
                </div>
                <i style={{ width: `${Math.round((count / max) * 100)}%` }} />
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ProjectDrawer({
  project,
  data,
  user,
  systemTime,
  onClose,
  onRefresh,
}: {
  project: Project;
  data: Bootstrap;
  user: User;
  systemTime: number;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [reply, setReply] = useState<Record<string, string>>({});
  const [reportTitle, setReportTitle] = useState("");
  const [reportContent, setReportContent] = useState("");
  const [decisionRemarks, setDecisionRemarks] = useState("");
  const [tenderDeadline, setTenderDeadline] = useState("");
  const [bidCount, setBidCount] = useState("0");
  const [qualifiedVendorIds, setQualifiedVendorIds] = useState<string[]>([]);
  const [topVendorIds, setTopVendorIds] = useState<string[]>([]);
  const [tacVendorId, setTacVendorId] = useState("");
  const [tacPrice, setTacPrice] = useState("");
  const [tacSpecifications, setTacSpecifications] = useState("");
  const [fundReference, setFundReference] = useState("");
  const [fundAmount, setFundAmount] = useState("");
  const [rejectionFile, setRejectionFile] = useState<File | null>(null);
  const reportInput = useRef<HTMLInputElement>(null);
  const workflowInput = useRef<HTMLInputElement>(null);
  const rejectionInput = useRef<HTMLInputElement>(null);
  const [committeeForm, setCommitteeForm] = useState({
    chairmanId: data.people[0]?.id ?? "",
    memberIds: data.people.slice(0, 3).map((person) => person.id),
    constitutionDate: new Date().toISOString().slice(0, 10),
    terms: "Complete the assigned procurement board review and submit its decision/report.",
  });
  const index = data.stages.findIndex((s) => s.id === project.stage);
  const committeeType = committeeTypeByStage[project.stage];
  const formationDocument = formationDocumentStages[project.stage];
  const rejectionApproval = rejectionApprovalByStage[project.stage];
  const committee = data.committees
    .filter(
      (item) =>
        item.project_id === project.id &&
        (!committeeType || item.type === committeeType),
    )
    .sort((a, b) => b.version - a.version)[0];
  const selectedCommitteeMembers = data.people.filter((person) =>
    committeeForm.memberIds.includes(person.id),
  );
  const isTscRevision =
    user.role === "admin" &&
    project.stage === "committee_pending" &&
    committee?.status === "changes_requested";
  const hasInlineRejection =
    (project.stage === "tsc_approval" &&
      user.role === "as_ia" &&
      committee?.status === "pending") ||
    (project.stage === "tec_approval" &&
      user.role === "hq" &&
      committee?.status === "pending") ||
    (project.stage === "as_review" && user.role === "as_ia") ||
    (project.stage === "cfa_approval" && user.role === "hq");
  useEffect(() => {
    if (isTscRevision && committee) {
      setCommitteeForm({
        chairmanId: committee.chairman?.id ?? committee.members[0]?.id ?? "",
        memberIds: committee.members.map((member) => member.id),
        constitutionDate: committee.constitution_date,
        terms: committee.terms,
      });
    }
  }, [committee?.id, committee?.status]);
  const cfaRelease = project.workflowRecords.find(
    (record) => record.kind === "cfa_fund_release",
  );
  const rejectionRecord = project.workflowRecords.find(
    (record) => record.kind === "rejection",
  );
  const rejectedAtStage =
    typeof rejectionRecord?.data.stage === "string"
      ? rejectionRecord.data.stage
      : "";
  const timelineEndIndex =
    project.stage === "terminated"
      ? data.stages.findIndex((stage) => stage.id === rejectedAtStage)
      : data.stages.findIndex((stage) => stage.id === project.stage);
  const timelineStages = data.stages.filter(
    (stage, stageIndex) =>
      stage.id !== "terminated" && stageIndex <= timelineEndIndex,
  );
  if (
    project.stage === "terminated" &&
    !timelineStages.some((stage) => stage.id === "terminated")
  ) {
    const terminatedStage = data.stages.find(
      (stage) => stage.id === "terminated",
    );
    if (terminatedStage) timelineStages.push(terminatedStage);
  }
  const timelineStageIds = new Set(data.stages.map((stage) => stage.id));
  const rejectionDocumentIds = new Set(
    project.workflowRecords
      .filter((record) => record.kind === "rejection")
      .map((record) => record.data.documentId)
      .filter((id): id is string => typeof id === "string"),
  );
  const attachedDocumentIds = new Set(rejectionDocumentIds);
  const documentsByEvent = new Map<
    string,
    (typeof project.documents)[number][]
  >();
  const stageByEventId = new Map<string, string>();
  for (const document of project.documents) {
    if (rejectionDocumentIds.has(document.id)) continue;
    const eventType = documentEventTypeByCategory[document.category];
    const documentTime = Date.parse(document.at);
    const candidates = project.events
      .filter(
        (event) =>
          event.actor.id === document.uploadedBy.id &&
          (!document.stage || !event.stage || event.stage === document.stage) &&
          !documentsByEvent.has(event.id) &&
          Math.abs(Date.parse(event.at) - documentTime) <= 120_000,
      )
      .sort(
        (a, b) =>
          Math.abs(Date.parse(a.at) - documentTime) -
          Math.abs(Date.parse(b.at) - documentTime),
      );
    const matchingEvent = eventType
      ? candidates.find((event) => event.type === eventType)
      : candidates[0];
    if (!matchingEvent) continue;
    documentsByEvent.set(matchingEvent.id, [document]);
    attachedDocumentIds.add(document.id);
    const documentStage =
      document.stage || legacyDocumentStageByCategory[document.category];
    if (!matchingEvent.stage && documentStage)
      stageByEventId.set(matchingEvent.id, documentStage);
  }
  const stageTimeline = timelineStages.map((stage, index) => {
    const documents = project.documents.filter(
      (document) =>
        (document.stage || legacyDocumentStageByCategory[document.category]) ===
        stage.id,
    );
    const queries = project.queries.filter(
      (item) => item.stage === stage.id,
    );
    const events = project.events.filter(
      (item) => (item.stage || stageByEventId.get(item.id)) === stage.id,
    );
    const rejections = project.workflowRecords.filter(
      (record) =>
        record.kind === "rejection" && record.data.stage === stage.id,
    );
    return {
      stage,
      index,
      current: stage.id === project.stage,
      documents: documents.filter(
        (document) => !attachedDocumentIds.has(document.id),
      ),
      queries,
      events,
      rejections,
    };
  });
  const earlierDocuments = project.documents.filter(
    (document) =>
      !attachedDocumentIds.has(document.id) &&
      !timelineStageIds.has(
        document.stage || legacyDocumentStageByCategory[document.category] || "",
      ),
  );
  const earlierQueries = project.queries.filter(
    (item) => !timelineStageIds.has(item.stage),
  );
  const earlierEvents = project.events.filter(
    (item) =>
      !timelineStageIds.has(item.stage || stageByEventId.get(item.id) || ""),
  );
  const hasEarlierActivity =
    earlierDocuments.length + earlierQueries.length + earlierEvents.length > 0;
  const clearDecisionDraft = () => {
    setDecisionRemarks("");
    setRejectionFile(null);
    if (rejectionInput.current) rejectionInput.current.value = "";
  };
  const submit = async (url: string, body: object) => {
    try {
      await api(url, { method: "POST", body: JSON.stringify(body) });
      setNote("");
      setQuery("");
      clearDecisionDraft();
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const uploadDocument = async (
    category: string,
    file: File | undefined,
    name?: string,
  ) => {
    if (!file) {
      setError("Select a PDF to upload");
      return;
    }
    try {
      const content = await pdfToDataUrl(file);
      await api(`/api/projects/${project.id}/documents`, {
        method: "POST",
        body: JSON.stringify({
          category,
          name: name || file.name,
          mimeType: "application/pdf",
          content,
        }),
      });
      setError("");
      setQuery("");
      clearDecisionDraft();
      await onRefresh();
      if (category === "tsc_report") {
        if (reportInput.current) reportInput.current.value = "";
      }
      if (
        category === "signed_approval" ||
        category === "bid_opening_board_formation" ||
        category.endsWith("_formation_support") ||
        category === "final_acceptance"
      ) {
        if (workflowInput.current) workflowInput.current.value = "";
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const submitWorkflowAction = async (
    action: string,
    actionData: Record<string, unknown> = {},
  ) => {
    try {
      await api(`/api/projects/${project.id}/workflow-action`, {
        method: "POST",
        body: JSON.stringify({ action, data: actionData }),
      });
      setError("");
      clearDecisionDraft();
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const readPdf = async (file: File | undefined) => {
    if (!file) throw new Error("Select a PDF to upload");
    return pdfToDataUrl(file);
  };
  const submitRejection = async () => {
    try {
      const content = await readPdf(rejectionFile ?? undefined);
      await api(`/api/projects/${project.id}/reject`, {
        method: "POST",
        body: JSON.stringify({
          note: decisionRemarks,
          name: rejectionFile?.name ?? "",
          content,
        }),
      });
      setError("");
      clearDecisionDraft();
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const rejectionPdfField = (
    <label>
      Rejection PDF (required only for Reject)
      <input
        ref={rejectionInput}
        type="file"
        accept="application/pdf,.pdf"
        onChange={(event) =>
          setRejectionFile(event.target.files?.[0] ?? null)
        }
      />
    </label>
  );
  const rejectButton = (
    <button
      className="button danger"
      disabled={decisionRemarks.trim().length < 2 || !rejectionFile}
      onClick={submitRejection}
    >
      Reject
    </button>
  );
  const submitCommittee = async () => {
    try {
      await api(`/api/projects/${project.id}/committees`, {
        method: "POST",
        body: JSON.stringify(committeeForm),
      });
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(e) => e.currentTarget === e.target && onClose()}
    >
      <aside className="drawer">
        <div className="drawer-head">
          <div>
            <span className="project-id">{project.id}</span>
            <h2>{project.title}</h2>
            <p className="subtle">
              {project.stageLabel}
              {!tenderDeadlineStatus(project, systemTime) &&
                ` · Due ${project.deadline}`}
            </p>
            <TenderDeadline project={project} systemTime={systemTime} />
            <small className="stage-next-hint">
              {stageNextStep(project.stage)}
            </small>
          </div>
          <button className="close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="drawer-progress">
          <div className="progress">
            <i
              style={{
                width: `${Math.round((index / Math.max(1, data.stages.length - 1)) * 100)}%`,
              }}
            />
          </div>
          <small>
            Stage {index + 1} of {data.stages.length}
          </small>
        </div>
        {error && <div className="error">{error}</div>}
        {rejectionApproval &&
          user.role === rejectionApproval.role &&
          !hasInlineRejection && (
          <section className="action-box rejection-box">
            <span className="eyebrow">AUTHORITY DECISION</span>
            <h3>Reject at {rejectionApproval.authority} approval</h3>
            <p className="subtle">
              Add the authority's remarks and signed PDF. Rejecting terminates
              the project and prevents further workflow actions.
            </p>
            <label>
              Remarks
              <textarea
                value={decisionRemarks}
                onChange={(event) => setDecisionRemarks(event.target.value)}
                placeholder="Reason provided by the approving authority…"
              />
            </label>
            {rejectionPdfField}
            {rejectButton}
          </section>
        )}
        {((user.role === "admin" && project.stage === "committee_pending") ||
          (user.role === "hq" &&
            ["tec_formation", "tac_formation"].includes(project.stage))) &&
          committeeType &&
          (!committee ||
            committee.status === "rejected" ||
            isTscRevision) && (
            <section className="action-box">
              <span className="eyebrow">COMMITTEE FORMATION</span>
              <h3>{isTscRevision ? "Update TSC membership" : `Form ${committeeType}`}</h3>
              <p className="subtle">
                Select exactly three members and one of them as chairperson.
                {project.stage === "tac_formation" &&
                  " At least one TAC member must belong to the Inspection & Audit department."}
                {isTscRevision &&
                  " AS (IA) requested changes. Resubmit the revised committee, then upload its supporting document for AS (IA) review."}
              </p>
              <div className="committee-member-picker">
                <div className="committee-member-options">
                  <div className="committee-member-options-heading">
                    <strong>Select three members</strong>
                    <span>{committeeForm.memberIds.length} of 3 selected</span>
                  </div>
                  <div className="committee-person-options">
                    {data.people.map((person) => (
                      <label
                        className={`committee-person-option${committeeForm.memberIds.includes(person.id) ? " is-selected" : ""}`}
                        key={person.id}
                      >
                        <input
                          type="checkbox"
                          checked={committeeForm.memberIds.includes(person.id)}
                          disabled={
                            !committeeForm.memberIds.includes(person.id) &&
                            committeeForm.memberIds.length >= 3
                          }
                          onChange={(event) =>
                            setCommitteeForm((current) => {
                              const memberIds = event.target.checked
                                ? current.memberIds.length < 3 &&
                                  !current.memberIds.includes(person.id)
                                  ? [...current.memberIds, person.id]
                                  : current.memberIds
                                : current.memberIds.filter(
                                    (memberId) => memberId !== person.id,
                                  );
                              return {
                                ...current,
                                memberIds,
                                chairmanId:
                                  current.chairmanId === person.id
                                    ? memberIds[0] ?? ""
                                    : current.chairmanId || memberIds[0] || "",
                              };
                            })
                          }
                        />
                        <span className="committee-person-details">
                          <strong>{person.name}</strong>
                          <small>
                            {person.designation} · {person.department_name}
                          </small>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                <aside
                  className="committee-member-summary"
                  aria-label="Selected committee members"
                  aria-live="polite"
                >
                  <div className="committee-member-summary-header">
                    <strong>Selected members</strong>
                    <span>{committeeForm.memberIds.length} of 3</span>
                  </div>
                  {selectedCommitteeMembers.length > 0 ? (
                    <ul className="committee-member-list">
                      {selectedCommitteeMembers.map((person, index) => (
                        <li className="committee-member-card" key={person.id}>
                          <span className="committee-member-number">
                            {index + 1}
                          </span>
                          <span className="committee-member-info">
                            <strong>{person.name}</strong>
                            <small>
                              {person.designation} · {person.department_name}
                            </small>
                          </span>
                          {person.id === committeeForm.chairmanId && (
                            <span className="committee-member-chair">
                              Chair
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="subtle">Select members from the list.</p>
                  )}
                </aside>
              </div>
              <label>
                Chairperson
                <select
                  value={committeeForm.chairmanId}
                  disabled={selectedCommitteeMembers.length === 0}
                  onChange={(e) =>
                    setCommitteeForm({
                      ...committeeForm,
                      chairmanId: e.target.value,
                    })
                  }
                >
                  {selectedCommitteeMembers.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Board responsibility
                <textarea
                  value={committeeForm.terms}
                  onChange={(e) =>
                    setCommitteeForm({
                      ...committeeForm,
                      terms: e.target.value,
                    })
                  }
                />
              </label>
              <button className="button primary" onClick={submitCommittee}>
                {isTscRevision ? "Resubmit revised TSC" : `Form ${committeeType}`}
              </button>
            </section>
          )}
          {formationDocument &&
            user.role === formationDocument.uploaderRole && (
              <section className="action-box">
                <span className="eyebrow">COMMITTEE FORMATION RECORD</span>
                <h3>Upload {formationDocument.label}</h3>
                <input
                  ref={workflowInput}
                  type="file"
                  accept="application/pdf,.pdf"
                />
                <button
                  className="button primary"
                  onClick={() =>
                    uploadDocument(
                      formationDocument.category,
                      workflowInput.current?.files?.[0],
                    )
                  }
                >
                  Upload document and continue
                </button>
              </section>
            )}
        {user.role === "hq" &&
          project.stage === "opening_board_formation" && (
            <section className="action-box">
              <span className="eyebrow">OFFLINE BID OPENING BOARD</span>
              <h3>Upload the document confirming the board was formed</h3>
              <p className="subtle">
                The Bid Opening Board is formed offline. Upload its formation
                document to continue.
              </p>
              <input
                ref={workflowInput}
                type="file"
                accept="application/pdf,.pdf"
              />
              <button
                className="button primary"
                onClick={() =>
                  uploadDocument(
                    "bid_opening_board_formation",
                    workflowInput.current?.files?.[0],
                  )
                }
              >
                Upload formation document and continue
              </button>
            </section>
          )}
        {user.role === "hq" &&
          project.stage === "tec_approval" &&
          committee?.status === "pending" && (
          <section className="action-box approval-box">
            <span className="eyebrow">ADMIN HQ · SS OFFLINE DECISION</span>
            <h3>Record SS's decision on TEC formation</h3>
            <p className="subtle">
              SS has no application login. Record its offline query or approval;
              Admin HQ uploads the signed approval document after approval.
            </p>
            <textarea
              value={decisionRemarks}
              onChange={(e) => setDecisionRemarks(e.target.value)}
              placeholder="SS approval remarks or query for Admin HQ…"
            />
            {rejectionPdfField}
            <div className="action-row">
              <button
                className="button secondary"
                onClick={() =>
                  submit(`/api/committees/${committee.id}/decision`, {
                    action: "query",
                    remarks: decisionRemarks,
                  })
                }
              >
                Raise query
              </button>
              <button
                className="button primary"
                onClick={() =>
                  submit(`/api/committees/${committee.id}/decision`, {
                    action: "approve",
                    remarks: decisionRemarks,
                  })
                }
              >
                Accept
              </button>
              {rejectButton}
            </div>
          </section>
        )}
        {user.role === "as_ia" &&
          project.stage === "tsc_approval" &&
          committee?.status === "pending" && (
            <section className="action-box approval-box">
              <span className="eyebrow">AS (IA) APPROVAL</span>
              <h3>Review and approve TSC formation</h3>
              <p className="subtle">
                Query Admin if clarification is needed, or return the TSC to
                Admin (IA) for member changes. Approval locks the membership.
              </p>
              <textarea
                value={decisionRemarks}
                onChange={(e) => setDecisionRemarks(e.target.value)}
                placeholder="Approval remarks or query for Admin…"
              />
              {rejectionPdfField}
              <div className="action-row">
                <button
                  className="button secondary"
                  onClick={() =>
                    submit(`/api/committees/${committee.id}/decision`, {
                      action: "query",
                      remarks: decisionRemarks,
                    })
                  }
                >
                  Raise query
                </button>
                <button
                  className="button secondary"
                  onClick={() =>
                    submit(`/api/committees/${committee.id}/decision`, {
                      action: "request_changes",
                      remarks: decisionRemarks,
                    })
                  }
                >
                  Request member changes
                </button>
                <button
                  className="button primary"
                  onClick={() =>
                    submit(`/api/committees/${committee.id}/decision`, {
                      action: "approve",
                      remarks: decisionRemarks,
                    })
                  }
                >
                  Accept
                </button>
                {rejectButton}
              </div>
            </section>
          )}
        {user.role === "admin" && project.stage === "tsc_report" && (
          <section className="action-box">
            <span className="eyebrow">TSC REPORT</span>
            <h3>Upload the TSC report received offline</h3>
            <p className="subtle">
              TSC provides the report to Admin offline. Upload its PDF here to continue.
            </p>
            <label>
              TSC report PDF
              <input
                ref={reportInput}
                type="file"
                accept="application/pdf,.pdf"
              />
            </label>
            <div className="action-row">
              <button
                className="button primary"
                onClick={() =>
                  uploadDocument(
                    "tsc_report",
                    reportInput.current?.files?.[0],
                  )
                }
              >
                Upload TSC report and continue
              </button>
            </div>
          </section>
        )}
        {user.role === signedApprovalRoles[project.stage] &&
          signedApprovalStages[project.stage] && (
          <section className="action-box">
            <span className="eyebrow">SIGNED APPROVAL DOCUMENT</span>
            <h3>Upload signed {signedApprovalStages[project.stage]} PDF</h3>
            <p className="subtle">
              {roles[user.role]} must upload the signed approval PDF before this
              stage can continue.
              {project.stage === "cs_sr_review" &&
                " CS/SR approval is handled offline; after the report returns to HQ, Admin HQ uploads the signed document."}
              {project.stage === "dgs_ia_review" &&
                " DGS approval is handled offline; after the report returns to HQ, Admin HQ uploads the signed document."}
            </p>
            <input
              ref={workflowInput}
              type="file"
              accept="application/pdf,.pdf"
            />
            <button
              className="button primary"
              onClick={() =>
                uploadDocument(
                  "signed_approval",
                  workflowInput.current?.files?.[0],
                )
              }
            >
              Upload signed approval and continue
            </button>
          </section>
        )}
        {user.role === "admin" && project.stage === "admin_report_review" && (
          <section className="action-box">
            <span className="eyebrow">ADMIN REPORT REVIEW</span>
            <h3>Send TSC specifications to AS (IA)</h3>
            {project.reports[0] && (
              <div className="report-preview">
                <b>{project.reports[0].title}</b>
                <p>{project.reports[0].content}</p>
              </div>
            )}
            <button className="button primary" onClick={() => submitWorkflowAction("forward_as")}>
              Send report to AS (IA)
            </button>
          </section>
        )}
        {user.role === "as_ia" && project.stage === "as_review" && (
          <section className="action-box approval-box">
            <span className="eyebrow">AS (IA) APPROVAL</span>
            <h3>Review the TSC report</h3>
            {project.reports[0] && (
              <div className="report-preview">
                <b>{project.reports[0].title}</b>
                <p>{project.reports[0].content}</p>
              </div>
            )}
            <textarea
              value={decisionRemarks}
              onChange={(e) => setDecisionRemarks(e.target.value)}
              placeholder="Approval remarks or query…"
            />
            {rejectionPdfField}
            <div className="action-row">
              <button className="button secondary" onClick={() => submit(`/api/projects/${project.id}/as-decision`, { action: "query", remarks: decisionRemarks })}>
                Raise query
              </button>
              <button className="button primary" onClick={() => submit(`/api/projects/${project.id}/as-decision`, { action: "approve", remarks: decisionRemarks })}>
                Accept
              </button>
              {rejectButton}
            </div>
          </section>
        )}
        {user.role === "admin" && project.stage === "admin_after_as" && (
          <section className="action-box">
            <span className="eyebrow">ADMIN ROUTING</span>
            <h3>Send the report to Admin HQ for DGS review</h3>
            <button className="button primary" onClick={() => submitWorkflowAction("route_second_review")}>
              Send to Admin HQ
            </button>
          </section>
        )}
        {user.role === "hq" && project.stage === "hq_review" && (
          <section className="action-box">
            <span className="eyebrow">ADMIN HQ ROUTING</span>
            <h3>Send the report for offline DGS approval</h3>
            <textarea value={decisionRemarks} onChange={(e) => setDecisionRemarks(e.target.value)} placeholder="Forwarding remarks…" />
            <button className="button primary" onClick={() => submitWorkflowAction("forward_to_dgs_review", { remarks: decisionRemarks })}>
              Send to DGS offline
            </button>
          </section>
        )}
        {user.role === "hq" && project.stage === "hq_after_dgs" && (
          <section className="action-box">
            <span className="eyebrow">ADMIN HQ ROUTING</span>
            <h3>Send the report for offline CS/SR approval</h3>
            <p className="subtle">
              The DGS approval document has been uploaded by Admin HQ. Send the
              report to CS/SR offline; after approval, it returns to HQ for the
              signed CS/SR document upload.
            </p>
            <textarea
              value={decisionRemarks}
              onChange={(e) => setDecisionRemarks(e.target.value)}
              placeholder="Forwarding remarks…"
            />
            <button
              className="button primary"
              onClick={() =>
                submitWorkflowAction("forward_to_cs_sr_review", {
                  remarks: decisionRemarks,
                })
              }
            >
              Send to CS/SR offline
            </button>
          </section>
        )}
        {user.role === "hq" && project.stage === "tender_draft" && (
          <section className="action-box">
            <span className="eyebrow">ADMIN HQ DRAFT TENDER</span>
            <h3>Upload draft tender and send it only to Admin (IA)</h3>
            <input ref={workflowInput} type="file" accept="application/pdf,.pdf" />
            <textarea value={decisionRemarks} onChange={(e) => setDecisionRemarks(e.target.value)} placeholder="Notes for Admin (IA)…" />
            <button className="button primary" onClick={async () => {
              try {
                const file = workflowInput.current?.files?.[0];
                await submitWorkflowAction("submit_draft_tender", {
                  name: file?.name ?? "",
                  content: await readPdf(file),
                  remarks: decisionRemarks,
                });
                if (workflowInput.current) workflowInput.current.value = "";
              } catch (e) { setError((e as Error).message); }
            }}>Send draft to Admin (IA) only</button>
          </section>
        )}
        {user.role === "admin" && project.stage === "ia_tender_review" && (
          <section className="action-box">
            <span className="eyebrow">ADMIN (IA) DRAFT REVIEW</span>
            <h3>Review the draft and send suggestions if needed</h3>
            <p className="subtle">
              Admin HQ publishes the final tender. This review is optional.
            </p>
            <textarea value={decisionRemarks} onChange={(e) => setDecisionRemarks(e.target.value)} placeholder="Suggestions for Admin HQ…" />
            <button className="button secondary" disabled={decisionRemarks.trim().length < 2} onClick={() => submitWorkflowAction("submit_draft_suggestions", { remarks: decisionRemarks })}>
              Send suggestions to Admin HQ
            </button>
          </section>
        )}
        {user.role === "hq" && project.stage === "ia_tender_review" && (
          <section className="action-box">
            <span className="eyebrow">ADMIN HQ FINAL TENDER</span>
            <h3>Review suggestions and publish the final tender</h3>
            <input ref={workflowInput} type="file" accept="application/pdf,.pdf" />
            <label>Tender deadline<input type="datetime-local" value={tenderDeadline} onChange={(e) => setTenderDeadline(e.target.value)} /></label>
            <textarea value={decisionRemarks} onChange={(e) => setDecisionRemarks(e.target.value)} placeholder="Publication remarks…" />
            <button className="button primary" onClick={async () => {
              try {
                const file = workflowInput.current?.files?.[0];
                await submitWorkflowAction("publish_final_tender", {
                  name: file?.name ?? "",
                  content: await readPdf(file),
                  deadline: tenderDeadline,
                  remarks: decisionRemarks,
                });
                if (workflowInput.current) workflowInput.current.value = "";
              } catch (e) { setError((e as Error).message); }
            }}>Publish final tender</button>
          </section>
        )}
        {user.role === "hq" && project.stage === "admin_issue_tender" && (
          <section className="action-box">
            <span className="eyebrow">ISSUE TENDER</span>
            <h3>Send final tender to vendors</h3>
            <p className="subtle">Bid deadline: {project.deadline}</p>
            <button className="button primary" onClick={() => submitWorkflowAction("issue_tender")}>Send tender to vendors</button>
          </section>
        )}
        {user.role === "hq" && project.stage === "bid_submission" && (
          <section className="action-box">
            <span className="eyebrow">BID RECEIPT</span>
            <h3>Record bids received after the deadline</h3>
            <label>Number of bids received<input type="number" min="0" value={bidCount} onChange={(e) => setBidCount(e.target.value)} /></label>
            <textarea value={decisionRemarks} onChange={(e) => setDecisionRemarks(e.target.value)} placeholder="Receipt and deadline verification remarks…" />
            <button className="button primary" onClick={() => submitWorkflowAction("confirm_bids", { count: bidCount, remarks: decisionRemarks })}>Confirm bid receipt</button>
          </section>
        )}
        {user.role === "hq" && project.stage === "tec_review" && (
          <section className="action-box">
            <span className="eyebrow">TEC TECHNICAL REPORT · ADMIN HQ</span>
            <h3>Record TEC's technical qualification report</h3>
            <input value={reportTitle} onChange={(e) => setReportTitle(e.target.value)} placeholder="Report title" />
            <textarea value={reportContent} onChange={(e) => setReportContent(e.target.value)} placeholder="Evaluation observations and qualification rationale…" />
            <label>Qualified vendors<select multiple value={qualifiedVendorIds} onChange={(e) => setQualifiedVendorIds(Array.from(e.target.selectedOptions).map((option) => option.value))}>
              {data.vendors.filter((vendor) => vendor.active).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
            </select></label>
            <button className="button primary" onClick={() => submitWorkflowAction("submit_tec_report", { title: reportTitle, content: reportContent, qualifiedVendorIds })}>Record TEC report and continue</button>
          </section>
        )}
        {user.role === "hq" && project.stage === "price_opening" && (
          <section className="action-box">
            <span className="eyebrow">TEC FINANCIAL BID OPENING · ADMIN HQ</span>
            <h3>Record TEC's financial bid opening and top three qualified vendors</h3>
            <label>Top three vendors<select multiple value={topVendorIds} onChange={(e) => setTopVendorIds(Array.from(e.target.selectedOptions).map((option) => option.value))}>
              {data.vendors.filter((vendor) => vendor.active && (project.workflowRecords.find((record) => record.kind === "tec_report")?.data.qualifiedVendorIds as string[] | undefined)?.includes(vendor.id)).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
            </select></label>
            <textarea value={decisionRemarks} onChange={(e) => setDecisionRemarks(e.target.value)} placeholder="Comparative financial analysis and report…" />
            <button className="button primary" onClick={() => submitWorkflowAction("submit_tec_financial_report", { topVendorIds, remarks: decisionRemarks })}>Record TEC financial report and continue</button>
          </section>
        )}
        {user.role === "hq" && project.stage === "tac_review" && (
          <section className="action-box">
            <span className="eyebrow">TAC FINAL SELECTION · ADMIN HQ</span>
            <h3>Record TAC's final vendor and award basis</h3>
            <label>Final vendor<select value={tacVendorId} onChange={(e) => setTacVendorId(e.target.value)}>
              <option value="">Select vendor</option>
              {data.vendors.filter((vendor) => (project.workflowRecords.find((record) => record.kind === "tec_financial_report" || record.kind === "x_report")?.data.topVendorIds as string[] | undefined)?.includes(vendor.id)).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
            </select></label>
            <label>Selected price<input type="number" min="0.01" value={tacPrice} onChange={(e) => setTacPrice(e.target.value)} /></label>
            <textarea value={tacSpecifications} onChange={(e) => setTacSpecifications(e.target.value)} placeholder="Final vendor technical specifications…" />
            <textarea value={decisionRemarks} onChange={(e) => setDecisionRemarks(e.target.value)} placeholder="TAC selection report and justification…" />
            <button className="button primary" onClick={() => submitWorkflowAction("submit_tac_report", { vendorId: tacVendorId, price: tacPrice, technicalSpecifications: tacSpecifications, remarks: decisionRemarks })}>Send TAC report to Admin HQ</button>
          </section>
        )}
        {user.role === "hq" && project.stage === "cfa_approval" && (
          <section className="action-box approval-box">
            <span className="eyebrow">OFFLINE CFA / IFD APPROVAL</span>
            <h3>Record CFA's offline fund release through IFD</h3>
            <label>Release reference<input value={fundReference} onChange={(e) => setFundReference(e.target.value)} /></label>
            <label>Amount approved<input type="number" min="0.01" value={fundAmount} onChange={(e) => setFundAmount(e.target.value)} /></label>
            <textarea value={decisionRemarks} onChange={(e) => setDecisionRemarks(e.target.value)} placeholder="CFA approval remarks or rejection reason…" />
            {rejectionPdfField}
            <div className="action-row">
              <button className="button primary" onClick={() => submitWorkflowAction("cfa_release_funds", { reference: fundReference, amount: fundAmount, remarks: decisionRemarks })}>
                Accept
              </button>
              {rejectButton}
            </div>
          </section>
        )}
        {user.role === "hq" && project.stage === "ifd_review" && (
          <section className="action-box">
            <span className="eyebrow">FINAL ACCEPTANCE</span>
            <h3>Upload the final acceptance document after IFD approval</h3>
            {cfaRelease && (
              <p className="subtle">
                Reference: {String(cfaRelease.data.reference)} · Amount: {money(Number(cfaRelease.data.amount))}
              </p>
            )}
            <input ref={workflowInput} type="file" accept="application/pdf,.pdf" />
            <button className="button primary" onClick={() => uploadDocument("final_acceptance", workflowInput.current?.files?.[0])}>
              Upload final acceptance and complete project
            </button>
          </section>
        )}
        <section className="drawer-section trail-section stage-timeline-section">
          <h3>Trail</h3>
          <ol className="stage-timeline">
            {stageTimeline.map((group) => {
              const hasItems =
                group.events.length +
                  group.documents.length +
                  group.queries.length +
                  group.rejections.length >
                0;
              return (
                <li
                  className={`stage-timeline-item${group.current ? " is-current" : ""}`}
                  key={group.stage.id}
                >
                  <details open={group.current}>
                    <summary>
                      <span className="timeline-node">{group.index + 1}</span>
                      <span className="timeline-stage-title">
                        {group.stage.label}
                      </span>
                      {group.current && (
                        <span className="timeline-stage-state">Current</span>
                      )}
                      {group.rejections.length > 0 && (
                        <span className="timeline-stage-state is-rejected">
                          Rejected
                        </span>
                      )}
                    </summary>
                    <div className="stage-timeline-content">
                      <ul className="stage-timeline-list">
                        {group.events.map((event) => (
                          <li key={event.id}>
                            <strong>{event.text}</strong>
                            <small>
                              {event.actor.name} ·{" "}
                              {new Date(event.at).toLocaleString()}
                            </small>
                            {documentsByEvent
                              .get(event.id)
                              ?.map((document) => (
                                <DocumentAttachment
                                  key={document.id}
                                  document={document}
                                />
                              ))}
                          </li>
                        ))}
                        {group.documents.map((document) => (
                          <li key={document.id}>
                            <DocumentAttachment document={document} />
                          </li>
                        ))}
                        {group.rejections.map((record) => (
                          <li className="timeline-rejection-note" key={record.id}>
                            <strong>
                              {String(record.data.authority)} rejection note
                            </strong>
                            <p>{String(record.data.note)}</p>
                            {project.documents
                              .filter(
                                (document) =>
                                  document.id === record.data.documentId,
                              )
                              .map((document) => (
                                <DocumentAttachment
                                  key={document.id}
                                  document={document}
                                />
                              ))}
                          </li>
                        ))}
                        {group.queries.map((item) => (
                          <li key={item.id}>
                            <div className="timeline-query">
                              <div>
                                <strong>{item.actor.name} · Query</strong>
                                <small>
                                  {item.status} ·{" "}
                                  {new Date(item.at).toLocaleString()}
                                </small>
                                <p>{item.text}</p>
                              </div>
                              {item.replies.length > 0 && (
                                <ul className="timeline-replies">
                                  {item.replies.map((response) => (
                                    <li key={response.id}>
                                      <strong>{response.actor.name}</strong>
                                      <p>{response.text}</p>
                                      <small>
                                        {new Date(
                                          response.at,
                                        ).toLocaleString()}
                                      </small>
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {project.stage !== "terminated" && (
                                <div className="reply-row">
                                  <input
                                    value={reply[item.id] ?? ""}
                                    onChange={(event) =>
                                      setReply({
                                        ...reply,
                                        [item.id]: event.target.value,
                                      })
                                    }
                                    placeholder="Reply to query…"
                                  />
                                  <button
                                    className="button secondary"
                                    onClick={() =>
                                      submit(
                                        `/api/projects/${project.id}/queries/${item.id}/replies`,
                                        { text: reply[item.id] },
                                      )
                                    }
                                  >
                                    Reply
                                  </button>
                                </div>
                              )}
                            </div>
                          </li>
                        ))}
                        {group.current &&
                          !["terminated", "completed"].includes(
                            project.stage,
                          ) &&
                          user.role !== "vendor" && (
                            <li>
                              <div className="reply-row stage-query-form">
                                <input
                                  value={query}
                                  onChange={(event) =>
                                    setQuery(event.target.value)
                                  }
                                  placeholder="Raise a query at this stage…"
                                />
                                <button
                                  className="button secondary"
                                  disabled={query.trim().length < 2}
                                  onClick={() =>
                                    submit(
                                      `/api/projects/${project.id}/queries`,
                                      { text: query },
                                    )
                                  }
                                >
                                  Ask
                                </button>
                              </div>
                            </li>
                          )}
                        {!hasItems &&
                          !(
                            group.current &&
                            !["terminated", "completed"].includes(
                              project.stage,
                            )
                          ) && <li className="timeline-empty">No activity recorded.</li>}
                      </ul>
                    </div>
                  </details>
                </li>
              );
            })}
          </ol>
          {hasEarlierActivity && (
            <details className="earlier-activity">
              <summary>Earlier records without a stage tag</summary>
              <ul className="stage-timeline-list">
                {earlierEvents.map((event) => (
                  <li key={event.id}>
                    <strong>{event.text}</strong>
                    <small>
                      {event.actor.name} · {new Date(event.at).toLocaleString()}
                    </small>
                    {documentsByEvent.get(event.id)?.map((document) => (
                      <DocumentAttachment
                        key={document.id}
                        document={document}
                      />
                    ))}
                  </li>
                ))}
                {earlierDocuments.map((document) => (
                  <li key={document.id}>
                    <DocumentAttachment document={document} />
                  </li>
                ))}
                {earlierQueries.map((item) => (
                  <li key={item.id}>
                    <strong>{item.actor.name} · Query</strong>
                    <p>{item.text}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      </aside>
    </div>
  );
}
function DocumentAttachment({
  document,
}: {
  document: Project["documents"][number];
}) {
  return (
    <div className="timeline-document">
      <div>
        <span className="timeline-document-label">Attached document</span>
        <strong>{document.name}</strong>
        <small>
          {document.category} · {document.uploadedBy.name} ·{" "}
          {new Date(document.at).toLocaleString()}
        </small>
      </div>
      <a
        className="button secondary document-view-button"
        href={document.content}
        target="_blank"
        rel="noreferrer"
      >
        View document
      </a>
    </div>
  );
}
function BidForm({ onSubmit }: { onSubmit: (body: object) => void }) {
  const [form, setForm] = useState({ reference: "", amount: "", note: "" });
  return (
    <section className="action-box">
      <span className="eyebrow">VENDOR SUBMISSION</span>
      <h3>Submit tender bid</h3>
      <input
        placeholder="Bid reference"
        value={form.reference}
        onChange={(e) => setForm({ ...form, reference: e.target.value })}
      />
      <input
        type="number"
        placeholder="Bid amount"
        value={form.amount}
        onChange={(e) => setForm({ ...form, amount: e.target.value })}
      />
      <textarea
        placeholder="Note (optional)"
        value={form.note}
        onChange={(e) => setForm({ ...form, note: e.target.value })}
      />
      <button className="button primary" onClick={() => onSubmit(form)}>
        Submit bid
      </button>
    </section>
  );
}
function CreateDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (p: Project) => void;
}) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    estimatedValue: "",
    deadline: "",
  });
  const [error, setError] = useState("");
  const [requirementPdf, setRequirementPdf] = useState<File | null>(null);
  return (
    <div className="drawer-backdrop">
      <section className="dialog">
        <div className="drawer-head">
          <div>
            <span className="eyebrow">
              OFFLINE DEPARTMENT LETTER
            </span>
            <h2>
              Create procurement project
            </h2>
          </div>
          <button className="close" onClick={onClose}>
            ×
          </button>
        </div>
        <label>
          Project title
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </label>
        <label>
          Description
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
        <label>
          Department letter PDF (required, maximum 8 MB)
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => setRequirementPdf(e.target.files?.[0] ?? null)}
          />
        </label>
        <div className="form-row">
          <label>
            Estimated value
            <input
              type="number"
              value={form.estimatedValue}
              onChange={(e) =>
                setForm({ ...form, estimatedValue: e.target.value })
              }
            />
          </label>
          <label>
            Deadline
            <input
              type="date"
              value={form.deadline}
              onChange={(e) => setForm({ ...form, deadline: e.target.value })}
            />
          </label>
        </div>
        {error && <div className="error">{error}</div>}
        <button
          className="button primary wide"
          onClick={async () => {
            try {
              if (!requirementPdf)
                throw new Error("Select the Department's letter PDF");
              const pdfData = await pdfToDataUrl(requirementPdf);
              const x = await api<{ project: Project }>("/api/projects", {
                method: "POST",
                body: JSON.stringify({
                  ...form,
                  requirementName: requirementPdf.name,
                  requirementPdf: pdfData,
                }),
              });
              onCreated(x.project);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Create project
        </button>
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
