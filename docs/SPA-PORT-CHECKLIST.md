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
| Landing / marketing home | `(marketing)/page.tsx` + `components/marketing/*` | hero + how + features + pricing + FAQ | [x] (no sticky compare / framer motion) |
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
| Onboarding create org | yes | `onboarding.tsx` | [~] (no Wizi / AuthShell polish) |
| Suspended workspace | yes | `suspended.tsx` | [x] |

---

## C. App shell & chrome

| Item | Next | SPA | Status |
|---|---|---|---|
| Sidebar dock + org switcher | yes | `app-shell.tsx` | [~] |
| Usage tile in dock | `usage-tile.tsx` | `usage-tile.tsx` | [x] |
| Plan banner (overage / trial / past_due) | `plan-banner.tsx` | in shell | [x] |
| Topbar breadcrumbs | `topbar.tsx` | org name only | [ ] |
| ⌘K search placeholder | topbar | — | [ ] |
| Mobile nav sheet | yes | basic toggle | [~] |
| User menu (profile / theme / tours / sign out) | `user-menu.tsx` | dock avatar menu | [x] (theme stays in topbar) |
| Settings sub-nav | `settings-nav.tsx` | flat list in sidebar | [~] |
| Empty state + Wizi | `empty-state.tsx` | dashed text boxes | [ ] |
| Error boundary / friendly error | `error-view.tsx` | — | [ ] |
| Live provider / live refresh | `live-provider.tsx` | SSE hook only | [~] |
| Motion provider | yes | — (static Wizi) | [ ] |
| Animated nav icons | `components/icons/animated/*` | lucide static | [ ] |
| Impersonation banner | yes | yes | [x] |
| Theme toggle | yes | yes | [x] |
| Notification bell | yes | yes | [~] (simpler) |
| Product tours (Help + runner + Wizi card) | nextstepjs | custom runner | [x] |
| Animated Wizi (motion moods) | `mascot/wizi.tsx` | static SVG | [~] |

---

## D. Overview

| Item | Next | SPA | Status |
|---|---|---|---|
| Overview route `/$orgSlug` | yes | `overview.tsx` | [~] |
| Greeting + Wizi | `greeting.tsx` | Wizi + summary | [~] (static Wizi) |
| KPI cards + sparklines | `kpi-card.tsx` + `getOverview` | yes | [~] (simple sparklines) |
| Connect-first card (`data-tour`) | yes | yes | [x] |
| Live overview refresh | `overview-live.tsx` | — | [ ] |
| `GET /api/v1/overview` | RSC only | yes | [x] |

---

## E. Mail

| Item | Next | SPA | Status |
|---|---|---|---|
| Inbox list + filters + bulk | `inbox-view.tsx` | filters + select/bulk trash + load more + triage filter | [~] (no dual-pane / shortcuts / live SSE) |
| Thread view (receipts, sanitize frame, attachments) | `thread-view.tsx` + friends | `thread.tsx` + MessageCard / EmailFrame / receipts / attachments | [x] |
| Reply box + AI draft | `reply-box.tsx` + `draft-reply-button` | inline reply + AI draft on thread | [x] (plain textarea; TipTap later) |
| Scheduled view (cancel/reschedule UI) | `scheduled-view.tsx` | `mail-folder` list + search | [~] (no cancel/reschedule dialogs) |
| Sent / Trash folders | via mail UI | `mail-folder.tsx` search + restore + load more | [~] |
| Compose TipTap / HTML / template / schedule / AI / attachments | full `composer/*` | `compose.tsx` | [x] (core) |
| Compose: AI tools parity, attachment chips UX | Next richer | SPA solid | [~] |
| Activity list | `activity-view.tsx` | filters + load more + row links | [x] (no bulk trash yet) |
| Activity email detail | `activity/[emailId]` | timeline + payload + open thread | [x] |
| Triage chip | `triage-chip.tsx` | list + thread summary | [x] |

---

## F. Audience

| Item | Next | SPA | Status |
|---|---|---|---|
| Contacts list + create/edit/import/delete | `contacts-view.tsx` + dialogs | filters + create + load more | [~] (no CSV import dialog) |
| Contact detail | `contacts/[id]` | yes (edit/segments/topics/delete) | [x] |
| Segments | `audience/segments` | list + create/rename/delete | [x] |
| Topics | `audience/topics` | list + create/edit/delete | [x] |
| Properties | `audience/properties` | list + create/edit fallback/delete | [x] |
| Audience nav tabs | `audience-nav.tsx` | yes | [x] |
| Broadcasts list | yes | status filter + links + new | [x] |
| Broadcast new / editor / send | `broadcasts/new`, `[id]`, editor | HTML editor + preview + send/schedule | [~] (no rich TipTap mode / polished send dialog) |
| Templates list | yes | list + duplicate + new | [x] |
| Template new / editor / variables | `templates/new`, `[id]` | HTML + variables + publish | [x] |

---

## G. Health

| Item | Next | SPA | Status |
|---|---|---|---|
| Insights charts + domain table | `insights-view.tsx` | KPIs + SVG charts + domain table + filters | [x] |
| Alerts rules + incidents UI | `alerts-view.tsx` | list + link to detail + rules CRUD | [~] |
| Incident detail + AI explain | `incidents/[id]` | detail + acknowledge + AI explain | [x] |
| Domains list + add/delete | `domains-view.tsx` | filters + add + tracking/project | [x] |
| Domain detail (DNS, tracking controls) | `domains/[domainId]` | DNS records, check/verify, tracking, delete | [x] |
| API keys list / create / revoke UI | Next richer | grouped list + create/delete dialogs + secret once | [x] |

