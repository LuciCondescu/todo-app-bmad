---
workflowType: 'prd'
workflow: 'edit'
classification:
  domain: 'general'
  projectType: 'web_app'
  complexity: 'low'
inputDocuments:
  - '_bmad-output/planning-artifacts/product-brief.md'
stepsCompleted: ['step-e-01-discovery', 'step-e-02-review', 'step-e-03-edit', 'step-e-04-polish']
lastEdited: '2026-04-18'
version: '1.1'
editHistory:
  - date: '2026-04-18'
    version: '1.0'
    changes: 'Full restructure from legacy prose into BMAD format per validation report findings. Added frontmatter and nine Level-2 sections. Enumerated FRs (FR-001..FR-012) with acceptance criteria and source traces. Quantified NFRs (NFR-001..NFR-007) with measurement methods. Authored three User Journeys. Added UX/UI Requirements and Responsive Design & Browser Support sections required for web_app. Removed density violations and reframed architecture-tier vocabulary.'
  - date: '2026-04-18'
    version: '1.1'
    changes: 'Applied three optional-polish improvements from the v1.0 validation report. (1) Reframed FR-006..FR-012 into strict [Actor] can [capability] form while preserving acceptance criteria and measurement posture. (2) Added journey traces to FR-005 (data model) and FR-012 (API contract) in addition to their Product Scope anchors. (3) Authored Journey 4 (Performance Under Sustained Use) to anchor SC-003 and NFR-001/NFR-002 to an explicit user narrative; updated NFR-001 and NFR-002 Source columns accordingly. Linked product-brief.md as input document.'
---

# Product Requirements Document — Todo App

## Executive Summary

**Vision:** A minimal, reliable personal todo application for individuals managing their own tasks, delivered as a web app accessible from any modern browser.

**Differentiator:** Intentionally minimal scope. Zero onboarding. Immediate utility on first load. No accounts, collaboration, priorities, or deadlines — just create, complete, delete.

**Target User:** A single individual managing their own short-lived tasks, accessing the app from a personal desktop or mobile browser. No multi-user, team, or enterprise personas in MVP.

## Success Criteria

| ID | Criterion | Measurement Method |
|---|---|---|
| SC-001 | A first-time user completes one full create → complete → delete cycle without external guidance in ≤60 seconds from landing. | Moderated usability test, n=5, 100% completion rate. |
| SC-002 | Todos persist across page refresh, browser close, and server restart with zero data loss. | Automated integration test crosses each boundary and verifies todo count and content match pre-boundary state. |
| SC-003 | UI interaction latency p95 ≤100ms; API latency p95 ≤200ms under single-user load. | Chrome DevTools Performance panel (UI); APM or request logs (API); measured on evergreen browser + mid-tier 2022 laptop. |
| SC-004 | Interface renders correctly across the declared browser/device matrix with no horizontal scroll or clipped content at minimum viewport (320px). | Cross-browser smoke test across matrix (see Responsive Design & Browser Support); visual diff. |

## Product Scope

### MVP — In Scope

- Users can create, view, complete, and delete single-user todos.
- Persistent storage surviving page refresh, browser close, and server restart.
- Responsive layout across desktop and mobile per declared matrix.
- Empty, loading, and error states for all data-bound surfaces.
- Modal confirmation before destructive delete.

### MVP — Out of Scope

Deferred to Growth or Vision phases:

- User accounts, authentication, multi-user support.
- Collaboration (shared lists, assignees).
- Task prioritization, deadlines, due dates, reminders.
- Notifications (email, push, in-app).
- Task categories, tags, projects, filters.
- Bulk operations, drag-to-reorder.

### Future Phases

- **Growth:** Authentication and user accounts; data scoped per user; email/SSO sign-in.
- **Vision:** Collaboration, shared lists, deadlines, notifications, cross-device sync.

**Architectural constraint from MVP scope:** The data model and data-access contract must not block the Growth phase. Todo records carry a nullable `userId` field from day one; the absence of multi-user is a business-logic decision, not a schema decision.

## User Journeys

### Journey 1 — First-Time User Creates First Todo

**Trigger:** User loads the app URL for the first time.
**Exercises:** SC-001; FR-001, FR-002, FR-007, FR-008.

1. User opens the app.
2. App displays empty state: illustration, copy "No todos yet. Add one below.", and a visible text input.
3. User types a task description (≤500 chars) into the input.
4. User submits via Enter key or the adjacent "Add" button.
5. Todo appears at the end of the active list, ordered by creation ASC.
6. Input clears and re-focuses for next entry.

**Completion criteria:** Todo is visible, persisted, and the list has transitioned from empty to one item.

### Journey 2 — Returning User Manages Existing List

**Trigger:** User reopens the app after closing it or refreshing the page.
**Exercises:** SC-001, SC-002; FR-002, FR-003, FR-004, FR-005, FR-006, FR-011.

