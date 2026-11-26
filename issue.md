# Code review issues

Full-repo review (current source, not a git diff) via five parallel agents covering editor/store, schema/data/app, AI/agent, auth/pages/components, and server/shared/api.

**Totals:** 2 critical · 16 high · 22 medium · 10 low (after de-duplication)

**Areas that look solid:** schema migrations (`migrateDiagramDoc`, `isContainerKind`, `createEmptyDiagram`); Firestore path authz / MCP uid scoping; key storage (localStorage, hash-fingerprinted model cache); ProtectedRoute/GuestRoute auth gates; decisionLayout / paletteDrop / measure; destructive `delete_diagram` UI confirm path (app only).

---

## Critical

### 1. Copy/duplicate of a group drops its children

- **Severity:** critical
- **Location:** `src/store/editorStore.ts:1042-1064` (`copySelection`; also `duplicateSelection` / alt-drag via `src/editor/Canvas.tsx:484-508`)
- **What happens:** `copySelection` only clones nodes in `selectedNodeIds`. Selecting a group (canvas or Layers) selects only the group id; descendants are not included.
- **Why it matters:** Paste, Duplicate, and Alt-drag-duplicate produce an empty group shell; child nodes and their edges are lost.
- **Trigger:** Select a group that has children → Copy / Duplicate / Alt-drag.

### 2. Legacy diagram copy early-return drops messages and versions

- **Severity:** critical
- **Location:** `src/data/diagrams.ts:430-469` (with `src/data/migration.ts:83-86`)
- **What happens:** `copyLegacyDiagramToProject` writes the diagram doc first, then copies `messages`/`versions`. If it aborts after `setDoc`, a retry hits `if (targetSnap.exists()) return true` and skips subcollection copy. Migration then deletes the legacy diagram (and its subcollections).
- **Why it matters:** Permanent loss of diagram chat history and version snapshots.
- **Trigger:** Crash/tab close/network failure mid-copy, or concurrent sign-in migrations racing on the same legacy diagram.

---

## High

### 3. Deleting a container orphans children at relative coordinates

- **Severity:** high
- **Location:** `src/store/editorStore.ts:383-392` (`removeNodes`)
- **What happens:** Children of a removed parent get `parentId: undefined` but keep parent-relative `position`. `ungroupSelection` converts correctly; `removeNodes` does not.
- **Why it matters:** Delete group/section → children jump to wrong absolute positions (layout corruption).
- **Trigger:** Delete a container that still has children.

### 4. Collapse only hides/remaps immediate children

- **Severity:** high
- **Location:** `src/editor/Canvas.tsx:202-222`, `src/editor/collapsedEdges.ts:16-30`
- **What happens:** `parentCollapsed` and `resolveEndpoint` only check the direct `parentId` against `collapsedParentIds`. Nested groups are supported elsewhere.
- **Why it matters:** Collapse outer group → grandchildren stay visible (or float); edges to them are not remapped to the outer boundary.
- **Trigger:** Nest a node in an inner group, collapse the outer group.

### 5. Paste offsets relative child positions inside groups

- **Severity:** high
- **Location:** `src/store/editorStore.ts:171-193` (`remapClipboard`)
- **What happens:** Offset is applied to every clipboard node. When a group and its children are both present, children keep parent-relative coords and also shift by paste offset. Bounding-box paste-at mixes absolute/relative coords.
- **Why it matters:** Pasted/duplicated group contents drift; paste-at targeting is wrong.
- **Trigger:** Marquee/selectAll a group+children → paste/duplicate.

### 6. Nested parent coordinates use one-level `parent.position`

- **Severity:** high
- **Location:** `src/editor/Canvas.tsx:99-107` (`worldPosition`), `72-96` (`findGroupAtPoint`); `src/store/editorStore.ts:478-485` (`setNodeParent`); `src/editor/Canvas.tsx:291-297` (drag snap); `src/editor/arrange.ts:26-34` (`toStoredPosition`)
- **What happens:** These paths add/subtract only the immediate parent’s stored position. Correct recursive helper is `absolutePosition` in `flowTypes.ts`; some paths (`reorderLayer`, `groupSelection`) already use it.
- **Why it matters:** Drop-into-group hit testing, reparenting, drag snap, and align/distribute for nested containers produce wrong positions/parents.
- **Trigger:** Nest a group, then drag/reparent/align a child.

