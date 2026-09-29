# UCD — Mailwise (Use Case Document)

> **Status:** Draft v0.1, 2026-09-29
> **Related:** `PRD.md`, `TRD.md`, `DBD.md`

---

## 1. Actors & roles

| Actor | Description |
|---|---|
| **Visitor** | Not signed in. Sees marketing pages, signs up, accepts invites. |
| **Owner** | Created the organization. Everything, including billing, deleting the org, transferring ownership. |
| **Admin** | Manages connections, members, projects, domains, API keys, alert rules, AI settings. No billing or org deletion. |
| **Developer** | Operational access: domains (tracking toggles), API keys (create sending keys), templates, activity log, insights, alerts. Can send. Cannot manage connections or members. |
| **Support** | Inbox-focused: read/reply/assign threads, compose, contacts (read + unsubscribe). Sees activity for recipients. No domains, keys, broadcasts, or settings. |
| **Viewer** | Read-only across what they can see. Cannot send. |
| **System (Resend)** | Sends webhook events to our ingest endpoint. |
| **System (scheduler)** | Runs syncs, DNS checks, silence checks, alert evaluation, digests, retention cleanup. |

Any member except Owner can be **project-scoped**: they see only data belonging to their assigned projects (domains, senders, emails, threads, contacts in segments tied to those projects).

### Permission matrix

| Capability | Owner | Admin | Developer | Support | Viewer |
|---|:-:|:-:|:-:|:-:|:-:|
| Billing (plan, payment, credit packs, extra connections), delete org | ✓ | | | | |
| Usage page (view) | ✓ | ✓ | | | |
| Members, roles, invitations | ✓ | ✓ | | | |
| Connections (add/remove/re-key) | ✓ | ✓ | | | |
| Projects & senders | ✓ | ✓ | ✓ (senders) | | |
| Domains: view | ✓ | ✓ | ✓ | | ✓ |
| Domains: tracking, add, verify, delete | ✓ | ✓ | ✓ (tracking) | | |
| API keys: view | ✓ | ✓ | ✓ | | |
| API keys: create/delete | ✓ | ✓ | ✓ (sending only) | | |
| Compose & send, reply | ✓ | ✓ | ✓ | ✓ | |
| Inbox: read, assign, label | ✓ | ✓ | ✓ | ✓ | ✓ (read) |
| Activity log & insights | ✓ | ✓ | ✓ | ✓ (activity) | ✓ |
| Contacts: edit, import | ✓ | ✓ | ✓ | unsubscribe only | |
| Segments, topics, properties | ✓ | ✓ | ✓ | | |
| Broadcasts: create/schedule/send | ✓ | ✓ | ✓ | | |
| Templates | ✓ | ✓ | ✓ | | ✓ (view) |
| Automations: view / enable-disable | ✓ | ✓ | ✓ | | ✓ (view) |
| Alert rules | ✓ | ✓ | ✓ | | |
| AI settings | ✓ | ✓ | | | |
| AI features (use) | ✓ | ✓ | ✓ | ✓ | |
| Audit log | ✓ | ✓ | | | |
| Move to Trash / restore (inbox, activity) | ✓ | ✓ | ✓ | ✓ (inbox; activity they can see) | |
| Delete permanently, empty Trash, bulk permanent delete | ✓ | ✓ | | | |
| Cleanup rules (archive/trash) · with `delete` action | ✓ · ✓ | ✓ · ✓ | ✓ · | | |

## 2. Use cases

Format: **ID — Name** · Actor · Preconditions · Main flow · Alternatives / errors · Result.

### Onboarding & tenancy

**UC-01 — Sign up and create organization** · Visitor
- Main: sign up (email + password, or Google/GitHub) → verify email → name organization (slug generated) → land on empty overview where Wizi greets and shows the "Connect your first Resend account" card → the `welcome` tour starts (UC-34).
- Alt: user already invited → joins existing org instead of creating one.
- Result: user is Owner of a new org.

