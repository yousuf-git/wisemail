import AxeBuilder from "@axe-core/playwright";
import { expect, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";

/** Unique-per-call suffix so specs never collide in the shared e2e database (parallel workers). */
let counter = 0;
export function uid(prefix = "t"): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${process.pid.toString(36)}${counter}`;
}

export const PASSWORD = "Passw0rd!long-enough";

export type Account = { name: string; email: string; password: string };

export function newAccount(label = "user"): Account {
  const id = uid(label);
  return { name: `Sam ${id}`, email: `${id}@example.com`, password: PASSWORD };
}

/** Fills the sign-up form and waits for the "check your inbox" screen. */
export async function signUp(page: Page, account: Account, next?: string) {
  await page.goto(next ? `/sign-up?next=${encodeURIComponent(next)}` : "/sign-up");
  await page.getByLabel("Your name").fill(account.name);
  await page.getByRole("textbox", { name: "Email" }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByTestId("verify-notice")).toBeVisible();
}

/** Opens the confirmation link Wisemail "sent" to `email` (fake mode lands in /dev/outbox). */
export async function verifyFromOutbox(page: Page, email: string, kind?: string) {
  const href = await outboxLink(page, email, kind);
  await page.goto(href);
}

/** Reads the newest link in the dev outbox addressed to `email` (optionally of one `kind`). */
export async function outboxLink(page: Page, email: string, kind?: string): Promise<string> {
  await expect(async () => {
    await page.goto("/dev/outbox");
    let rows = page.getByTestId("outbox-row").filter({ hasText: email });
    if (kind) rows = rows.and(page.locator(`[data-kind="${kind}"]`));
    await expect(rows.first()).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  let rows = page.getByTestId("outbox-row").filter({ hasText: email });
  if (kind) rows = rows.and(page.locator(`[data-kind="${kind}"]`));
  const href = await rows.first().getByTestId("outbox-link").getAttribute("href");
  if (!href) throw new Error(`no link in the outbox for ${email}`);
  return href;
}

/**
 * Reads the newest one-time code in the dev outbox addressed to `email` (of `kind`), in a second
 * tab so the page that asked for it stays where it is.
 */
export async function outboxCode(page: Page, email: string, kind: string): Promise<string> {
  const tab = await page.context().newPage();
  try {
    const rows = () =>
      tab
        .getByTestId("outbox-row")
        .filter({ hasText: email })
        .and(tab.locator(`[data-kind="${kind}"]`));
    await expect(async () => {
      await tab.goto("/dev/outbox");
      await expect(rows().first()).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    const code = (await rows().first().getByTestId("outbox-code").textContent())?.trim();
    if (!code || !/^\d{6}$/.test(code))
      throw new Error(`no 6-digit code in the outbox for ${email}`);
    return code;
  } finally {
    await tab.close();
  }
}

/** Types a code into the segmented input (digit by digit, like a person). */
export async function typeCode(page: Page, code: string) {
  await page.getByLabel("Digit 1 of 6").click();
  await page.keyboard.type(code);
}

/** Sign-up, verify and create a workspace; resolves with the org slug (page is on its overview). */
export async function createWorkspace(
  page: Page,
  options: { account?: Account; plan?: "free" | "pro" | "team" | "agency" } = {},
): Promise<{ account: Account; slug: string; name: string }> {
  const account = options.account ?? newAccount();
  await signUp(page, account);
  await verifyFromOutbox(page, account.email, "verify-email");
  await page.waitForURL(/\/onboarding/);
  const name = `Bakery ${uid("w")}`;
  await page.getByLabel("Workspace name").fill(name);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.waitForURL((url) => !/onboarding|sign-/.test(url.pathname), { timeout: 30_000 });
  const slug = new URL(page.url()).pathname.split("/")[1]!;
  if (options.plan && options.plan !== "free") await setPlan(page, slug, options.plan);
  return { account, slug, name };
}

export async function setPlan(page: Page, orgSlug: string, plan: "free" | "pro" | "team" | "agency") {
  const res = await page.request.post("/api/e2e/seed", { data: { kind: "plan", orgSlug, plan } });
  expect(res.ok(), await res.text()).toBeTruthy();
}

export async function signIn(page: Page, account: Account) {
  await page.goto("/sign-in");
  await page.getByRole("textbox", { name: "Email" }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
}

/**
 * Clicks until `expected` is visible. The dev server hydrates late, and a click before hydration
 * is silently lost, so retrying is the robust way to open dialogs and menus.
 */
export async function clickUntilVisible(trigger: Locator, expected: Locator) {
  await expect(async () => {
    await trigger.click({ timeout: 3_000 });
    await expect(expected).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
}

/** Opens Settings -> Connections -> Connect dialog. */
export async function openConnectDialog(page: Page, slug: string) {
  await page.goto(`/${slug}/settings/connections`);
  await clickUntilVisible(
    page.locator('[data-tour="connections-add"]').first(),
    page.getByRole("heading", { name: "Connect a Resend account" }),
  );
}

/** Connects a fake Resend account from Settings -> Connections and returns its id. */
export async function connectResend(
  page: Page,
  slug: string,
  options: { name?: string; team?: string; flags?: string } = {},
): Promise<{ id: string; key: string; team: string; name: string; domain: string }> {
  const team = options.team ?? uid("acme");
  // `allgood`: every fake domain verified, receiving and both trackings on.
  const key = `re_${team}_${options.flags ?? "allgood"}`;
  const name = options.name ?? `Acme ${team}`;
  await openConnectDialog(page, slug);
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Full access API key").fill(key);
  await page.getByRole("button", { name: "Connect account" }).click();
  await expect(page.getByText(`Connected “${name}”`)).toBeVisible({ timeout: 30_000 });
  const card = page.getByRole("article", { name });
  await expect(card).toBeVisible({ timeout: 30_000 });
  const id = (await card.getAttribute("id"))!.replace("connection-", "");
  await page.goto(`/${slug}/settings/connections/${id}`);
  return { id, key, team, name, domain: `${team}.example.com` };
}

/** Waits until the connection's first sync settled (domains are needed for senders). */
export async function waitForSync(page: Page) {
  await expect(page.getByTestId("sync-status")).toContainText(/Synced/, { timeout: 60_000 });
}

/** Creates `<local>@<domain>` from Settings -> Senders. */
export async function createSender(page: Page, slug: string, domain: string, local = "support") {
  await page.goto(`/${slug}/settings/senders`);
  await clickUntilVisible(
    page.getByRole("button", { name: "New sender" }).first(),
    page.getByRole("heading", { name: "New sender" }),
  );
  await page.getByLabel("Domain").click();
  await page.getByRole("option", { name: domain, exact: true }).click();
  await page.getByLabel("Address").fill(local);
  await page.getByRole("button", { name: /^Create/ }).click();
  await expect(page.getByText(`Created ${local}@${domain}`)).toBeVisible();
  return `${local}@${domain}`;
}

/** Posts a signed, real-path webhook (via the test-only seed route) and waits for ingest to accept. */
export async function seedInbound(
  page: Page,
  input: { connectionId: string; apiKey: string; from: string; to: string; subject: string; text?: string },
) {
  const res = await page.request.post("/api/e2e/seed", {
    data: {
      kind: "inbound",
      connectionId: input.connectionId,
      apiKey: input.apiKey,
      from: input.from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  const json = (await res.json()) as { ingest: { status: number } };
  expect(json.ingest.status).toBeLessThan(300);
}

export async function seedEvent(
  page: Page,
  input: { connectionId: string; type: string; subject: string; count?: number },
) {
  const res = await page.request.post("/api/e2e/seed", { data: { kind: "event", ...input } });
  expect(res.ok(), await res.text()).toBeTruthy();
}

/** A second, isolated browser session (its own cookies). */
export async function newSession(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

/** Fails on serious or critical axe violations and prints what they are. */
export async function expectNoSeriousA11y(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const summary = bad.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\n    ` +
      v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(" "))
        .join("\n    "),
  );
  expect(bad, `${label}: accessibility violations\n${summary.join("\n")}`).toEqual([]);
}

