import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGameStore } from "../store/gameStore";
import { calculateReward } from "./rewards";
import {
  addDays,
  advanceRecurring,
  currentStreak,
  firstDue,
  isMissed,
  isValidRecurrence,
  isWaiting,
  nextDue,
  recurrenceLabel,
  streakBonus,
  weekday,
} from "./recurrence";
import type { Quest } from "./types";

// 2026-10-05 ist ein Montag
const MON = "2026-10-05";

const quest = (overrides: Partial<Quest> = {}): Quest => ({
  id: "q",
  title: "Sport",
  effort: "medium",
  category: "body",
  status: "open",
  createdAt: "2026-10-01T08:00:00.000Z",
  recurrence: { kind: "daily" },
  dueDate: MON,
  streak: 0,
  ...overrides,
});

describe("Wiederkehrende Quests: Termine", () => {
  it("rechnet mit lokalen Tagen, auch über Monatsgrenzen", () => {
    expect(weekday(MON)).toBe(0);
    expect(weekday("2026-10-11")).toBe(6);
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("täglich, an Wochentagen und alle X Tage", () => {
    expect(firstDue({ kind: "daily" }, MON)).toBe(MON);
    expect(nextDue({ kind: "daily" }, MON)).toBe("2026-10-06");
    // Mi und Fr: ab Montag zuerst Mittwoch, nach Mittwoch Freitag, nach Freitag wieder Mittwoch
    const wf = { kind: "weekdays", days: [2, 4] } as const;
    expect(firstDue({ ...wf, days: [...wf.days] }, MON)).toBe("2026-10-07");
    expect(nextDue({ ...wf, days: [...wf.days] }, "2026-10-07")).toBe("2026-10-09");
    expect(nextDue({ ...wf, days: [...wf.days] }, "2026-10-09")).toBe("2026-10-14");
    expect(firstDue({ kind: "interval", every: 3 }, MON)).toBe(MON);
    expect(nextDue({ kind: "interval", every: 3 }, MON)).toBe("2026-10-08");
  });

  it("prüft Eingaben und beschreibt den Rhythmus lesbar", () => {
    expect(isValidRecurrence({ kind: "weekdays", days: [] })).toBe(false);
    expect(isValidRecurrence({ kind: "interval", every: 0 })).toBe(false);
    expect(isValidRecurrence({ kind: "interval", every: 31 })).toBe(false);
    expect(recurrenceLabel({ kind: "weekdays", days: [4, 0, 2] })).toBe("Mo, Mi, Fr");
    expect(recurrenceLabel({ kind: "weekdays", days: [0, 1, 2, 3, 4] })).toBe("Werktags");
    expect(recurrenceLabel({ kind: "interval", every: 7 })).toBe("Wöchentlich");
    expect(recurrenceLabel({ kind: "interval", every: 3 })).toBe("Alle 3 Tage");
  });
});

describe("Wiederkehrende Quests: Serien", () => {
  it("pünktlich erledigt wächst die Serie, der Termin springt weiter", () => {
    const { next, streak } = advanceRecurring(quest({ streak: 4 }), MON);
    expect(streak).toBe(5);
    expect(next.dueDate).toBe("2026-10-06");
    expect(next.bestStreak).toBe(5);
    expect(next.lastDone).toBe(MON);
    expect(isWaiting(next, MON)).toBe(true);
    expect(() => advanceRecurring(next, MON)).toThrow(/nächsten Termin/);
  });

  it("ein verpasster Termin lässt die Serie reissen – sie beginnt wieder bei 1", () => {
    const late = quest({ streak: 6, bestStreak: 6 });
    expect(isMissed(late, "2026-10-07")).toBe(true);
    expect(currentStreak(late, "2026-10-07")).toBe(0);
    const { next, streak } = advanceRecurring(late, "2026-10-07");
    expect(streak).toBe(1);
    expect(next.bestStreak).toBe(6);
    expect(next.dueDate).toBe("2026-10-08");
  });

  it("Bonus: +5 % pro Tag über 1, höchstens +50 %", () => {
    expect(streakBonus(1)).toBe(0);
    expect(streakBonus(5)).toBeCloseTo(0.2);
    expect(streakBonus(40)).toBe(0.5);
    const plain = calculateReward("medium", "body");
    const streak = calculateReward("medium", "body", false, 11);
    expect(streak.xp).toBe(Math.round(plain.xp * 1.5));
    expect(streak.streak).toBe(11);
    expect(plain.streak).toBeUndefined();
  });
});

describe("Wiederkehrende Quests: im Questlog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 5, 9, 0));
    useGameStore.setState({ quests: [] });
  });
  afterEach(() => vi.useRealTimers());

  it("bleibt nach dem Erledigen stehen, unter „Erledigt“ landet ein Eintrag mit Serienbonus", () => {
    const store = useGameStore.getState();
    store.addQuest({ title: "Sport", effort: "medium", category: "body", recurrence: { kind: "daily" } });
    const id = useGameStore.getState().quests[0].id;
    expect(useGameStore.getState().quests[0].dueDate).toBe(MON);

    useGameStore.getState().completeQuest(id);
    let quests = useGameStore.getState().quests;
    expect(quests).toHaveLength(2);
    const recurring = quests.find((q) => q.id === id)!;
    expect(recurring.status).toBe("open");
    expect(recurring.streak).toBe(1);
    expect(recurring.dueDate).toBe("2026-10-06");
    const entry = quests.find((q) => q.recurringId === id)!;
    expect(entry.status).toBe("done");
    expect(entry.recurrence).toBeUndefined();

    // Gleicher Tag: nicht noch einmal
    useGameStore.getState().completeQuest(id);
    expect(useGameStore.getState().quests).toHaveLength(2);

    // Am nächsten Tag: Serie 2, mit Bonus
    vi.setSystemTime(new Date(2026, 9, 6, 9, 0));
    useGameStore.getState().completeQuest(id);
    quests = useGameStore.getState().quests;
    expect(quests.find((q) => q.id === id)!.streak).toBe(2);
    expect(quests[0].reward?.streak).toBe(2);
    expect(quests[0].reward?.xp).toBe(calculateReward("medium", "body", false, 2).xp);
  });
});
