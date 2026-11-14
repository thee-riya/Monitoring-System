# ProcureFlow

ProcureFlow is a modern, self-hosted, LAN-only tender and approval workflow application. The frontend is React 19 + Vite, the backend is TypeScript + Express 5, and data is stored in SQLite through better-sqlite3. It runs on one computer and is reachable by other devices on the same network without internet access.

## Run

1. Install Node.js 20 or newer.
2. Install dependencies with `npm install`.
3. Start the LAN server with `npm start`; it builds the current production bundle before starting.
4. On the host, open `http://localhost:3000`. Other LAN devices can use `http://<host-ip>:3000`.

For development, use `npm run dev`. Vite runs the frontend at port `5173` and proxies `/api` requests to the TypeScript server at port `3000`.

The application creates `procureflow.sqlite` on first run. Keep this file backed up; it is the local application database.

## Demo accounts

| Role | Username | Password |
|---|---|---|
| Admin (IA) | `admin` | `admin123` |
| AS (IA) | `AS` | `AS123` |
| Admin HQ | `hq` | `hq123` |

## Workflow

Only Admin (IA) (`admin / admin123`), AS (IA) (`AS / AS123`) and Admin HQ (`hq / hq123`) have application logins. Admin (IA) creates projects and handles the workflow through routing the report to Admin HQ. Admin HQ sends the report for offline DGS and CS/SR approvals, receives it back after each approval, and uploads both signed documents.

Admin (IA) forms the TSC and uploads its formation supporting document → AS (IA) reviews the proposed TSC; if member changes are needed, AS returns it to Admin for revision and a new supporting-document upload → AS approves the TSC and Admin uploads the signed approval PDF → TSC becomes final and its membership is locked → TSC provides its specifications report to Admin offline → Admin uploads the report PDF → Admin sends it to AS (IA) for first report approval and uploads AS's signed approval PDF → Admin routes it to Admin HQ → HQ sends it to DGS for offline approval → DGS approval returns to HQ, which uploads DGS's signed approval document → HQ sends the report to CS/SR for offline approval → CS/SR approval returns to HQ, which uploads CS/SR's signed approval document → tender processing begins with Admin HQ's draft, which is sent only to Admin (IA) for review → Admin (IA) may suggest changes → Admin HQ publishes the final tender with a deadline and issues it → Admin HQ records bid receipt → the Bid Opening Board is formed offline and Admin HQ uploads its formation document → the board opens technical bids offline → Admin HQ forms the TEC and uploads its formation supporting document → HQ records SS's offline approval and uploads SS's signed approval PDF → HQ records TEC's technical and financial reports → Admin HQ forms TAC and uploads its formation supporting document → HQ records TAC's recommendation → CFA approves release through IFD offline and HQ records the release → Admin HQ uploads the signed CFA approval; after IFD approval, HQ uploads the final acceptance document and completes the project.

Vendor queries, replies, and technical/financial bid submission are offline and are not implemented. Department gives its procurement letter to Admin offline; only Admin (IA) can select **New project**, and the form requires the letter PDF. New projects start at TSC formation; there is no Department login or separate demand-acceptance stage. The only application logins are Admin (IA), AS (IA) and Admin HQ. TSC, DGS, CS/SR, the Bid Opening Board, SS, TEC, TAC, CFA and vendors do not sign in; Admin HQ records or uploads their later workflow outputs. Admin (IA) handles the workflow through routing the report to Admin HQ after AS (IA)'s first report approval, uploads the TSC supporting document and may review the draft tender. Admin HQ handles offline DGS/CS/SR approval handoffs and their signed-document uploads, uploads supporting documents after TEC/TAC formation, publishes the final tender, records offline committee/CFA decisions, and uploads signed approval and final acceptance documents. The draft tender is sent only to Admin (IA) for review. AS queries remain in the Trail rather than being workflow stages. When HQ has a question during DGS or CS/SR routing, it can raise a query for Admin (IA), who can see and reply to it; DGS/CS-SR approvals and their direct queries remain offline.

## Architecture

- `src/client/` — React UI, responsive workspace shell, dashboard, project drawer, forms and workflow map.
- `src/server/` — Express API, validation, session handling, workflow permissions and SQLite persistence.
- `src/shared/` — shared TypeScript domain types.
- `dist/` — generated production output; do not edit directly.

## Implemented workflow coverage

