import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OtpInput } from "../otp-input";

afterEach(cleanup);

function Harness({ onComplete }: { onComplete?: (code: string) => void }) {
  const [value, setValue] = useState("");
  return <OtpInput value={value} onChange={setValue} onComplete={onComplete} />;
}

const box = (n: number) => screen.getByLabelText(`Digit ${n} of 6`) as HTMLInputElement;

describe("OtpInput", () => {
  it("labels the group and every digit", () => {
    render(<Harness />);
    expect(screen.getByRole("group", { name: "Verification code" })).toBeTruthy();
    expect(screen.getAllByLabelText(/^Digit \d of 6$/)).toHaveLength(6);
    expect(box(1).autocomplete).toBe("one-time-code");
  });

  it("advances as digits are typed and completes on the sixth", async () => {
    const done = vi.fn();
    const user = userEvent.setup();
    render(<Harness onComplete={done} />);
    await user.click(box(1));
    await user.keyboard("12a34");
    expect(box(1).value).toBe("1");
    expect(box(4).value).toBe("4");
    expect(document.activeElement).toBe(box(5));
    await user.keyboard("56");
    expect(done).toHaveBeenCalledWith("123456");
  });

  it("backspace clears the box, then steps back", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(box(1));
    await user.keyboard("123");
    await user.keyboard("{Backspace}");
    expect(document.activeElement).toBe(box(3));
    expect(box(3).value).toBe("");
    await user.keyboard("{Backspace}");
    expect(box(2).value).toBe("");
    expect(document.activeElement).toBe(box(2));
  });

  it("fills every box from a paste and ignores non-digits", () => {
    const done = vi.fn();
    render(<Harness onComplete={done} />);
    fireEvent.paste(box(1), { clipboardData: { getData: () => " 482 913 " } });
    expect([1, 2, 3, 4, 5, 6].map((n) => box(n).value).join("")).toBe("482913");
    expect(done).toHaveBeenCalledWith("482913");
  });

  it("takes a whole code from SMS autofill into the first box", () => {
    const done = vi.fn();
    render(<Harness onComplete={done} />);
    fireEvent.change(box(1), { target: { value: "654321" } });
    expect(done).toHaveBeenCalledWith("654321");
  });
});
