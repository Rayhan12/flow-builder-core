# Flow Builder: Project Plan

A web app to draw, save and share-ready flowcharts and decision flows. Diagrams are stored as JSON, can be drawn by hand in a decision-engine style editor, and can be created or updated by an AI assistant using each user's own API key.

UI inspiration: decision-engine editors such as Taktile (clean light canvas, typed nodes, colour groups, side panel). We only borrow general ideas. No Taktile branding, logo, assets or code.

## 1. Goals

- Sign in with email and password.
- Create, open, rename, duplicate and delete diagrams. Each diagram is one Firestore doc.
- Draw flows with typed nodes, icons, colours, groups, branches and auto-layout.
- Import and export diagrams as JSON.
- Ask an AI assistant (Gemini first) to create a new flow or change the current one, with a preview before applying and undo after.
- Remember the AI conversation per diagram.
- Host on Firebase Hosting. Run fully on the Firebase Emulator Suite for local work.

## 2. Tech stack

| Area | Choice |
|---|---|
| App | React 19, Vite, TypeScript (strict) |
| Canvas | React Flow (`@xyflow/react`) |
| Layout | elkjs (layered layout), run in a Web Worker for large flows |
| Icons | lucide-react with a searchable picker |
| Validation | zod (schema for diagrams and AI output) |
| State | Zustand store with an undo/redo history (patch based) |
| Routing | React Router |
| Backend | Firebase Auth (Email/Password), Firestore, Hosting |
| AI | Provider interface, Gemini provider first (REST, `generateContent` with JSON output) |
| Tests | Vitest + Testing Library, Firestore rules tests with `@firebase/rules-unit-testing` on the emulator, Playwright smoke test |
| Lint | oxlint (from the Vite template) |

## 3. Architecture

```
src/
  lib/firebase.ts          Firebase init, emulator switch
  schema/                  zod schema, types, migrations (v1 -> vN)
  store/                   editor store, history (undo/redo), selection
  data/                    Firestore repo: projects, diagrams, versions, messages, migration, settings
  editor/
    Canvas.tsx             React Flow canvas, minimap, controls, background
    nodes/                 one component per node kind
    edges/                 labelled edges for decision branches
    panels/                node side panel, group panel, diagram settings
    palette/               drag-to-add node palette
    IconPicker.tsx         searchable lucide picker
    layout.worker.ts       elk auto-layout
  ai/
    provider.ts            LLMProvider interface
    gemini.ts              Gemini provider
    prompts.ts             system prompt with the schema
    ops.ts                 edit operations and apply/diff logic
    AssistantPanel.tsx     chat UI, diff preview, apply, undo
  agent/                   AI agent panel, Gemini tool loop, browser DataPort (section 16)
  pages/                   Login, Signup, Diagrams list, Editor, Settings
shared/
  tools/                   pure agent tool layer shared with the MCP server (sections 15 and 16)
```

Data flow: Firestore doc -> zod parse + migrate -> editor store -> React Flow. Edits go into the store (with history) and are saved back with a debounced write (about 1 second) plus a manual Save.

## 4. Diagram JSON schema (v1)

Every diagram carries `schemaVersion`. Old docs are upgraded on load by small migration functions (`migrations[1] = v1 -> v2`, and so on), so the format can grow without breaking saved work.

```jsonc
{
  "schemaVersion": 1,
  "id": "d_abc123",
  "title": "BNPL approval flow",
  "description": "optional",
  "nodes": [
    {
      "id": "n1",
      "kind": "start",          // start | end | step | decision | mapping | integration | rule | note | group
      "label": "Customer applies",
      "description": "optional longer text",
      "icon": "user",           // lucide icon name
      "color": "blue",          // palette key or hex
      "position": { "x": 0, "y": 0 },
      "size": { "w": 220, "h": 80 },   // optional, mainly for groups
      "parentId": "g1",         // optional, node sits inside a group
      "data": { }               // kind specific, see below
    }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n2", "sourceHandle": "yes", "label": "Yes", "color": "green" }
  ],
  "groups": [ ],                // groups are also nodes with kind "group"; this list is reserved for future use
  "viewport": { "x": 0, "y": 0, "zoom": 1 },
  "theme": { "palette": "default" }
}
```

Kind specific `data`:

| Kind | data fields |
|---|---|
| start, end | none |
| step | `owner?`, `notes?` |
| decision | `branches: [{ id, label, condition?, color? }]` (each branch is a source handle) |
| mapping | `mappings: [{ from, to, transform? }]` |
| integration | `service`, `method?` (GET/POST...), `endpoint?`, `inputs?: string[]`, `outputs?: string[]` |
| rule | `rules: [{ condition, outcome, score? }]`, `threshold?` |
| note | `text` |
| group | `label`, `color`, `collapsed?` (a coloured segment that holds other nodes) |

Limits checked by zod: max 2,000 nodes, 4,000 edges, labels up to 200 characters, unique ids, every edge points at real nodes.

## 5. Firestore data model

```
users/{uid}
  email, displayName, createdAt, settings: { theme, aiProvider, aiModel }
  migration?: { legacyDiagramsDone?: bool }

users/{uid}/projects/{projectId}
  name, color, icon, createdAt, updatedAt, diagramCount

users/{uid}/projects/{projectId}/diagrams/{diagramId}
  ownerId, title, schemaVersion, doc (the diagram JSON above, minus id),
  nodeCount, createdAt, updatedAt, revision

users/{uid}/projects/{projectId}/diagrams/{diagramId}/versions/{versionId}
  doc, createdAt, reason ("manual" | "ai-apply" | "import" | "agent" | "mcp")

users/{uid}/projects/{projectId}/diagrams/{diagramId}/messages/{messageId}
  role ("user" | "assistant"), text, ops?, createdAt, applied (bool)

users/{uid}/agentChats/{chatId}
  title, messageCount, createdAt, updatedAt  (per-user AI agent panel, see section 16)

users/{uid}/agentChats/{chatId}/messages/{messageId}
  role ("user" | "assistant"), text, toolCalls?, createdAt

users/{uid}/diagrams/{diagramId}
  legacy path kept for migration (read/delete by owner)
```

Firestore docs have a 1 MiB limit. A 2,000 node diagram is well under that in practice. If a doc grows past about 700 KB we warn the user; a later milestone can split nodes into chunk docs (this is why `schemaVersion` exists).

## 6. Security rules

File: `firestore.rules`.

- Everything under `users/{uid}` can only be read or written by the signed-in user with that uid.
- Diagram writes must keep `ownerId == uid`, have an integer `schemaVersion` and a title up to 200 characters.
- Everything else is denied.
- Rules are tested on the emulator in `tests/rules.test.ts` (owner can read/write, other users and signed-out users cannot).

## 7. AI assistant

### Bring your own key

Decision: **the API key is stored only in the browser** (localStorage, per user id), not in Firestore. Reason: the app has no server, so a key in Firestore would still be sent to and used by the browser, and storing it remotely adds a leak risk with no benefit. The Settings page shows a clear note: "Your key stays in this browser. It is sent only to the AI provider you pick." A "Forget key" button removes it. Keys are never logged, never committed, and never placed in `.env` files.

Later option: a Cloud Function proxy with Secret Manager. That needs the paid Blaze plan, so it is out of scope for now.

### Provider interface

```ts
interface LLMProvider {
  id: 'gemini' | 'openrouter' | string
  listModels(): Promise<string[]>
  generate(req: { system: string; messages: ChatMessage[]; jsonSchema?: object }): Promise<string>
}
```

Gemini first (`gemini-2.5-flash` default, user can pick). OpenRouter and others plug in later with the same interface.

### What the AI returns

The assistant always answers in JSON, one of:

1. `{ "type": "replace", "diagram": { ...full diagram v1... }, "summary": "..." }` for a new flow or a big rewrite.
2. `{ "type": "ops", "ops": [ ... ], "summary": "..." }` for small changes. Ops: `addNode`, `updateNode`, `removeNode`, `addEdge`, `updateEdge`, `removeEdge`, `setGroup`, `setTitle`.
3. `{ "type": "message", "text": "..." }` when it only needs to answer or ask a question.

Every reply is parsed with zod. Invalid output is shown as an error with a "Try again" button, and is never applied.

### Apply flow