### 7. Connected/insert nodes ignore nesting

- **Severity:** high
- **Location:** `src/store/editorStore.ts:573-616` (`addConnectedNode`), `619-657` (`insertNodeOnEdge`)
- **What happens:** New nodes are placed from stored positions and never inherit `parentId`.
- **Why it matters:** Actions from a nested node place the new node at relative coords in world space, outside the group.
- **Trigger:** Add connected node or insert-on-edge from a node inside a group.

### 8. Diagram saves lose updates (non-atomic / missing revision checks)

- **Severity:** high
- **Locations:**
  - `src/data/diagrams.ts:364-400` (`saveDiagram` get-then-update, no transaction)
  - `src/agent/browserDataPort.ts:119-121` (same client path)
  - `server/adminDataPort.ts:200-226` (`persist`), `384-394` (`renameDiagram`) — MCP never compares revision
- **What happens:** Client optimistic lock is check-then-write without a transaction; Firestore rules do not enforce revision. MCP admin persist writes `record.revision + 1` from a stale snapshot with no conflict check.
- **Why it matters:** Concurrent Editor tabs, Editor+agent, or Editor+MCP → last writer wins; silent diagram content loss.
- **Trigger:** Two writers on the same diagram (tabs, autosave overlapping agent/MCP, or MCP while editor open).

### 9. `renameDiagram` races and clobbers concurrent body saves

- **Severity:** high
- **Location:** `src/data/diagrams.ts:242-263`
- **What happens:** Rename does its own get → bump `revision` → write title from migrated snapshot without coordinating with in-flight `saveDiagram`.
- **Why it matters:** Lost node/edge edits, or spurious “updated elsewhere”; title/body diverge from intent.
- **Trigger:** Rename on project page while editor/agent is saving.

### 10. `diagramCount` read-modify-write races (client + MCP)

- **Severity:** high
- **Locations:** `src/data/diagrams.ts:49-59`, `src/data/projects.ts:206-218`; `server/adminDataPort.ts:135-149` (+ callers)
- **What happens:** Count is get → add delta → write with no transaction / `FieldValue.increment`. Client adjust also no-ops if the project doc is missing.
- **Why it matters:** Wrong project diagram counts; create with a bad `projectId` can orphan diagrams without error.
- **Trigger:** Parallel creates/deletes (UI + agent/MCP).

### 11. Stale project/diagram cache across logout / user switch

- **Severity:** high
- **Location:** `src/app/AppDataProvider.tsx:16-56`
- **What happens:** On `uid` change, only `loadedRef` is reset. `projects` / `diagramsByProject` are not cleared; in-flight lists are not uid-guarded. Logout leaves prior data mounted.
- **Why it matters:** Brief or stuck display of another account’s project/diagram metadata.
- **Trigger:** Sign out, or switch accounts before refresh finishes.

### 12. Assistant proposals computed on a stale diagram

- **Severity:** high
- **Location:** `src/ai/AssistantPanel.tsx:112-178`, `190-245`, `248-264`
- **What happens:** `sendPrompt` closes over the diagram snapshot from request start. Apply calls `replaceDiagramContent(next)` rooted in that old snapshot.
- **Why it matters:** Concurrent canvas edits during the model wait are overwritten and autosaved.
- **Trigger:** Edit the open diagram while an Assistant reply with `ops`/`replace` is in flight, then Apply.

### 13. Agent writes leave open Editor on a stale revision

- **Severity:** high
- **Location:** `src/agent/browserDataPort.ts:119-128`, `174-191`; consumers refresh lists only via `onDataChanged`
- **What happens:** Port persists to Firestore; `onDataChanged` refreshes project/diagram lists only — open Editor never reloads. Local revision lags Firestore.
- **Why it matters:** Canvas shows old content; further local edits hit “updated elsewhere” or collide with agent data.
- **Trigger:** Open a diagram in the Editor, use Agent/create flow to mutate that same diagram, keep editing.

### 14. Full diagram overwrite without user confirmation (agent tools)

