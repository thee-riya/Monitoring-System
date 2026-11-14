let state = {
  user: null,
  projects: [],
  stages: [],
  selected: null,
  view: "dashboard",
  error: "",
};
const app = document.querySelector("#app");
const roleLabel = {
  admin: "Admin",
  super_admin: "Super Admin",
  hq: "HQ Officer",
  committee: "Committee Member",
  ia: "IA (historical record)",
  vendor: "Vendor",
};
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[char],
  );
async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}
function stageIndex(stage) {
  return state.stages.findIndex((item) => item[0] === stage);
}
function render() {
  state.user ? renderApp() : renderLogin();
}
function renderLogin() {
  app.innerHTML = `<div class="login"><div class="login-card"><div class="brand"><span class="mark">PF</span> ProcureFlow</div><h1 style="margin-top:30px">Tender command centre</h1><p class="muted">Secure, self-hosted workflow for projects, approvals, tenders and bids.</p><form id="loginForm"><div class="field"><label>Username</label><input name="username" required autofocus></div><div class="field"><label>Password</label><input name="password" type="password" required></div><button class="btn primary" style="width:100%">Sign in</button><div id="loginError"></div></form><div class="demo" style="margin-top:20px"><b>Demo access</b><br>admin / admin123 &nbsp; · &nbsp; hq / hq123 &nbsp; · &nbsp; vendor / vendor123</div></div></div>`;
  document.querySelector("#loginForm").onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    try {
      const data = await api("/api/login", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(form)),
      });
      state.user = data.user;
      await load();
    } catch (error) {
      document.querySelector("#loginError").innerHTML =
        `<div class="error">${esc(error.message)}</div>`;
    }
  };
}
async function load() {
  const data = await api("/api/projects");
  state.projects = data.projects;
  state.stages = data.stages;
  state.error = "";
  render();
}
function renderApp() {
  const active = state.view === "dashboard" ? "dashboard" : "projects";
  const completed = state.projects.filter(
    (project) => project.stage === "completed",
  ).length;
  app.innerHTML = `<div class="shell"><aside><div class="brand"><span class="mark">PF</span> ProcureFlow</div><nav class="nav"><button class="${active === "dashboard" ? "active" : ""}" data-view="dashboard">▦ &nbsp; Overview</button><button class="${active === "projects" ? "active" : ""}" data-view="projects">▤ &nbsp; Projects</button></nav><div class="user"><b>${esc(state.user.name)}</b><div class="muted">${esc(roleLabel[state.user.role])}</div><button id="logout" class="btn secondary" style="width:100%;margin-top:12px">Sign out</button></div></aside><main>${state.view === "dashboard" ? dashboard(completed) : projectsView()}</main></div>${state.selected ? modal(state.selected) : ""}`;
  document.querySelectorAll("[data-view]").forEach(
    (button) =>
      (button.onclick = () => {
        state.view = button.dataset.view;
        render();
      }),
  );
  document.querySelector("#logout").onclick = async () => {
    await api("/api/logout", { method: "POST" });
    state.user = null;
    render();
  };
  document.querySelectorAll("[data-project]").forEach(
    (button) =>
      (button.onclick = () => {
        state.selected = state.projects.find(
          (p) => p.id === button.dataset.project,
        );
        render();
      }),
  );
  document
    .querySelector("#newProject")
    ?.addEventListener("click", () => showProjectForm());
  document.querySelector("#closeModal")?.addEventListener("click", () => {
    state.selected = null;
    render();
  });
  document
    .querySelector("#actionForm")
    ?.addEventListener("submit", submitAction);
  document.querySelector("#queryForm")?.addEventListener("submit", submitQuery);
  document
    .querySelectorAll("[data-reply]")
    .forEach((form) => form.addEventListener("submit", submitReply));
}
function dashboard(completed) {
  const active = state.projects.filter((p) => p.stage !== "completed").length,
    bids = state.projects.reduce((sum, p) => sum + p.bids.length, 0),
    queries = state.projects.reduce(
      (sum, p) => sum + p.queries.filter((q) => q.status === "open").length,
      0,
    );
  return `<div class="top"><div><h1>Good ${new Date().getHours() < 12 ? "morning" : "day"}, ${esc(state.user.name.split(" ")[0])}</h1><p class="muted">Track every tender from creation to CFA approval.</p></div><button class="btn primary" id="newProject">+ New project</button></div><div class="grid"><div class="card"><span class="muted">Active projects</span><div class="metric">${active}</div></div><div class="card"><span class="muted">Open queries</span><div class="metric">${queries}</div></div><div class="card"><span class="muted">Vendor bids</span><div class="metric">${bids}</div></div><div class="card"><span class="muted">Completed</span><div class="metric">${completed}</div></div></div><div class="card"><div class="row"><div><h2>Workflow pipeline</h2><p class="muted">Projects currently moving through the approval chain.</p></div><button class="btn secondary" data-view="projects">View all</button></div><div class="projects">${state.projects.slice(0, 6).map(projectCard).join("")}</div></div>`;
}
function projectsView() {
  return `<div class="top"><div><h1>Projects</h1><p class="muted">All tenders, approvals, queries and bids in one place.</p></div><button class="btn primary" id="newProject">+ New project</button></div><div class="projects">${state.projects.map(projectCard).join("") || `<div class="card empty">No projects yet.</div>`}</div>`;
}
function projectCard(project) {
  const progress = Math.round(
    (stageIndex(project.stage) / (state.stages.length - 1)) * 100,
  );
  return `<div class="card project-card"><div class="project-head"><div><span class="badge">${esc(project.id)}</span><h3 style="margin:12px 0 2px">${esc(project.title)}</h3><span class="muted">${esc(project.owner.name)}</span></div><b>${progress}%</b></div><p class="muted">${esc(project.description)}</p><div class="progress"><i style="width:${progress}%"></i></div><div class="row"><span class="muted">${esc(project.stageLabel)}</span><button class="btn secondary" data-project="${project.id}">Open</button></div></div>`;
}
function modal(project) {
  const canQuery =
    !["vendor"].includes(state.user.role) || project.stage === "bid_submission";
  const next = state.stages[stageIndex(project.stage) + 1];
  return `<div class="modal-bg"><div class="modal"><div class="modal-head"><div><span class="badge">${esc(project.id)}</span><h2 style="margin:10px 0 2px">${esc(project.title)}</h2><p class="muted">${esc(project.stageLabel)} · Deadline ${esc(project.deadline)}</p></div><button class="btn secondary" id="closeModal">Close</button></div><div class="card" style="margin:18px 0;background:#fafbff"><b>Workflow progress</b><div class="progress" style="margin-top:12px"><i style="width:${Math.round((stageIndex(project.stage) / (state.stages.length - 1)) * 100)}%"></i></div><small class="muted">${stageIndex(project.stage) + 1} of ${state.stages.length} stages</small></div>${actionPanel(project, next)}<h3>Queries & replies</h3>${project.queries.map(queryBlock).join("") || `<p class="muted">No queries raised.</p>`}${canQuery ? `<form id="queryForm"><div class="field"><label>Raise a query</label><textarea name="text" placeholder="Ask a question for the relevant stakeholder..." required></textarea></div><button class="btn secondary">Submit query</button></form>` : ""}<h3 style="margin-top:25px">Activity</h3><div class="timeline">${project.events
    .slice()
    .reverse()
    .map(
      (event) =>
        `<div class="event"><div><b>${esc(event.text)}</b><br><small>${esc(event.actor?.name || "System")} · ${new Date(event.at).toLocaleString()}</small></div></div>`,
    )
    .join("")}</div></div></div>`;
}
function actionPanel(project, next) {
  if (state.user.role === "vendor" && project.stage === "bid_submission")
    return `<div class="card" style="margin-bottom:20px"><h3>Submit tender bid</h3><form id="actionForm"><input type="hidden" name="action" value="submit_bid"><div class="field"><label>Bid reference</label><input name="reference" required placeholder="e.g. BID-2026-001"></div><div class="field"><label>Bid amount</label><input name="amount" type="number" min="0" required></div><div class="field"><label>Note</label><textarea name="note"></textarea></div><button class="btn primary">Submit bid</button></form></div>`;
  const allowed = ["admin", "super_admin", "committee", "ia", "hq"].includes(
    state.user.role,
  );
  if (!allowed || !next || project.stage === "completed") return "";
  return `<div class="card" style="margin-bottom:20px"><h3>Next workflow action</h3><p class="muted">Advance this project to <b>${esc(next[1])}</b> after completing the current review.</p><form id="actionForm"><input type="hidden" name="action" value="advance"><input type="hidden" name="targetStage" value="${next[0]}"><div class="field"><label>Decision note</label><textarea name="note" placeholder="Record the decision, approval or handover note..." required></textarea></div><button class="btn primary">Advance workflow</button></form></div>`;
}
function queryBlock(query) {
  return `<div class="query"><b>${esc(query.actor.name)}</b><span class="muted"> · ${esc(query.status)}</span><p style="margin:8px 0">${esc(query.text)}</p>${query.replies.map((reply) => `<div style="padding:8px 0 0 14px;border-left:2px solid #dfe5ff"><b>${esc(reply.actor.name)}</b><p style="margin:3px 0">${esc(reply.text)}</p></div>`).join("")}<form data-reply="${query.id}" style="display:flex;gap:8px;margin-top:12px"><input name="text" placeholder="Reply to query..." required style="flex:1"><button class="btn secondary">Reply</button></form></div>`;
}
function showProjectForm() {
  state.selected = { new: true };
  render();
  document.querySelector("#newProjectForm").onsubmit = async (event) => {
    event.preventDefault();
    try {
      const data = await api("/api/projects", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(event.target))),
      });
      state.selected = data.project;
      await load();
    } catch (error) {
      document.querySelector("#formError").innerHTML =
        `<div class="error">${esc(error.message)}</div>`;
    }
  };
}
async function submitAction(event) {
  event.preventDefault();
  try {
    const data = await api(`/api/projects/${state.selected.id}/action`, {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(event.target))),
    });
    state.selected = data.project;
    await load();
  } catch (error) {
    alert(error.message);
  }
}
async function submitQuery(event) {
  event.preventDefault();
  try {
    const data = await api(`/api/projects/${state.selected.id}/query`, {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(event.target))),
    });
    state.selected = data.project;
    await load();
  } catch (error) {
    alert(error.message);
  }
}
async function submitReply(event) {
  event.preventDefault();
  try {
    const form = new FormData(event.target);
    form.append("queryId", event.target.dataset.reply);
    const data = await api(`/api/projects/${state.selected.id}/reply`, {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form)),
    });
    state.selected = data.project;
    await load();
  } catch (error) {
    alert(error.message);
  }
}
async function boot() {
  try {
    const data = await api("/api/me");
    state.user = data.user;
    await load();
  } catch {
    render();
  }
}
const originalModal = modal;
modal = (project) =>
  project.new
    ? `<div class="modal-bg"><div class="modal"><div class="modal-head"><h2>New project</h2><button class="btn secondary" id="closeModal">Close</button></div><form id="newProjectForm"><div class="field"><label>Project title</label><input name="title" required></div><div class="field"><label>Description</label><textarea name="description" required></textarea></div><div class="field"><label>Estimated value</label><input name="estimatedValue" type="number" min="0"></div><div class="field"><label>Target deadline</label><input name="deadline" type="date" required></div><button class="btn primary">Create project</button><div id="formError"></div></form></div></div>`
    : originalModal(project);
boot();
