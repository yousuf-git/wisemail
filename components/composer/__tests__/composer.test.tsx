import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  saveDraftAction: vi.fn(),
  sendEmailAction: vi.fn(),
  getDraftAction: vi.fn(),
  deleteDraftAction: vi.fn(),
  cancelScheduledAction: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    error: mocks.toastError,
    success: mocks.toastSuccess,
    dismiss: vi.fn(),
  }),
}));
vi.mock("@/app/(app)/[orgSlug]/compose/actions", () => ({
  saveDraftAction: mocks.saveDraftAction,
  sendEmailAction: mocks.sendEmailAction,
  getDraftAction: mocks.getDraftAction,
  deleteDraftAction: mocks.deleteDraftAction,
  cancelScheduledAction: mocks.cancelScheduledAction,
  createUploadAction: vi.fn(),
  confirmUploadAction: vi.fn(),
  removeAttachmentAction: vi.fn(),
}));
// jsdom cannot run ProseMirror or CodeMirror layout; plain textareas stand in for both.
vi.mock("../rich-editor", async () => {
  const React = await import("react");
  return {
    default: (props: {
      initialHtml: string;
      onChange: (html: string) => void;
      disabled?: boolean;
    }) =>
      React.createElement("textarea", {
        "aria-label": "Message body",
        defaultValue: props.initialHtml,
        disabled: props.disabled,
        onChange: (event: { target: { value: string } }) => props.onChange(event.target.value),
      }),
  };
});
vi.mock("../html-editor", async () => {
  const React = await import("react");
  return {
    default: (props: { value: string; onChange: (html: string) => void }) =>
      React.createElement("textarea", {
        "aria-label": "HTML source",
        value: props.value,
        onChange: (event: { target: { value: string } }) => props.onChange(event.target.value),
      }),
  };
});

import { Composer } from "../composer";
import type { DraftDTO, SenderDTO } from "@/lib/dto/mail";

const sender = (over: Partial<SenderDTO> = {}): SenderDTO => ({
  id: "a".repeat(24),
  domainId: "d".repeat(24),
  domainName: "acme.com",
  projectId: null,
  localPart: "support",
  address: "support@acme.com",
  displayName: "Acme Support",
  replyTo: [],
  signatureHtml: "",
  isDefault: true,
  status: "active",
  statusReason: null,
  canReceiveReplies: true,
  receivingNote: null,
  version: 0,
  ...over,
});

const draftDto = (over: Partial<DraftDTO> = {}): DraftDTO => ({
  id: "e".repeat(24),
  senderId: "a".repeat(24),
  threadId: null,
  inReplyToEmailId: null,
  to: ["ada@example.com"],
  cc: [],
  bcc: [],
  subject: "Draft subject",
  mode: "rich",
  bodyHtml: "<p>Hi</p>",
  bodyText: "Hi",
  templateId: null,
  templateVariables: {},
  attachments: [],
  scheduledAt: null,
  updatedAt: "2026-09-29T10:00:00.000Z",
  version: 3,
  ...over,
});

