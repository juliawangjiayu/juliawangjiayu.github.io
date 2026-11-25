# Guess Where Post Office Shelf Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present all four Guess Where modes and their instructions as a single-screen magical post office shelf on desktop.

**Architecture:** Keep the existing `GuessWherePage` state and game actions. Add a reusable decorative mailbox SVG to the current motif module, wrap the existing mode buttons in shelf-specific presentation markup, and scope all visual changes to the Guess Where theme stylesheet.

**Tech Stack:** React 19, TypeScript, CSS, Vite

**Spec:** `docs/superpowers/specs/2026-11-22-guess-where-post-office-design.md`

## Global Constraints

- Preserve every existing mode action and Random journey rule.
- Keep exact Guess Where answers and coordinates out of public presentation code.
- Desktop must show the heading, four modes, Random explanation, and leaderboard link in the initial viewport.
- Tablet and mobile reflow instead of shrinking text below comfortable reading size.
- Do not add animation or dependencies.

## Review Focus

- A short laptop viewport must not hide the fourth mode or leaderboard link.
- A busy/disabled mode must retain an obvious disabled state.
- A long Random progress sentence must wrap within its compartment.
- The shelf must become two columns before the compartments become cramped.
- Mobile buttons must remain at least 44px tall and must not overflow horizontally.

---

### Task 1: Mailbox shelf presentation

**Files:**
- Modify: `src/components/SectionMotifs.tsx`
- Modify: `src/pages/GuessWherePage.tsx`
- Modify: `src/styles/sectionThemes.css`

**Interfaces:**
- Consumes: existing `modes`, `beginMode(mode.id)`, Random progress copy, `WitchMotif`, and `FlightTrail`
- Produces: `MailboxMotif` and the accessible `.guess-post-office` shelf composition

- [x] **Step 1: Add `MailboxMotif`**

Create a decorative SVG component with a closed mailbox door, letter slot, small flag, and star seal. It accepts the existing `MotifProps` class name and is hidden from accessibility.

- [x] **Step 2: Restructure only the non-challenge landing mode selector**

Keep each existing mode as a `<button>`, add the mailbox motif and shelf framing, and retain all current disabled and click expressions unchanged.

- [x] **Step 3: Implement desktop and responsive shelf styles**

Use a four-column shelf on desktop, two columns below the tablet breakpoint, and one column on mobile. Fit the normal desktop state into `100svh - var(--header-height)` and keep the Random rule strip compact.

- [x] **Step 4: Verify behavior and layout**

Run `npm run typecheck`, `npm test`, and `npm run build`. Inspect desktop, short-laptop, tablet, and mobile viewport screenshots; verify all four buttons and instructional copy are visible as specified.

- [x] **Step 5: Commit**

Commit the spec, plan, component, page, and theme changes together after visual approval.