**UC-02 — Invite member** · Owner/Admin
- Main: Settings → Members → invite by email, choose role, optionally restrict to projects → invite email sent → invitee accepts (UC-01 alt).
- Errors: email already a member; invitation expired (7 days) → resend.

**UC-03 — Switch organization** · Any member of several orgs
- Main: org switcher in sidebar → sets active organization → all views reload scoped to it.

### Connections

**UC-04 — Connect a Resend account** · Owner/Admin
- Pre: user has a full-access Resend API key.
- Main: Connections → Add → name the connection ("Personal", "Client: Bakery") → paste key → we validate → register webhook → start sync → progress panel shows each resource syncing → checklist appears.
- Alt A: key is sending-only → "This key can only send email. Create a Full access key in Resend → API Keys."
- Alt B: key invalid/revoked → "Resend rejected this key."
- Alt C: key already connected in this org (same Resend team) → blocked, link to existing connection.
- Alt D: no free webhook slot on the account → connection saved as *Needs attention*, explains the plan limit and how to free a slot, retry button.
- Result: connection active, data syncing, events flowing.

**UC-05 — Work the setup checklist** · Owner/Admin/Developer
- Main: connection page lists checks (webhook ok, open tracking, click tracking, receiving/MX, SPF/DKIM, DMARC) → one-click fix for tracking toggles; copyable DNS records + "Check again" for DNS items.
- Result: checklist green; read receipts and inbox become available.

**UC-06 — Rotate or remove a connection** · Owner/Admin
- Rotate: paste a new key → validated against the same Resend team → old key replaced; webhook untouched.
- Remove: confirm by typing the connection name → we delete our webhook in Resend, delete the key, choose to keep or delete synced history.

### Projects & senders

**UC-07 — Create a project** · Owner/Admin
- Main: name, color, pick domains from any connection → insights and inbox can filter by it; member scoping can use it.
- Edge: a domain belongs to at most one project.