const ok = <T,>(data: T) => ({ ok: true as const, data });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.saveDraftAction.mockImplementation(async (_slug, input) =>
    ok(draftDto({ ...input, id: input.id ?? "e".repeat(24), version: (input.version ?? -1) + 1 })),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const sendButton = () => screen.getByRole("button", { name: /^(send now|sending…|scheduling…)$/i });

describe("Composer autosave", () => {
  it("saves once, debounced, with the latest values", async () => {
    render(<Composer orgSlug="acme" senders={[sender()]} canSend />);
    vi.useFakeTimers();
    const subject = screen.getByLabelText("Subject");
    fireEvent.change(subject, { target: { value: "Hel" } });
    await act(async () => vi.advanceTimersByTimeAsync(800));
    fireEvent.change(subject, { target: { value: "Hello" } });
    await act(async () => vi.advanceTimersByTimeAsync(800));
    expect(mocks.saveDraftAction).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(600));
    expect(mocks.saveDraftAction).toHaveBeenCalledTimes(1);
    expect(mocks.saveDraftAction).toHaveBeenCalledWith(
      "acme",
      expect.objectContaining({ subject: "Hello", senderId: "a".repeat(24), mode: "rich" }),
    );
    expect(mocks.saveDraftAction.mock.calls[0]![1]).not.toHaveProperty("id");
  });

  it("does not save an untouched composer", async () => {
    render(<Composer orgSlug="acme" senders={[sender()]} canSend />);
    vi.useFakeTimers();
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(mocks.saveDraftAction).not.toHaveBeenCalled();
  });

  it("sends the id and version of the last save on the next one", async () => {
    render(
      <Composer orgSlug="acme" senders={[sender()]} canSend draft={draftDto({ version: 3 })} />,
    );
    vi.useFakeTimers();
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Changed" } });
    await act(async () => vi.advanceTimersByTimeAsync(1300));
    expect(mocks.saveDraftAction).toHaveBeenLastCalledWith(
      "acme",
      expect.objectContaining({ id: "e".repeat(24), version: 3, subject: "Changed" }),
    );
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Changed again" } });
    await act(async () => vi.advanceTimersByTimeAsync(1300));
    expect(mocks.saveDraftAction).toHaveBeenLastCalledWith(
      "acme",
      expect.objectContaining({ version: 4, subject: "Changed again" }),
    );
  });

  it("stops and offers a reload when the draft was edited elsewhere", async () => {
    mocks.saveDraftAction.mockResolvedValue({
      ok: false,
      error: { code: "conflict", message: "changed" },
    });
    mocks.getDraftAction.mockResolvedValue(
      ok(draftDto({ subject: "From the other tab", version: 9 })),
    );
    render(<Composer orgSlug="acme" senders={[sender()]} canSend draft={draftDto()} />);
    vi.useFakeTimers();
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Mine" } });
    await act(async () => vi.advanceTimersByTimeAsync(1300));
    expect(mocks.toastError).toHaveBeenCalledWith(
      "This draft was edited somewhere else",
      expect.objectContaining({ action: expect.objectContaining({ label: "Reload" }) }),
    );
    vi.useRealTimers();
    await userEvent.click(screen.getByRole("button", { name: "Reload latest" }));
    await waitFor(() => expect(screen.getByLabelText("Subject")).toHaveValue("From the other tab"));
    expect(mocks.saveDraftAction).toHaveBeenCalledTimes(1);
  });

  it("does not autosave when the member cannot send", async () => {
    render(<Composer orgSlug="acme" senders={[sender()]} canSend={false} />);
    vi.useFakeTimers();
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(mocks.saveDraftAction).not.toHaveBeenCalled();
  });
});

describe("Composer permissions", () => {
  it("disables Send and the fields when canSend is false, with the reason", () => {
    render(<Composer orgSlug="acme" senders={[sender()]} canSend={false} />);
    expect(sendButton()).toBeDisabled();
    expect(screen.getByLabelText("Subject")).toBeDisabled();
    expect(screen.getByLabelText("To")).toBeDisabled();
    expect(screen.getByText(/can read mail but not send it/i)).toBeInTheDocument();
    expect(screen.getByTestId("send-wrapper")).toBeInTheDocument();
  });

  it("enables Send for a member who can send", () => {
    render(<Composer orgSlug="acme" senders={[sender()]} canSend />);
    expect(sendButton()).toBeEnabled();
  });

  it("disables Send when there is no sender to use", () => {
    render(<Composer orgSlug="acme" senders={[]} canSend />);
    expect(sendButton()).toBeDisabled();
  });
});

