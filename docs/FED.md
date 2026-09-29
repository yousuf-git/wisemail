# FED — Mailwise (Front-End Design)

> **Status:** Draft v0.1, 2026-09-29
> **Direction:** Warm, tactile minimalism · approachable companion · progressive disclosure · floating utility dock
> **Related:** `PRD.md`, `TRD.md`

---

## 1. Design philosophy

Email operations are technical: DNS records, bounce codes, webhook events. The interface makes them feel calm and collaborative instead of intimidating.

1. **Warm, tactile minimalism.** Cream canvas instead of stark white; white surfaces float above it on soft, warm shadows rather than hard borders. Generous corner radii soften dense data.
2. **Approachable companion.** **Wizi**, an envelope character, greets people, explains empty states, and celebrates milestones. Copy speaks as a partner: *"What are we sending today?"*
3. **Progressive disclosure.** No blank canvases. Every empty view shows the next concrete step (connect an account, enable open tracking, add an MX record) with a small preview of what it unlocks. Technical detail (headers, raw payloads, DNS values) sits one click deeper.
4. **Distinct functional hierarchy.** A floating sidebar dock groups navigation by purpose; controls sit at the edges of the element they affect (composer settings live in the composer's bottom bar, not in a separate panel).
5. **Answers before logs.** Summary first (KPI tile with sparkline and delta), detail on demand (table, timeline, raw event).
6. **Alive, not busy.** Icons, Wizi, numbers, and status chips respond to the user and to live data with short micro-animations (see §9), so the app feels awake without anything moving on its own for no reason.

## 2. Color system

All colors are CSS variables mapped into Tailwind v4 `@theme`. Components use semantic tokens only, never raw hex.

### 2.1 Light (default)

| Token | Hex | Use |
|---|---|---|
| `--canvas` | `#F8F7F4` | App background |
| `--canvas-sunken` | `#F1EFEA` | Wells, table header, code blocks, hover on canvas |
| `--surface` | `#FFFFFF` | Sidebar dock, cards, composer, popovers |
| `--surface-raised` | `#FFFFFF` + shadow `lg` | Dialogs, command palette |
| `--ink` | `#1F1E1C` | Primary text, active icons |
| `--ink-secondary` | `#52504B` | Body copy in dense areas |
| `--ink-muted` | `#74737A` | Descriptions, placeholders, section labels |
| `--ink-faint` | `#A3A1A8` | Disabled, tertiary metadata |
| `--line` | `#ECEAE4` | Dividers, card edges |
| `--line-strong` | `#DDDAD2` | Input borders, focused table rows |
| `--accent` | `#0EA5E9` | Brand: primary buttons, links, selected nav, the mascot's seal |
| `--accent-hover` | `#0284C7` | |
| `--accent-soft` | `#E6F6FE` | Selected rows, accent chips background |
| `--accent-ink` | `#FFFFFF` | Text on accent |
| `--glow` | `#F59E0B` | Warm interaction glow (composer focus ring, upgrade pill, Wizi's cheeks) |
| `--glow-soft` | `rgba(245,158,11,0.16)` | Ambient glow behind the composer and hero cards |
| `--coral` | `#E07A5F` | Secondary warm accent: highlights, illustration details |

### 2.2 Semantic (email states)

Separate from the brand accent. Each has a solid (icons, chart lines), a soft background (chips), and an ink color (chip text).

| State | Solid | Soft | Ink | Used for |
|---|---|---|---|---|
| `success` | `#10B981` | `#E8F8F1` | `#047857` | Delivered, verified, healthy |
| `info` | `#0EA5E9` | `#E6F6FE` | `#0369A1` | Sent, queued, scheduled |
| `engaged` | `#8B5CF6` | `#F1ECFE` | `#6D28D9` | Opened, clicked (read receipts) |
| `warning` | `#F59E0B` | `#FEF4E2` | `#B45309` | Delivery delayed, pending DNS, soft bounce |
| `danger` | `#EF4444` | `#FDECEC` | `#B91C1C` | Bounced, failed, complained, unverified |
| `neutral` | `#A3A1A8` | `#F1EFEA` | `#52504B` | Suppressed, canceled, draft |

Opened/clicked get their own violet `engaged` color so read receipts stand out from delivery states in timelines and thread chips.

### 2.3 Warm dark mode

Warm charcoal, not blue-black. Surfaces get lighter as they rise instead of relying on shadows.

| Token | Dark hex |
|---|---|
| `--canvas` | `#1A1917` |
| `--canvas-sunken` | `#151412` |
| `--surface` | `#242320` |
| `--surface-raised` | `#2D2B28` |
| `--ink` | `#F2EFE9` |
| `--ink-secondary` | `#CFCBC3` |
| `--ink-muted` | `#A09D96` |
| `--ink-faint` | `#6E6B65` |
| `--line` | `#34322E` |
| `--line-strong` | `#44413C` |
| `--accent` | `#38BDF8` (lifted for contrast) |
| `--accent-hover` | `#7DD3FC` |
| `--accent-soft` | `rgba(56,189,248,0.14)` |
| `--accent-ink` | `#0B1A22` |
| `--glow-soft` | `rgba(245,158,11,0.12)` |

Semantic soft backgrounds in dark mode use the solid color at 14% alpha; inks use the 300-level tint (e.g. success ink `#6EE7B7`).

Theme: follows system by default; user toggle (Light / Dark / System) in the account menu, stored per user. Rendered email HTML always gets a white "paper" background in both themes, with an optional "preview dark" toggle, because most emails are designed for white.

### 2.4 Charts

Series order: `accent`, `engaged`, `success`, `glow`, `coral`, `neutral`. Grid lines use `--line`; axis labels `--ink-faint`; area fills use the series color at 12% opacity with a 1.5 px line; the latest point is marked with a 3 px dot.

## 3. Typography

| Role | Family | Fallback |
|---|---|---|
| UI & headings | **Plus Jakarta Sans** (variable, 400–800) | `Inter, system-ui, sans-serif` |
| Numbers & code | **Geist Mono** | `ui-monospace, SFMono-Regular, monospace` |

Loaded with `next/font/google`. All numeric displays use `font-variant-numeric: tabular-nums`. IDs, DNS values, headers, and raw JSON use Geist Mono.

### Type scale (rem at 16 px root)

| Token | Size / line-height | Weight | Tracking | Use |
|---|---|---|---|---|
| `display` | 2.25 / 2.5 | 700 | -0.025em | Greeting on overview ("Good morning, Sam. What are we sending today?") |
| `h1` | 1.75 / 2.125 | 700 | -0.02em | Page titles |
| `h2` | 1.25 / 1.75 | 600 | -0.01em | Section and card titles |
| `h3` | 1.0625 / 1.5 | 600 | -0.005em | Sub-sections, dialog titles |
| `body` | 0.9375 / 1.5 | 400 | 0 | Default text (15 px) |
| `body-sm` | 0.8125 / 1.25 | 400–500 | 0 | Tables, metadata, sidebar items |
| `label` | 0.75 / 1rem | 600 | 0.06em, uppercase | Section labels in sidebar and cards |
| `metric` | 1.75 / 2 | 700 | -0.02em, tabular | KPI numbers |
| `mono-sm` | 0.8125 / 1.25 | 400 | 0 | IDs, DNS, code |

Headings use `text-wrap: balance`; reading text is capped at 68ch (thread view, docs panels).

## 4. Shape, depth, spacing

- **Radii:** `sm 8px` (inputs inside toolbars, chips' inner), `md 12px` (buttons, inputs), `lg 16px` (cards, table containers), `xl 22px` (hero cards, composer capsule, sidebar dock), `full` (pills, avatars, status chips).
- **Shadows** (warm-tinted, never grey-blue):
  - `sm`: `0 1px 2px rgba(60,45,20,0.06)`
  - `md`: `0 1px 0 var(--line), 0 12px 28px -14px rgba(60,45,20,0.14)`
  - `lg`: `0 24px 60px -20px rgba(60,45,20,0.22)`
  - `glow`: `0 0 0 6px var(--glow-soft), 0 12px 32px -12px rgba(245,158,11,0.28)` — composer focus, primary call-to-action cards
- Borders are used only where shadows would be unclear (inputs, tables). Cards rely on shadow `md` plus a 1 px `--line` edge.
- **Spacing:** 4 px base; common steps 4, 8, 12, 16, 20, 24, 32, 48. Page gutter 24 px desktop, 16 px mobile. Card padding 20–24 px.
- **Density:** tables and the thread list use 44 px rows (comfortable) with a compact 36 px option in settings.

## 5. Layout

```
┌────────────┬──────────────────────────────────────────────────────┐
│  Floating  │  Top bar: breadcrumb · global search (⌘K) · bell · + │
│  dock      ├──────────────────────────────────────────────────────┤
│ (surface,  │                                                      │
│  xl radius,│   Page content on --canvas                           │
│  12px from │   max-width 1280px (inbox: full width, 3 panes)      │
│  edges)    │                                                      │
└────────────┴──────────────────────────────────────────────────────┘
```

**Sidebar dock** (240 px, collapsible to 72 px icon rail), grouped:
1. **Top:** org switcher · primary button **Compose** · Inbox (unread count) · Notifications.
2. **Mail:** Overview · Inbox · Scheduled · Activity.
3. **Audience:** Contacts · Segments & topics · Broadcasts · Templates · Automations.
4. **Health:** Insights · Alerts · Domains · API keys.
5. **Bottom tile (grounded):** connection health dots (one per Resend account), plan name chip, tracked emails this period vs. allowance bar, AI credits left (paid plans) or an "Upgrade" pill with the amber glow (Free and trial), trial days left during the trial, user avatar and menu.

**Inbox:** three panes — mailboxes (collapsible) · thread list (380 px) · thread view. Below 1024 px becomes list → detail navigation.

**Mobile (< 768 px):** dock becomes a bottom tab bar (Overview, Inbox, Compose, Activity, More); composer opens full-screen; tables become stacked cards.

## 6. Components & tone

- **Buttons:** primary = accent fill, `md` radius, 40 px height; secondary = surface with `--line-strong` border; ghost for toolbars; destructive = danger solid only inside confirmation dialogs.
- **Status chips:** pill, soft background + ink text + 6 px solid dot. Read receipts in threads show a mini progression: `Sent · Delivered · Opened 2m ago` with the reached step bold and `engaged` colored.
- **KPI tile:** label, metric, delta chip (↑/↓ with success/danger relative to whether up is good), 32 px tall sparkline under it. Click opens the insight.
- **Setup checklist card:** progress ring + items with state icons; each incomplete item has one clear action button and a short "unlocks: read receipts" note.
- **Composer capsule:** large white rounded (`xl`) card with warm `glow` on focus. Subject and body take the space; sender, recipients, mode switch (Rich · HTML · Template), attachments, schedule, and AI actions live in the capsule's bottom bar as pills. HTML mode splits the capsule: CodeMirror left, live preview right with Desktop/Mobile and Light/Dark toggles.
- **Recommended actions grid** (overview, empty states): 2-column cards with a small illustrated preview of the result (e.g. a mini thread with an "Opened" chip for "Turn on read receipts").
- **Tables:** sticky header on `--canvas-sunken`, row hover `--canvas-sunken`, selected `--accent-soft`, right-aligned tabular numbers, row click opens a side sheet before a full page.
- **Timeline:** vertical line with state-colored nodes; each node shows the event, relative time, and exact timestamp on hover; raw JSON expandable in mono.
- **Toasts:** bottom-center, surface, short verb-first copy ("Email scheduled for 9:00").
- **Dialogs:** destructive confirmations require typing the resource name for connections and domains.
- **Code/DNS values:** mono on `--canvas-sunken`, copy button on hover.
- **Message body:** embedded images render in place at their natural size, capped to the message width; while loading they hold their space with a warm skeleton so text doesn't jump. A missing embedded image shows a small "Image unavailable" placeholder.
- **Attachment chips:** below each message, a wrapping row of `lg`-radius chips: file-type icon (PDF, doc, sheet, archive, image, other), the **exact original filename** (middle-truncated with the full name in a tooltip, e.g. `Quarterly-rep…final.pdf`), and size in muted text. Hover lifts the chip and animates the download arrow down (§9.3). Click downloads in place: the chip shows a brief progress ring, then a check; the thread does not move. Unavailable files show the chip dimmed with "No longer available". A "Download all" link appears for 3+ files.
- **Image attachments** (not embedded): 96 px rounded thumbnails in the same row; click opens a lightbox with the image, filename, and a Download button.
- **Bulk selection bar:** when rows are selected, a floating `surface` bar (shadow `lg`, `xl` radius) rises from the bottom: "12 selected · Select all 4,812 matching", then Archive, Move to Trash, and (Owner/Admin in Trash) Delete permanently. Long jobs show a progress ring in the bar and can run while the user keeps working.
- **Trash:** a mailbox at the bottom of the Inbox and Activity lists, with a muted trash icon and item count. Rows show "Deletes permanently in 12 days" in `--ink-faint`. Header actions: Restore, Delete permanently, Empty trash. Empty state: Wizi (Inbox zero pose) "Trash is empty".
- **Delete feedback:** trashed rows collapse (height and opacity, 200 ms) and a toast "Moved to Trash · Undo" stays 5 seconds with a shrinking progress line. Restored rows slide back in with the arrival highlight.
- **Permanent delete dialog:** `danger` icon, plain text "Deleted from Mailwise for good. Resend keeps its copy until its own retention ends.", count of items and files; bulk permanent delete asks the user to type the count. The primary button is `danger` solid ("Delete 4,812 emails").
- **Usage meter:** horizontal bar split into three segments (transactional `accent`, broadcast `engaged`, inbound `success`) against the allowance; a dashed marker for the projected month-end total. Bar turns `warning` from 80% and `danger` past 100%, with the label "Over by 12,400 · est. $2 overage".
- **Plan banners:** full-width, below the top bar, one at a time by priority: payment failed (`danger` soft) → over allowance (`warning` soft) → trial ending (`accent` soft). Each has one action (Update payment, View usage, Choose a plan) and can be dismissed for 24 h, except payment failed.
- **Locked feature:** the control stays visible at normal size with a small lock icon and `--ink-faint` label; hover or click opens a popover naming the plan that includes it ("Assignment is on Pro and above") with a "See plans" button for Owners, or "Ask your Owner" for others. Never hide a gated feature entirely.
- **Limit dialog:** Wizi (Thinking pose) at 64 px, "You've connected 3 of 3 Resend accounts on Pro", a two-column comparison of the current and next tier, primary "Upgrade to Team". Agency extra connection: same dialog with "This adds $5/month" and "Add connection" as the primary action.
- **Plan comparison:** four tier cards in a row (stacked on mobile), current plan outlined in `accent`, recommended next tier with the amber `glow` shadow; monthly/annual toggle showing the annual saving.

## 7. Mascot — Wizi the envelope

Wizi is a cream paper envelope with rounded corners, a sky-blue wax seal (the brand accent) with a check mark, dot eyes, a small smile, amber cheek blush, thin charcoal arms and legs, and sky-blue shoes. Character sheet: https://claude.ai/artifact/8KfaVLHiWXmNidZQ41gPBa. Original pigeon vs. envelope comparison: https://claude.ai/artifact/WHLXcNpLBkSRgLCyWrMQDT (option B). Final illustration to be produced by an illustrator from this spec.

| State | Pose | Where |
|---|---|---|
| **Hello** | Waving, flap closed | Overview greeting, sign-in |
| **Sent** | Happy closed eyes, motion lines | Send/schedule success, broadcast sent |
| **Opened** | Flap open, letter peeking out, surprised eyes, sparkles | Read-receipt notifications, "turn on open tracking" card |
| **Inbox zero** | Sleeping, "z z" | Empty inbox, no incidents |
| **Thinking** | Hand on chin, dotted thought bubble | Syncing, AI generating |
| **Worried** | Small frown, seal tilted | Error pages, connection needs attention |
| **Detective** | Magnifier | Search with no results, recipient lookup empty |

Rules:
- Wizi appears at most **once per view**, only in greetings, empty states, onboarding, success moments, and errors. Never in dense tables or next to data that needs attention.
- Sizes: 160 px (onboarding/empty), 64 px (greeting), 24 px (toasts, favicon variant uses seal only).
- Built as React SVG components with CSS-variable colors so they follow the theme; the envelope body stays cream in dark mode.
- **Contrast on light surfaces:** Wizi mostly sits on white cards and toasts, so in light mode the envelope is warm cream (`#FFF9EE`, flap `#F6E4BE`) with a 2.5 px warm-charcoal outline (`#3A342C`) and soft fold lines (`#D9C7A2`). In dark mode it keeps the pale paper (`#F7F4EE`, flap `#E9E3D6`) with a light outline (`#CFC7B6`), which already stands out on charcoal.
- Animated with Motion variants on the SVG parts (arms, eyes, flap, seal); see §9.3 for the behaviors. If the final illustration comes as a rigged animation file, Rive can replace the SVG later without changing where Wizi appears.

## 8. Voice & copy

- Partner voice, plain words: "What are we sending today?", "Let's connect your first Resend account."
- Name things by what people recognize: "Read receipts" (not "open tracking webhook"), "Inbox" (not "receiving"). Technical term follows in muted text where useful: "Read receipts · uses Resend open tracking".
- Buttons state the action: "Connect account", "Turn on read receipts", "Send now", "Schedule".
- Errors say what happened and what to do: "Resend rejected this key. Create a Full access key in Resend → API Keys and paste it here."
- Honest metrics: "Open rate (estimated)" with a tooltip about privacy proxies.

## 9. Motion & micro-interactions

The app should feel live, the way Resend's and Groq's interfaces do: icons react when you point at them, numbers roll when they change, new data arrives with a small, clear signal.

### 9.1 Principles
- **Animate on intent or on real change.** Hover, focus, press, or a live data update triggers motion. The only ambient motion is Wizi's idle blink and the live-connection dot.
- **Short and physical.** Springs for icons and chips (`stiffness 320, damping 22`); 150–400 ms for everything else. Easing for tweens `cubic-bezier(0.2, 0.8, 0.2, 1)`.
- **One thing moves at a time** in a given element: an icon animation replaces, not stacks with, a background change.
- **The whole target triggers it.** Hovering or keyboard-focusing a nav item or button animates its icon, not just hovering the 16 px glyph.
- **Transform and opacity only**, so animations stay at 60 fps on long tables.
- **Reduced motion:** under `prefers-reduced-motion`, transforms and path animations are off; color and opacity changes remain, numbers switch without rolling.

### 9.2 Durations
| Interaction | Duration |
|---|---|
| Hover, press (scale 0.97) | 120–150 ms |
| Icon hover animation | 350–500 ms, spring |
| Popovers, chips, tooltips | 200 ms |
| Sheets, dialogs | 280 ms |
| Live row arrival highlight | 1.2 s accent-soft fade |
| Number roll | 600 ms |

### 9.3 Catalog
**Animated icons (lucide-animated, see `TRD.md`).** Each nav and primary-action icon has a hover animation tied to its meaning. Where lucide-animated has the icon, use its animation (adjusted to the timing above); where it doesn't, build one in the same pattern (a Motion-wrapped Lucide SVG in `components/icons/animated/`):

| Icon | Where | Animation |
|---|---|---|
| Inbox tray | Sidebar, Inbox | Tray dips and a letter drops in |
| Send / paper plane | Compose, Send button | Plane lifts off to the top-right and returns |
| Bell | Notifications | Rings (rotates ±12°, 3 swings); rings once by itself when a new notification arrives |
| Chart bars | Insights | Bars regrow from zero in sequence |
| Activity / pulse | Activity | Line draws left to right |
| Calendar-clock | Scheduled | Clock hand sweeps |
| Users | Audience | Figures nudge apart |
| Megaphone | Broadcasts | Short shake with sound lines |
| Globe | Domains | Rotates 30° |
| Key | API keys | Turns like in a lock |
| Siren / alert triangle | Alerts | Blinks once |
| Settings gear | Settings | Rotates 90° |
| Sparkles | AI actions | Sparkles twinkle |
| Copy | Copy buttons | Two sheets separate; morphs to a check on success |
| Download | Attachment chips | Arrow drops into the tray; morphs to a check when the download starts |
| Trash | Delete buttons, Trash mailbox | Lid lifts and settles |
| Undo | Undo toast | Arrow curls back |
| Refresh | "Check again", sync | Spins one turn; keeps spinning while pending |
| Chevron | Expanders | Rotates to open state |

Icons without a bespoke animation get a default: lift 1 px and a 4° tilt.

**Wizi (Motion variants on SVG parts).**
- Idle: blinks every 4–7 s (random), slow 1 px breathing on the body. Only while visible on screen.
- Hover (or tap on mobile): waves, cheeks brighten.
- Greeting: one wave on overview load, once per session.
- Sent: seal presses down like a stamp, motion lines streak.
- Opened: flap flips open, letter rises, two sparkles.
- Thinking (syncing, AI): thought-bubble dots pulse in sequence until done.
- Worried: seal tilts, small shake once.
- Inbox zero: "z" letters float up slowly.

**Data and state.**
- Numbers (KPIs, counters, usage) roll between values with NumberFlow; unread badges pop (scale 1 → 1.15 → 1) when they increase.
- Sparklines and small charts draw in on first view only, not on every refetch.
- Status chips cross-fade to the new state; the read-receipt progression fills the next step and the "Opened" chip does one soft pulse in `engaged`.
- New threads, events, and notifications slide in 8 px from the top with the arrival highlight.
- **Live indicator:** a small dot next to the org name pulses gently while the realtime stream is connected; it turns grey and stops when disconnected, with a tooltip.
- Toasts spring up from the bottom; progress rings animate to their value.
- Buttons scale to 0.97 on press; primary buttons show a spinner that morphs back to the label.
- Skeletons use a warm shimmer (`--canvas-sunken` → `--canvas`).

**Not animated:** page transitions, parallax, background loops, table rows on hover (only their icons), anything in the rendered email.

## 9A. Product tour

Guided tours for new users, built with NextStepjs (see `TRD.md`) and styled to this system.

- **Tour card:** `surface` card, `xl` radius, shadow `lg`, max width 360 px. Wizi at 64 px in the top-left corner, in a pose matching the step (Hello on the first step, Opened on the read-receipts step, Sent on the last). Title `h3`, body `body`, footer with step dots, "Back", primary "Next" / "Finish", and a quiet "Skip tour" link.
- **Spotlight:** the target gets a cut-out in a warm overlay (`rgba(31,30,28,0.55)` light, `rgba(0,0,0,0.65)` dark) with `lg` radius and a 6 px amber `glow` ring. The spotlight glides between targets (280 ms); the card springs into place.
- **Mobile:** the card docks as a bottom sheet; spotlight stays.
- **Copy:** one idea per step, two sentences at most, written in Wizi's partner voice: "This is your inbox. Replies you send show when they're opened."
- **Launcher:** Help menu (the "?" in the top bar) lists available tours with a check next to completed ones and "Replay".
- **Checklist tie-in:** finishing a tour step that corresponds to a setup item (e.g. "Turn on read receipts") links straight to that action.
- Reduced motion: no gliding, card appears in place.

## 10. Accessibility

- WCAG 2.2 AA contrast for all text in both themes (muted text checked on `--canvas` and `--surface`).
- State is never color-only: chips carry text labels and icons.
- Full keyboard support: inbox shortcuts (`j/k` navigate, `r` reply, `e` archive, `#` move to Trash, `z` undo, `x` select, `c` compose, `/` search, `⌘K` palette), visible 2 px accent focus ring offset from the element.
- Charts have accessible summaries ("Bounce rate 1.2%, down 0.4 points from last week").
- Email content iframe gets a title; the dark preview toggle is a labeled button. Attachment chips are buttons with accessible names ("Download Quarterly-report-final.pdf, 2.4 MB").

## 11. Tailwind v4 token sketch

```css
@import "tailwindcss";

@theme {
  --font-sans: "Plus Jakarta Sans", Inter, system-ui, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, monospace;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 22px;
  --color-canvas: var(--canvas);
  --color-surface: var(--surface);
  --color-ink: var(--ink);
  --color-ink-muted: var(--ink-muted);
  --color-line: var(--line);
  --color-accent: var(--accent);
  --color-glow: var(--glow);
  --color-engaged: var(--engaged);
  /* …remaining semantic tokens */
}

:root {
  --canvas: #F8F7F4; --surface: #FFFFFF; --ink: #1F1E1C; --ink-muted: #74737A;
  --line: #ECEAE4; --accent: #0EA5E9; --glow: #F59E0B; --engaged: #8B5CF6;
}
.dark {
  --canvas: #1A1917; --surface: #242320; --ink: #F2EFE9; --ink-muted: #A09D96;
  --line: #34322E; --accent: #38BDF8; --engaged: #A78BFA;
}
```