- Role-checked, sequential stages from Admin's project creation with a required Department letter through CFA/IFD completion.
- Admin (IA) forms the TSC and uploads its supporting document. The Bid Opening Board is formed offline, with its formation document uploaded by Admin HQ. Admin HQ forms TEC and TAC and uploads a supporting document after each formation; there is no separate X committee. Each committee selects three unique members and one chairperson from the same pool of 10 personnel. TAC must include a member from the Inspection & Audit department. Six demo vendors are available for evaluation.
- AS (IA) approves the proposed TSC before it becomes final; queries leave the proposal pending, while a member-change request returns it to Admin for revision and another supporting-document upload. Approval locks the final membership.
- Admin HQ sends the report to DGS offline; after it returns, HQ uploads DGS's signed document and sends it to CS/SR offline. After it returns from CS/SR, HQ uploads CS/SR's signed document; both approvals and signings are offline. Admin (IA) uploads signed AS (IA) approval PDFs; Admin HQ uploads the later signed SS and CFA approval PDFs.
- Supporting PDFs are required after TSC, TEC and TAC formation. The TSC report (provided offline by TSC and uploaded online by Admin), draft tender PDF and final tender PDF are persisted; Admin HQ publishes the final tender with a deadline after optional Admin (IA) suggestions.
- The TEC approval gate records SS's offline approval or query; Admin HQ records the decision and uploads SS's signed approval. TEC technical qualifications and its top-three financial evaluation, TAC's award recommendation, bid receipt and fund release are persisted as workflow records.
- CFA and IFD approvals are offline and have no login; Admin HQ records the release, uploads the signed CFA approval and then uploads the final acceptance PDF after IFD approval.
- Admin-only report routing, designated reviewer decisions, and private stage queries.
- At approval gates, AS (IA) decides through its login; Admin HQ records offline decisions from DGS, CS/SR, SS, CFA and IFD. Rejection requires a note and PDF, terminates the project, and blocks further workflow actions.
- Vendor query/reply and bid submission are intentionally offline and not implemented.
- Activity events retain actor, timestamp and action details. The project workspace groups activities, queries, replies and PDFs beneath expandable stage headings connected as a vertical timeline.

## Frontend behavior

The browser starts at the login screen, establishes a cookie session with the API, and loads the bootstrap payload containing users, stages, projects, audit events, queries and workflow records. The dashboard summarizes the current workload. Opening a project shows a side drawer where an authorized role can perform its stage-specific action, raise or answer an internal query, and review a collapsible, stage-linked Trail. Uploaded PDFs appear below their matching activity message with a View document button; queries and replies remain within their stage. Vendor query and bid submission are offline. After every mutation the client refreshes project data from the server so the UI remains consistent with SQLite.

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
| Department | Provide the procurement letter to Admin offline; no application login. |
| Admin (IA) | Create projects from Department letters, form TSC and upload its supporting document, route the report to Admin HQ after AS (IA)'s first report approval, upload signed AS (IA) approval PDFs, and optionally review the draft tender and send suggestions. |
| Admin HQ | Receive and forward the report for offline DGS and CS/SR approvals, upload both signed approval documents after each offline approval returns to HQ; prepare and publish the tender; manage tender issue and bid receipt; form TEC/TAC and upload their supporting documents; record offline decisions and upload other signed approvals and final acceptance. |
| TSC | Prepare the specifications report and provide it to Admin offline; TSC has no application login. |
| AS (IA) | Approve or query the proposed TSC, return it to Admin for member changes if needed, and give the first approval of the TSC report routed by Admin. TSC membership is locked after approval. |
| DGS | Give the second approval offline; return the report and signed document to Admin HQ for upload. No application login. |
| CS/SR | Give the third TSC report approval offline; return the report and signed document to Admin HQ for upload. No application login. |
| Bid Opening Board | Form offline and open technical bids offline; Admin HQ uploads the formation document. |
| SS | Approve or query the proposed TEC offline; Admin HQ records the decision and uploads SS's signed approval. |
| TEC | Evaluate technical bids and open/evaluate qualified financial bids offline; Admin HQ records TEC's reports. TEC has no login. |
| TAC | Select the final vendor offline; Admin HQ records its recommendation. TAC has no login. |
| CFA | Approve fund release through IFD offline; Admin HQ records it and uploads the signed CFA approval and, after IFD approval, the final acceptance document. CFA has no login. |
| Vendors | Six demo vendors are available for evaluation. Vendors receive the final tender, raise queries and submit technical/financial bids offline; these vendor-facing activities are not implemented. |

### 3. Functional requirements