- **Severity:** high
- **Location:** `src/ai/providers/agentLoop.ts:71-92`; `shared/tools/definitions.ts` (only `delete_diagram` is `destructive`); `src/agent/prompts.ts:11-20` (`CREATE_FLOW_TOOLS`)
- **What happens:** `runOne` only prompts for tools marked `destructive`. `update_diagram` / `apply_diagram_edits` execute immediately.
- **Why it matters:** Prompt-injected or confused model can replace any accessible diagram with no confirm — silent data loss.
- **Trigger:** Agent/create chat that calls those tools (including via injected instructions).

### 15. Autosave `markSaved` drops concurrent edits

- **Severity:** high
- **Location:** `src/pages/Editor.tsx:251-271` (+ `src/store/editorStore.ts:1184-1188`)
- **What happens:** `persist()` snapshots then always `markSaved()` on success. Edits during the in-flight save set dirty via `withHistory`, but `markSaved` forces `'saved'`.
- **Why it matters:** UI shows “Saved” while newer in-memory changes are never written; next autosave only runs on a later dirty transition.
- **Trigger:** Edit → autosave starts → edit again before save finishes → leave the diagram.

### 16. In-flight save corrupts the next diagram after route change

- **Severity:** high
- **Location:** `src/pages/Editor.tsx:251-271`, `216-249`
- **What happens:** `EditorInner` is not keyed by `diagramId`. Navigating away resets/loads the next diagram while an older `persist()` can still complete and `markSaved(nextRevision)` on the shared store.
- **Why it matters:** Wrong revision / “Saved” on the newly opened diagram; later saves conflict or look clean when they aren’t.
- **Trigger:** Dirty diagram A → autosave starts → quickly open diagram B.

### 17. Sticky `loadError` blocks a valid diagram after a failed open

- **Severity:** high
- **Location:** `src/pages/Editor.tsx:216-249`, `684-698`
- **What happens:** Failed loads set `loadError`, but success never clears it. Render gates on `if (loadError || !diagram)`. Editor does not remount on param change.
- **Why it matters:** After “Diagram not found”, opening another valid diagram still shows the error empty state.
- **Trigger:** Open a bad editor URL, then navigate to a real diagram in the same session.

### 18. MCP deletes only need model `confirm: true` (no human gate)

- **Severity:** high
- **Location:** `server/mcp/tools.ts:26-28`, `shared/tools/definitions.ts:123-127`
- **What happens:** MCP always passes `allowDestructive: true`. App UI confirms deletes; MCP does not. Tool copy implies app-side confirm that does not exist on MCP.
- **Why it matters:** A token-holding agent can permanently delete diagrams without a human confirm (including mistaken/hallucinated calls).
- **Trigger:** Authenticated MCP `delete_diagram` with `confirm: true`.

---

## Medium

### 19. Undo/redo restores viewport

- **Severity:** medium
- **Location:** `src/store/editorStore.ts:229-251` (+ undo/redo)
- **What happens:** History snapshots include `viewport`. `setViewport` is not historied, but undo/redo reapplies the old viewport.
- **Why it matters:** After pan/zoom, undoing an unrelated edit jumps the camera.
- **Trigger:** Edit → pan → undo.

### 20. Container z baseline blocks “bring to front” vs nodes

- **Severity:** medium
- **Location:** `src/editor/zOrder.ts:75-79`
- **What happens:** Containers always get `zIndex = -1000 + index`; non-containers get `0 + index`. Raise never crosses that gap.
- **Why it matters:** Bring to front on a group among sibling steps never paints the group above those steps.
- **Trigger:** Select a root-level group overlapping steps → Reorder → Front.

### 21. `removeNodes` leaves stale selected edge IDs

- **Severity:** medium
- **Location:** `src/store/editorStore.ts:394-397`
- **What happens:** Connected edges are deleted, but `selectedEdgeIds` is not filtered (unlike `removeEdges`).
- **Why it matters:** Selection can reference deleted edges until the next selection change.
- **Trigger:** Select an edge and one of its nodes → delete the node.

### 22. Concurrent `ensureDefaultProject` can reset `p_default`

