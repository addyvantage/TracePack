export type TerminalState = "observed" | "warn" | "failed" | "neutral";

export function shouldUseColor(stream: NodeJS.WriteStream = process.stdout): boolean {
  return Boolean(stream.isTTY) && !process.env.NO_COLOR;
}

export function colorize(value: string, state: TerminalState, enabled: boolean): string {
  if (!enabled) {
    return value;
  }

  const code =
    state === "observed" ? "32" : state === "warn" ? "33" : state === "failed" ? "31" : "90";
  return `\u001B[${code}m${value}\u001B[0m`;
}

export function glyph(
  state: TerminalState,
  options: { unicode?: boolean; color?: boolean } = {}
): string {
  const unicode = options.unicode ?? true;
  const value = unicode
    ? state === "observed"
      ? "✓"
      : state === "warn"
        ? "⚠"
        : state === "failed"
          ? "✗"
          : "·"
    : state === "observed"
      ? "[ok]"
      : state === "warn"
        ? "[warn]"
        : state === "failed"
          ? "[fail]"
          : "[..]";
  return colorize(value, state, options.color ?? false);
}

export function arrow(options: { unicode?: boolean; color?: boolean } = {}): string {
  return colorize(options.unicode === false ? "->" : "→", "neutral", options.color ?? false);
}
