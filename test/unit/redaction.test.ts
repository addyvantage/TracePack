import { describe, expect, it } from "vitest";
import { isSensitivePath, normalizeRelativePath } from "../../src/core/paths.js";
import { redactText, summarizeOutput } from "../../src/core/redaction.js";

describe("redaction", () => {
  it("redacts common secret-like output", () => {
    const githubToken = `ghp_${"a".repeat(32)}`;
    const apiKey = `sk-${"b".repeat(32)}`;
    const result = redactText(`github ${githubToken} and key ${apiKey}`);
    expect(result.text).toContain("[REDACTED:github_token_like]");
    expect(result.text).toContain("[REDACTED:openai_api_key_like]");
    expect(result.replacements.length).toBe(2);
  });

  it("tracks output truncation", () => {
    const summary = summarizeOutput("a".repeat(100), 10);
    expect(summary.truncated).toBe(true);
    expect(summary.omittedBytes).toBe(90);
    expect(summary.text.length).toBe(10);
  });

  it("detects sensitive paths without reading their contents", () => {
    expect(isSensitivePath(".env.local")).toBe(true);
    expect(isSensitivePath(".ssh/id_ed25519")).toBe(true);
    expect(isSensitivePath("src/index.ts")).toBe(false);
  });

  it("normalizes Windows-style relative paths", () => {
    expect(normalizeRelativePath("src\\core\\file.ts")).toBe("src/core/file.ts");
  });
});
