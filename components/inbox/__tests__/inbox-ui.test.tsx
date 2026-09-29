import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/app/(app)/[orgSlug]/inbox/actions", () => ({
  retryInboundAction: vi.fn(),
}));

import { MessageCard } from "../message-card";
import { AttachmentChips } from "../attachment-chips";
import { EmailFrame } from "../email-frame";
import { ReceiptSteps } from "../receipt-steps";
import { ThreadRow } from "../thread-row";
import { useMailShortcuts, type MailShortcutHandlers } from "../use-mail-shortcuts";
import type { AttachmentDTO, MailListRowDTO, MessageDTO, ReceiptSummaryDTO } from "@/lib/dto/mail";

afterEach(cleanup);

const NOW = Date.parse("2026-09-29T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("EmailFrame", () => {
  it("renders the body in an iframe with exactly the allowed sandbox tokens", () => {
    render(<EmailFrame title="Message from jane" html="<p>Hello</p>" text={null} />);
    const frame = screen.getByTitle("Message from jane") as HTMLIFrameElement;
    expect(frame.tagName).toBe("IFRAME");
    expect(frame.getAttribute("sandbox")).toBe("allow-popups allow-popups-to-escape-sandbox");
    const tokens = frame.getAttribute("sandbox")!.split(" ");
    for (const forbidden of [
      "allow-scripts",
      "allow-same-origin",
      "allow-forms",
      "allow-top-navigation",
    ]) {
      expect(tokens).not.toContain(forbidden);
    }
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
    const doc = frame.getAttribute("srcdoc")!;
    expect(doc).toContain(
      `http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'"`,
    );
    expect(doc).toContain("<p>Hello</p>");
    expect(frame.hasAttribute("src")).toBe(false);
  });

  it("falls back to escaped plain text", () => {
    render(<EmailFrame title="t" html={null} text={"<b>not bold</b>"} />);
    const doc = screen.getByTitle("t").getAttribute("srcdoc")!;
    expect(doc).toContain("&lt;b&gt;not bold&lt;/b&gt;");
  });
});

describe("ReceiptSteps", () => {
  const receipts: ReceiptSummaryDTO = {
    status: "opened",
    sentAt: ago(600_000),
    deliveredAt: ago(590_000),
    firstOpenedAt: ago(120_000),
    lastOpenedAt: ago(120_000),
    openCount: 1,
    firstClickedAt: null,
    clickCount: 0,
    likelyAutomatedOpen: false,
    opensTracked: true,
    bounce: null,
    events: [
      { type: "email.sent", at: ago(600_000) },
      { type: "email.delivered", at: ago(590_000) },
      { type: "email.opened", at: ago(120_000) },
    ],
  };

  it("renders Sent · Delivered · Opened 2m ago from the timeline", () => {
    render(<ReceiptSteps receipts={receipts} now={NOW} />);
    const list = screen.getByRole("list", { name: "Delivery progress" });
    const steps = within(list).getAllByText(/Sent|Delivered|Opened/);
    expect(steps.map((s) => s.textContent)).toEqual(["Sent", "Delivered", "Opened 2m ago"]);
    expect(list.querySelector('[data-step="opened"]')).toHaveAttribute("data-tone", "engaged");
    expect(list.querySelector('[data-step="delivered"]')).toHaveAttribute("data-tone", "ok");
  });

  it("links 'Opens not tracked' to the setup checklist", () => {
    render(
      <ReceiptSteps
        receipts={{
          ...receipts,
          status: "delivered",
          openCount: 0,
          firstOpenedAt: null,
          lastOpenedAt: null,
          opensTracked: false,
          events: receipts.events.slice(0, 2),
        }}
        now={NOW}
        settingsHref="/acme/settings/connections"
      />,
    );
    expect(screen.getByRole("link", { name: "Opens not tracked" })).toHaveAttribute(
      "href",
      "/acme/settings/connections",
    );
  });
});

