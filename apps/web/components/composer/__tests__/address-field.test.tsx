import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { AddressField, splitAddresses, toAddressValue } from "../address-field";

afterEach(cleanup);

function Harness({ initial = [] as string[] }) {
  const [values, setValues] = useState(initial);
  return <AddressField label="To" values={values} onChange={setValues} />;
}

const pills = () => screen.queryAllByTestId("address-pill");

describe("address parsing", () => {
  it("splits on commas, semicolons and whitespace but keeps display names together", () => {
    expect(splitAddresses("a@x.com, b@x.com; c@x.com\nd@x.com")).toEqual([
      "a@x.com",
      "b@x.com",
      "c@x.com",
      "d@x.com",
    ]);
    expect(splitAddresses("Jane Doe <jane@x.com>, bob@x.com")).toEqual([
      "Jane Doe <jane@x.com>",
      "bob@x.com",
    ]);
  });

  it("stores the bare lowercase address", () => {
    expect(toAddressValue("Jane Doe <Jane@X.com>")).toBe("jane@x.com");
    expect(toAddressValue("nope")).toBe("nope");
  });
});

describe("AddressField", () => {
  it("turns a valid address into a pill on comma and Enter", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText("To");
    await user.type(input, "ada@example.com,");
    await user.type(input, "grace@example.com{Enter}");
    expect(pills().map((p) => p.textContent)).toEqual(["ada@example.com", "grace@example.com"]);
    expect(pills().every((p) => p.getAttribute("data-valid") === "true")).toBe(true);
  });

  it("keeps an invalid address as a flagged pill so it can be fixed or removed", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText("To"), "not-an-email{Enter}");
    const [pill] = pills();
    expect(pill).toHaveAttribute("data-valid", "false");
    expect(pill).toHaveTextContent("not a valid email address");
    expect(screen.getByLabelText("To")).toHaveAttribute("aria-invalid", "true");
    await user.click(screen.getByRole("button", { name: "Remove not-an-email" }));
    expect(pills()).toHaveLength(0);
  });

  it("splits pasted lists, commits on blur and ignores duplicates", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText("To");
    await user.click(input);
    await user.paste("a@x.com, b@x.com; a@x.com");
    expect(pills().map((p) => p.textContent)).toEqual(["a@x.com", "b@x.com"]);
    fireEvent.change(input, { target: { value: "c@x.com" } });
    fireEvent.blur(input);
    expect(pills()).toHaveLength(3);
  });

  it("removes the last pill on Backspace in an empty field", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["a@x.com", "b@x.com"]} />);
    await user.click(screen.getByLabelText("To"));
    await user.keyboard("{Backspace}");
    expect(pills().map((p) => p.textContent)).toEqual(["a@x.com"]);
  });

  it("does not split a display name typed with spaces", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText("To"), "Jane Doe <jane@x.com>{Enter}");
    expect(pills().map((p) => p.textContent)).toEqual(["jane@x.com"]);
  });
});