1. User opens the app.
2. App shows loading state (skeleton or spinner) while fetching todos.
3. List renders with active todos first (creation ASC) and completed todos last (creation ASC).
4. User clicks a checkbox to mark a todo complete. The todo immediately renders with strike-through + 60% opacity and moves to the completed section.
5. User clicks the delete icon on a todo. A modal confirmation appears ("Delete this todo? This cannot be undone.") with Cancel and Delete buttons.
6. User confirms delete. Todo disappears from the list.

**Completion criteria:** List state on next reload reflects all completions and deletions from this session.

### Journey 3 — Error Recovery

**Trigger:** Network failure or server error during any CRUD action.
**Exercises:** SC-002; FR-010, NFR-004.

1. User performs an action (create, complete, delete) with no network or while the server returns a 5xx response.
2. App displays an inline error at the point of failure ("Couldn't save. Check your connection.") with a Retry button.
3. User input is preserved (description text remains in the input on create failure).
4. User taps Retry. The action re-fires.
5. On success, the error clears and the action completes normally.

**Completion criteria:** No data loss. User can recover without refreshing the page.

### Journey 4 — Performance Under Sustained Use

**Trigger:** A returning user works with a populated list (≥50 todos) across a session of repeated create, complete, and delete actions.
**Exercises:** SC-003; NFR-001, NFR-002; FR-002, FR-003.

1. User opens the app. List of 50+ todos fetches and renders; perceived render completion tracks API p95 ≤200ms.
2. User rapidly toggles completion checkboxes on multiple todos in succession. Each checkbox state transition — strike-through, opacity change, section reordering — resolves within UI p95 ≤100ms.
3. User adds several new todos in quick succession. Each `POST` round-trip and subsequent list reconciliation stays within the p95 envelope.
4. User deletes a handful of todos (each gated by the confirmation modal). Modal open, confirm, and row removal each resolve within UI p95 ≤100ms.
5. Session continues without cumulative degradation — the 40th interaction feels identical to the 1st.

**Completion criteria:** No interaction in the session exceeds the p95 targets under single-user load. No perceptible lag on create, complete, or delete. Measured results match SC-003 and satisfy NFR-001 and NFR-002.

## Functional Requirements

| ID | Requirement | Acceptance Criteria | Source |
|---|---|---|---|
| FR-001 | Users can create a todo by entering a description (≤500 chars) and submitting via Enter or the "Add" button. | Input rejects empty/whitespace-only submissions; description is trimmed; new todo appended to active list; input clears and re-focuses. | Journey 1; SC-001 |
| FR-002 | Users can view the full todo list on load, with active items first (creation ASC) and completed items last (creation ASC). | List renders on successful list fetch; ordering verified by automated test. | Journeys 1, 2; SC-001 |
| FR-003 | Users can mark a todo complete by clicking its checkbox. | Todo immediately renders with strike-through + 60% opacity; completion persists across reload; todo relocates to the completed section. | Journey 2; SC-002 |
| FR-004 | Users can delete a todo via a row-level delete icon, gated by a modal confirmation. | Modal copy: "Delete this todo? This cannot be undone." Cancel dismisses the modal with no change. Delete removes the todo and persists. Hard delete — no soft-delete semantics in MVP. | Journey 2; SC-002 |
| FR-005 | Users' todos are stored under a stable record shape — `id` (string/uuid), `description` (string ≤500 chars), `completed` (boolean), `createdAt` (ISO 8601 timestamp), `userId` (nullable string, reserved for Growth) — with no additional fields in MVP. | Schema covered by automated contract tests. No additional fields in MVP. | Journey 2; Product Scope |
| FR-006 | Users see completed todos rendered with strike-through text, 60% opacity, and a checked checkbox icon, with text maintaining WCAG 2.1 AA contrast (≥4.5:1) against background at 60% opacity. | Contrast verified via automated a11y check (axe-core or equivalent). | Journey 2; SC-004; NFR-007 |
| FR-007 | Users see an empty state when the todo list is empty — illustration, copy "No todos yet. Add one below.", and a visible text input. | Component renders on first load when list is empty and after all todos are deleted. | Journey 1 |
| FR-008 | Users see a loading state during the initial todo fetch — skeleton placeholder or spinner visible within 16ms of mount. | Observed in DevTools. No flash of empty state while fetch is pending. | Journey 2 |
| FR-009 | Users can access the app across the declared browser/device matrix (see Responsive Design & Browser Support) with correct rendering at every supported viewport. | Visual smoke test on all target browsers at declared viewports. Zero horizontal scroll at 320px. | Journey 2; SC-004 |
| FR-010 | Users see an inline error at the point of failure for any failed CRUD action, with a Retry button and no loss of in-progress input. | Simulated network failure during create/complete/delete shows error UI. Retry re-fires the original request. Input preserved on create failure. | Journey 3; SC-002 |
| FR-011 | Users' todos persist across page refresh, browser close, and server restart. | Automated integration test: create todo → stop/start server → fetch → todo present with identical id and fields. | Journey 2; SC-002 |
| FR-012 | Users can perform CRUD on todos via `POST /todos`, `GET /todos`, `PATCH /todos/:id`, `DELETE /todos/:id` with JSON request/response bodies matching the FR-005 schema. | Contract test asserts endpoint shapes and status codes (201, 200, 200, 204). | Journeys 1, 2, 3; Product Scope |