- **Severity:** medium
- **Location:** `src/data/projects.ts:234-247`, `137-163`
- **What happens:** Fixed id `p_default` via full `setDoc` overwrite. Two clients that both see an empty list can overwrite a populated default project.
- **Why it matters:** `diagramCount` (and metadata) reset to 0 while diagrams still exist.
- **Trigger:** Two tabs/devices completing post–sign-in setup together.

### 23. `deleteProject` can orphan newly created diagrams

- **Severity:** medium
- **Location:** `src/data/projects.ts:224-231`
- **What happens:** Lists diagrams, deletes them, then deletes the project. A concurrent create after the list is not deleted; Firestore does not cascade.
- **Why it matters:** Orphan diagram docs under a deleted project path.
- **Trigger:** Create-in-project overlapping project delete.

### 24. Rename persists migrated `doc` but not top-level `schemaVersion`

- **Severity:** medium
- **Location:** `src/data/diagrams.ts:242-263`
- **What happens:** Rename writes migrated `doc` and bumps `revision` but does not update top-level `schemaVersion`.
- **Why it matters:** List-item `schemaVersion` can disagree with `doc.schemaVersion` until a later `saveDiagram`.
- **Trigger:** Rename a diagram that still has an old top-level `schemaVersion`.

### 25. Missing `doc` crashes diagram load

- **Severity:** medium
- **Location:** `src/data/diagrams.ts:139-141`
- **What happens:** `toRecord` always runs `migrateDiagramDoc(data.doc)`. Rules do not require `doc`.
- **Why it matters:** `getDiagram` / open-editor throws; diagram becomes unloadable.
- **Trigger:** Partial/corrupt write that omits `doc`.

### 26. `messageCount` undercounts under concurrency

- **Severity:** medium
- **Location:** `src/data/agentChats.ts:178-201`
- **What happens:** Count is `current.messageCount + 1` from a caller-supplied or freshly read snapshot, not an atomic increment.
- **Why it matters:** Stale/low `messageCount` on the chat doc (messages themselves are stored).
- **Trigger:** Overlapping `addAgentChatMessage` calls.

### 27. Settings patch lost updates

- **Severity:** medium
- **Location:** `src/data/settings.ts:57-75`
- **What happens:** Read full settings → merge patch → write whole object, no transaction.
- **Why it matters:** Concurrent theme vs provider/model updates can drop one side.
- **Trigger:** Two settings writes overlapping.

### 28. Create/delete count updates not tied to the diagram write

- **Severity:** medium
- **Location:** `src/data/diagrams.ts:210-228`, `265-291`, `353-360`
- **What happens:** Diagram `setDoc`/`deleteDoc` and count adjust are separate operations.
- **Why it matters:** Mid-operation failure leaves count wrong or orphan diagrams; drift until `syncProjectDiagramCount` (legacy migration only).
- **Trigger:** Failure or offline blip between diagram write and count adjust.

### 29. Failed `create_diagram` body persist leaves an empty diagram

- **Severity:** medium
- **Locations:** `src/agent/browserDataPort.ts:158-171`; `server/adminDataPort.ts:309-361` (double-write then persist)
- **What happens:** Empty shell is created first; body persist/layout/save can fail afterward. MCP path sets revision 0 then `persist` rewrites.
- **Why it matters:** Tool returns error but empty (or half-written) diagrams remain; retries create more; count can inflate.
- **Trigger:** `create_diagram` with a body that fails after the empty record exists.

### 30. `supportsTools` over-claims tool support

- **Severity:** medium
- **Location:** `src/agent/AgentPanel.tsx:346-354`; `src/agent/agentCreate.ts:30-36`; `src/ai/providers/openaiCompatible.ts:166-174`
- **What happens:** Panels use `modelStatus?.supportsTools ?? true`. OpenRouter `ping` always returns `supportsTools: true`.
- **Why it matters:** Models without tools get native schemas; JSON-tool fallback is skipped; calls fail hard.
- **Trigger:** Chat/create with a model missing from cache, or an OpenRouter model without tools.

### 31. JSON fallback tool-call IDs collide across steps