1. Show a diff preview: added (green), changed (amber), removed (red) nodes and edges, plus a text summary.
2. User clicks Apply or Discard.
3. Apply goes through the same undo history, and saves a version snapshot (`reason: "ai-apply"`).
4. New nodes without positions are placed by auto-layout.

Conversation history per diagram is stored in `messages`. The last N messages plus the current diagram JSON are sent with each prompt (trimmed to fit the model context).

## 8. Editor features

- Node palette (drag or click to add) for all kinds.
- Side panel to edit label, description, icon, colour, kind specific fields, and branches for decisions.
- Searchable icon picker (lucide, about 1,500 icons, virtualised list).
- Colour palette of about 10 named colours plus custom hex, for nodes, edges and groups.
- Groups (segments): coloured boxes that hold nodes, can be collapsed.
- Auto-layout (elk, top-to-bottom or left-to-right).
- Minimap, zoom controls, fit view, snap to grid.
- Undo/redo (Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z), copy/paste, multi-select, delete.
- Import JSON (validated), export JSON, export PNG/SVG (later).
- Light theme first, dark toggle.
- Scale: memoised node components, `onlyRenderVisibleElements`, layout in a worker, debounced saves. Target: 1,000 nodes stay smooth to pan and zoom.

## 9. Milestones

| # | Milestone | Done when |
|---|---|---|
| M0 | Scaffold: Vite + React + TS, Firebase config, rules, emulator config, this plan | `npm run build` and `npm run lint` pass (done) |
| M1 | Auth and app shell: login, signup, sign out, protected routes, light/dark toggle | Can sign up and sign in on the emulator; tests pass |
| M2 | Schema and data layer: zod schema v1, migrations, Firestore repo, diagrams list (create, rename, duplicate, delete), rules tests | Unit and rules tests pass; list works on the emulator |
| M3 | Editor core: React Flow canvas, all node kinds, edges with branch handles, side panel, palette, minimap, zoom, undo/redo, autosave | Can draw, save, reload and see the same flow |
| M4 | Icons, colours, groups, auto-layout, import/export JSON | Icon picker search works; layout runs; JSON round trips exactly |
| M5 | AI assistant: settings page for key, Gemini provider, generate new flow, edit ops, diff preview, apply/undo, per diagram chat history | With a real key, a prompt makes a valid flow; invalid AI output is rejected; tests use a mocked provider |
| M6 | Scale and polish: 1,000 node test diagram, performance pass, empty states, keyboard shortcuts, Playwright smoke test | Smoke test passes; large flow stays usable |
| M7 | Deploy: connect real Firebase project, deploy rules and hosting | Only after Rayhan says go |

Every milestone must end with `npm run build`, `npm run lint` and `npm test` passing, and one local git commit.

## 10. Acceptance criteria (whole project)

- A new user can sign up with email and password, create a diagram, draw a flow with at least one decision, one integration and one group, set icons and colours, reload and see it unchanged.
- Another user cannot read or write that diagram (proven by rules tests).
- Export JSON, then import it into a new diagram, gives the same flow.
- With a Gemini key, "Create a BNPL approval flow with credit check and merchant payout" produces a valid flow; "Add a fraud check before approval" updates it with a diff preview; Undo reverts it.
- No API keys in the repo or in Firestore.
- Works on the Firebase emulators with no real project, and on a real project after `.env.local` is filled in.

## 11. How to run locally

```bash
npm install
npm run emulators      # terminal 1: auth 9099, firestore 8080, UI 4000
npm run dev            # terminal 2: Vite dev server
```

With no Firebase values in `.env.local`, the app uses the emulators and the `demo-flow-builder` project id.

## 12. Out of scope for now

Real-time multi-user editing, sharing links, comments, Cloud Functions, paid Firebase features.

## 13. Update from Rayhan (Nov 25)