## Non-Functional Requirements

| ID | Requirement | Measurement Method | Source |
|---|---|---|---|
| NFR-001 | UI interaction response time p95 ≤100ms under single-user load. | Chrome DevTools Performance panel on evergreen browser + mid-tier 2022 laptop; measured across create, complete, and delete actions. | SC-003; Journey 4 |
| NFR-002 | API response time p95 ≤200ms for all four endpoints (FR-012) under single-user load. | APM or request-log aggregation over ≥100 requests per endpoint. | SC-003; Journey 4 |
| NFR-003 | Data durability: zero todo loss across page refresh, browser close, and server restart. | Automated integration test (FR-011). | SC-002 |
| NFR-004 | On network or server error during any CRUD action, the app renders an inline error (FR-010) and preserves user input. | Fault-injection test (offline mode; simulated 5xx response); assert UI state and preserved input. | Journey 3 |
| NFR-005 | The data model carries a nullable `userId` field from MVP to enable the Growth-phase authentication addition without a schema migration. | Schema review; verified by FR-005 contract test. | Product Scope |
| NFR-006 | A new engineer can clone the repository, install dependencies, and run the app locally by following the README alone in ≤15 minutes. | Onboarding trial: new engineer performs the steps end-to-end; wall-clock time recorded. | Vision (maintainability) |
| NFR-007 | All text elements meet WCAG 2.1 AA contrast (≥4.5:1 for normal text, ≥3:1 for large text), including completed-todo text at 60% opacity. | Automated a11y check (axe-core or equivalent) in CI. | SC-004; FR-006 |

## UX/UI Requirements

### Component Inventory (MVP)

- **Header** — app title only; no navigation.
- **Add Todo Input** — text input (`maxlength=500`) + "Add" button; Enter submits.
- **Todo List** — two sections (Active, Completed); empty when zero todos.
- **Todo Row** — checkbox + description + delete icon; strike-through + 60% opacity when completed.
- **Delete Confirmation Modal** — title "Delete this todo?"; body "This cannot be undone."; Cancel + Delete buttons; Escape closes; clicking the backdrop closes.
- **Empty State** — illustration, copy, and focused input.
- **Loading State** — skeleton rows matching list layout, or centered spinner.
- **Error State (inline)** — error copy + Retry button at the site of the failed action.

### Interaction States

| Component | Required States |
|---|---|
| Add Todo Input | default, focus, disabled (during submit), error (empty / too long) |
| Todo Row | default, hover, focus (keyboard), completed, deleting |
| Checkbox | unchecked, checked, focus |
| Delete Icon Button | default, hover, focus, disabled (during delete) |
| Modal | open, closing |
| Buttons (generic) | default, hover, focus, active, disabled |

### Accessibility Baseline

- Keyboard-navigable: all interactive elements reachable via Tab with a visible focus ring.
- Screen-reader labels on icon buttons ("Delete todo: {description}").
- Checkbox state communicated via native `<input type="checkbox">` or equivalent ARIA.
- Modal traps focus while open and returns focus to the trigger on close.
- WCAG 2.1 AA contrast on all text, including completed-todo text at 60% opacity (NFR-007).

### Copy (MVP Commitments)

- Empty state: "No todos yet. Add one below."
- Add button: "Add"
- Delete modal title: "Delete this todo?"
- Delete modal body: "This cannot be undone."
- Generic error: "Couldn't save. Check your connection."
- Retry button: "Retry"

## Responsive Design & Browser Support

### Breakpoints

- **Mobile:** ≤640px
- **Tablet:** 641–1024px
- **Desktop:** ≥1025px

### Viewport Requirements

- **Minimum supported viewport width:** 320px (iPhone SE / equivalent).
- **Minimum tap target size:** 44×44px (iOS HIG baseline).
- **No horizontal scroll** at any viewport ≥320px.

### Browser / Device Matrix

| Browser | Supported Versions |
|---|---|
| Chrome (desktop + Android) | Last 2 evergreen versions |
| Firefox (desktop) | Last 2 evergreen versions |
| Safari (macOS) | Last 2 evergreen versions |
| Safari (iOS) | iOS 15+ |

Internet Explorer and legacy Edge are explicitly unsupported.