---

## H. Settings

| Item | Next | SPA | Status |
|---|---|---|---|
| General | yes | yes | [~] (form exists; polish) |
| Connections list | full cards + dialogs + checklist | cards + quota + checklist + rename/remove | [~] (dialogs less polished than Next) |
| Connection detail | `connections/[connectionId]` | yes | [~] (sync + checklist + counts; DNS polish TBD) |
| Senders | full dialogs | grouped list + create/edit/disable/delete + status | [x] |
| Members + invites + scopes | full | invite dialog, role change, scopes, remove, quota | [x] |
| Projects | full | cards + quota + create/edit/delete + colors | [x] |
| Notifications prefs | yes | channels + quiet hours + digest | [x] |
| Billing / Stripe / packs / portal | `billing-view.tsx` | preview, packs, pending, portal, return poll | [x] |
| AI settings | `ai-settings.tsx` | credits, usage, privacy, locked, switches | [x] |
| Audit log | full filters/export UX | filters + export + load more + expand | [x] |
| **Cleanup rules** | `settings/cleanup` | RuleDialog (preview/edit/block sender) | [x] |
| **Usage** | `settings/usage` | yes | [~] (core meters; history/charts TBD) |
| Settings catch-all section | `settings/[section]` | splat placeholder | [~] |

---

## I. Notifications

| Item | Next | SPA | Status |
|---|---|---|---|
| Notifications page | richer | basic list/mark | [~] |
| Unread bell | yes | yes | [x] |

---

## J. Platform admin

| Item | Next | SPA | Status |
|---|---|---|---|
| Overview / users / user detail / orgs / org detail | yes | yes | [~] (functional; polish TBD) |
| Health / pricing / settings | yes | yes | [~] |
| Impersonate from user page | yes | yes | [x] |

---

## K. Dev-only (fake modes)

| Item | Next | SPA / API | Status |
|---|---|---|---|
| `/dev/outbox` | yes | SPA + `GET /api/dev/outbox` | [x] |
| `/dev/stripe/checkout|portal` | yes | SPA + `/api/dev/stripe/*` | [x] |
| `/dev/shell-preview` | yes | skip / optional | [ ] |

---

## L. Shared UI kit (Next `components/ui`)

SPA mostly uses raw Tailwind. Port as needed when feature UIs need them:

| Item | Status |
|---|---|
| button, input, dialog, dropdown, form, badge, tooltip, toast/sonner, sheet, tabs, … | [ ] |

---

## M. API gaps for SPA (no Next RSC)

Add Fastify `GET` (or actions already exist) where SPA today lacks a read:

| Endpoint / action | Purpose | Status |
|---|---|---|
| `GET /api/v1/overview` | Overview KPIs | [x] |
| `GET /api/v1/usage/summary` | Dock usage tile | [x] |
| `GET /api/v1/settings/usage` | Usage page | [x] |
| `GET /api/v1/settings/cleanup` (or cleanup-rules) | Cleanup page | [x] |
| Contact / segment / topic / property / broadcast / template / domain / incident detail GETs | Detail pages | [x] (activity email still open) |
| `GET /api/v1/insights/options` | Insight filter bar | [x] |
| `GET /api/v1/incidents/:id` | Incident detail | [x] |
| `GET /api/v1/api-keys` payload (`keys`, `connections`, `can`) | API keys UI | [x] |
| `GET /api/v1/senders` payload (`senders`, `domains`, `can`) | Senders UI | [x] |
| `GET /api/v1/projects` payload (`projects`, `quota`, `can`) | Projects UI | [x] |
| `GET /api/v1/members` payload (quota, projects, actorRole, can) | Members UI | [x] |
| `GET /api/v1/domains` payload + `GET /api/v1/domains/:id` | Domains UI | [x] |
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
| Tour UI tests | [ ] |
| Auth form tests | [ ] |
| Domain feature UI tests (inbox, connections, billing, …) | [ ] |
| Playwright e2e against SPA | [~] (`apps/spa/tests/e2e`; Next e2e archived) |

---

## Suggested port order (execution)

1. **Settings: Usage + Cleanup** + usage summary API + dock tile + plan banner  
2. **Overview KPIs** (`GET /api/v1/overview` + greeting/KPI UI)  
3. **Connections** full list/detail/checklist/dialogs  
4. **Inbox / thread** parity (filters, reply, receipts, AI draft)  
5. **Audience** (contacts detail + segments/topics/properties)  
6. **Broadcasts + templates** editors  
7. **Domains** detail + DNS  
8. **Insights charts** + incident detail  
9. **Billing / members / projects / senders / audit / AI** polish to Next  
10. **Marketing + legal**  
11. **Auth polish** (shell, social, OTP UX)  
12. **Dev pages** (outbox, fake Stripe)  
13. **UI kit + motion Wizi** as shared foundation while feature ports land  

---

## Progress snapshot

- Routes that exist but are thin stubs: **majority of product areas** (`[~]`).  
- Remaining gaps: ⌘K search, breadcrumbs, empty-state Wizi, UI kit, shell-preview.  
- Recently completed this session: AI/audit, activity, notifications, cleanup, marketing, auth+OTP, /dev pages, user menu.
