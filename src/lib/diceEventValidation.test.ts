import { statusForDiceError } from "@/lib/diceEventHttp";
import {
  campaignArcSchema,
  diceEventCreateSchema,
  diceEventFilterSchema,
  diceEventSchema,
} from "@/lib/validation/diceEvent";

const valid = { userId: "u1", kind: "CRITICAL", skill: "percepcion", date: "2026-11-01" };

describe("diceEventCreateSchema", () => {
  it("takes no date or time: whatever is sent is dropped", () => {
    const parsed = diceEventCreateSchema.parse({ ...valid, date: "2020-01-01", time: "03:00" });

    expect(parsed).not.toHaveProperty("date");
    expect(parsed).not.toHaveProperty("time");
  });

  it("still normalises the skill and validates the rest", () => {
    expect(diceEventCreateSchema.parse({ ...valid, skill: " lore:  hogar " }).skill).toBe("LORE: HOGAR");
    expect(diceEventCreateSchema.safeParse({ ...valid, skill: " " }).success).toBe(false);
    expect(diceEventCreateSchema.safeParse({ ...valid, kind: "WIN" }).success).toBe(false);
  });
});

describe("diceEventSchema (edit)", () => {
  it("normalises the skill and treats a blank time and ids as none", () => {
    const parsed = diceEventSchema.parse({ ...valid, skill: "  lore:  hogar", time: "", arcId: "", sessionId: null });

    expect(parsed.skill).toBe("LORE: HOGAR");
    expect(parsed.time).toBeNull();
    expect(parsed.arcId).toBeNull();
    expect(parsed.sessionId).toBeNull();
  });

  it("accepts HH:MM times, including past midnight", () => {
    expect(diceEventSchema.parse({ ...valid, time: "02:14" }).time).toBe("02:14");
  });

  it.each(["24:00", "9:30", "12:60", "noon"])("rejects the time %s", (time) => {
    const result = diceEventSchema.safeParse({ ...valid, time });
    expect(result.success).toBe(false);
  });

  it.each(["2026-02-30", "01/11/2026", ""])("rejects the date %p", (date) => {
    const result = diceEventSchema.safeParse({ ...valid, date });
    expect(result.success).toBe(false);
  });

  it("rejects a blank skill and an unknown kind", () => {
    expect(diceEventSchema.safeParse({ ...valid, skill: "   " }).success).toBe(false);
    expect(diceEventSchema.safeParse({ ...valid, kind: "WIN" }).success).toBe(false);
  });

  it("rejects a skill longer than 60 characters once normalised", () => {
    expect(diceEventSchema.safeParse({ ...valid, skill: "a".repeat(61) }).success).toBe(false);
  });
});

describe("diceEventFilterSchema", () => {
  it("defaults the paging and coerces strings", () => {
    expect(diceEventFilterSchema.parse({})).toMatchObject({ page: 1, pageSize: 25 });
    expect(diceEventFilterSchema.parse({ page: "3", pageSize: "50" })).toMatchObject({ page: 3, pageSize: 50 });
  });

  it("falls back to the defaults on garbage or out-of-range paging", () => {
    expect(diceEventFilterSchema.parse({ page: "-2", pageSize: "9999" })).toMatchObject({ page: 1, pageSize: 25 });
    expect(diceEventFilterSchema.parse({ page: "abc" })).toMatchObject({ page: 1 });
  });
});

describe("campaignArcSchema", () => {
  it("turns a blank name into null", () => {
    expect(campaignArcSchema.parse({ name: "  " }).name).toBeNull();
  });

  it("rejects a name over 80 characters", () => {
    expect(campaignArcSchema.safeParse({ name: "x".repeat(81) }).success).toBe(false);
  });
});

describe("statusForDiceError", () => {
  it("maps missing to 404, unknown to 500 and the rest to 400", () => {
    expect(statusForDiceError("diceEvents.errors.notFound")).toBe(404);
    expect(statusForDiceError("arcs.errors.notFound")).toBe(404);
    expect(statusForDiceError("diceEvents.errors.unknown")).toBe(500);
    expect(statusForDiceError("diceEvents.errors.playerNotMember")).toBe(400);
    expect(statusForDiceError("diceEvents.errors.futureDate")).toBe(400);
  });
});
