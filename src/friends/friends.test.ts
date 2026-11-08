import { describe, expect, it } from "vitest";
import { friendPair, friendStatus, lastSeenText } from "./friends";

describe("Freundesliste", () => {
  it("speichert ein Paar immer gleich herum, egal wer fragt", () => {
    expect(friendPair("b", "a")).toEqual({ user_a: "a", user_b: "b" });
    expect(friendPair("a", "b")).toEqual({ user_a: "a", user_b: "b" });
  });

  it("unterscheidet gesendete und erhaltene Anfragen", () => {
    const row = { user_a: "a", user_b: "b", requested_by: "a", status: "pending" as const };
    expect(friendStatus(row, "a")).toBe("outgoing");
    expect(friendStatus(row, "b")).toBe("incoming");
    expect(friendStatus({ ...row, status: "accepted" }, "b")).toBe("accepted");
  });

  it("zeigt, wann ein Freund zuletzt aktiv war", () => {
    const now = Date.parse("2026-11-08T12:00:00Z");
    const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
    expect(lastSeenText(ago(1), now)).toBe("gerade eben");
    expect(lastSeenText(ago(15), now)).toBe("vor 15 Min.");
    expect(lastSeenText(ago(3 * 60), now)).toBe("vor 3 Std.");
    expect(lastSeenText(ago(30 * 60), now)).toBe("gestern");
    expect(lastSeenText(ago(5 * 24 * 60), now)).toBe("vor 5 Tagen");
  });
});
