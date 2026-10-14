# SPA port checklist — Next (`archive/next-web`) → React SPA (`apps/spa`)

Living checklist for **full product UI parity**. Backend services mostly already live under `apps/api`. Legend:

- `[x]` done at Next parity (or intentional SPA equivalent)
- `[~]` route or thin stub exists; **missing Next feature UI / flows**
- `[ ]` missing from SPA (route and/or UI)

Source for Next surfaces: `archive/next-web/app/**/page.tsx` + `archive/next-web/components/**`.  
Update this file as ports land.

---

## How to read “deeper ports”

M7/M8 shipped many **routes** with thin list pages (`ResourcePage` + `GET`). Next had full views (dialogs, editors, charts, detail pages, empty states with Wizi, checklist, etc.). Those gaps are `[~]` below — not “done.”

---

## A. Marketing & legal

| Item | Next | SPA | Status |
|---|---|---|---|
| Landing / marketing home | `(marketing)/page.tsx` + `components/marketing/*` | hero + how + features + sticky compare + pricing + FAQ | [x] (sticky compare → pricing overlay) |
| Pricing page | `(marketing)/pricing` | yes | [x] |
| Privacy | `(marketing)/privacy` | yes | [x] |
| Terms | `(marketing)/terms` | yes | [x] |
| Marketing chrome (header/footer/motion) | `components/marketing/*` | header/footer + shell | [x] (motion reduced) |

---

## B. Auth & account

| Item | Next | SPA | Status |
|---|---|---|---|
| Sign-in | yes | `sign-in.tsx` | [x] (AuthShell + social + password toggle) |
| Sign-up | yes | `sign-up.tsx` | [x] (AuthShell + social + strength meter) |
| Forgot password | yes | `forgot-password.tsx` | [x] |
| Reset password (token + OTP code path) | yes (`reset-code-form`) | token + OTP + password | [x] (no expiry clocks / outbox hint) |
| Verify email (OTP + resend) | yes | segmented OTP + resend | [x] (no clocks / outbox hint) |
| Auth shell + Wizi | `auth-shell.tsx` | AuthShell + atmosphere + Wizi | [x] |
| Social OAuth buttons | `social-buttons.tsx` | catalog-gated | [x] |
| Password input + strength | `password-input.tsx` | yes | [x] |
| Invite accept | yes | `invite.tsx` | [x] |
| Onboarding create org | yes | `onboarding.tsx` | [x] (AuthShell + Wizi; `?new=1` for another workspace) |
| Suspended workspace | yes | `suspended.tsx` | [x] |

---

## C. App shell & chrome

| Item | Next | SPA | Status |
|---|---|---|---|
| Sidebar dock + org switcher | yes | `app-shell.tsx` | [x] |
| Usage tile in dock | `usage-tile.tsx` | `usage-tile.tsx` | [x] |
| Plan banner (overage / trial / past_due) | `plan-banner.tsx` | in shell | [x] |
| Topbar breadcrumbs | `topbar.tsx` | `topbar-chrome.tsx` + `BreadcrumbLabel` | [x] |
| ⌘K search | topbar | nav/settings jump palette | [x] (workspace pages; not full-text mail search) |
| Mobile nav sheet | yes | `<dialog>` slide-over dock | [x] |
| User menu (profile / theme / tours / sign out) | `user-menu.tsx` | dock avatar menu | [x] (theme stays in topbar) |
| Settings sub-nav | `settings-nav.tsx` | `SettingsNav` + layout; sidebar = Settings only | [x] |
| Empty state + Wizi | `empty-state.tsx` | `EmptyState` via `ResourceEmpty` | [x] |
| Error boundary / friendly error | `error-view.tsx` | router `defaultErrorComponent` | [x] |
| Live provider / live refresh | `live-provider.tsx` | `useOrgStream` multi-topic invalidate | [x] |
| Motion provider | yes | `LazyMotion` + `MotionConfig` | [x] (`motion` package) |
| Lenis smooth scroll | marketing + app | `SmoothScroll` (Lenis) | [x] |
| Animated nav icons | `components/icons/animated/*` | lucide + CSS hover scale/tilt | [x] (CSS hover; prefers-reduced-motion) |
| Impersonation banner | yes | yes | [x] |
| Theme toggle | yes | yes | [x] |
| Notification bell | yes | yes | [x] |
| Product tours (Help + runner + Wizi card) | nextstepjs | custom runner | [x] (welcome + first-look + feature tours) |
| Animated Wizi (motion moods) | `mascot/wizi.tsx` | Motion SVG moods | [x] |