describe("Composer sending", () => {
  async function fill(user: ReturnType<typeof userEvent.setup>, to = "ada@example.com") {
    await user.type(screen.getByLabelText("To"), `${to}{Enter}`);
    await user.type(screen.getByLabelText("Subject"), "Hello");
    await user.type(await screen.findByLabelText("Message body"), "<p>Hi Ada</p>");
  }

  it("checks the form before calling the server", async () => {
    const user = userEvent.setup();
    render(<Composer orgSlug="acme" senders={[sender()]} canSend />);
    await user.click(sendButton());
    expect(mocks.sendEmailAction).not.toHaveBeenCalled();
    expect(screen.getByText("Add at least one recipient.")).toBeInTheDocument();
    expect(screen.getByText("Add a subject.")).toBeInTheDocument();
    expect(screen.getByText("Write a message.")).toBeInTheDocument();
  });

  it("blocks an invalid address and explains", async () => {
    const user = userEvent.setup();
    render(<Composer orgSlug="acme" senders={[sender()]} canSend />);
    await fill(user, "nope");
    await user.click(sendButton());
    expect(mocks.sendEmailAction).not.toHaveBeenCalled();
    expect(screen.getByText("Fix or remove the highlighted addresses.")).toBeInTheDocument();
  });

  it("sends with Ctrl+Enter and calls onSent", async () => {
    mocks.sendEmailAction.mockResolvedValue(
      ok({ emailId: "f".repeat(24), status: "sent", mode: "inline", threadId: null }),
    );
    const onSent = vi.fn();
    const user = userEvent.setup();
    render(<Composer orgSlug="acme" senders={[sender()]} canSend onSent={onSent} />);
    await fill(user);
    await user.keyboard("{Control>}{Enter}{/Control}");
    await waitFor(() => expect(mocks.sendEmailAction).toHaveBeenCalledTimes(1));
    expect(mocks.sendEmailAction).toHaveBeenCalledWith(
      "acme",
      expect.objectContaining({
        senderId: "a".repeat(24),
        to: ["ada@example.com"],
        subject: "Hello",
        html: "<p>Hi Ada</p>",
      }),
    );
    await waitFor(() => expect(onSent).toHaveBeenCalledWith("f".repeat(24)));
    expect(mocks.toastSuccess).toHaveBeenCalledWith(expect.stringContaining("ada@example.com"));
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("goes to the email in Activity after sending from the page", async () => {
    mocks.sendEmailAction.mockResolvedValue(
      ok({ emailId: "f".repeat(24), status: "sent", mode: "inline", threadId: null }),
    );
    const user = userEvent.setup();
    render(<Composer orgSlug="acme" senders={[sender()]} canSend variant="page" />);
    await fill(user);
    await user.click(sendButton());
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(`/acme/activity/${"f".repeat(24)}`),
    );
  });

  it("shows server errors in plain words and keeps the form", async () => {
    mocks.sendEmailAction.mockResolvedValue({
      ok: false,
      error: {
        code: "domain_unverified",
        message: "acme.com isn't verified in Resend, so it can't send.",
      },
    });
    const user = userEvent.setup();
    render(<Composer orgSlug="acme" senders={[sender()]} canSend />);
    await fill(user);
    await user.click(sendButton());
    expect(await screen.findByTestId("composer-error")).toHaveTextContent(
      "acme.com isn't verified in Resend",
    );
    expect(screen.getByLabelText("Subject")).toHaveValue("Hello");
    expect(sendButton()).toBeEnabled();
  });

  it("marks inactive senders as unusable with the reason and blocks sending", async () => {
    const inactive = sender({
      status: "domain_unverified",
      statusReason: "domain_failed",
      isDefault: false,
    });
    const active = sender({ id: "b".repeat(24), localPart: "hi", address: "hi@acme.com" });
    const user = userEvent.setup();
    render(
      <Composer
        orgSlug="acme"
        senders={[inactive, active]}
        canSend
        draft={draftDto({ senderId: inactive.id })}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The domain failed verification in Resend.",
    );
    await user.click(sendButton());
    expect(mocks.sendEmailAction).not.toHaveBeenCalled();
  });
});

describe("Composer preview", () => {
  it("shows the sandboxed preview beside the HTML editor", async () => {
    const user = userEvent.setup();
    render(<Composer orgSlug="acme" senders={[sender()]} canSend />);
    await user.click(screen.getByRole("tab", { name: "HTML" }));
    const source = await screen.findByLabelText("HTML source");
    fireEvent.change(source, { target: { value: "<h1>Hello</h1>" } });
    const frame = screen.getByTestId("composer-preview");
    expect(frame.getAttribute("sandbox")).toBe("allow-popups allow-popups-to-escape-sandbox");
    expect(frame.getAttribute("srcdoc")).toContain("<h1>Hello</h1>");
  });

  it("keeps Template mode disabled as coming soon", () => {
    render(<Composer orgSlug="acme" senders={[sender()]} canSend />);
    expect(screen.getByRole("tab", { name: "Template" })).toBeDisabled();
  });
});
