import { describe, expect, it } from "vitest";
import { isStrictlyLiveEvent, type SgoEvent } from "./sportsgameodds.js";

const NOW = new Date("2026-07-11T02:00:00.000Z");

function eventWithStatus(status: NonNullable<SgoEvent["status"]>): SgoEvent {
  return {
    eventID: "event-1",
    status: {
      startsAt: "2026-07-11T01:00:00.000Z",
      live: true,
      started: true,
      ended: false,
      finalized: false,
      cancelled: false,
      ...status,
    },
  };
}

describe("isStrictlyLiveEvent", () => {
  it("accepts only an event that has started and is currently live", () => {
    expect(isStrictlyLiveEvent(eventWithStatus({}), NOW)).toBe(true);
  });

  it.each([
    ["future", { startsAt: "2026-07-11T03:00:00.000Z" }],
    ["not started", { started: false }],
    ["not live", { live: false }],
    ["ended", { ended: true }],
    ["finalized", { finalized: true }],
    ["cancelled", { cancelled: true }],
    ["missing start", { startsAt: undefined }],
    ["invalid start", { startsAt: "not-a-date" }],
  ])("rejects a %s event", (_label, status) => {
    expect(isStrictlyLiveEvent(eventWithStatus(status), NOW)).toBe(false);
  });

  it("keeps an in-progress event live during an official break", () => {
    expect(isStrictlyLiveEvent(eventWithStatus({ inBreak: true }), NOW)).toBe(
      true,
    );
  });
});
