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
  admin: "Admin",
  super_admin: "Super Admin",
  hq: "Admin HQ",
  committee: "Committee Member",
  ia: "IA Wing",
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
  "demand_submission", "committee_pending", "tsc_report", "admin_report_review",
  "as_review", "admin_after_as", "hq_review", "dgs_ia_review",
  "tender_draft", "ia_tender_review", "admin_issue_tender", "bid_submission",
  "opening_board_formation", "tec_formation",
  "tec_approval", "tec_review", "x_formation", "price_opening",
  "tac_formation", "tac_review", "cfa_approval", "ifd_review", "completed",
];
const committeeTypeByStage: Record<string, string> = {
  committee_pending: "Technical Scrutiny Committee",
  opening_board_formation: "Bid Opening Board",
  tec_formation: "Technical Evaluation Committee",
  tec_approval: "Technical Evaluation Committee",
  tec_review: "Technical Evaluation Committee",
  x_formation: "Financial Evaluation Committee (X)",
  price_opening: "Financial Evaluation Committee (X)",
  tac_formation: "Tender Acceptance Committee (TAC)",
  tac_review: "Tender Acceptance Committee (TAC)",
};
const stageNextStep = (stage: string) => {
  const steps: Record<string, string> = {
    demand_submission: "Next: Admin (admin / admin123) reviews and accepts the department demand.",
    committee_pending: "Next: Admin (admin / admin123) forms the three-member TSC.",
    tsc_report: "Next: TSC (tsc / tsc123) submits the specification report to Admin.",
    admin_report_review: "Next: Admin (admin / admin123) sends the TSC report to AS (IA).",
    as_review: "Next: AS (AS / AS123) approves the report and returns it to Admin.",
    admin_after_as: "Next: Admin (admin / admin123) sends the report to Admin HQ (hq / hq123).",
    hq_review: "Next: Admin HQ (hq / hq123) sends the report to DGS (dgs / dgs123) for review.",
    dgs_ia_review: "Next: DGS (dgs / dgs123) reviews the report and returns it to Admin HQ.",
    tender_draft: "Next: Admin HQ (hq / hq123) sends the draft tender PDF to IA.",
    ia_tender_review: "Next: IA (ia / ia123) edits and publishes the final tender with a deadline.",
    admin_issue_tender: "Next: Admin (admin / admin123) sends the final tender to vendors.",
    bid_submission: "After the due time, Admin (admin / admin123) records bids received.",
    opening_board_formation: "Next: Admin (admin / admin123) forms the bid opening board.",
    tec_formation: "The Bid Opening Board opens technical bids offline. Next: Admin (admin / admin123) forms TEC and sends it to SS.",
    tec_approval: "Next: SS (superadmin / admin123) queries or approves TEC.",
    tec_review: "Next: TEC (tec / tec123) submits its qualified-vendor report.",
    x_formation: "Next: Admin (admin / admin123) forms the X committee.",
    price_opening: "Next: X committee (tsc / tsc123) evaluates bids and selects the top three.",
    tac_formation: "Next: Admin (admin / admin123) forms TAC, including one IA member.",
    tac_review: "Next: TAC (tac / tac123) submits the selected vendor, price and specifications.",
    cfa_approval: "Next: CFA (cfa / cfa123) releases funds through IFD.",
    ifd_review: "Next: IA (ia / ia123) confirms IFD release and completes the project.",
    completed: "Procurement workflow complete.",
  };
  return steps[stage] ?? "";
};

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
          department / department123 · admin / admin123
        </div>
      </section>
    </main>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<Bootstrap | null>(null);
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
  const active = data.projects.filter((p) => p.stage !== "completed").length;
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
          {user.role === "department" && (
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
                ? "Good day, " + user.name.split(" ")[0]
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
            {user.role === "department" && (
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
          />
        )}
        {view === "projects" && <Projects data={data} onOpen={setSelected} />}
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
          role={user.role}
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
}: {
  data: Bootstrap;
  onOpen: (p: Project) => void;
  onProjects: () => void;
}) {
  const openQueries = data.projects.reduce(
    (n, p) => n + p.queries.filter((q) => q.status === "open").length,
    0,
  );
  const bids = data.projects.reduce((n, p) => n + p.bids.length, 0);
  return (
    <>
      <section className="metric-grid">
        <Metric
          label="Active projects"
          value={data.projects.filter((p) => p.stage !== "completed").length}
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
          <ProjectCard key={p.id} project={p} onOpen={onOpen} />
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
}: {
  data: Bootstrap;
  onOpen: (p: Project) => void;
}) {
  return (
    <div className="project-grid">
      {data.projects.map((p) => (
        <ProjectCard key={p.id} project={p} onOpen={onOpen} />
      ))}
    </div>
  );
}
function ProjectCard({
  project,
  onOpen,
}: {
  project: Project;
  onOpen: (p: Project) => void;
}) {
  const percent = Math.round(
    (Math.max(0, stageOrder.indexOf(project.stage)) /
      Math.max(1, stageOrder.length - 1)) *
      100,
  );
  return (
    <article className="project-card">
      <div className="card-top">
        <span className="project-id">{project.id}</span>
        <span className="pill">{percent}% complete</span>
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
  onClose,
  onRefresh,
}: {
  project: Project;
  data: Bootstrap;
  user: User;
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
  const [fundRemarks, setFundRemarks] = useState("");
  const [trailOpen, setTrailOpen] = useState(true);
  const reportInput = useRef<HTMLInputElement>(null);
  const workflowInput = useRef<HTMLInputElement>(null);
  const [committeeForm, setCommitteeForm] = useState({
    chairmanId: data.people[0]?.id ?? "",
    memberIds: data.people.slice(0, 3).map((person) => person.id),
    constitutionDate: new Date().toISOString().slice(0, 10),
    terms: "Complete the assigned procurement board review and submit its decision/report.",
  });
  const index = data.stages.findIndex((s) => s.id === project.stage);
  const next = data.stages[index + 1];
  const committeeType = committeeTypeByStage[project.stage];
  const committee = data.committees.find(
    (item) =>
      item.project_id === project.id &&
      (!committeeType || item.type === committeeType),
  );
  const cfaRelease = project.workflowRecords.find(
    (record) => record.kind === "cfa_fund_release",
  );
  const canAdvance =
    Boolean(next) &&
    user.role === "admin" &&
    project.stage === "demand_submission";
  const submit = async (url: string, body: object) => {
    try {
      await api(url, { method: "POST", body: JSON.stringify(body) });
      setNote("");
      setQuery("");
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
      await onRefresh();
      if (category === "tsc_report") {
        if (reportInput.current) reportInput.current.value = "";
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
      setDecisionRemarks("");
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const readPdf = async (file: File | undefined) => {
    if (!file) throw new Error("Select a PDF to upload");
    return pdfToDataUrl(file);
  };
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
              {project.stageLabel} · Due {project.deadline}
            </p>
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
        {user.role !== "vendor" || project.stage === "bid_submission" ? (
          <section className="drawer-section trail-section">
            <button
              className="trail-toggle"
              aria-expanded={trailOpen}
              onClick={() => setTrailOpen(!trailOpen)}
            >
              <span>Trail</span>
              <span className="trail-toggle-icon" aria-hidden="true">
                {trailOpen ? "-" : "+"}
              </span>
            </button>
            {trailOpen && (
              <>
                {project.documents.length > 0 && (
                  <div className="trail-block">
                    <h4>Documents</h4>
                    {project.documents.map((doc) => (
                      <div className="trail-item" key={doc.id}>
                        <div>
                          <b>{doc.name}</b>
                          <small>
                            {doc.category} · {new Date(doc.at).toLocaleString()}
                          </small>
                        </div>
                        <a href={doc.content} target="_blank" rel="noreferrer">
                          View
                        </a>
                      </div>
                    ))}
                  </div>
                )}
                {project.queries.length > 0 && (
                  <div className="trail-block">
                    <h4>Queries</h4>
                    {project.queries.map((q) => (
                      <div className="query" key={q.id}>
                        <b>{q.actor.name}</b>
                        <small>{q.status}</small>
                        <p>{q.text}</p>
                        {q.replies.map((r) => (
                          <div className="reply" key={r.id}>
                            <b>{r.actor.name}</b>
                            <p>{r.text}</p>
                          </div>
                        ))}
                        <div className="reply-row">
                          <input
                            value={reply[q.id] ?? ""}
                            onChange={(e) =>
                              setReply({ ...reply, [q.id]: e.target.value })
                            }
                            placeholder="Reply to query…"
                          />
                          <button
                            className="button secondary"
                            onClick={() =>
                              submit(
                                `/api/projects/${project.id}/queries/${q.id}/replies`,
                                { text: reply[q.id] },
                              )
                            }
                          >
                            Reply
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="reply-row">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Raise a new query…"
                  />
                  <button
                    className="button secondary"
                    onClick={() =>
                      submit(`/api/projects/${project.id}/queries`, { text: query })
                    }
                  >
                    Ask
                  </button>
                </div>
              </>
            )}
          </section>
        ) : null}
        {error && <div className="error">{error}</div>}
        {user.role === "admin" &&
          committeeType &&
          ["committee_pending", "opening_board_formation", "tec_formation", "x_formation", "tac_formation"].includes(project.stage) &&
          (!committee || committee.status === "rejected") && (
            <section className="action-box">
              <span className="eyebrow">COMMITTEE FORMATION</span>
              <h3>Form {committeeType}</h3>
              <p className="subtle">
                Select exactly three members and one of them as chairperson.
                {project.stage === "tac_formation" &&
                  " At least one TAC member must belong to IA."}
              </p>
              <label>
                Three members
                <select
                  multiple
                  value={committeeForm.memberIds}
                  onChange={(e) =>
                    setCommitteeForm({
                      ...committeeForm,
                      memberIds: Array.from(e.target.selectedOptions).map(
                        (option) => option.value,
                      ),
                    })
                  }
                >
                  {data.people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name} · {person.designation}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Chairperson
                <select
                  value={committeeForm.chairmanId}
                  onChange={(e) =>
                    setCommitteeForm({
                      ...committeeForm,
                      chairmanId: e.target.value,
                    })
                  }
                >
                  {data.people.map((person) => (
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
                Form {committeeType}
              </button>
            </section>
          )}
        {user.role === "super_admin" &&
          project.stage === "tec_approval" &&
          committee?.status === "pending" && (
          <section className="action-box approval-box">
            <span className="eyebrow">SUPER ADMIN DECISION</span>
            <h3>Review and approve TEC formation</h3>
            <p className="subtle">
              SS may query Admin or approve the proposed TEC.
            </p>
            <textarea
              value={decisionRemarks}
              onChange={(e) => setDecisionRemarks(e.target.value)}
              placeholder="Record approval remarks or a query for Admin…"
            />
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
                Approve TEC
              </button>
            </div>
          </section>
        )}
        {canAdvance && (
          <section className="action-box">
            <span className="eyebrow">
              {project.stage === "demand_submission" ? "DEMAND REVIEW" : "BID OPENING"}
            </span>
            <h3>
              {project.stage === "demand_submission"
                ? "Accept the department procurement demand"
                : "Open technical bids"}
            </h3>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add an approval or handover note…"
            />
            <button
              className="button primary"
              onClick={() =>
                submit(`/api/projects/${project.id}/advance`, { note })
              }
            >
              {project.stage === "demand_submission"
                ? "Accept demand →"
                : "Open technical bids →"}
            </button>
          </section>
        )}
        {user.role === "committee" && project.stage === "tsc_report" && (
          <section className="action-box">
            <span className="eyebrow">TSC REPORT</span>
            <h3>Send specification report to Admin</h3>
            <input
              value={reportTitle}
              onChange={(e) => setReportTitle(e.target.value)}
              placeholder="Report title"
            />
            <textarea
              value={reportContent}
              onChange={(e) => setReportContent(e.target.value)}
              placeholder="Record technical scrutiny, observations and recommendation…"
            />
            <label>
              Optional PDF attachment
              <input
                ref={reportInput}
                type="file"
                accept="application/pdf,.pdf"
              />
            </label>
            <div className="action-row">
              <button
                className="button secondary"
                onClick={() =>
                  uploadDocument(
                    "tsc_report",
                    reportInput.current?.files?.[0],
                    reportTitle ? `${reportTitle}.pdf` : undefined,
                  )
                }
              >
                Upload report PDF
              </button>
              <button
                className="button primary"
                onClick={() =>
                  submit(`/api/projects/${project.id}/tsc-report`, {
                    title: reportTitle,
                    content: reportContent,
                  })
                }
              >
                Submit report to Admin
              </button>
            </div>
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
            <div className="action-row">
              <button className="button secondary" onClick={() => submit(`/api/projects/${project.id}/as-decision`, { action: "query", remarks: decisionRemarks })}>
                Raise query
              </button>
              <button className="button primary" onClick={() => submit(`/api/projects/${project.id}/as-decision`, { action: "approve", remarks: decisionRemarks })}>
                Approve and return to Admin
              </button>
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
            <h3>Send the report to DGS for review</h3>
            <textarea value={decisionRemarks} onChange={(e) => setDecisionRemarks(e.target.value)} placeholder="Forwarding remarks…" />
            <button className="button primary" onClick={() => submitWorkflowAction("forward_to_dgs_review", { remarks: decisionRemarks })}>
              Send to DGS
            </button>
          </section>
        )}
        {user.role === "dgs_ia" && project.stage === "dgs_ia_review" && (
          <section className="action-box approval-box">
            <span className="eyebrow">DGS REVIEW</span>
            <h3>Review the TSC report and return it to Admin HQ</h3>
            {project.reports[0] && (
              <div className="report-preview">
                <b>{project.reports[0].title}</b>
                <p>{project.reports[0].content}</p>
              </div>
            )}
            <textarea value={decisionRemarks} onChange={(e) => setDecisionRemarks(e.target.value)} placeholder="Approval remarks or query…" />
            <div className="action-row">
              <button className="button secondary" onClick={() => submitWorkflowAction("second_review_decision", { decision: "query", remarks: decisionRemarks })}>Raise query</button>
              <button className="button primary" onClick={() => submitWorkflowAction("second_review_decision", { decision: "approve", remarks: decisionRemarks })}>Approve and return to Admin HQ</button>
            </div>
          </section>
        )}
        {user.role === "hq" && project.stage === "tender_draft" && (
          <section className="action-box">
            <span className="eyebrow">ADMIN HQ DRAFT TENDER</span>
            <h3>Upload and send draft tender to IA</h3>
            <input ref={workflowInput} type="file" accept="application/pdf,.pdf" />
            <textarea value={decisionRemarks} onChange={(e) => setDecisionRemarks(e.target.value)} placeholder="Note for IA…" />
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
            }}>Send draft to IA</button>
          </section>
        )}
        {user.role === "ia" && project.stage === "ia_tender_review" && (
          <section className="action-box">
            <span className="eyebrow">IA FINAL TENDER REVIEW</span>
            <h3>Publish final tender with deadline</h3>
            <input ref={workflowInput} type="file" accept="application/pdf,.pdf" />
            <label>Tender deadline<input type="datetime-local" value={tenderDeadline} onChange={(e) => setTenderDeadline(e.target.value)} /></label>
            <textarea value={decisionRemarks} onChange={(e) => setDecisionRemarks(e.target.value)} placeholder="Changes made and publication remarks…" />
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
        {user.role === "admin" && project.stage === "admin_issue_tender" && (
          <section className="action-box">
            <span className="eyebrow">ISSUE TENDER</span>
            <h3>Send final tender to vendors</h3>
            <p className="subtle">Bid deadline: {project.deadline}</p>
            <button className="button primary" onClick={() => submitWorkflowAction("issue_tender")}>Send tender to vendors</button>
          </section>
        )}
        {user.role === "admin" && project.stage === "bid_submission" && (
          <section className="action-box">
            <span className="eyebrow">BID RECEIPT</span>
            <h3>Record bids received after the deadline</h3>
            <label>Number of bids received<input type="number" min="0" value={bidCount} onChange={(e) => setBidCount(e.target.value)} /></label>
            <textarea value={decisionRemarks} onChange={(e) => setDecisionRemarks(e.target.value)} placeholder="Receipt and deadline verification remarks…" />
            <button className="button primary" onClick={() => submitWorkflowAction("confirm_bids", { count: bidCount, remarks: decisionRemarks })}>Confirm bid receipt</button>
          </section>
        )}
        {user.role === "tec" && project.stage === "tec_review" && (
          <section className="action-box">
            <span className="eyebrow">TEC TECHNICAL REPORT</span>
            <h3>Record technically qualified vendors</h3>
            <input value={reportTitle} onChange={(e) => setReportTitle(e.target.value)} placeholder="Report title" />
            <textarea value={reportContent} onChange={(e) => setReportContent(e.target.value)} placeholder="Evaluation observations and qualification rationale…" />
            <label>Qualified vendors<select multiple value={qualifiedVendorIds} onChange={(e) => setQualifiedVendorIds(Array.from(e.target.selectedOptions).map((option) => option.value))}>
              {data.vendors.filter((vendor) => vendor.active).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
            </select></label>
            <button className="button primary" onClick={() => submitWorkflowAction("submit_tec_report", { title: reportTitle, content: reportContent, qualifiedVendorIds })}>Send TEC report to Admin</button>
          </section>
        )}
        {user.role === "committee" && project.stage === "price_opening" && (
          <section className="action-box">
            <span className="eyebrow">X COMMITTEE FINANCIAL EVALUATION</span>
            <h3>Select the top three qualified vendors</h3>
            <label>Top three vendors<select multiple value={topVendorIds} onChange={(e) => setTopVendorIds(Array.from(e.target.selectedOptions).map((option) => option.value))}>
              {data.vendors.filter((vendor) => vendor.active && (project.workflowRecords.find((record) => record.kind === "tec_report")?.data.qualifiedVendorIds as string[] | undefined)?.includes(vendor.id)).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
            </select></label>
            <textarea value={decisionRemarks} onChange={(e) => setDecisionRemarks(e.target.value)} placeholder="Comparative financial analysis and report…" />
            <button className="button primary" onClick={() => submitWorkflowAction("submit_x_report", { topVendorIds, remarks: decisionRemarks })}>Send X committee report to Admin</button>
          </section>
        )}
        {user.role === "tac" && project.stage === "tac_review" && (
          <section className="action-box">
            <span className="eyebrow">TAC FINAL SELECTION</span>
            <h3>Select final vendor and record award basis</h3>
            <label>Final vendor<select value={tacVendorId} onChange={(e) => setTacVendorId(e.target.value)}>
              <option value="">Select vendor</option>
              {data.vendors.filter((vendor) => (project.workflowRecords.find((record) => record.kind === "x_report")?.data.topVendorIds as string[] | undefined)?.includes(vendor.id)).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
            </select></label>
            <label>Selected price<input type="number" min="0.01" value={tacPrice} onChange={(e) => setTacPrice(e.target.value)} /></label>
            <textarea value={tacSpecifications} onChange={(e) => setTacSpecifications(e.target.value)} placeholder="Final vendor technical specifications…" />
            <textarea value={decisionRemarks} onChange={(e) => setDecisionRemarks(e.target.value)} placeholder="TAC selection report and justification…" />
            <button className="button primary" onClick={() => submitWorkflowAction("submit_tac_report", { vendorId: tacVendorId, price: tacPrice, technicalSpecifications: tacSpecifications, remarks: decisionRemarks })}>Send TAC report</button>
          </section>
        )}
        {user.role === "cfa" && project.stage === "cfa_approval" && (
          <section className="action-box">
            <span className="eyebrow">CFA FUND RELEASE</span>
            <h3>Release funds through IFD</h3>
            <label>Release reference<input value={fundReference} onChange={(e) => setFundReference(e.target.value)} /></label>
            <label>Amount released<input type="number" min="0.01" value={fundAmount} onChange={(e) => setFundAmount(e.target.value)} /></label>
            <textarea value={fundRemarks} onChange={(e) => setFundRemarks(e.target.value)} placeholder="CFA release authority and IFD instructions…" />
            <button className="button primary" onClick={() => submitWorkflowAction("cfa_release_funds", { reference: fundReference, amount: fundAmount, remarks: fundRemarks })}>Record CFA release and send to IFD</button>
          </section>
        )}
        {user.role === "ia" && project.stage === "ifd_review" && (
          <section className="action-box">
            <span className="eyebrow">IFD RELEASE CONFIRMATION</span>
            <h3>Confirm CFA funds have been released</h3>
            {cfaRelease && (
              <p className="subtle">
                Reference: {String(cfaRelease.data.reference)} · Amount: {money(Number(cfaRelease.data.amount))}
              </p>
            )}
            <textarea value={fundRemarks} onChange={(e) => setFundRemarks(e.target.value)} placeholder="IFD confirmation and completion remarks…" />
            <button className="button primary" onClick={() => submitWorkflowAction("release_funds", {
              reference: String(cfaRelease?.data.reference ?? ""),
              amount: String(cfaRelease?.data.amount ?? ""),
              remarks: fundRemarks,
            })}>Confirm release and complete project</button>
          </section>
        )}
        <section className="drawer-section">
          <h3>Activity</h3>
          {project.events.map((e) => (
            <div className="event" key={e.id}>
              <span className="event-dot" />
              <div>
                <b>{e.text}</b>
                <small>
                  {e.actor.name} · {new Date(e.at).toLocaleString()}
                </small>
              </div>
            </div>
          ))}
        </section>
      </aside>
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
  role,
  onClose,
  onCreated,
}: {
  role: User["role"];
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
              DEPARTMENT DEMAND
            </span>
            <h2>
              Raise procurement demand
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
        {role === "department" && (
          <label>
            Requirement PDF (optional, maximum 8 MB)
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setRequirementPdf(e.target.files?.[0] ?? null)}
            />
          </label>
        )}
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
              const pdfData = role === "department" && requirementPdf
                ? await pdfToDataUrl(requirementPdf)
                : undefined;
              const x = await api<{ project: Project }>("/api/projects", {
                method: "POST",
                body: JSON.stringify({
                  ...form,
                  ...(requirementPdf && pdfData
                    ? {
                        requirementName: requirementPdf.name,
                        requirementPdf: pdfData,
                      }
                    : {}),
                }),
              });
              onCreated(x.project);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Submit demand
        </button>
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
