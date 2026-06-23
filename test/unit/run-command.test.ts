import { describe, expect, it } from "vitest";
import { parseRunTimeoutSeconds } from "../../src/commands/run.js";

describe("run command options", () => {
  it("parses positive integer timeout seconds", () => {
    expect(parseRunTimeoutSeconds("1")).toBe(1);
    expect(parseRunTimeoutSeconds("300")).toBe(300);
  });

  it("rejects invalid timeout values", () => {
    for (const value of ["0", "-1", "1.5", "Infinity", "abc"]) {
      expect(() => parseRunTimeoutSeconds(value)).toThrow(
        "Timeout must be a positive integer number of seconds"
      );
    }
  });
});
