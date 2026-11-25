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
  data/                    Firestore repo: diagrams, versions, messages, settings
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
  pages/                   Login, Signup, Diagrams list, Editor, Settings
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

users/{uid}/diagrams/{diagramId}
  ownerId, title, schemaVersion, doc (the diagram JSON above, minus id),
  nodeCount, createdAt, updatedAt, revision

users/{uid}/diagrams/{diagramId}/versions/{versionId}
  doc, createdAt, reason ("manual" | "ai-apply" | "import")

users/{uid}/diagrams/{diagramId}/messages/{messageId}
  role ("user" | "assistant"), text, ops?, createdAt, applied (bool)
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
| M9 | **Projects.** After sign in the user lands on a Projects list (create, rename, delete with confirm dialog that says how many diagrams will go). Each project holds its own diagrams. Firestore: `users/{uid}/projects/{pid}` with `name, createdAt, updatedAt, diagramCount`, and diagrams at `users/{uid}/projects/{pid}/diagrams/{did}` with `versions` and `messages` under each diagram (AI chat stays per diagram). Routes: `/projects`, `/projects/:pid`, `/projects/:pid/diagrams/:did`. Update firestore.rules and rules tests for the new paths (owner only), keep the old `users/{uid}/diagrams` path readable and deletable by the owner for migration. Migration: on sign in, if old top-level diagrams exist, copy them (with versions and messages) into a "My first project" default project, then delete the old ones, once, idempotent. Every new user (email or Google) gets a user doc and a default project. Deleting a project deletes its diagrams and their subcollections client side in batches. | Projects CRUD works on emulators; migration test passes; rules tests pass |
| M10 | **Richer editing and Google sign in.** Copy, cut, paste (Cmd/Ctrl+C/X/V, keeps edges between copied nodes, offsets position), duplicate (Cmd/Ctrl+D), multi-select (shift click, drag box), align (left, centre, right, top, middle, bottom) and distribute (horizontal, vertical) from a toolbar that appears when 2+ nodes are selected, editable edge labels (double click edge), search on the canvas (Cmd/Ctrl+F or K: find nodes by label, description or kind, jump and highlight). "Continue with Google" button on sign in and sign up screens: `signInWithPopup` with `GoogleAuthProvider`, fall back to `signInWithRedirect` when the popup is blocked (`auth/popup-blocked`, `auth/cancelled-popup-request`, `auth/operation-not-supported-in-environment`), handle `getRedirectResult` on load. Styled per design system (secondary button, Google "G" mark drawn as a simple inline SVG, which is allowed for sign-in buttons). Keep email and password. First-time Google users get their user doc and default project. | All features work; tests pass |
