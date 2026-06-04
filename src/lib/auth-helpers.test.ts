import { describe, expect, it } from "vitest";
import { isAllowedEmail, requireUserId, resolveUserId, sessionCallback } from "./auth-helpers";

describe("isAllowedEmail", () => {
  it("matches the owner case-insensitively", () => {
    expect(isAllowedEmail("Owner@Gmail.com", "owner@gmail.com")).toBe(true);
  });
  it("rejects a different email", () => {
    expect(isAllowedEmail("intruder@gmail.com", "owner@gmail.com")).toBe(false);
  });
  it("rejects null/empty email or owner", () => {
    expect(isAllowedEmail(null, "owner@gmail.com")).toBe(false);
    expect(isAllowedEmail("owner@gmail.com", "")).toBe(false);
    expect(isAllowedEmail(undefined, undefined as unknown as string)).toBe(false);
  });
});

describe("requireUserId", () => {
  it("returns the id when present", () => {
    expect(requireUserId({ user: { id: "u1" } })).toBe("u1");
  });
  it("throws when session is null", () => {
    expect(() => requireUserId(null)).toThrow("UNAUTHENTICATED");
  });
  it("throws when user id is missing", () => {
    expect(() => requireUserId({ user: {} })).toThrow("UNAUTHENTICATED");
  });
});

describe("resolveUserId", () => {
  it("returns the dev override when one is set", () => {
    expect(resolveUserId("user-stub", null)).toBe("user-stub");
  });
  it("falls back to the session user id when there is no override", () => {
    expect(resolveUserId(undefined, { user: { id: "u1" } })).toBe("u1");
  });
  it("throws when there is no override and no session", () => {
    expect(() => resolveUserId(undefined, null)).toThrow("UNAUTHENTICATED");
  });
});

describe("sessionCallback", () => {
  it("copies the adapter user id onto session.user.id", () => {
    const session = { user: { email: "a@b.com" } } as never;
    const out = sessionCallback({ session, user: { id: "u9" } } as never);
    expect(out.user.id).toBe("u9");
  });
});
