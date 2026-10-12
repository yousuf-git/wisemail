import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import { InvalidIdError, idToString, isIdString, newId, parseId, toId } from "@/lib/db/ids";

describe("branded ids", () => {
  it("brands valid hex strings and round-trips", () => {
    const hex = new Types.ObjectId().toHexString();
    const id = toId("emails", hex);
    expect(id).toBeInstanceOf(Types.ObjectId);
    expect(idToString(id)).toBe(hex);
  });

  it("rejects malformed ids", () => {
    expect(() => toId("emails", "nope")).toThrow(InvalidIdError);
    expect(() => toId("emails", "12345678901234567890123z")).toThrow(InvalidIdError);
    expect(parseId("threads", "nope")).toBeNull();
    expect(parseId("threads", 42)).toBeNull();
    expect(parseId("threads", undefined)).toBeNull();
    expect(isIdString("a".repeat(24))).toBe(true);
    expect(isIdString("a".repeat(23))).toBe(false);
  });

  it("does not let an id of one collection stand in for another (compile-time)", () => {
    const thread = newId("threads");
    // @ts-expect-error Id<"threads"> is not assignable to Id<"emails">
    const email: ReturnType<typeof newId<"emails">> = thread;
    expect(email).toBe(thread);
  });
});