/** A workspace with a Pro plan, a synced fake Resend account and a sender: what mail specs need. */
export async function mailWorkspace(page: Page, options: { plan?: "pro" | "team" | "agency" } = {}) {
  const ws = await createWorkspace(page, { plan: options.plan ?? "pro" });
  const conn = await connectResend(page, ws.slug);
  await waitForSync(page);
  const mailbox = await createSender(page, ws.slug, conn.domain);
  return { ...ws, conn, mailbox };
}

/** Fills the full-page composer (`/compose`). Does not press Send. */
export async function fillCompose(
  page: Page,
  slug: string,
  input: { to: string; subject: string; body: string },
) {
  await page.goto(`/${slug}/compose`);
  const composer = page.locator('[data-slot="composer"]');
  await expect(composer).toBeVisible();
  const to = composer.getByRole("textbox", { name: /^To/ });
  await expect(async () => {
    await to.fill(input.to);
    await to.press("Enter");
    await expect(composer.getByTestId("address-pill")).toHaveCount(1, { timeout: 1_500 });
  }).toPass({ timeout: 20_000 });
  await composer.getByLabel("Subject").fill(input.subject);
  const editor = composer.locator('[contenteditable="true"]').first();
  await editor.click();
  await page.keyboard.type(input.body);
  return composer;
}