---

## D. Overview

| Item | Next | SPA | Status |
|---|---|---|---|
| Overview route `/$orgSlug` | yes | `overview.tsx` | [x] |
| Greeting + Wizi | `greeting.tsx` | Wizi + summary + mood | [x] |
| KPI cards + sparklines | `kpi-card.tsx` + `getOverview` | yes | [x] |
| Connect-first card (`data-tour`) | yes | yes | [x] |
| Live overview refresh | `overview-live.tsx` | SSE invalidates + 60s fallback | [x] |
| `GET /api/v1/overview` | RSC only | yes | [x] |

---

## E. Mail

| Item | Next | SPA | Status |
|---|---|---|---|
| Inbox list + filters + bulk | `inbox-view.tsx` | filters + select/bulk trash + load more + triage + empty Wizi | [x] (single-pane; dual-pane not ported by design) |
| Thread view (receipts, sanitize frame, attachments) | `thread-view.tsx` + friends | `thread.tsx` + MessageCard / EmailFrame / receipts / attachments | [x] |
| Reply box + AI draft | `reply-box.tsx` + `draft-reply-button` | inline reply + AI draft on thread | [x] (plain textarea; TipTap in compose) |
| Scheduled view (cancel/reschedule UI) | `scheduled-view.tsx` | cancel/reschedule dialogs + empty Wizi | [x] |
| Sent / Trash folders | via mail UI | `mail-folder.tsx` search + restore + load more | [x] |
| Compose TipTap / HTML / template / schedule / AI / attachments | full `composer/*` | `compose.tsx` | [x] |
| Compose: AI tools parity, attachment chips UX | Next richer | SPA solid | [x] |
| Activity list | `activity-view.tsx` | filters + load more + row links | [x] |
| Activity email detail | `activity/[emailId]` | timeline + payload + open thread | [x] |
| Triage chip | `triage-chip.tsx` | list + thread summary | [x] |

---

## F. Audience

| Item | Next | SPA | Status |
|---|---|---|---|
| Contacts list + create/edit/import/delete | `contacts-view.tsx` + dialogs | filters + create + CSV import + load more | [x] |
| Contact detail | `contacts/[id]` | yes (edit/segments/topics/delete) | [x] |
| Segments | `audience/segments` | list + create/rename/delete | [x] |
| Topics | `audience/topics` | list + create/edit/delete | [x] |
| Properties | `audience/properties` | list + create/edit fallback/delete | [x] |
| Audience nav tabs | `audience-nav.tsx` | yes | [x] |
| Broadcasts list | yes | status filter + links + new | [x] |
| Broadcast new / editor / send | `broadcasts/new`, `[id]`, editor | HTML editor + preview + send/schedule | [x] (CodeMirror HTML; TipTap optional later) |
| Templates list | yes | list + duplicate + new | [x] |
| Template new / editor / variables | `templates/new`, `[id]` | HTML + variables + publish | [x] |

---

## G. Health

| Item | Next | SPA | Status |
|---|---|---|---|
| Insights charts + domain table | `insights-view.tsx` | KPIs + SVG charts + domain table + filters | [x] |
| Alerts rules + incidents UI | `alerts-view.tsx` | incidents + rules cards, empty Wizi, create/toggle/delete | [x] |
| Incident detail + AI explain | `incidents/[id]` | detail + acknowledge + AI explain | [x] |
| Domains list + add/delete | `domains-view.tsx` | filters + add + tracking/project | [x] |
| Domain detail (DNS, tracking controls) | `domains/[domainId]` | DNS records, check/verify, tracking, delete | [x] |
| API keys list / create / revoke UI | Next richer | grouped list + create/delete dialogs + secret once | [x] |

---

## H. Settings

| Item | Next | SPA | Status |
|---|---|---|---|
| General | yes | yes | [x] |
| Connections list | full cards + dialogs + checklist | cards + quota + checklist + rename/remove | [x] |
| Connection detail | `connections/[connectionId]` | sync + checklist + counts | [x] |
| Senders | full dialogs | grouped list + create/edit/disable/delete + status | [x] |
| Members + invites + scopes | full | invite dialog, role change, scopes, remove, quota | [x] |
| Projects | full | cards + quota + create/edit/delete + colors | [x] |
| Notifications prefs | yes | channels + quiet hours + digest | [x] |
| Billing / Stripe / packs / portal | `billing-view.tsx` | preview, packs, pending, portal, return poll | [x] |
| AI settings | `ai-settings.tsx` | credits, usage, privacy, locked, switches | [x] |
| Audit log | full filters/export UX | filters + export + load more + expand | [x] |
| **Cleanup rules** | `settings/cleanup` | RuleDialog (preview/edit/block sender) | [x] |
| **Usage** | `settings/usage` | meters + projection | [x] (history charts optional polish) |
| Settings catch-all section | `settings/[section]` | redirect unknown → general | [x] |