- Real Firebase project: `flow-builder-core`. Firestore and Email/Password auth are enabled. Open sign-up is fine. Per-user `firestore.rules` are deployed.
- Each user enters their own Gemini key in Settings. If a user opens or uses the AI chat without a key, the app must show a clear prompt (inline card or dialog) asking for the key, with a link to Settings and a field to paste it right there. Then the chat continues.
- Hosting will be deployed to https://flow-builder-core.web.app once the app works (M7 is approved).
- UI must follow docs/DESIGN_SYSTEM.md (tokens and component patterns, based on the Brex style from https://styles.refero.design/, reference only). Apply it to every screen, including ones built in earlier milestones.

## 14. New milestones from Rayhan (Nov 26)

These come after M6. M7 (deploy) is handled outside the coding runs. Do them in this order.

| # | Milestone | Done when |
|---|---|---|
| M8 | **Decision-flow editor polish (Taktile-like).** Follow docs/DESIGN_SYSTEM.md section 0 and 10. Taktile's decision-flow editor is the primary reference, Refero (Brex) the secondary one. Rework node cards, side panel, toolbar, palette, edges and the canvas grid. Canvas: crisp dot grid (with a line grid option), snap-to-grid always on by default (16px), alignment guides while dragging (centre and edge lines to nearby nodes), clean orthogonal edge routing (smoothstep with rounded corners, no overlaps through nodes where elk can help), tidy handles, "+" insert button on edge hover. Polished, a bit edgy, crisp 1px lines. No Taktile logo, name or code. | Looks clearly like a pro decision-flow editor; snapping and guides work; tests pass |
| M9 | **Projects.** After sign in the user lands on a Projects dashboard (`/`). Create, rename, recolour and delete projects (delete confirms diagram count). Each project holds its own diagrams with `color` and `icon` on the project doc. Firestore: `users/{uid}/projects/{pid}` with `name, color, icon, createdAt, updatedAt, diagramCount`, diagrams at `users/{uid}/projects/{pid}/diagrams/{did}` with `versions` and `messages` under each diagram (AI chat stays per diagram). Routes: `/` dashboard, `/p/:projectId` project diagram list, `/p/:projectId/d/:diagramId` editor. Legacy `/diagrams/:diagramId` editor route resolves the default project until redirects are removed. Keep old `users/{uid}/diagrams` readable and deletable by the owner for migration. Migration on sign in copies legacy diagrams (with versions and messages) into "My first project", then deletes legacy docs, idempotent via `migration.legacyDiagramsDone`. Every new user gets a user doc and default project. Deleting a project deletes diagrams and subcollections client side in batches (~400). | Projects CRUD works on emulators; migration test passes; rules tests pass |
| M10 | **Richer editing and Google sign in.** Copy, cut, paste (Cmd/Ctrl+C/X/V, keeps edges between copied nodes, offsets position), duplicate (Cmd/Ctrl+D), multi-select (shift click, drag box), align (left, centre, right, top, middle, bottom) and distribute (horizontal, vertical) from a toolbar that appears when 2+ nodes are selected, editable edge labels (double click edge), search on the canvas (Cmd/Ctrl+F or K: find nodes by label, description or kind, jump and highlight). "Continue with Google" button on sign in and sign up screens: `signInWithPopup` with `GoogleAuthProvider`, fall back to `signInWithRedirect` when the popup is blocked (`auth/popup-blocked`, `auth/cancelled-popup-request`, `auth/operation-not-supported-in-environment`), handle `getRedirectResult` on load. Styled per design system (secondary button, Google "G" mark drawn as a simple inline SVG, which is allowed for sign-in buttons). Keep email and password. First-time Google users get their user doc and default project. | All features work; tests pass |
| M11 | **MCP server for AI agents (Vercel function).** See section 15. | Token auth and scoping tests pass; `npm run build`, lint and tests pass; local MCP call against emulators works |

## 15. MCP server (M11)

Goal: let a user's own AI agent (Cursor, Claude Desktop, others) read and edit their projects and diagrams through MCP. No change to the Firebase billing plan (Spark): the server runs as a Vercel serverless function, not a Cloud Function.

**Layout and runtime**
- `api/mcp.ts` at the repo root (Vercel Node function), endpoint path `/api/mcp`. Root `vercel.json` keeps the Vite SPA build (`dist`) and the function. Shared logic in `server/` (for example `server/mcp/tools.ts`, `server/mcp/auth.ts`, `server/firebaseAdmin.ts`) so it can be unit tested without Vercel.
- Official `@modelcontextprotocol/sdk`, `StreamableHTTPServerTransport` in **stateless** mode (`sessionIdGenerator: undefined`), new server per request. Handle POST; return 405 for GET/DELETE as the SDK docs show for stateless servers.
- `firebase-admin` initialised from env `FIREBASE_SERVICE_ACCOUNT` (base64 of the service account JSON). When `FIRESTORE_EMULATOR_HOST` is set, use the emulator with project id `flow-builder-core` and no credentials. Never commit any key. Add `FIREBASE_SERVICE_ACCOUNT=` (empty) to `.env.example` with a comment.
- Reuse the same zod diagram schema and the same edit ops (`src/schema`, `src/ai/ops.ts`) on the server. Move shared pure code if needed so both sides import it without browser-only deps.

**Tokens**
- Settings page section "Connect your AI agent": create a named token, list tokens (name, created, last used, revoked), revoke. Show the raw token once in a copy box ("Copy it now, you will not see it again").
- Raw token: `fbmcp_` + 32 random bytes base64url, made with `crypto.getRandomValues` in the browser. Store only `sha256(token)` hex.
- Firestore: top-level `mcpTokens/{sha256hex}` with `{ uid, name, createdAt, lastUsedAt, revoked: false }`. Rules: create only if `request.resource.data.uid == request.auth.uid` and `revoked == false`; get, list, update (only `revoked` and `name`), delete only if `resource.data.uid == request.auth.uid`. Client lists with `where('uid','==',uid)`. Nobody can read another user's token docs. Add rules tests.
- Section also shows the MCP URL (`VITE_MCP_URL`, default `https://<vercel-domain>/api/mcp`) and copy-paste config snippets for Cursor (`~/.cursor/mcp.json` with `url` and `headers.Authorization`), Claude Desktop (via `npx mcp-remote <url> --header "Authorization: Bearer <token>"`) and a generic Streamable HTTP client.

**Server auth and scoping**
- Read `Authorization: Bearer <token>`, hash it, get `mcpTokens/{hash}` with firebase-admin, reject missing, unknown or revoked tokens with 401 (JSON-RPC error). Update `lastUsedAt` (best effort).
- Every Firestore path is built from that uid only: `users/{uid}/projects/...`. No tool takes a uid argument. Ids are validated (`^[A-Za-z0-9_-]{1,128}$`).

**Tools** (zod input schemas, clear descriptions, JSON text results)
- `list_projects`, `get_project {projectId}`, `create_project {name}`
- `list_diagrams {projectId}`, `get_diagram {projectId, diagramId}` (returns full diagram JSON)
- `create_diagram {projectId, title, diagram?}` (diagram validated with the schema)
- `update_diagram {projectId, diagramId, diagram}` full replace, validated, saves a version snapshot (`reason: "mcp"`)
- `apply_diagram_edits {projectId, diagramId, ops}` same ops as the AI chat, validated, version snapshot
- `rename_diagram {projectId, diagramId, title}`
- `delete_diagram {projectId, diagramId, confirm: true}` refuses unless `confirm === true`

**Tests** (Vitest, emulators via `firebase emulators:exec`)
- Unknown, missing and revoked tokens get 401.
- A valid token for user A cannot see or change user B's projects or diagrams (tool calls return not found).
- update_diagram rejects invalid JSON; apply_diagram_edits applies ops; delete without confirm is refused.
- An end-to-end test calls the handler with a real MCP client (`Client` + `StreamableHTTPClientTransport`) against a local HTTP server.

**Vercel readiness (part of M11)**
- Root `vercel.json`: `framework: "vite"`, `buildCommand: "npm run build"`, `outputDirectory: "dist"`, SPA rewrite of non-`/api` paths to `/index.html`, function config for `api/mcp.ts` (Node runtime, maxDuration 30). Do not install or run the Vercel CLI; the project is created and linked from GitHub by someone else.
- Write `docs/DEPLOY.md`: Firebase Hosting deploy steps for the web app (stays the main host), Vercel setup for the MCP function, and the exact env var names: `FIREBASE_SERVICE_ACCOUNT` (base64 service account JSON, server only), `FIREBASE_PROJECT_ID=flow-builder-core`, and the `VITE_FIREBASE_*` plus `VITE_USE_EMULATORS=false` values so the Vercel copy of the SPA also works. The web app reads `VITE_MCP_URL` to show the MCP URL in Settings. Include the console steps to make a service account key (Firebase console > Project settings > Service accounts > Generate new private key, then `base64 -i key.json | pbcopy`) and a warning to never commit it.
- CORS on `/api/mcp`: allow POST and OPTIONS with `Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version` headers.

**Update (Nov 26, 12:35 AM): Vercel facts for M11**
- Vercel project `flow-builder-core` is linked to GitHub main and auto-deploys. Production domain: https://flow-builder-core.vercel.app. MCP URL: https://flow-builder-core.vercel.app/api/mcp (`VITE_MCP_URL`).
- Server credential env var is **`FIREBASE_SERVICE_ACCOUNT_KEY`** (already set in Vercel). Accept either base64 or raw JSON (try JSON.parse first, else base64 decode then parse). Fall back to `FIREBASE_SERVICE_ACCOUNT` with the same handling. `FIREBASE_PROJECT_ID` is also set. Update docs/DEPLOY.md and .env.example to these names.
- Order changed: M9 (Projects) runs before M11, and M10 runs after M11.
- Make sure the Vercel build passes: `vercel.json` must not break the existing SPA deploy, the function must bundle its imports from `src/` or `server/` (avoid browser-only imports in shared code), and `firebase-admin` and `@modelcontextprotocol/sdk` must be in `dependencies`.

## 16. AI agent panel

Goal: an agent panel in the app that manages projects and diagrams through the same ten tools as the MCP server (section 15). The user talks to it in plain language; it calls tools, shows each call as a card, and links to what it made. It runs fully in the browser with the user's own Gemini key (section 7), so the Spark plan is enough.

### Layout

```
shared/tools/                 pure TypeScript, only depends on zod (no Firebase, React or browser APIs)
  types.ts                    DataPort, ToolResult, ToolDefinition, ToolError, ExecuteOptions
  mcpToolNames.ts             MCP_TOOL_NAMES, the exact list from section 15
  definitions.ts              zod input schema, description and flags per tool
  execute.ts                  executeTool(name, args, port, opts?)
  memoryPort.ts               in-memory DataPort for tests
  index.ts                    re-exports
src/agent/
  browserDataPort.ts          createBrowserDataPort(uid): DataPort on Firestore via src/data/*
  geminiTools.ts              generateWithTools: Gemini function calling loop
  prompts.ts                  system prompt, CREATE_FLOW_TOOLS
  AgentPanel.tsx              drawer or dialog UI, chat history, key card, confirm dialog
  ToolCallCard.tsx            one inline card per tool call
  AiCreateFlow.tsx            AgentPanel preset for "AI create" (dialog, create tools only)
  AgentPanelProvider.tsx      one shared panel for the app; useAgentPanel() opens it
  agentCreate.ts              agentCreateDiagram: headless create handler
  index.ts                    public exports
src/data/agentChats.ts        chat history repo
```

Vite and TypeScript read `shared/` directly with relative imports (`../../shared/tools`). `tsconfig.app.json` includes `shared`, and Vitest runs `shared/**/*.test.ts`. Imports inside `shared/` use explicit `.ts` extensions so Node and Vercel can load the same files.

### Tools (exact names, same as section 15)

`list_projects`, `get_project`, `create_project`, `list_diagrams`, `get_diagram`, `create_diagram`, `update_diagram`, `apply_diagram_edits`, `rename_diagram`, `delete_diagram`.

- Each has a zod input schema in `definitions.ts` (ids match `^[A-Za-z0-9_-]{1,128}$`, titles up to 200 characters, at most 500 ops per call).
- `executeTool` validates args first, then calls the port. It never throws: it returns `{ ok: true, data, summary, openPath?, mutated }` or `{ ok: false, code, error }`. Codes: `invalid_args`, `unknown_tool`, `not_found`, `confirm_required`, `not_allowed`, `declined`, `failed`.
- `openPath` is an app route for the Open link: `/p/{projectId}` for project results and `/p/{projectId}/d/{diagramId}` for diagram results.
- Free-form JSON args (`diagram`, `ops`) are kept loose in the shared schema. The port validates them with the real diagram schema and `EditOpSchema`, so schema rules live in one place per runtime. Gemini cannot take free-form objects, so it receives these two args as JSON encoded strings and `executeTool` decodes them.
- A test asserts that `MCP_TOOL_NAMES` equals the section 15 list exactly, that `TOOL_DEFINITIONS` has one entry per name, and that the Gemini function declarations use the same names.

### DataPort

```ts
interface DataPort {
  listProjects(): Promise<ProjectSummary[]>
  getProject(projectId): Promise<ProjectSummary | null>
  createProject({ name }): Promise<ProjectSummary>
  listDiagrams(projectId): Promise<DiagramSummary[]>
  getDiagram(projectId, diagramId): Promise<DiagramWithBody | null>
  createDiagram(projectId, title, diagram?): Promise<DiagramSummary>
  updateDiagram(projectId, diagramId, diagram): Promise<DiagramSummary>
  applyDiagramEdits(projectId, diagramId, ops): Promise<DiagramSummary & { changeSummary }>
  renameDiagram(projectId, diagramId, title): Promise<DiagramSummary>
  deleteDiagram(projectId, diagramId): Promise<void>   // only after both confirm gates
}
```

The port is already scoped to one user: no method takes a uid. Ports throw `ToolError(code, message)` for expected failures such as `not_found` and `invalid_args`.

- Browser adapter (`createBrowserDataPort(uid)`): wraps `src/data/projects.ts`, `diagrams.ts` and `versions.ts`. Full replaces go through `applyReplace` and edits through `applyOps` from `src/ai/ops.ts`, so agent writes obey the same validation as the editor assistant. Invalid input is rejected before anything is written (a bad `create_diagram` leaves no empty diagram behind). Each write saves a version snapshot with `reason: "agent"`. `VersionReason` is now `manual | ai-apply | import | agent | mcp`. Diagrams that arrive without node positions are laid out with elk (loaded on demand).
- MCP server (M11): implements the same interface with firebase-admin, scoped by the token's uid, saves snapshots with `reason: "mcp"`, and registers each tool from `TOOL_DEFINITIONS` (`def.input.shape` as the MCP input schema) with a handler that calls `executeTool(name, args, port, { allowDestructive: true })`. It may set `allowDestructive` because its schema already makes the client send `confirm: true`. No tool logic is duplicated.

### Destructive actions

`delete_diagram` has two gates, both required:

1. `args.confirm === true`, supplied by the model or MCP client. Without it `executeTool` returns `invalid_args` or `confirm_required`.
2. `opts.allowDestructive === true`, supplied by the caller after its own approval. Without it `executeTool` returns `not_allowed` and does not touch the port.

In the browser, `generateWithTools` does a side-effect-free dry run first. If the model set `confirm: true`, it calls `confirmDestructive`, which opens the panel's confirm dialog ("Delete diagram? The agent wants to delete the diagram "X". This cannot be undone."). Only Delete runs the tool with `allowDestructive: true`. Cancel (or Escape, or closing the panel) returns `declined` to the model, which is told nothing changed. If the model forgets `confirm`, the user is not prompted at all.

### Gemini function calling

`generateWithTools` in `src/agent/geminiTools.ts` uses the REST `generateContent` endpoint with `tools: [{ functionDeclarations }]` and `functionCallingConfig.mode = AUTO`.

- Declarations are built from the shared zod schemas with `z.toJSONSchema`, then mapped to the Gemini subset (`STRING`, `NUMBER`, `INTEGER`, `BOOLEAN`, `ARRAY`, `OBJECT`, `description`, `enum`, `properties`, `required`, `items`). Anything else (`pattern`, `additionalProperties`, `$schema`, length limits) is dropped, tools without args get no `parameters`, and free-form JSON args become strings.
- Loop: send chat plus declarations; if the reply has `functionCall` parts, echo the model turn unchanged (keeps thought signatures), run each call with `executeTool`, send the results as `functionResponse` parts, and repeat until the model returns text or `maxSteps` model calls (default 8) are used. Large results are replaced by a short note past about 48,000 characters.
- Returns `{ text, toolCalls: [{ id, name, args, status, result, openPath? }], steps }`. `onToolCall` fires when a call starts and ends, so the UI shows a running card.
- Tools can be restricted per call (`tools: [...]`). The "AI create" flow uses `CREATE_FLOW_TOOLS` (no delete, no new projects).
- The key comes from `keyStorage` (browser only) and the model from user settings. Errors from the API surface as an error bubble in the panel.

### Chat history

```
users/{uid}/agentChats/{chatId}                  { title, messageCount, createdAt, updatedAt }
users/{uid}/agentChats/{chatId}/messages/{mid}   { role: "user" | "assistant", text, toolCalls?, createdAt }
```

- A messages subcollection keeps each doc small and avoids the 1 MiB limit on one growing array. `firestore.rules` now also covers `agentChats/{chatId}/messages/{messageId}` (owner only); the rules test checks it. The new rule must be deployed with `firebase deploy --only firestore:rules` before history saves on the live project. Until then the panel keeps working and shows a notice that history was not saved.
- `toolCalls` are stored compactly: `{ id, name, argsPreview (first 400 chars), status, summary, error?, openPath?, mutated? }`. Full diagram JSON is never stored in chat docs.
- The chat is created on the first message and named from it. The general panel reopens the latest chat; the "AI create" flow and any open with an initial prompt start a new chat. A history button lists the last 20 chats, and a New chat button starts another.

### AgentPanel UI

- Two shapes from one component: `variant="drawer"` (380px, fixed to the right edge) and `variant="dialog"` (centred modal, 640px). It uses the design system tokens and the existing `.ai-*` bubble, key card and composer classes.
- Missing key: the same inline card as the editor assistant (paste field, "Get a key", link to Settings). A prompt passed in before the key exists is kept and sent once the key is saved.
- User bubbles, assistant bubbles, and tool call cards: tool name, status (Running, Done, Failed, Declined), one line summary or error, and an Open link when the result has an `openPath` (`Open project` or `Open diagram`). In the dialog variant Open also closes the dialog.
- Props: `open`, `onClose`, `initialPrompt?`, `initialProjectId?`, `mode?: 'agent' | 'create'`, `variant?`, `onDataChanged?`. `initialProjectId` is passed to the model as the default project. `onDataChanged` fires after a tool changed data, so lists can refresh.
- Exports (`src/agent/index.ts`): `AgentPanel`, `AiCreateFlow` (same `open`, `onClose`, `initialPrompt?`, `initialProjectId?`), `AgentPanelProvider` with `useAgentPanel()` (`openAgent`, `openAiCreate`, `closeAgent`), `createBrowserDataPort`, `generateWithTools`, and `agentCreateDiagram`.

### Entry points

- Sidebar "AI create" and the project page "AI create" button: `openAiCreate({ projectId })` from `AppDataProvider` now renders `AiCreateFlow` (the agent panel as a dialog, create tools only, `initialProjectId` set to the current project). After the agent changes data, the provider reloads the project list and any loaded diagram lists.
- Dashboard "Ask AI" box: keeps its form (prompt plus project picker) and now uses `agentCreateDiagram` as its `onGenerate` handler (set in `App.tsx`). It runs the same Gemini tool loop headless and opens the new diagram. To open the full chat from the dashboard instead, render `<AgentPanel open onClose initialPrompt={text} initialProjectId={id} variant="dialog" />`, or wrap the app in `AgentPanelProvider` and call `useAgentPanel().openAgent({ prompt, projectId })`.
- All of these reuse `AgentPanel`; nothing else implements an agent UI.
- The agent panel changes data in Firestore. It does not edit a diagram that is open in the editor store, so it is meant for the dashboard, project pages and sidebar; the in-editor assistant (section 7) stays the tool for the open diagram.

### Tests

- `shared/tools/mcpToolNames.test.ts`: names equal the section 15 list exactly; definitions match; only `delete_diagram` is destructive.
- `shared/tools/execute.test.ts`: validation, not found, JSON string args, both delete gates, error mapping, using the in-memory port.
- `src/agent/geminiTools.test.ts`: declarations match the MCP names and avoid unsupported schema keys; the loop, error feedback, step limit, tool allow list and the confirm guard, with a scripted `fetch`.
- `src/agent/AgentPanel.test.tsx`: key card, tool cards with Open links, history load and save, initial prompt, confirm dialog (Cancel and Delete), failures.
- `src/agent/browserDataPort.emulator.test.ts` and `src/data/agentChats.emulator.test.ts`: tools against the Auth and Firestore emulators (skipped without `FIRESTORE_EMULATOR_HOST`). `tests/rules.test.ts` covers `agentChats/.../messages`.
