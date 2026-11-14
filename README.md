# ProcureFlow

ProcureFlow is a modern, self-hosted, LAN-only tender and approval workflow application. The frontend is React 19 + Vite, the backend is TypeScript + Express 5, and data is stored in SQLite through better-sqlite3. It runs on one computer and is reachable by other devices on the same network without internet access.

## Run

1. Install Node.js 20 or newer.
2. Install dependencies with `npm install`.
3. Build the production bundle with `npm run build`.
4. Start the LAN server with `npm start`.
5. On the host, open `http://localhost:3000`. Other LAN devices can use `http://<host-ip>:3000`.

For development, use `npm run dev`. Vite runs the frontend at port `5173` and proxies `/api` requests to the TypeScript server at port `3000`.

The application creates `procureflow.sqlite` on first run. Keep this file backed up; it is the local application database.

## Demo accounts

| Role | Username | Password |
|---|---|---|
| Department | `department` | `department123` |
| Admin | `admin` | `admin123` |
| Admin HQ | `hq` | `hq123` |
| TSC / Committee Member | `tsc` | `tsc123` |
| Technical Evaluation Committee (TEC) | `tec` | `tec123` |
| Tender Acceptance Committee (TAC) | `tac` | `tac123` |
| AS (IA) report reviewer | `AS` | `AS123` |
| DGS report reviewer | `dgs` | `dgs123` |
| IA Wing | `ia` | `ia123` |
| Super Admin (SS) | `superadmin` | `admin123` |
| CFA | `cfa` | `cfa123` |

## Workflow

Department submits a procurement demand (with an optional PDF) → Admin forms a three-member TSC with one chairperson → TSC sends its specifications report to Admin → Admin forwards it to AS (IA) for approval → Admin sends it to Admin HQ → Admin HQ sends it to DGS for review → DGS may query Admin HQ and waits for its reply, or approves and returns the report to Admin HQ → Admin HQ prepares and uploads the draft tender PDF → IA publishes the final tender PDF with a deadline → Admin issues the tender and records bid receipt → Admin forms the Bid Opening Board, which opens technical bids → Admin forms the TEC → SS approves the TEC → TEC evaluates vendors and reports qualified vendors to Admin → Admin forms X, which evaluates financial bids and reports its top three → Admin forms a three-person TAC including IA → TAC recommends the final vendor, price and specifications → CFA releases funds through IFD and the project is completed.

Vendor queries, replies, and technical/financial bid submission are offline and are not implemented. Only Department can select **New project** and raise a procurement demand; only this form offers the optional requirement-PDF upload. All demand submissions begin at the demand-review stage, where Admin only reviews and accepts the demand. After a stage transition, the project shows the responsible next role and demo sign-in credentials. Queries remain in the Trail rather than being workflow stages.

## Architecture

- `src/client/` — React UI, responsive workspace shell, dashboard, project drawer, forms and workflow map.
- `src/server/` — Express API, validation, session handling, workflow permissions and SQLite persistence.
- `src/shared/` — shared TypeScript domain types.
- `dist/` — generated production output; do not edit directly.

## Implemented workflow coverage

- Role-checked, sequential stages from optional-PDF demand registration through CFA/IFD completion.
- Admin forms the TSC, Bid Opening Board, TEC, X committee and TAC; each committee has exactly three unique members and one chairperson. TAC must include an IA member.
- TSC report, draft tender PDF and final tender PDF are persisted; IA publishes the final tender with a deadline.
- The TEC approval gate supports SS approval or query. TEC qualification results, X's top-three financial shortlist, TAC's award recommendation, bid receipt and fund release are persisted as workflow records.
- Admin-only report routing, designated reviewer decisions, and private stage queries.
- Vendor query/reply and bid submission are intentionally offline and not implemented.
- Activity events retain actor, timestamp and action details; the project Trail shows queries and history.

## Frontend behavior

The browser starts at the login screen, establishes a cookie session with the API, and loads the bootstrap payload containing users, stages, projects, audit events, queries and workflow records. The dashboard summarizes the current workload. Opening a project shows a side drawer where an authorized role can perform its stage-specific action, raise or answer an internal query, and review the audit history. Vendor query and bid submission are offline. After every mutation the client refreshes project data from the server so the UI remains consistent with SQLite.