- **Severity:** medium
- **Location:** `src/ai/providers/jsonFallback.ts:28-36`; `src/ai/providers/agentLoop.ts:139-177`
- **What happens:** IDs are `json-fallback-${toolName}` with no step/seq.
- **Why it matters:** Multi-step loops reuse the same id for Anthropic/OpenAI tool result association.
- **Trigger:** Provider with `supportsTools: false` calling the same tool on more than one loop step.

### 32. Failed refresh after key change can rebind stale models to the new fingerprint

- **Severity:** medium
- **Location:** `src/ai/providers/probe.ts:45-68`; `src/ai/components/AiProvidersSection.tsx:97-109`
- **What happens:** On refresh list failure, previous cache is saved under the new `keyFingerprint` and the ptr updates.
- **Why it matters:** Old models look valid for the new key; key-change detection clears.
- **Trigger:** In-place key change + refresh whose `listModels` fails.

### 33. Key update keeps stale `keyFingerprint`

- **Severity:** medium
- **Location:** `src/ai/providers/connections.ts:202-218` (`setLegacyApiKey` → `upsertConnection`)
- **What happens:** Spreading `existing` into upsert keeps the old fingerprint while `apiKey` changes.
- **Why it matters:** Cache still hits the old fingerprinted entry; key-change detection does not fire.
- **Trigger:** Updating a Gemini key via `setApiKey` / `setLegacyApiKey` on a connection that already has a fingerprint.

### 34. Unsaved editor work can be discarded on tab close

