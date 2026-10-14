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
| Landing / marketing home | `(marketing)/page.tsx` + `components/marketing/*` | `home.tsx` stub | [ ] |
| Pricing page | `(marketing)/pricing` | — | [ ] |
| Privacy | `(marketing)/privacy` | — | [ ] |
| Terms | `(marketing)/terms` | — | [ ] |
| Marketing chrome (header/footer/motion) | `components/marketing/*` | — | [ ] |

---

## B. Auth & account

| Item | Next | SPA | Status |
|---|---|---|---|
| Sign-in | yes | `sign-in.tsx` | [~] (no social buttons / AuthShell / password strength) |
| Sign-up | yes | `sign-up.tsx` | [~] (no social / AuthShell / strength meter) |
| Forgot password | yes | `forgot-password.tsx` | [~] |
| Reset password (token + OTP code path) | yes (`reset-code-form`) | `reset-password.tsx` (token / email notice only) | [~] |
| Verify email (OTP + resend) | yes | `verify-email.tsx` | [~] (no OTP boxes / clocks / outbox hint) |
| Auth shell + Wizi | `auth-shell.tsx` | shared `AuthLayout` text-only | [ ] |
| Social OAuth buttons | `social-buttons.tsx` | — | [ ] |
| Password input + strength | `password-input.tsx` | plain `<input>` | [ ] |
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
| User menu (profile / theme / tours / sign out) | `user-menu.tsx` | sign-out only in dock | [ ] |
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
| Inbox list + filters + bulk | `inbox-view.tsx` | thin list + trash one | [~] |
| Thread view (receipts, sanitize frame, attachments) | `thread-view.tsx` + friends | `thread.tsx` basic | [~] |
| Reply box + AI draft | `reply-box.tsx` + `draft-reply-button` | — | [ ] |
| Scheduled view (cancel/reschedule UI) | `scheduled-view.tsx` | `mail-folder` list | [~] |
| Sent / Trash folders | via mail UI | `mail-folder.tsx` | [~] |
| Compose TipTap / HTML / template / schedule / AI / attachments | full `composer/*` | `compose.tsx` | [x] (core) |
| Compose: AI tools parity, attachment chips UX | Next richer | SPA solid | [~] |
| Activity list | `activity-view.tsx` | thin list | [~] |
| Activity email detail | `activity/[emailId]` | — | [ ] |
| Triage chip | `triage-chip.tsx` | — | [ ] |

---

## F. Audience

| Item | Next | SPA | Status |
|---|---|---|---|
| Contacts list + create/edit/import/delete | `contacts-view.tsx` + dialogs | thin list | [~] |
| Contact detail | `contacts/[id]` | — | [ ] |
| Segments | `audience/segments` | — | [ ] |
| Topics | `audience/topics` | — | [ ] |
| Properties | `audience/properties` | — | [ ] |
| Audience nav tabs | `audience-nav.tsx` | — | [ ] |
| Broadcasts list | yes | thin list | [~] |
| Broadcast new / editor / send | `broadcasts/new`, `[id]`, editor | — | [ ] |
| Templates list | yes | thin list | [~] |
| Template new / editor / variables | `templates/new`, `[id]` | — | [ ] |

---

## G. Health

| Item | Next | SPA | Status |
|---|---|---|---|
| Insights charts + domain table | `insights-view.tsx` | numbers only | [~] |
| Alerts rules + incidents UI | `alerts-view.tsx` | basic CRUD | [~] |
| Incident detail + AI explain | `incidents/[id]` | — | [ ] |
| Domains list + add/delete | `domains-view.tsx` | thin list | [~] |
| Domain detail (DNS, tracking controls) | `domains/[domainId]` | — | [ ] |
| API keys list / create / revoke UI | Next richer | thin list | [~] |

---

## H. Settings

| Item | Next | SPA | Status |
|---|---|---|---|
| General | yes | yes | [~] (form exists; polish) |
| Connections list | full cards + dialogs + checklist | cards + quota + checklist + rename/remove | [~] (dialogs less polished than Next) |
| Connection detail | `connections/[connectionId]` | yes | [~] (sync + checklist + counts; DNS polish TBD) |
| Senders | full dialogs | basic | [~] |
| Members + invites + scopes | full | invite + list | [~] |
| Projects | full | thin | [~] |
| Notifications prefs | yes | thin | [~] |
| Billing / Stripe / packs / portal | `billing-view.tsx` | basic checkout/portal | [~] |
| AI settings | `ai-settings.tsx` | basic | [~] |
| Audit log | full filters/export UX | thin list | [~] |
| **Cleanup rules** | `settings/cleanup` | list + toggle + simple create | [~] (no full RuleDialog / block-sender UX) |
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
| `/dev/outbox` | yes | API may still serve; SPA route — | [ ] |
| `/dev/stripe/checkout|portal` | yes | — | [ ] |
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
| Contact / segment / topic / property / broadcast / template / domain detail GETs | Detail pages | [~] (some list GETs exist) |
| `GET /api/v1/tours` | Tour bootstrap | [x] |
| `impersonation.stop` user action | Stop banner | [x] |

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
- Entirely missing product routes: contact detail, segments/topics/properties, broadcast/template editors, domain detail, incident detail, activity email detail, marketing/legal, reset OTP path, auth shell polish.  
- Recently completed: … **connections list + detail + checklist fixes**, usage/cleanup, overview KPIs, dock usage tile.  
- Next up (suggested): inbox/thread parity → audience detail routes.