The visual layer includes page-entry transitions, staggered metric and project-card reveals, hover elevation, animated progress bars, navigation movement, drawer/dialog transitions, activity-list reveals, and a live system-status pulse. All motion is disabled or reduced automatically when the browser's `prefers-reduced-motion` setting is enabled.

## Data flow

1. A user signs in with one of the configured demo accounts.
2. Express validates the request and creates an in-memory session cookie.
3. The React client requests `/api/bootstrap`.
4. The server reads normalized project, event, query, reply and bid records from SQLite.
5. Role permissions determine which workflow actions are displayed and accepted.
6. Mutations are validated with Zod, written transactionally through SQLite statements, and recorded in the activity log.
7. The client refreshes the affected data and animates the updated state.

## Software Requirements Specification (SRS)

### 1. Purpose and scope

ProcureFlow is a LAN-hosted procurement monitoring and approval system. It records a procurement demand, approvals, tender preparation and publication, offline vendor bidding, committee evaluation, financial review and closure. The system is designed for controlled sequential handoffs: a user cannot skip a stage or perform an action reserved for another authority.

The application is intended for a trusted departmental LAN. It uses local SQLite storage, cookie-based sessions and a React browser client. It does not require an internet connection after dependencies have been installed.

### 2. Actors and authority

| Actor | Allowed responsibility |
|---|---|
| Department | Raise a procurement demand; attaching a requirement PDF is optional. |
| Admin | Form committees, route reports to AS (IA) and Admin HQ, issue the final tender, record bid receipt, and manage the later committee stages. |
| Admin HQ | Forward the report to DGS for review, receive the review outcome, and prepare/upload the draft tender PDF for IA. |
| TSC | Prepare and send the specifications report to Admin. |
| AS (IA) | Review the TSC report routed by Admin and return a decision or query. |
| DGS | Review the report sent by Admin HQ and approve, return or query it to Admin HQ. |
| IA Wing | Publish the final tender PDF and deadline; serve as a required TAC member; confirm IFD release. |
| Bid Opening Board | Open technical bids after Admin forms the three-member board. |
| SS | Approve or query the proposed TEC. |
| TEC | Evaluate technical bids and send its qualified-vendor report to Admin. |
| X committee | Evaluate financial bids of technically qualified vendors and send the top-three shortlist to Admin. |
| TAC | Select the final vendor and submit the price and technical specifications. |
| CFA | Release funds through IFD. |
| Vendors | Receive the final tender, raise queries and submit technical/financial bids offline; these vendor-facing activities are not implemented. |

### 3. Functional requirements

1. **Authentication:** users sign in with a username and password; authenticated API calls use an HTTP-only session cookie.
2. **Demand registration:** Department provides the demand title, description, estimated value and deadline; a PDF may be attached but is not mandatory.
3. **Committee formation:** Admin forms each board/committee from exactly three unique members and selects one of them as chairperson. TAC must include an IA member.
4. **Approval routing:** TSC submits its specifications report to Admin; Admin routes it to AS (IA), then to Admin HQ. Admin HQ sends it to DGS for review. DGS may query Admin HQ and wait for its reply, or approve and return the report to Admin HQ.
5. **Tender documents:** Admin HQ uploads the draft tender PDF and sends it to IA; IA uploads and publishes the final tender PDF with a deadline; Admin issues the tender and records bid receipt.
6. **Committee evaluation:** Admin forms the Bid Opening Board, TEC, X and TAC. SS approves or queries the TEC; TEC reports qualified vendors; X reports its top three; TAC records the final selection, price and specifications.
7. **Funding:** CFA records fund release through IFD; IA confirms the IFD release and completes the project.
8. **Sequential workflow:** every transition must target the declared next stage. Arbitrary target stages and skipped handoffs are rejected.
9. **Private conversations:** a query is visible to its sender and designated responder for that stage. Other users cannot read or reply to it.
10. **Activity transparency:** project activity events are visible to all authenticated users, including actor and timestamp.
11. **Validation:** malformed requests, incomplete committee composition, invalid amounts and unauthorized actions return explicit errors.
12. **Persistence:** projects, committees, reports, tender documents, queries, replies, events and workflow records are stored in SQLite. Vendor bid content remains offline.