- **Severity:** medium
- **Location:** `src/pages/Editor.tsx:274-280` (no `beforeunload` anywhere)
- **What happens:** Dirty state is UI-only; no navigation/tab-close guard.
- **Why it matters:** Recent edits disappear with no prompt (worse with false “Saved” from #15).
- **Trigger:** Edit, close/refresh before autosave completes.

### 35. Post-login deep-link restore unreliable / lost on Google redirect

- **Severity:** medium
- **Location:** `src/components/GuestRoute.tsx:19-20`; `src/pages/Login.tsx:13-17,35,49`; `src/auth/AuthProvider.tsx:117-127`
- **What happens:** `GuestRoute` always navigates to `/` when `user` is set. `signInWithRedirect` full-page reloads wipe `location.state`.
- **Why it matters:** Users kicked from a deep link often land on home instead of the original URL.
- **Trigger:** Hit a protected URL while signed out, then Google redirect (or race with GuestRoute).

### 36. Post-sign-in setup failures are swallowed

- **Severity:** medium
- **Location:** `src/auth/AuthProvider.tsx:46-58`
- **What happens:** `ensureUserAndDefaultProject` / `migrateLegacyDiagramsIfNeeded` errors are only `console.error`’d; user stays signed in with no UI.
- **Why it matters:** First session can show empty dashboard / missing default project with no recovery.
- **Trigger:** Firestore/rules/network failure during post-sign-in setup.

### 37. Missing legacy diagram IDs still redirect into the editor

- **Severity:** medium
- **Location:** `src/pages/DiagramRedirect.tsx:28-32`
- **What happens:** Unknown id still picks the default project and navigates to the editor path.
- **Why it matters:** Broken links open “Diagram not found” instead of a safe fallback.
- **Trigger:** Visit `/diagrams/:unknownId` while authenticated.

### 38. Diagram switches don’t reset loading → false “not found” flash

- **Severity:** medium
- **Location:** `src/pages/Editor.tsx:153-154,216-249,680-698`
- **What happens:** `loading` starts `true` only on mount; param changes never `setLoading(true)`. Cleanup clears diagram while `loading` stays false.
- **Why it matters:** Brief incorrect “Diagram not found” when switching diagrams (worse with sticky `loadError`).
- **Trigger:** Navigate between two valid editor URLs without leaving the editor layout.

### 39. Concurrent MCP `delete_diagram` can under-count

- **Severity:** medium
- **Location:** `server/adminDataPort.ts:404-410`
- **What happens:** Two deletes can both pass `requireDiagram` and both decrement after the doc is gone (second delete is a no-op).
- **Why it matters:** `diagramCount` decremented twice for one diagram.
- **Trigger:** Duplicate/overlapping delete tool calls for the same id.

### 40. Delete wipes history before the diagram doc

- **Severity:** medium
- **Location:** `server/adminDataPort.ts:404-409`
- **What happens:** `messages` and `versions` are deleted, then the diagram doc, with no single transaction.
- **Why it matters:** Failure mid-delete leaves a diagram with no version/message history.
- **Trigger:** Mid-delete failure (timeout, quota, process kill).

### 41. In-memory `applyDiagramEdits` does not apply ops

- **Severity:** medium
- **Location:** `shared/tools/memoryPort.ts:100-105`
- **What happens:** Increments `revision` and fabricates `changeSummary` from `ops.length` but never mutates `diagram`.
- **Why it matters:** DataPort contract broken; unit tests assert only summary text and stay green while edits are no-ops.
- **Trigger:** Any test/caller using `createMemoryDataPort()` for `apply_diagram_edits`.

---

## Low

### 42. Null `updatedAt` sorts as newest in recent list

- **Severity:** low
- **Location:** `src/data/diagrams.ts:169-198`
- **What happens:** Sort uses `updatedAt?.getTime() ?? Infinity`.
- **Why it matters:** Diagrams missing timestamps float to the top of “recent.”
- **Trigger:** Docs written without `updatedAt`.

### 43. `updateProject` drops color/icon when name is set

- **Severity:** low
- **Location:** `src/data/projects.ts:192-204`
- **What happens:** If `patch.name` is set it renames and returns, ignoring `color`/`icon`. Currently unused by callers.
- **Why it matters:** Combined name+color updates would only rename if the API is adopted.
- **Trigger:** Caller passes `{ name, color }` / `{ name, icon }`.

### 44. User abort reported as timeout / network as CORS

- **Severity:** low
- **Location:** `src/ai/providers/http.ts:79-84`
- **What happens:** Any `AbortError` → `ProviderTimeoutError`; any `TypeError` → `ProviderCorsError`.
- **Why it matters:** Callers mis-label cancel and generic network failures.
- **Trigger:** AbortSignal abort during `providerFetch`, or offline `Failed to fetch`.

### 45. Empty model text after tools reported as success via last OK tool

- **Severity:** low
- **Location:** `src/ai/providers/agentLoop.ts:95-99`, `143-145`
- **What happens:** If the model returns no text after tool calls, `fallbackText` uses the last successful tool summary even when later tools failed.
- **Why it matters:** UI can show “Done…” after a mixed success/failure turn.
- **Trigger:** Multi-tool step where a later call errors and final assistant text is empty.

### 46. Return URL ignores search/hash and isn’t validated

- **Severity:** low
- **Location:** `src/components/ProtectedRoute.tsx:20`, `src/pages/Login.tsx:13-17`
- **What happens:** Only `pathname` is stored; Login trusts `state.from`.
- **Why it matters:** Query/hash deep links aren’t restored; odd same-origin `from` strings possible (external open-redirect risk limited because `state` isn’t URL-settable).
- **Trigger:** Protected URL with `?…`/`#…`, or crafted in-app navigation state.

### 47. MCP `rename_diagram` skips version snapshot

- **Severity:** low
- **Location:** `server/adminDataPort.ts:384-402`
- **What happens:** Rename updates in place with no version doc; update/apply go through `persist` (best-effort version).
- **Why it matters:** Title changes missing from MCP version history used for recovery.
- **Trigger:** MCP `rename_diagram`.

### 48. Unbounded MCP request body buffering

- **Severity:** low
- **Location:** `server/mcp/handler.ts:51-60`
- **What happens:** Authenticated requests buffer the full body with no size cap before `JSON.parse`.
- **Why it matters:** Memory pressure / function OOM on a huge POST.
- **Trigger:** Large authenticated MCP payload.

---

## Coverage notes

All five review slices completed:

| Slice | Scope | Status |
| --- | --- | --- |
| 1 | `src/editor/`, `src/store/` | Complete |
| 2 | `src/schema/`, `src/data/`, `src/app/` | Complete |
| 3 | `src/ai/`, `src/agent/` | Complete |
| 4 | `src/auth/`, `src/pages/`, `src/components/`, `src/App.tsx` | Complete |
| 5 | `server/`, `shared/`, `api/` | Complete |

Related findings across slices were merged (notably #8 revision races, #10 diagramCount races, #29 empty create leftovers).
