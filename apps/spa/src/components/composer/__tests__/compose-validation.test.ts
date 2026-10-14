import { describe, expect, it } from "vitest";

import { isBodyBlank, isLossyForRich } from "../compose-validation";

describe("isBodyBlank", () => {
  it("treats empty markup as blank", () => {
    expect(isBodyBlank("")).toBe(true);
    expect(isBodyBlank("<p></p>")).toBe(true);
    expect(isBodyBlank("<p>&nbsp;</p>")).toBe(true);
  });

  it("keeps text and images", () => {
    expect(isBodyBlank("<p>Hi</p>")).toBe(false);
    expect(isBodyBlank('<p><img src="https://x.test/a.png"></p>')).toBe(false);
  });
});

describe("isLossyForRich", () => {
  it("flags HTML TipTap would flatten", () => {
    expect(isLossyForRich("<p>Hi</p>")).toBe(false);
    expect(isLossyForRich("<table><tr><td>x</td></tr></table>")).toBe(true);
    expect(isLossyForRich('<p style="color:red">x</p>')).toBe(true);
  });
});
