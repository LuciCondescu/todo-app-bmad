# Contrast audit — WCAG 2.1 token-pair compliance

This document is the human-readable evidence trail for NFR-007's contrast commitment. Every color pair declared in the design system has its WCAG contrast ratio computed, recorded, and threshold-checked here.

**Authoritative source:** the automated test at [`apps/web/test/a11y/contrast.a11y.test.tsx`](../apps/web/test/a11y/contrast.a11y.test.tsx). Ratios in the table below are HARVESTED from that test's output; if a future change to the [`@theme` block in `apps/web/src/styles/index.css:3-18`](../apps/web/src/styles/index.css) shifts a ratio, the test fails and this table must be updated.

**Convention:** any future change to the `@theme` block MUST trigger an update to this document. Tokens are the source of truth; this doc is the evidence of compliance. Code-review discipline enforces the pairing — a PR touching `@theme` without a corresponding update here should be rejected.

## Pairs

| Pair Label | Foreground (hex/token) | Background (hex/token) | Alpha | Computed Ratio | WCAG Level Achieved | Threshold | Source |
|---|---|---|---|---|---|---|---|
| body text | `#1A1A1A` (`--color-fg`) | `#FAFAFA` (`--color-bg`) | — | **16.67** | AAA normal | ≥7 | `apps/web/src/styles/index.css:6` |
| secondary text | `#737373` (`--color-fg-muted`) | `#FAFAFA` (`--color-bg`) | — | **4.54** | AA normal *(thin margin: +0.04)* | ≥4.5 | `apps/web/src/styles/index.css:7` |
| completed text (60% opacity) | `#1A1A1A` (`--color-completed-fg` source) | `#FAFAFA` (`--color-bg`) | 0.6 | **4.50** | AA normal *(at threshold; un-rounded composite ≈ 4.506)* | ≥4.5 | `apps/web/src/styles/index.css:11-13` (also UX spec `ux-design-specification.md:435`) |
| focus ring | `#2563EB` (`--color-accent`) | `#FAFAFA` (`--color-bg`) | — | **4.95** | AA non-text *(passes the stricter AA-normal text threshold too)* | ≥3 | `apps/web/src/styles/index.css:9, 27-30` |
| Primary button text | `#FFFFFF` literal | `#2563EB` (`--color-accent`) | — | **5.17** | AA normal | ≥4.5 | `apps/web/src/components/AddTodoInput.tsx:61` |
| Danger button text | `#FFFFFF` literal | `#DC2626` (`--color-danger`) | — | **4.83** | AA normal *(thin margin: +0.33)* | ≥4.5 | `apps/web/src/components/DeleteTodoModal.tsx:84` |
| InlineError text | `#991b1b` literal | `#fef2f2` literal | — | **7.60** | AAA normal *(thin margin over AAA: +0.60)* | ≥7 | Story 4.1 — `apps/web/src/components/InlineError.tsx` |

## Notes

**60%-opacity composite (completed text).** Effective ratio is computed via `alphaComposite(fg, bg, alpha)` BEFORE the contrast formula runs: foreground `#1A1A1A` at opacity 0.6 is blended against background `#FAFAFA` → effective composite ≈ `rgb(115.6, 115.6, 115.6)` (un-rounded; sub-pixel precision per the WCAG canon — rounding to integer `rgb(116, 116, 116)` would push the ratio to ≈4.48, FAILING AA. The math helper at [`apps/web/test/a11y/contrastMath.ts`](../apps/web/test/a11y/contrastMath.ts) returns float values explicitly to avoid this trap). The ratio against `#FAFAFA` is then computed normally: ≈4.506. This matches the UX spec's audit at `ux-design-specification.md:435`.

**Primary / Danger button as-implemented vs AC text.** Story 5.4 AC-text describes these as `#2563EB on #FFFFFF` / `#DC2626 on #FFFFFF` (text colored on a white page). The actual components (`bg-[--color-accent] text-white`, `bg-[--color-danger] text-white`) place white TEXT on the accent/danger BACKGROUND. Contrast ratio is symmetric — `computeContrast(a, b) === computeContrast(b, a)` — so the math is identical, but the table reflects the as-implemented pair (white on accent/danger) since that is what users perceive. Documented in the test file's header comment.

**Thin margins flagged for design vigilance.** Three pairs sit close to their threshold and are sensitive to small palette changes:

- `secondary text` is at 4.54 (just 0.04 above AA). A small darkening of `--color-fg-muted` from `#737373` to `#797979` would tip below — DON'T make that change without re-running the audit.
- `completed text (60%)` is at 4.50 — right at the AA boundary. Any change to `--color-fg`, `--color-bg`, OR the alpha (currently 0.6) requires a full recompute. The current 4.50 ratio is the un-rounded `4.506`, which means even a 0.01 movement either way could flip pass/fail in the rounded display.
- `Danger button` is at 4.83 (0.33 above AA). The next danger-color variant a designer might pick (e.g., `#E11D48` or `#DC1D45`) needs verification before adoption.

**Focus ring threshold rationale.** The `≥3` is WCAG SC 1.4.11 (Non-text Contrast) — UI components and graphical objects need 3:1 against adjacent colors. The actual ratio (4.95:1) comfortably exceeds the AA-text threshold (4.5:1) too, which is the more typical reference benchmark.

## Footer

Source test: [`apps/web/test/a11y/contrast.a11y.test.tsx`](../apps/web/test/a11y/contrast.a11y.test.tsx)  
Pure-math helper + WCAG-formula reference: [`apps/web/test/a11y/contrastMath.ts`](../apps/web/test/a11y/contrastMath.ts)  
Token declarations: [`apps/web/src/styles/index.css:3-18`](../apps/web/src/styles/index.css)  
WCAG 2.1 SC 1.4.3 / 1.4.6 / 1.4.11 — minimum / enhanced / non-text contrast: <https://www.w3.org/TR/WCAG21/#contrast-minimum>

Audit performed 2026-04-27 by @lucicondescu via Story 5.4 land. Rerun via `npm test --workspace apps/web -- test/a11y/contrast.a11y.test.tsx --reporter=verbose` whenever the `@theme` block changes.