---

## I. Notifications

| Item | Next | SPA | Status |
|---|---|---|---|
| Notifications page | richer | filter tabs + styles + empty Wizi + settings | [x] |
| Unread bell | yes | yes | [x] |

---

## J. Platform admin

| Item | Next | SPA | Status |
|---|---|---|---|
| Overview / users / user detail / orgs / org detail | yes | yes | [x] |
| Health / pricing / settings | yes | yes | [x] |
| Impersonate from user page | yes | yes | [x] |

---

## K. Dev-only (fake modes)

| Item | Next | SPA / API | Status |
|---|---|---|---|
| `/dev/outbox` | yes | SPA + `GET /api/dev/outbox` | [x] |
| `/dev/stripe/checkout|portal` | yes | SPA + `/api/dev/stripe/*` | [x] |
| `/dev/shell-preview` | yes | `dev-shell-preview.tsx` (demo / empty / wizi) | [x] |

---

## L. Shared UI kit (Next `components/ui`)

SPA prefers thin primitives over a full shadcn tree:

| Item | Status |
|---|---|
| `Button`, `DialogShell` (+ native dialogs elsewhere) | [x] intentional SPA kit |
| Full shadcn port (dropdown, sheet, toast, tabs, …) | [x] deferred — use native / Tailwind patterns |

---

## M. API gaps for SPA (no Next RSC)

| Endpoint / action | Purpose | Status |
|---|---|---|
| `GET /api/v1/overview` | Overview KPIs | [x] |
| `GET /api/v1/usage/summary` | Dock usage tile | [x] |
| `GET /api/v1/settings/usage` | Usage page | [x] |
| `GET /api/v1/settings/cleanup` (or cleanup-rules) | Cleanup page | [x] |
| Contact / segment / topic / property / broadcast / template / domain / incident detail GETs | Detail pages | [x] |
| `GET /api/v1/insights/options` | Insight filter bar | [x] |
| `GET /api/v1/incidents/:id` | Incident detail | [x] |
| `GET /api/v1/api-keys` payload | API keys UI | [x] |
| `GET /api/v1/senders` payload | Senders UI | [x] |
| `GET /api/v1/projects` payload | Projects UI | [x] |
| `GET /api/v1/members` payload | Members UI | [x] |
| `GET /api/v1/domains` + `/:id` | Domains UI | [x] |
| `GET /api/v1/audience/options` | Contact filters | [x] |
| `GET /api/v1/contacts/:id` | Contact detail | [x] |
| `GET /api/v1/segments` / `topics` / `properties` | Audience lists | [x] |
| `GET /api/v1/broadcasts/:id` + `/options` | Broadcast editor | [x] |
| `GET /api/v1/templates/:id` | Template editor | [x] |
| `GET /api/v1/tours` | Tour bootstrap | [x] |
| `impersonation.stop` user action | Stop banner | [x] |
| `GET /api/v1/ai/usage` | AI settings usage table | [x] |
| `GET /api/v1/audit/filters` | Audit filter bar | [x] |

---

## N. Tests to port (from Next / archive)

| Item | Status |
|---|---|
| Composer unit tests | [x] (SPA) |
| Tour UI tests | [x] (`tour/__tests__/tour-ui.test.tsx`) |
| Auth form tests | [x] (otp-input + social-buttons) |
| Domain feature UI tests | [~] optional follow-up |
| Playwright e2e against SPA | [~] (`apps/spa/tests/e2e`; expand over time) |

---

## Progress snapshot

- **Product UI port: complete** at SPA parity (or documented intentional equivalents).
- Intentional differences vs Next: single-pane inbox, CodeMirror HTML for broadcasts, ⌘K jumps pages (not full-text mail body search); Lenis + Motion for scroll/Wizi.
- Optional follow-ups: expand Playwright, domain UI unit tests, Framer-style animated nav icon library.
