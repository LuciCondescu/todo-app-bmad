---
artifact: 'product-brief'
project: 'todo-app'
author: 'Lucian Condescu'
audience: 'self — alignment doc for owner/sole engineer'
relatedDocuments:
  - '_bmad-output/planning-artifacts/PRD.md'
  - '_bmad-output/planning-artifacts/PRD-validation-report.md'
classification:
  domain: 'general'
  projectType: 'web_app'
  complexity: 'low'
date: '2026-04-18'
version: '1.0'
---

# Project Brief — Todo App

## 1. Why This Exists

A lightweight personal todo application built as a training project, intended to double as a reference implementation for a minimal, disciplined product development loop end-to-end: brief → PRD → architecture → implementation → tests.

The brief exists to answer, in one sitting, three questions that any future-me will ask when returning to this repo:

1. **What is this?** — a single-user, browser-based todo app with CRUD and persistence.
2. **Why did I build it?** — to practice the full BMAD-style product discipline on a problem small enough to finish, while producing a working artifact that's actually useful for day-to-day task capture.
3. **What did I deliberately not build?** — see §6 "Out of Scope". The discipline is in what's excluded.

## 2. Problem Framing

### The underlying job

*"I want to dump a short list of things I need to do today/this week into a text box and cross them off as I finish, without logging in, without categorizing, without being sold on productivity methodology."*

This is the **Jobs-to-be-Done** framing. The job is not "manage a complex life of responsibilities across domains and collaborators" — that's Todoist's job. This job is lighter, more ephemeral, and adjacent to a sticky note.

### Why existing tools fail the job

- **Heavyweight task managers** (Todoist, TickTick, Things) require an account, onboarding, and a mental model of projects/priorities/labels. Overkill for the job.
- **Note apps** (Apple Notes, Obsidian) don't offer first-class `completed` state and a satisfying strike-through interaction.
- **Browser bookmarks of a sticky-note web app** exist but are frequently abandoned (no persistence, or the hosting dies, or the data model is opaque).

### The thin-wedge bet

A todo app at the Apple-Notes level of lightness, with first-class completion semantics and durable persistence, is a legitimate unmet niche for personal use — not a market to disrupt, but a genuine ergonomic gap.

## 3. Target User

**Single persona in MVP:** a solo individual managing their own short-lived tasks from a personal browser (desktop or mobile).

**Not in scope as personas:**

- Teams, shared lists, collaborators, assignees.
- Enterprise buyers, admins, SSO consumers.
- Power users demanding priorities, deadlines, labels, recurring tasks, or natural-language parsing.

**Why restrict personas so hard?** Every additional persona adds an auth story, a permissions story, a notification story, and a sync conflict story. Single-persona MVP eliminates all four.

## 4. Vision & Strategic Intent

**Vision (one sentence):** A minimal, reliable personal todo app that a first-time user can use end-to-end in under 60 seconds with zero onboarding.

**Strategic intent of each phase:**

| Phase | Intent | Key Constraint |
|---|---|---|
| **MVP** (this release) | Prove the thin-wedge experience works: zero onboarding, durable persistence, clean state model. | Data schema must not block Growth (nullable `userId` from day one). |
| **Growth** (future) | Add auth so a user's todos follow them across devices without re-typing. | Schema-compatible with MVP; no migration. |
| **Vision** (future) | Cross-device sync, shared lists, deadlines, notifications — *if and only if* MVP + Growth prove the baseline experience is worth extending. | Additions must preserve the zero-onboarding feel for new users. |

## 5. Differentiator

**What makes this app defensibly different from a generic todo clone?**

The differentiator is **intentional minimalism enforced at every decision point**:

- **No account, no wall.** Open URL → start typing. No "sign up to save". No marketing interstitial.
- **No onboarding.** The empty state *is* the tutorial ("No todos yet. Add one below.").
- **No feature menu.** Create, view, complete, delete. That's it. No priorities, labels, projects, deadlines, reminders, recurring tasks, bulk ops, or drag-to-reorder.
- **Persistence is a promise, not a feature.** Zero data loss across refresh, browser close, and server restart is NFR-003 — graded with the same weight as a production system, because data loss is the one failure mode that destroys trust instantly.
- **Responsive at 320px.** Real mobile support, not a desktop-only app that happens to resize.

**What this is not:** This is not a Todoist competitor, a Notion competitor, or a productivity methodology. Those would be different products with different PRDs.

## 6. Scope — In vs. Out

### MVP: In Scope

- Create, view, complete, delete single-user todos.
- Persistence across page refresh, browser close, and server restart.
- Responsive layout (mobile ≤640px, tablet 641–1024px, desktop ≥1025px; 320px minimum viewport).
- Empty, loading, and error states for every data-bound surface.
- Modal confirmation before destructive delete.
- Evergreen browser support (see PRD Responsive Design & Browser Support).