describe("AttachmentChips", () => {
  const att = (over: Partial<AttachmentDTO>): AttachmentDTO => ({
    id: "a1",
    filename: "Northwind-PO-2026-0917.pdf",
    contentType: "application/pdf",
    size: 184 * 1024,
    disposition: "attachment",
    embedded: false,
    available: true,
    downloadUrl: "/api/files/a1",
    thumbnailUrl: null,
    ...over,
  });

  it("links chips to the authorized download route with the exact name and size", () => {
    render(<AttachmentChips attachments={[att({})]} />);
    const chip = screen.getByRole("link", {
      name: "Download Northwind-PO-2026-0917.pdf, 184 KB",
    });
    expect(chip).toHaveAttribute("href", "/api/files/a1");
    // A click downloads through a hidden iframe: the thread never navigates away.
    fireEvent.click(chip);
    const frame = document.querySelector("iframe[hidden]");
    expect(frame).toHaveAttribute("src", "/api/files/a1");
    frame?.remove();
    expect(chip).toHaveTextContent("PDF");
  });

  it("dims unavailable files, hides embedded images, thumbnails other images", () => {
    render(
      <AttachmentChips
        attachments={[
          att({
            id: "a2",
            filename: "assets.zip",
            contentType: "application/zip",
            available: false,
          }),
          att({ id: "a3", filename: "logo.png", contentType: "image/png", embedded: true }),
          att({
            id: "a4",
            filename: "Screenshot.png",
            contentType: "image/png",
            thumbnailUrl: "https://files.example/thumb.png",
          }),
        ]}
      />,
    );
    expect(screen.getByText("No longer available at Resend")).toBeInTheDocument();
    expect(screen.queryByText("logo.png")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview Screenshot.png" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /assets\.zip/ })).not.toBeInTheDocument();
  });

  it("offers Download all from three files", () => {
    const files = ["a", "b", "c"].map((id) => att({ id, filename: `${id}.pdf` }));
    render(<AttachmentChips attachments={files} />);
    expect(screen.getByRole("button", { name: "Download all (3)" })).toBeInTheDocument();
  });
});

describe("MessageCard", () => {
  const message: MessageDTO = {
    id: "m1",
    direction: "outbound",
    status: "opened",
    from: { address: "support@acme.com", name: "Acme Support" },
    to: [{ address: "jane@northwind.io" }],
    cc: [],
    bcc: [],
    subject: "Invoice question",
    snippet: "Thanks Jane",
    at: ago(3_600_000),
    scheduledAt: null,
    authorId: null,
    contentStatus: "ready",
    html: "<p>Thanks Jane</p>",
    text: null,
    attachments: [],
    receipts: {
      status: "opened",
      sentAt: ago(3_600_000),
      deliveredAt: ago(3_590_000),
      firstOpenedAt: ago(60_000),
      lastOpenedAt: ago(60_000),
      openCount: 1,
      firstClickedAt: null,
      clickCount: 0,
      likelyAutomatedOpen: false,
      opensTracked: true,
      bounce: null,
      events: [
        { type: "email.sent", at: ago(3_600_000) },
        { type: "email.delivered", at: ago(3_590_000) },
        { type: "email.opened", at: ago(60_000) },
      ],
    },
  };

  it("collapses older messages to one line and expands on click", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <MessageCard
        message={message}
        orgSlug="acme"
        expanded={false}
        onToggle={onToggle}
        onRetried={vi.fn()}
      />,
    );
    expect(screen.queryByTitle(/Message from/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(onToggle).toHaveBeenCalled();
    rerender(
      <MessageCard
        message={message}
        orgSlug="acme"
        expanded
        onToggle={onToggle}
        onRetried={vi.fn()}
      />,
    );
    expect(screen.getByTitle("Message from Acme Support: Invoice question")).toBeInTheDocument();
    expect(screen.getByTestId("receipt-steps")).toBeInTheDocument();
  });

  it("shows a skeleton while the body is fetched and a retry when it failed", () => {
    const base = {
      ...message,
      direction: "inbound" as const,
      receipts: null,
      html: null,
      text: null,
    };
    const { rerender } = render(
      <MessageCard
        message={{ ...base, contentStatus: "pending" }}
        orgSlug="acme"
        expanded
        onToggle={vi.fn()}
        onRetried={vi.fn()}
      />,
    );
    expect(screen.getByText("Fetching message…")).toBeInTheDocument();
    rerender(
      <MessageCard
        message={{ ...base, contentStatus: "failed" }}
        orgSlug="acme"
        expanded
        onToggle={vi.fn()}
        onRetried={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

describe("ThreadRow", () => {
  const row: MailListRowDTO = {
    kind: "thread",
    id: "t1",
    threadId: "t1",
    subject: "Invoice question",
    snippet: "Thanks, that fixes it!",
    people: ["jane@northwind.io"],
    lastMessageAt: ago(60_000),
    messageCount: 2,
    unread: true,
    starred: false,
    hasAttachments: true,
    projectId: null,
    status: null,
    scheduledAt: null,
    trashedAt: null,
    purgeAt: null,
  };

  it("shows sender, subject, snippet, unread dot and attachment icon; keeps the AI slot hidden", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <ul>
        <ThreadRow row={row} folder="inbox" href="/acme/inbox/t1" selected onSelect={onSelect} />
      </ul>,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/acme/inbox/t1");
    expect(link).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("jane@northwind.io")).toBeInTheDocument();
    expect(screen.getByText("Invoice question")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Unread" })).toBeInTheDocument();
    expect(screen.getByLabelText("Has attachments")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="ai-chip"]')).toHaveAttribute("hidden");
    fireEvent.click(link);
    expect(onSelect).toHaveBeenCalledWith(row);
  });

  it("offers Restore in Trash instead of a link", () => {
    const onRestore = vi.fn();
    render(
      <ul>
        <ThreadRow
          row={{
            ...row,
            trashedAt: ago(1000),
            purgeAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
          }}
          folder="trash"
          href="/x"
          selected={false}
          onSelect={vi.fn()}
          onRestore={onRestore}
        />
      </ul>,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Restore/ }));
    expect(onRestore).toHaveBeenCalled();
    expect(screen.getByText(/Deletes permanently in \d+ days?/)).toBeInTheDocument();
  });
});

describe("useMailShortcuts", () => {
  function Harness({ handlers }: { handlers: MailShortcutHandlers }) {
    useMailShortcuts(handlers);
    return (
      <div>
        <input aria-label="field" />
        <div role="dialog">
          <button>inside</button>
        </div>
      </div>
    );
  }
  const press = (
    key: string,
    target: Element | Document = document,
    init: KeyboardEventInit = {},
  ) => fireEvent.keyDown(target, { key, ...init });

  it("maps j k e r u # and / to their handlers", () => {
    const h = {
      next: vi.fn(),
      prev: vi.fn(),
      trash: vi.fn(),
      reply: vi.fn(),
      unread: vi.fn(),
      search: vi.fn(),
    };
    render(<Harness handlers={h} />);
    for (const key of ["j", "k", "e", "#", "r", "u", "/"]) press(key);
    expect(h.next).toHaveBeenCalledTimes(1);
    expect(h.prev).toHaveBeenCalledTimes(1);
    expect(h.trash).toHaveBeenCalledTimes(2);
    expect(h.reply).toHaveBeenCalledTimes(1);
    expect(h.unread).toHaveBeenCalledTimes(1);
    expect(h.search).toHaveBeenCalledTimes(1);
  });

  it("ignores typing in fields, dialogs and modifier combinations", () => {
    const h = { next: vi.fn(), reply: vi.fn() };
    render(<Harness handlers={h} />);
    press("j", screen.getByLabelText("field"));
    press("r", screen.getByRole("button", { name: "inside" }));
    press("j", document, { metaKey: true });
    press("r", document, { ctrlKey: true });
    press("x");
    expect(h.next).not.toHaveBeenCalled();
    expect(h.reply).not.toHaveBeenCalled();
  });
});
