import { describe, expect, it } from "vitest";
import {
  classifyCommand,
  commandHasSuspiciousTestFlag,
  evidenceForCommand
} from "../../src/core/classify.js";

describe("command classification", () => {
  it("classifies common validation commands", () => {
    expect(classifyCommand(["npm", "test"])).toBe("validation");
    expect(classifyCommand(["pnpm", "run", "lint"])).toBe("validation");
    expect(classifyCommand(["tsc", "--noEmit"])).toBe("validation");
    expect(classifyCommand(["go", "test", "./..."])).toBe("validation");
    expect(classifyCommand(["git", "diff", "--check"])).toBe("validation");
    expect(classifyCommand(["git", "diff", "--cached", "--check"])).toBe("validation");
  });

  it("classifies build as possible validation and install as non-validation", () => {
    expect(classifyCommand(["npm", "run", "build"])).toBe("possible_validation");
    expect(classifyCommand(["npm", "install"])).toBe("non_validation");
  });

  it("does not promote failed validation to success", () => {
    expect(evidenceForCommand("validation", 0)).toBe("successful_validation");
    expect(evidenceForCommand("validation", 1)).toBe("failed_validation");
  });

  it("detects deterministic suspicious test flags", () => {
    expect(commandHasSuspiciousTestFlag(["vitest", "-u"])).toContain("-u");
    expect(commandHasSuspiciousTestFlag(["jest", "--updateSnapshot"])).toContain("update");
    expect(commandHasSuspiciousTestFlag(["pytest"])).toBeUndefined();
  });
});
