# Browser matrix — FR-009 / SC-004

## Declared matrix

Per `_bmad-output/planning-artifacts/PRD.md:212-219`, the MVP supports:

- **Chrome (desktop)** — evergreen, last-2 stable.
- **Firefox (desktop)** — evergreen, last-2 stable.
- **Safari (macOS)** — evergreen, last-2 stable.
- **Safari (iOS) 15+** — primary mobile target.

Declared viewports (from PRD `Responsive layout` section): **320 × 800** (smallest supported) through **1440 × 800** (typical desktop). The breakpoint at which `lg:pt-16` engages is 1024px.

## Automated proxies (Playwright)

| Engine    | Proxy maps to               | Notes                                                                                        |
| --------- | --------------------------- | -------------------------------------------------------------------------------------------- |
| Chromium  | Chrome (desktop)            | Identical engine — high-fidelity proxy.                                                      |
| Firefox   | Firefox (desktop)           | Identical engine.                                                                            |
| WebKit    | Safari (macOS) AND iOS 15+  | NOT identical — Playwright ships its own WebKit binary, which lags Safari by some weeks. Acceptable for layout / DOM-API regression-guard; insufficient for OS-level integration (touch events, viewport-meta quirks, momentum scrolling). |

## What Playwright CANNOT cover

The matrix is a regression guard, not a release-gating verification. The following scenarios still need manual checks before any release that touches layout, the modal, or input handling:

- **Real macOS Safari** — Playwright's WebKit binary is engine-only; cookie / extension / WebAuthn behavior differs.
- **Real iOS Safari (iOS 15+)** — touch-target tolerance, momentum scrolling, viewport-meta interactions, on-screen-keyboard impact on layout, the home-bar safe area.
- **Tab-traversal of buttons in WebKit / Safari** — by default Safari's keyboard navigation skips non-form-control elements (buttons land in the focus chain only when the user enables *"Press Tab to highlight each item on a webpage"* in System Preferences). The matrix surfaces this: the Story 5.2 modal-tab-reachability test guards against the regression in Chromium + Firefox, and explicitly skips the Tab assertion in the WebKit project. **Manual verification path on iOS:** open the modal, swipe (VoiceOver) to confirm both buttons are reachable as accessible elements; the Tab keyboard interaction has no iOS analogue.

## Unsupported

Per `_bmad-output/planning-artifacts/PRD.md:221`:

- **Internet Explorer** — explicitly unsupported.
- **Legacy (non-Chromium) Edge** — explicitly unsupported.

No `polyfill` or `shim` is shipped to extend support to either; bug reports against IE / legacy Edge are closed `wontfix`.

## CI policy

The full browser matrix runs **locally pre-release**, not on every push.

The `.github/workflows/ci.yml` workflow runs `npm run test:e2e` on every PR, which is narrowed to `--project=chromium` (Story 5.2 made this explicit in `apps/web/package.json`). CI installs only Chromium via `npx playwright install --with-deps chromium`; Firefox + WebKit binaries are not pulled.

Adding the matrix to CI is a one-line script change (extend the `Install Playwright browsers` step + add a `test:browsers` step) — defer until evidence of a cross-browser regression slipping through the manual pre-release pass justifies the +60–90s of CI wall-clock per run.

## How to run locally

```sh
# One-time installation of Firefox + WebKit binaries.
cd apps/web
npx playwright install firefox webkit

# Prerequisite: Postgres up + dev API server reachable (Playwright's
# webServer config also boots them automatically).
docker compose up -d postgres

# Run the matrix.
npm run test:browsers --workspace apps/web
```

Default `npm run test:e2e` continues to run Chromium-only; the matrix spec is the sole consumer of the Firefox + WebKit projects.

## Most-recent run

| Date       | Browser  | Viewport  | Journey 1 | Modal (320px) | Modal width (1024px) |
| ---------- | -------- | --------- | --------- | ------------- | -------------------- |
| 2026-04-27 | Chromium | 320×800   | ✅ pass   | ✅ pass       | n/a                  |
| 2026-04-27 | Chromium | 1024×800  | ✅ pass   | n/a           | ✅ pass (= 400px)    |
| 2026-04-27 | Firefox  | 320×800   | ✅ pass   | ✅ pass       | n/a                  |
| 2026-04-27 | Firefox  | 1024×800  | ✅ pass   | n/a           | ✅ pass (= 400px)    |
| 2026-04-27 | WebKit   | 320×800   | ✅ pass   | ✅ pass¹      | n/a                  |
| 2026-04-27 | WebKit   | 1024×800  | ✅ pass   | n/a           | ✅ pass (= 400px)    |

¹ WebKit's modal test runs the boundingBox + initial-focus + width-clamp assertions; the keyboard-Tab traversal sub-step is skipped per the platform limitation called out above.

12/12 tests passed in 8.9s. SC-004 (zero horizontal scroll at 320px) verified on all three engines, on both initial load and post-reload. FR-009 (cross-browser rendering at declared viewports) verified.

Update this table after every release-candidate matrix run.