**UC-08 — Create a sender** · Owner/Admin/Developer
- Pre: the domain exists in a connected Resend account (so the connection's full-access key can send from it).
- Main: pick domain from the synced list (only sendable domains are selectable) → local part (`support`) → display name → default reply-to, signature → save.
- Alt A: domain was verified in Resend moments ago and is not in the list yet → "Refresh domains" re-syncs that connection's domains.
- Alt B: domain is not in any connected Resend account → "Add domain" link (P1 flow) or instructions to add it in Resend first.
- Alt C: receiving is off on the domain (and on the reply-to domain, if set) → sender saves with the note "Replies won't reach your inbox: receiving is off for xyz.com", linking to the setup checklist and suggesting a reply-to on a receiving-enabled domain.
- Error: domain exists but is not verified → not selectable; shows its status with a link to the domain's DNS records.
- Open item: whether Resend accepts sends from `partially_verified` domains is to be confirmed against the API during setup; until then such domains are not selectable.

**UC-08b — Sender becomes unusable** · System, then Owner/Admin/Developer
- Trigger: the sender's domain is deleted or stops being verified in Resend, its connection needs attention, or Resend rejects a send for the domain.
- Main: sender status changes (e.g. `domain_unverified`) → the sender is greyed out in the composer and senders list with the reason → pending scheduled emails and broadcasts using it are listed under "Needs attention" → their authors and Admins are notified → each item can switch to another sender, be rescheduled, or be canceled.
- Result: when the domain is verified again, the sender returns to active automatically and the notification resolves.

### Sending

**UC-09 — Compose and send an email** · Owner/Admin/Developer/Support
- Main: Compose → choose sender (grouped by project) → recipients (autocomplete from contacts and past correspondents) → subject → mode: Rich text | HTML (split view with live preview, desktop/mobile, light/dark) | Template (pick template, fill variables, preview) → attach files → Send now / Schedule / Send test to me.
- AI: "Suggest subject", "Rewrite", "Shorten".
- Errors: invalid address highlighted; attachment > 40 MB total rejected; sender not active → send blocked with the reason and a sender switcher; Resend rejects the domain → message "xyz.com is no longer verified in Resend", sender marked unusable (UC-08b); other Resend validation errors shown inline; rate limit → queued and retried with a toast.
- Result: email in Activity with status Queued → Sent.

**UC-10 — Manage scheduled emails** · Sender roles
- Main: Scheduled → list with send time → reschedule or cancel.
- Edge: send time already passed (in-flight) → action disabled.

### Inbox

**UC-11 — Read inbound mail** · Owner/Admin/Developer/Support/Viewer
- Pre: receiving enabled on at least one domain.
- Main: Inbox → mailbox list (All, Unassigned, Mine, per project, per address) → thread list with AI summary and category chip → open thread → messages in order, inbound rendered safely with embedded images and remote images shown in place, attachment chips below each message, outbound replies with receipt chips.
- Alt: body still being fetched → skeleton with "Fetching message…", fills in live.

**UC-11b — Download an attachment** · Any member who can read the thread
- Main: click an attachment chip → the file downloads under its exact original name → the thread stays open in the same tab.
- Alt A: image attached but not embedded → thumbnail; click opens a lightbox preview with a Download button.
- Alt B (Free, file over 4 MB) → downloaded from Resend's servers; the browser may use a different name.
- Alt C (Free, Resend no longer has the file) → chip shows "No longer available at Resend"; upgrading keeps files for new mail.

**UC-12 — Reply to a thread** · Sender roles
- Main: Reply / Reply all / Forward → sender defaults to the address that received the message → optional AI draft ("Draft reply") → edit → send.
- Result: reply appears in thread; receipt chip updates Sent → Delivered → Opened live.

**UC-13 — See that a customer read my reply** · Any member with thread access
- Main: `email.opened` for an outbound message in a thread → chip shows "Opened 2m ago" (count on hover) → notification "Jane opened your reply to 'Invoice question'" to the author and assignee.
- Edge: open tracking disabled on that domain → chip shows "Opens not tracked" with a link to the checklist.
- Edge: opened within seconds of delivery from a known proxy pattern → "Opened (likely automatic)".

**UC-14 — Triage: assign, label, archive** · Sender roles
- Main: assign to member, add label, star, archive, mark unread; bulk actions on list.

### Activity & insights

**UC-15 — Investigate an email** · Developer/Admin/Support
- Main: Activity → search by recipient/subject/tag/Resend id → email detail: headers, rendered content, timeline, raw events.

**UC-16 — Look up a recipient** · Developer/Admin/Support
- Main: search `jane@x.com` → everything sent to and received from that address across connections, contact records, suppression status.

**UC-17 — Review email health** · Any non-Support role
- Main: Overview → KPI tiles with sparklines per project → Insights → deliverability, inbound, engagement tabs → filter by date range, connection, project, domain, tag.

### Alerts & notifications

**UC-18 — Create an alert rule** · Owner/Admin/Developer
- Main: Alerts → New rule → preset (bounce rate, complaint, silence, domain status) or custom metric + threshold + window + scope → channels (in-app, email, Slack/Discord webhook) → save.
- Result: incidents open and resolve automatically; each shows AI explanation if enabled.

**UC-19 — Receive and act on notifications** · All members
- Main: bell shows unread count live → notification links to thread/email/incident → mark read / all read.
- Settings: per-type channels, quiet hours.

### Domains & API keys

**UC-20 — Manage domain tracking and DNS** · Owner/Admin/Developer
- Main: Domains → domain → DNS records with status → toggle open/click tracking → "Check DNS now".
- Alert: scheduled check finds drift (e.g. DKIM removed) → notification + incident.

**UC-21 — Create a scoped sending key for a project** · Owner/Admin/Developer
- Main: API keys → New → connection, name, permission `sending_access`, restrict to domain → key shown once with copy button → metadata stored (never the key).

### Audience & marketing

**UC-22 — Manage contacts** · Owner/Admin/Developer
- Main: Contacts → filter by connection/segment/topic → contact detail with properties and engagement timeline → edit, add to segment, update topic subscriptions, unsubscribe → CSV import with column mapping.

**UC-23 — Send a broadcast** · Owner/Admin/Developer
- Main: Broadcasts → New → connection, sender, segment, optional topic → content (HTML/rich text/template) → preview + test send → schedule or send → post-send stats from events.
- Error: segment empty → blocked; unsubscribe link missing → warning (Resend handles `{{{RESEND_UNSUBSCRIBE_URL}}}`).

**UC-24 — Manage templates** · Owner/Admin/Developer
- Main: list across connections → preview with sample variables → edit → duplicate to another connection.

**UC-25 — View automations** · Owner/Admin/Developer/Viewer
- Main: Automations → list per connection → step graph (read-only) → enable/disable → outcome counts from events.

### AI & settings

**UC-26 — Configure AI** · Owner/Admin
- Pre: paid plan (or trial).
- Main: Settings → AI → enable/disable features, see credit usage by feature and member, remaining allowance and pack balance.
- Alt: Free plan → page explains AI is on paid plans, with an upgrade button.

**UC-27 — Review audit log** · Owner/Admin
- Pre: Team or Agency plan.
- Main: filter by actor, action, date → entry detail with before/after where applicable.

### Plans & billing

**UC-28 — Start trial and upgrade** · Owner
- Main: new org starts a 14-day Pro trial automatically (no card; AI capped at 200 credits) → banner shows days left → Settings → Billing → compare plans → choose tier and monthly/annual → Stripe Checkout → back to Billing with the new plan active.
- Alt: trial ends without upgrading → org moves to Free; AI locks; Pro-only features become read-only; notification to Owner 3 days before and on the day.
- Result: `org_settings.plan` updated; limits and features change immediately.

**UC-29 — Hit a plan limit** · Any member who can create the resource
- Main: tries to add a 4th connection on Pro (or a project, alert rule, member invite over the limit) → dialog shows the limit, what the next tier includes, and "Upgrade" (Owner) or "Ask your Owner" (others).
- Alt (Agency, 16th+ connection): dialog "This adds $5/month to your plan" → confirm (Owner) → subscription quantity updated → connection flow continues (UC-04).
- Alt (gated feature, e.g. assignment on Free): control shows a lock and one-line explanation; clicking opens the plan comparison.

**UC-30 — Track usage and overage** · Owner/Admin
- Main: Settings → Usage → tracked emails vs. allowance (transactional / broadcast / inbound), daily chart, projected month-end and projected overage cost, AI credits by feature, resource counts vs. limits.
- Notifications at 80% and 100%; banner from 100%.
- Paid plan over allowance: ingest continues; overage appears on the next invoice.
- Free over allowance: 7-day grace, then excess emails keep 7 days of history; banner explains and offers upgrade.

**UC-31 — Buy AI credit packs** · Owner
- Main: Settings → AI or Billing → "Buy 1,000 credits ($5)" → Stripe Checkout (one-time) → pack balance increases.
- Error: Free plan → not offered; upgrade first.

**UC-32 — Downgrade or cancel** · Owner
- Main: Billing → Manage (Stripe Customer Portal) → choose lower tier or cancel → change is scheduled for period end → summary lists what changes: connections over the new limit (Owner picks which stay active; the rest become read-only), features that become read-only, shorter retention after a 14-day notice.
- Result: at period end the plan changes and the Owner is notified.

**UC-33 — Payment fails** · System, then Owner
- Main: Stripe reports a failed invoice → org `past_due` → banner for Owner with "Update payment method" (Customer Portal) → Stripe retries.
- Alt: still unpaid after 14 days → org moves to Free under the downgrade rules.

### Onboarding tours

**UC-34 — Take a product tour** · Any member
- Trigger: first visit to an org with no connection (`welcome`), first connection synced (`first-look`), or first visit to Inbox, composer, Insights, Alerts, Broadcasts, Usage (feature tours).
- Main: warm overlay spotlights the first target → tour card with Wizi explains it → Next / Back (buttons or arrow keys) → the tour moves across pages when needed → Finish. The `welcome` tour's last step opens the Connect dialog.
- Alt A: Skip tour → recorded as skipped; not shown automatically again.
- Alt B: step targets something the member can't access or the plan doesn't include → step left out; tour doesn't start if fewer than two steps remain.
- Alt C: a dialog or the composer is open → auto tour waits until it closes.
- Result: progress saved per user and org; available again from Help → Tours → Replay.

**UC-35 — Replay a tour** · Any member
- Main: Help menu ("?") → Tours → list with completion checks → Replay → tour starts from step 1.

### Delete & cleanup

**UC-36 — Move to Trash and restore** · Owner/Admin/Developer/Support (within their access)
- Main: in Inbox or Activity, select a thread, a single message, or several rows → Delete (or `#` key) → items leave the list → toast "Moved to Trash · Undo" for 5 seconds.
- Alt A: Undo → items return exactly where they were.
- Alt B: Trash view → select → Restore.
- Result: items stay in Trash 30 days, then are deleted permanently by the system.

**UC-37 — Delete permanently / Empty trash** · Owner/Admin
- Main: Trash → select → "Delete permanently" (or "Empty trash") → dialog: "Deleted from Mailwise for good. Resend keeps its copy until its own retention ends." → confirm.
- Result: emails, bodies, and files removed; they never reappear through sync or late events; insights and usage unchanged; audit log entry.

**UC-38 — Bulk delete by filter** · Owner/Admin (permanent) or members who can trash (to Trash)
- Main: in Inbox or Activity, apply a filter (e.g. from `no-reply@github.com`, older than 30 days) → "Select all 4,812 matching" → Move to Trash (or Delete permanently, confirmed by typing the count) → progress bar; the page stays usable.
- Alt: new mail arriving during the job is not included.

**UC-39 — Cleanup rules and block sender (P1)** · Owner/Admin/Developer (`delete` action: Owner/Admin)
- Main: Settings → Cleanup → New rule → conditions (sender, sender domain, subject, tag, AI category, direction, age) and scope (projects, mailboxes) → action (archive, trash, delete) → preview shows how many existing items match → save.
- Alt: from a thread → "Block sender" → future mail from that address or domain goes straight to Trash, without notifications.
- Result: hourly runs; each rule shows last run and items affected.

**UC-40 — Cancel and delete a scheduled email** · Sender roles
- Main: Scheduled → Delete → Mailwise cancels it in Resend → on success it is removed; if Resend has already sent it, the dialog says so and nothing is deleted.

**UC-41 — Delete Resend objects** · Roles allowed for each object
- Main: delete a contact, segment, topic, template, draft or scheduled broadcast, domain, or API key → dialog states it will also be deleted in Resend → confirm → deleted in Resend, then here.
- Alt: sent broadcast → only "Remove from Mailwise" is offered.

## 3. Pages & routes (derived)

| Route | Purpose | Use cases |
|---|---|---|
| `/` , `/pricing` | Marketing, pricing | — |
| `/sign-in`, `/sign-up`, `/invite/[token]` | Auth | UC-01, UC-02 |
| `/[org]` | Overview: greeting, KPIs, checklist progress, recent activity, open incidents | UC-17 |
| `/[org]/inbox`, `/[org]/inbox/[threadId]` | Inbox and thread view | UC-11–14 |
| `/[org]/inbox/trash`, `/[org]/activity/trash` | Trash for inbox and activity | UC-36–38 |
| `/[org]/settings/cleanup` | Cleanup rules and blocked senders (P1) | UC-39 |
| `/[org]/compose` (also opened as a sheet from anywhere) | Composer | UC-09 |
| `/[org]/scheduled` | Scheduled emails | UC-10 |
| `/[org]/activity`, `/[org]/activity/[emailId]` | Activity log, email detail | UC-15 |
| `/[org]/recipients/[email]` | Recipient lookup | UC-16 |
| `/[org]/insights` | Insights tabs | UC-17 |
| `/[org]/alerts`, `/[org]/alerts/rules/[id]`, `/[org]/alerts/incidents/[id]` | Alerts | UC-18 |
| `/[org]/notifications` | Notification history | UC-19 |
| `/[org]/domains`, `/[org]/domains/[id]` | Domains | UC-20 |
| `/[org]/api-keys` | API keys | UC-21 |
| `/[org]/audience/contacts[/id]`, `/segments`, `/topics`, `/properties` | Audience | UC-22 |
| `/[org]/broadcasts[/id]` | Broadcasts | UC-23 |
| `/[org]/templates[/id]` | Templates | UC-24 |
| `/[org]/automations[/id]` | Automations | UC-25 |
| `/[org]/settings/general`, `/members`, `/projects`, `/connections[/id]`, `/senders`, `/ai`, `/notifications`, `/audit-log` | Settings | UC-02, 04–08, 26, 27 |
| `/[org]/settings/usage` | Usage vs. plan | UC-30 |
| `/[org]/settings/billing` | Plan, trial, checkout, credit packs, Customer Portal link | UC-28, 29, 31–33 |

## 4. Assumptions

1. Users have admin access to their Resend accounts and can create full-access API keys.
2. One connection equals one Resend team; the same team cannot be connected twice in one org, but may be connected in two different orgs (e.g. agency and client).
3. Resend delivers webhooks at least once and not necessarily in order.
4. Open tracking requires enabling it per domain in Resend; we can toggle it via the API.
5. Receiving requires an MX record the user adds at their DNS provider; we cannot automate DNS.
6. Emails sent by the user's own apps (outside our composer) still appear in Activity, because we receive their webhooks.
7. Resend sells transactional plans (emails/month) and marketing plans (contacts) separately; neither quota is exposed by the API, so users enter them manually for usage insights.
8. The AI provider configured by env supports the OpenAI Chat Completions API and structured JSON output.

## 5. Edge cases

| Case | Handling |
|---|---|
| Duplicate webhook delivery | Unique `(connectionId, svixId)`; second insert ignored, 200 returned. |
| Events arrive before the email exists in our DB (sent by another app) | `process-event` upserts a stub `emails` document from event data. |
| Events out of order | Status uses highest rank; timeline sorted by `occurredAt`. |
| Webhook deleted in Resend | Silence check (no events in 24 h while emails were sent recently) or 404 on webhook get → re-register, alert Admins. |
| API key revoked in Resend | Any 401 flips connection to *Needs attention*, pauses jobs, notifies Admins. |
| Resend 429 | Throttled jobs back off using `retry-after`; interactive sends queue with toast "Sending shortly". |
| Inbound raw MIME too large or fetch fails | Retry with backoff (5 attempts); thread shows metadata with "Content unavailable, retry". |
| Malicious inbound HTML | Sanitized + sandboxed iframe (no scripts, no same-origin, no forms). Remote images load automatically (product decision), so senders can detect opens. |
| Embedded image referenced by `cid:` but its attachment is missing | Image slot shows a small "Image unavailable" placeholder; the rest of the message renders. |
| Filename with non-Latin characters, quotes, or slashes | Original name kept (UTF-8 via `filename*`); only path separators and control characters removed. |
| Two attachments with the same filename | Both kept with the same name; downloads are separate by attachment id. |
| Org upgrades from Free | `backfill-storage` copies files of emails Resend still has into our storage; older ones stay unavailable. |
| Org downgrades to Free | Files already stored stay until the shortened retention ends; new mail is served from Resend. |
| Reply to a thread whose domain has no sender | Composer asks to pick or create a sender on that domain. |
| Sender's domain deleted or unverified in Resend | Sender status → `domain_unverified`; composer blocks it; pending scheduled emails and broadcasts flagged; authors and Admins notified (UC-08b). |
| Our domain data is stale at send time | Server action checks sender status first; if Resend still rejects the domain, mark it, trigger a domain sync, show the reason. |
| Domain verified in Resend but not yet synced | `domain.updated` webhook normally syncs it; "Refresh domains" on the sender form as fallback. |
| Sender's domain cannot receive mail | Sender shows "Replies won't reach your inbox"; suggest a reply-to on a receiving-enabled domain. |
| Same domain present in two connected accounts | Not confirmed whether Resend allows it; safe either way, since a sender references one synced domain document and therefore one connection. |
| Same email address on contacts in two connections | Recipient lookup merges by normalized address; contacts stay separate records. |
| Member loses project access while viewing | Next request returns 403; SSE stream closes; UI routes to overview. |
| Connection removed | Webhook deleted in Resend; its data kept or deleted per user choice; related senders disabled. |
| Domain moved between projects | Existing emails keep their original `projectId`; new events use the new mapping. Insights note the change date. |
| Scheduled email canceled in Resend directly | `email.*` events or sync reconcile status to canceled. |
| AI credits exhausted | AI buttons show "Out of AI credits" with a buy-pack link (Owner) or usage link; core features unaffected. |
| AI used on Free | Buttons locked with an upgrade prompt; server rejects with `ai_not_in_plan`. |
| Duplicate or out-of-order `email.sent` events | Email counted once via `emails.meteredAt`. |
| Two members add connections at the same time near the limit | Limit check and creation run in one transaction on the org's connection count; the second gets `plan_limit_reached`. |
| Downgrade leaves more connections than allowed | Owner picks which stay active; the rest become read-only (events still ingested, no sending); their senders show `connection_inactive`. |
| Stripe webhook arrives before the checkout redirect returns | Billing page reads plan state from `org_settings`, updated by the webhook; the return page polls briefly until it changes. |
| Tour target missing (layout changed, element not rendered) | NextStepjs retries the selector; then the step is skipped and a warning goes to Sentry. |
| Member's role changes mid-tour | Next step re-checks access; inaccessible steps are skipped. |
| Tour started on mobile | Card docks as a bottom sheet; spotlight still shown. |
| Open or click event arrives for a permanently deleted email | Counted in insights; email not recreated; no notification. |
| Reply arrives to a permanently deleted message | Starts a new thread (the old Message-ID is remembered only as a hash). |
| Manual re-sync after deletes | Tombstoned emails are skipped. |
| Scheduled email already sent when deleting | Resend refuses the cancel; nothing is deleted and the user is told it was sent. |
| Resend delete fails for a contact/template/etc. | Nothing is removed in Mailwise; error shown with Resend's message. |
| Two members trash and restore the same thread at once | Last action wins; both see the result live. |
| Permanent delete while R2 deletion fails | Records are gone; the job retries the R2 deletion; the bucket's lifecycle rule is the final backstop. |
| Thread partly trashed (one message) | Thread stays in the inbox without that message; the message appears in Trash with its thread subject. |
| Stripe usage report fails | `report-usage` retries with the same idempotency key; `usage_periods.overage.reportedToStripe` prevents double billing. |
| Prompt injection in inbound mail | Content passed as quoted data; AI output is only a suggestion; no tool access. |
| Very high volume org | Rollups keep dashboards constant-time; raw events expire per plan retention (TTL). |
| Org deleted | Soft-delete 30 days, then webhooks removed in Resend and all org data purged. |
