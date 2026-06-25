import { describe, expect, it } from "vitest";
import { isSensitivePath, normalizeRelativePath } from "../../src/core/paths.js";
import {
  redactText,
  safeCommandText,
  sanitizeCommandArgv,
  sanitizeCommandString,
  summarizeOutput
} from "../../src/core/redaction.js";

describe("redaction", () => {
  it("redacts common secret-like output", () => {
    const githubToken = fakeGithubToken("a");
    const apiKey = fakeOpenAiKey("b");
    const result = redactText(`github ${githubToken} and key ${apiKey}`);
    expect(result.text).toContain("[REDACTED:github_token_like]");
    expect(result.text).toContain("[REDACTED:openai_api_key_like]");
    expect(result.replacements.length).toBe(2);
  });

  it("redacts sensitive standalone, assigned, split, bearer, URL, and path command arguments", () => {
    const openAiKey = fakeOpenAiKey("c");
    const githubAssigned = fakeGithubToken("d");
    const githubSplit = fakeGithubToken("e");
    const bearerValue = fakeBearerValue("f");
    const queryToken = fakeQueryToken("g");

    const result = sanitizeCommandArgv([
      "deploy",
      openAiKey,
      `--token=${githubAssigned}`,
      "--token",
      githubSplit,
      `Authorization: Bearer ${bearerValue}`,
      `https://example.invalid/deploy?access_token=${queryToken}&ok=1`,
      ".env.local",
      "plain-arg"
    ]);
    const serialized = JSON.stringify(result);

    for (const raw of [openAiKey, githubAssigned, githubSplit, bearerValue, queryToken]) {
      expect(serialized).not.toContain(raw);
    }
    expect(result.argv).toEqual([
      "deploy",
      "[REDACTED:openai_api_key_like]",
      "--token=[REDACTED:github_token_like]",
      "--token",
      "[REDACTED:github_token_like]",
      "Authorization: Bearer [REDACTED:authorization_bearer_token_like]",
      "https://example.invalid/deploy?access_token=[REDACTED:assignment_secret_like]&ok=1",
      "[REDACTED:sensitive_path_argument]",
      "plain-arg"
    ]);
    expect(result.redaction).toEqual(
      expect.objectContaining({
        argumentsRedacted: true,
        redactedArgumentCount: 6,
        reproductionMayRequireLocalValues: true
      })
    );
    expect(result.redaction.replacements).toEqual(
      expect.arrayContaining([
        { pattern: "openai_api_key_like", count: 1 },
        { pattern: "github_token_like", count: 2 },
        { pattern: "authorization_bearer_token_like", count: 1 },
        { pattern: "assignment_secret_like", count: 1 },
        { pattern: "sensitive_path_argument", count: 1 }
      ])
    );
  });

  it("sanitizes shell-style command strings and preserves ordinary arguments", () => {
    const githubToken = fakeGithubToken("h");
    const text = sanitizeCommandString(`deploy --token ${githubToken} --target staging`);

    expect(text).toBe("deploy --token [REDACTED:github_token_like] --target staging");
    expect(text).not.toContain(githubToken);
    expect(safeCommandText(["npm", "test", "--", "plain-arg"])).toBe("npm test -- plain-arg");
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

function fakeOpenAiKey(fill: string): string {
  return `${["s", "k-"].join("")}${fill.repeat(32)}`;
}

function fakeGithubToken(fill: string): string {
  return `${["gh", "p_"].join("")}${fill.repeat(32)}`;
}

function fakeBearerValue(fill: string): string {
  return `bearer-${fill.repeat(24)}`;
}

function fakeQueryToken(fill: string): string {
  return `query_${fill.repeat(24)}`;
}