1. **Authentication:** Only Admin (IA), AS (IA), and Admin HQ have application logins. All other actors, including DGS, CS/SR, the Bid Opening Board, SS, TEC, TAC and CFA, have no login; Admin HQ records or uploads their workflow outputs. Authenticated API calls use an HTTP-only session cookie.
2. **Project registration:** Admin (IA) enters project details from the offline Department letter and uploads its required PDF.
3. **Committee formation:** Admin (IA) forms the TSC and uploads its supporting document. If AS (IA) requests member changes, the workflow returns to Admin (IA); Admin revises and resubmits the TSC and uploads a supporting document for that revision. Admin HQ forms TEC and TAC using the same checkbox-based selector as TSC, each with exactly three unique members from the pool of 10 personnel and one chairperson, and uploads a supporting document after each formation. The Bid Opening Board is formed offline and Admin HQ uploads its formation document. No separate X committee is formed. TAC must include a member from the Inspection & Audit department.
4. **Approval routing:** AS (IA) approves the proposed TSC before it is treated as final; a query leaves it pending, while an explicit member-change request sends it back to Admin. Approval locks the TSC membership, and Admin uploads AS's signed approval PDF before the report stage. TSC provides its specifications report to Admin offline, and Admin uploads the report PDF online. Admin routes it to AS (IA) for first report approval, then to Admin HQ. HQ sends it to DGS for second approval offline; after DGS approval returns to HQ, HQ uploads the signed document and sends it to CS/SR offline. After CS/SR approval returns to HQ, HQ uploads the signed document before tender processing begins. Both DGS and CS/SR approvals and signings are offline.
5. **Tender documents:** Admin HQ uploads the draft tender PDF and sends it only to Admin (IA) for review; Admin (IA) may send suggestions; Admin HQ uploads and publishes the final tender PDF with a deadline, issues it and records bid receipt. After publication, the due date is displayed while the tender is being issued and bids are being received, with a red overdue reminder after the deadline passes according to the system clock.
6. **Committee evaluation:** Admin HQ uploads confirmation of offline Bid Opening Board formation and supporting documents after TEC/TAC formation. SS approves or queries the TEC offline; Admin HQ records the decision and uploads SS's signed approval PDF before recording TEC's offline technical and financial reports. Admin HQ also records TAC's offline recommendation.
7. **Funding:** CFA approves fund release through IFD offline and has no login. Admin HQ records the release, uploads CFA's signed approval PDF, then after IFD approval uploads the final acceptance PDF to complete the project.
8. **Sequential workflow:** every transition must target the declared next stage. Arbitrary target stages and skipped handoffs are rejected. At an approval gate, the authorized role can reject with a note and PDF; this moves the project to **Project terminated** and prevents any further project actions.
9. **Private conversations:** a query is visible to its sender and designated responder for that stage. During HQ's DGS and CS/SR approval handoffs, Admin (IA) is a designated responder to HQ's queries and can reply in the Trail. Other users cannot read or reply to the query.
10. **Activity transparency:** project activity events are visible to all authenticated users, including actor and timestamp.
11. **Validation:** malformed requests, incomplete committee composition, invalid amounts and unauthorized actions return explicit errors.
12. **Persistence:** projects, committees, reports, tender documents, queries, replies, events and workflow records are stored in SQLite. Vendor bid content remains offline.

### 4. Workflow stages

`Admin (IA) creates project and uploads Department letter → Admin forms TSC and uploads supporting document → AS (IA) approves TSC formation → Admin uploads signed AS approval → TSC report provided offline and uploaded by Admin → AS (IA) first report approval → Admin uploads signed AS approval → Admin routes report to HQ → HQ sends to DGS offline → DGS approves offline and returns the signed document/report to HQ → HQ uploads DGS's signed document → HQ sends report to CS/SR offline → CS/SR approves offline and returns the signed document/report to HQ → HQ uploads CS/SR's signed document → Admin HQ drafts tender and sends it only to Admin (IA) → Admin (IA) may review and suggest changes → Admin HQ publishes final tender PDF and deadline, issues tender and records offline bid receipt → Bid Opening Board formed offline; Admin HQ uploads formation document → board opens technical bids offline → Admin HQ forms TEC and uploads supporting document → HQ records SS's offline approval and uploads signed SS approval → HQ records TEC's offline technical report → HQ records TEC's financial bid opening/evaluation → Admin HQ forms TAC and uploads supporting document → HQ records TAC's offline recommendation → CFA approves through IFD offline → HQ records release and uploads signed CFA approval → after IFD approval, Admin HQ uploads final acceptance PDF → Completed`