### MVP: Out of Scope (Deliberately)

Deferred to Growth or Vision, not dropped:

- User accounts, authentication, multi-user support → Growth.
- Collaboration, shared lists, assignees → Vision.
- Priorities, deadlines, due dates, reminders → Vision.
- Email, push, or in-app notifications → Vision.
- Categories, tags, projects, filters → Vision.
- Bulk operations, drag-to-reorder → Vision.
- Offline-first / local-first sync → Vision.
- Native mobile apps → Vision.

### Why this cut line?

The thin-wedge bet (§2) is that the *first* create→complete→delete cycle, done in under 60 seconds with no friction, is the whole product promise. Every excluded feature above, added in MVP, would dilute that promise or expand the surface area beyond what a single person can reliably build, test, and maintain in the project window.

## 7. Success — What "Done" Looks Like

Detailed measurable SCs live in the PRD (SC-001..SC-004). At the brief level, "done" means:

1. **A first-time user completes the core loop (create → complete → delete) in ≤60 seconds without asking me anything.** If I hand this to a friend and they fumble, MVP has failed.
2. **Nothing is ever lost.** Close the tab, restart the server, refresh — the todos are there. Data loss is the existential failure mode.
3. **It works on my phone and my laptop equally well.** If I can't use it on the subway on my phone, it's not finished.
4. **It meets the latency targets** (UI p95 ≤100ms, API p95 ≤200ms) so it *feels* like a sticky note, not a web page.

## 8. Constraints & Assumptions

### Technical constraints

- **Stack is open.** The PRD deliberately contains no framework, database, or cloud-provider choice. The architecture agent is free to choose.
- **Data contract is fixed.** Todo = `{id, description ≤500 chars, completed, createdAt, userId (nullable)}`. The `userId` nullable field is a hard schema commitment to protect the Growth phase from a migration.
- **API contract is fixed.** `POST/GET/PATCH/DELETE /todos(:id)` with JSON bodies. Downstream architecture cannot rename or reshape these verbs/resources without breaking the PRD contract.

### Process constraints

- Solo builder. No parallel work streams. Scope must fit a solo cadence.
- This is a training project, so the BMAD artifacts (brief, PRD, validation report, architecture, epics/stories) are themselves deliverables — the process is as much the output as the app.

### Assumptions

- A modern evergreen browser is reasonable to require (no IE, no legacy Edge).
- Personal-use privacy posture is acceptable for MVP (no encryption at rest beyond standard DB defaults; no PII beyond self-supplied task text; no regulatory regime applies).
- The project continues into Growth only if MVP is actually used day-to-day after ship. Otherwise, MVP is the terminal version and the learning was the point.

## 9. Risks & Open Questions

### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| MVP is too minimal to be worth using and becomes a one-weekend curiosity. | Medium | Personal-use acceptance test: I commit to using it daily for two weeks post-ship before any Growth-phase work. |
| Persistence layer choice leaks into UX (e.g., latency spikes) and violates NFR-001/002. | Low–Medium | Latency NFRs are measured and test-gated; if violated, stack choice gets revisited before ship. |
| Scope creep — adding "one small feature" erodes the differentiator (§5). | Medium | MVP Out-of-Scope list (§6) is canonical. Any addition must be explicitly re-negotiated in the PRD, not slipped in. |
| Growth-phase auth retrofit breaks MVP users' data. | Low | Nullable `userId` schema commitment (NFR-005) is the explicit mitigation. |

### Open Questions (to resolve before Growth, not before MVP ship)

- What's the auth mechanism for Growth? (Email magic link? SSO? Password?) — out of scope now; flag for Growth planning.
- Is data export a hard requirement? — currently not in MVP; revisit if the product gets real daily use.
- Which deployment target hits the NFR-006 onboarding target (new engineer running locally in ≤15 min)? — architecture-phase decision.

## 10. How This Brief Connects to Downstream Artifacts

This brief is the **why**. The PRD is the **what**. The architecture doc (next) will be the **how**. The epics/stories will be the **what, broken into doable chunks**.

Traceability expectation:

- Every claim in this brief should appear, operationalized, in the PRD. If it doesn't, either the brief is aspirational or the PRD has a gap.
- Every FR/NFR in the PRD should trace back to a problem, persona, or success statement in this brief. If it doesn't, the FR is scope creep.

**Current status:** PRD is validated 5/5 and production-ready. Cosmetic polish (FR reframing, journey traces, latency journey) applied in version 1.1 of the PRD.

---

*End of brief. For the enumerated requirements contract, see the PRD. For the rationale behind each PRD section, see the inline Source columns.*