### 4. Workflow stages

`Department demand → Admin accepts demand and forms TSC → TSC report → Admin review → AS (IA) review → Admin sends to Admin HQ → Admin HQ sends to DGS → DGS review returns to Admin HQ → Admin HQ draft tender PDF → IA final tender PDF and deadline → Admin issues tender and records offline bid receipt → Admin forms Bid Opening Board → offline technical bid opening → Admin forms TEC → SS approval → TEC technical report → Admin forms X → X financial shortlist → Admin forms TAC → TAC award recommendation → CFA fund release through IFD → IA confirms IFD → Completed`

Only Department can create a project, and all projects begin with Department demand submission. Admin's demand-review action is limited to reviewing and accepting a submitted demand. TSC formation advances the project to the TSC report stage once the committee is submitted. The listed vendor-facing tender queries, replies and bid submissions are offline and do not have application screens or actions.

### 5. Non-functional requirements

- **Deployment:** Node.js 20+, Express 5, React 19, Vite and SQLite.
- **Network:** listen on the host LAN interface; no cloud service is required at runtime.
- **Security:** HTTP-only session cookie, server-side role checks, Zod request validation and no client-only authorization.
- **Usability:** responsive layout for desktop and tablet screens, keyboard-friendly forms and reduced-motion support.
- **Traceability:** each state-changing action writes an event with actor, timestamp and description.
- **Reliability:** workflow mutations use database transactions where multiple records must change together.

## Detailed end-to-end example

Start the application and sign in with the Department account to select **New project**. Department may attach an optional requirement PDF. Admin does not have a New project option; submitted demands start at Department demand submission for Admin to review and accept.

```bash
npm install
npm run check
npm run build
npm start
```

The application is at `http://localhost:3000`; other LAN devices can use `http://<host-ip>:3000`. Follow the steps in order, signing in as the role responsible for each action:

1. **Department** (`department / department123`) raises the demand and may attach a requirement PDF.
2. **Admin** (`admin / admin123`) accepts the demand and forms a TSC with three members and one chairperson. On submission, the stage advances to the TSC report stage.
3. **TSC** (`tsc / tsc123`) submits the specifications report to Admin.
4. **Admin** forwards the report to **AS (IA)** (`AS / AS123`); AS approves, returns or queries it, and the workflow goes back to Admin.
5. **Admin** sends the report to **Admin HQ** (`hq / hq123`), which forwards it to **DGS** (`dgs / dgs123`). DGS can raise a query; Admin HQ replies in the Trail while the report remains under DGS review. DGS then approves and returns the report to Admin HQ.
6. **Admin HQ** (`hq / hq123`) prepares and uploads the draft tender PDF, then sends it to IA.
7. **IA** uploads and publishes the final tender PDF with a deadline.
9. **Admin** issues the tender and records that technical and financial bids have been received by the deadline. Vendor participation and submissions are offline.
10. **Admin** forms a three-member Bid Opening Board. The board opens technical bids offline; the application proceeds directly to TEC formation.
11. **Admin** forms the three-member TEC. **SS** (`superadmin / admin123`) approves or queries the TEC.
12. **TEC** (`tec / tec123`) evaluates technical bids and sends its qualified-vendor report to Admin.
13. **Admin** forms the three-member X committee. X evaluates qualifying financial bids and sends its top-three shortlist to Admin.
14. **Admin** forms a three-member TAC that includes at least one IA member.
15. **TAC** (`tac / tac123`) selects the final vendor and records the price and technical specifications in its report to Admin.
16. **CFA** (`cfa / cfa123`) records fund release through IFD.
17. **IA** confirms IFD release; the project moves to **Completed**.

At every stage, the project workspace identifies the next role and shows its demo sign-in hint. Queries and replies appear in the Trail; they are not workflow stages. The activity history records the actor, action and timestamp.