Only Admin (IA), AS (IA) and Admin HQ have application logins. Department, TSC, DGS, CS/SR, the Bid Opening Board, SS, TEC, TAC, CFA and vendors do not sign in. Only Admin (IA) can create projects, using an offline Department letter and required PDF upload. Projects begin at TSC formation; there is no Department login, demand-submission stage or separate Admin acceptance. Admin (IA) uploads a supporting document after TSC formation; AS approval makes the TSC final. Admin (IA) routes the TSC report to Admin HQ after AS (IA)'s first report approval. HQ sends it to DGS offline; after the report returns, HQ uploads DGS's signed document and sends it to CS/SR offline. After the report returns from CS/SR, HQ uploads its signed document; both approvals and signings are offline. Tender processing begins after HQ's CS/SR document upload. Admin HQ sends the draft tender only to Admin (IA), who may review it and send suggestions. Admin HQ handles later online tasks, including final tender publication, document uploads after TEC/TAC formation, and recording offline committee and CFA decisions. IFD approval is offline; Admin HQ uploads the final acceptance document afterward. AS queries remain pending for Admin's reply. Vendor queries, replies and bid submissions are also offline and are not implemented.

### 5. Non-functional requirements

- **Deployment:** Node.js 20+, Express 5, React 19, Vite and SQLite.
- **Network:** listen on the host LAN interface; no cloud service is required at runtime.
- **Security:** HTTP-only session cookie, server-side role checks, Zod request validation and no client-only authorization.
- **Usability:** responsive layout for desktop and tablet screens, keyboard-friendly forms and reduced-motion support.
- **Traceability:** each state-changing action writes an event with actor, timestamp and description.
- **Reliability:** workflow mutations use database transactions where multiple records must change together.

## Detailed end-to-end example

Start the application and sign in as Admin (IA) (`admin / admin123`) to select **New project**. Enter the project details from the Department's offline letter and upload the required letter PDF. The only other application logins are AS (IA) (`AS / AS123`) and Admin HQ (`hq / hq123`). TSC and other committees/authorities have no login; Admin or HQ uploads their supporting documents, decisions and reports.

```bash
npm install
npm run check
npm start
```

`npm start` rebuilds `dist/` before launching so it serves the latest source changes.

The application is at `http://localhost:3000`; other LAN devices can use `http://<host-ip>:3000`. Follow the steps in order, signing in only as one of the three roles with an application login:

1. **Admin (IA)** (`admin / admin123`) receives the Department's letter offline, creates a project and uploads the letter PDF.
2. **Admin (IA)** forms a TSC with three members and one chairperson, then uploads its formation supporting document.
3. **AS (IA)** (`AS / AS123`) approves the proposed TSC. AS may query Admin without changing membership or request member changes, which returns the proposal to Admin (IA) for revision and resubmission with a new supporting document. After approval, the TSC is treated as final and its membership is locked.
4. **Admin (IA)** uploads AS's signed TSC-formation approval PDF, then **TSC** provides its specifications report offline and Admin uploads the report PDF.
5. **Admin** forwards the report to **AS (IA)** (`AS / AS123`), the first report approver. AS approves, returns or queries it; on approval Admin uploads AS's signed approval PDF.
6. **Admin** sends the report to **Admin HQ** (`hq / hq123`), which forwards it to **DGS** for offline second approval. DGS has no application login. After DGS approves offline, the report and signed document return to HQ; Admin HQ uploads the signed DGS approval PDF.
7. **Admin HQ** sends the report to **CS/SR** for third approval offline. CS/SR has no application login. After approval, the report and signed document return to HQ; Admin HQ uploads the signed CS/SR approval PDF, after which tender processing starts.
8. **Admin HQ** (`hq / hq123`) prepares and uploads the draft tender PDF and sends it only to Admin (IA).
9. **Admin (IA)** reviews the draft and may send suggestions to Admin HQ. **Admin HQ** uploads and publishes the final tender PDF with a deadline.
10. **Admin HQ** issues the tender and records that technical and financial bids have been received by the deadline. Vendor participation and submissions are offline.
11. The Bid Opening Board is formed offline. **Admin HQ** uploads the formation document; the board opens technical bids offline.
12. **Admin HQ** forms the three-member TEC and uploads its supporting document. **SS** approves or queries it offline; Admin HQ records the decision and, after approval, uploads SS's signed approval PDF.
13. TEC evaluates technical bids offline and provides its qualified-vendor report. **Admin HQ** records the report.
14. TEC opens and evaluates financial bids for technically qualified vendors offline. **Admin HQ** records the top-three shortlist; no separate X committee is formed.
15. **Admin HQ** forms a three-member TAC that includes at least one member from the Inspection & Audit department and uploads its supporting document.
16. TAC selects the final vendor offline and provides its recommendation with price and technical specifications. **Admin HQ** records the recommendation.
17. CFA approves fund release through IFD offline. **Admin HQ** records the release and uploads CFA's signed approval PDF.
18. After IFD approval, **Admin HQ** uploads the final acceptance PDF; the project moves to **Completed**.

At every stage, the project workspace identifies the next role and shows a demo sign-in hint only for roles with application logins. Queries and replies appear in the Trail; they are not workflow stages. The activity history records the actor, action and timestamp.
