import { describe, expect, it } from "vitest";

import { radioTargetIndex } from "./radio-keyboard";

describe("radioTargetIndex", () => {
  it("moves forward and wraps with right and down arrows", () => {
    expect(radioTargetIndex("ArrowRight", 0, 3)).toBe(1);
    expect(radioTargetIndex("ArrowDown", 2, 3)).toBe(0);
  });

  it("moves backward and wraps with left and up arrows", () => {
    expect(radioTargetIndex("ArrowLeft", 2, 3)).toBe(1);
    expect(radioTargetIndex("ArrowUp", 0, 3)).toBe(2);
  });

  it("moves to the first and last enabled item with Home and End", () => {
    expect(radioTargetIndex("Home", 2, 4)).toBe(0);
    expect(radioTargetIndex("End", 0, 4)).toBe(3);
  });

  it("ignores activation and unrelated keys", () => {
    expect(radioTargetIndex("Enter", 1, 3)).toBeUndefined();
    expect(radioTargetIndex(" ", 1, 3)).toBeUndefined();
    expect(radioTargetIndex("Tab", 1, 3)).toBeUndefined();
  });
});
