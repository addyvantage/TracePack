import { createHash, randomBytes } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import type { SafePathDescriptor } from "./manifest.js";

const SENSITIVE_PATH_PATTERNS: RegExp[] = [
  /(^|[\\/])\.env(\..*)?$/i,
  /(^|[\\/])\.ssh([\\/]|$)/i,
  /(^|[\\/])\.aws([\\/]|$)/i,
  /(^|[\\/])\.azure([\\/]|$)/i,
  /(^|[\\/])\.config[\\/]gcloud([\\/]|$)/i,
  /(^|[\\/])\.docker[\\/]config\.json$/i,
  /(^|[\\/])\.npmrc$/i,
  /(^|[\\/])\.yarnrc(\.yml)?$/i,
  /(^|[\\/])\.pnpmrc$/i,
  /(^|[\\/])id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /(^|[\\/]).*\.(pem|key|p12|pfx)$/i,
  /(^|[\\/])(credentials|credential|secrets?|tokens?|cookies?)([\\/._-]|$)/i,
  /(^|[\\/])(login data|cookies|web data)$/i,
  /(^|[\\/])Library[\\/]Keychains([\\/]|$)/i,
  /(^|[\\/])AppData[\\/]Roaming[\\/]Microsoft[\\/]Protect([\\/]|$)/i
];

export const SAFE_FILE_HASH_LIMIT_BYTES = 1024 * 1024;

export function createRunId(date = new Date()): string {
  const stamp = date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  return `${stamp}-${randomBytes(3).toString("hex")}`;
}

export function tracepackDir(cwd: string): string {
  return path.join(cwd, ".tracepack");
}

export function activeSessionPath(cwd: string): string {
  return path.join(tracepackDir(cwd), "active-session.json");
}

export function runDirectory(cwd: string, runId: string): string {
  return path.join(tracepackDir(cwd), runId);
}

export function toPosixPath(value: string): string {
  return value.replaceAll("\\", "/").split(path.sep).join("/");
}

export function normalizeRelativePath(value: string): string {
  return toPosixPath(value).replace(/^\.\/+/, "");
}

export function isSensitivePath(value: string): boolean {
  const normalized = value.replaceAll("/", path.sep);
  return SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function safePathDescriptor(absolutePath: string, root?: string): SafePathDescriptor {
  if (root) {
    const relative = path.relative(root, absolutePath);
    if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
      return {
        label: normalizeRelativePath(relative) || ".",
        pathHash: shortHash(path.resolve(absolutePath)),
        representation: "relative"
      };
    }
  }

  return {
    label: path.basename(absolutePath) || ".",
    pathHash: shortHash(path.resolve(absolutePath)),
    representation: "basename"
  };
}

export function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export async function hashFileIfSafe(
  absolutePath: string,
  limitBytes = SAFE_FILE_HASH_LIMIT_BYTES
): Promise<string | undefined> {
  const info = await lstat(absolutePath);
  if (info.isSymbolicLink() || !info.isFile() || info.size > limitBytes) {
    return undefined;
  }

  const content = await readFile(absolutePath);
  return createHash("sha256").update(content).digest("hex");
}

export async function fileMetadata(absolutePath: string): Promise<{
  sizeBytes?: number;
  mtime?: string;
  sha256?: string;
  contentHashStatus?: "hashed" | "not_hashed";
  contentHashReason?: string;
}> {
  const info = await lstat(absolutePath);
  const base = {
    sizeBytes: info.size,
    mtime: info.mtime.toISOString()
  };

  if (info.isSymbolicLink()) {
    return {
      ...base,
      contentHashStatus: "not_hashed",
      contentHashReason: "Path is a symbolic link; TracePack did not read the target contents."
    };
  }

  if (!info.isFile()) {
    return {
      ...base,
      contentHashStatus: "not_hashed",
      contentHashReason: "Path is not a regular file; content hash was not captured."
    };
  }

  if (info.size > SAFE_FILE_HASH_LIMIT_BYTES) {
    return {
      ...base,
      contentHashStatus: "not_hashed",
      contentHashReason: `File is larger than the ${SAFE_FILE_HASH_LIMIT_BYTES} byte safe hashing limit.`
    };
  }

  const sha256 = await hashFileIfSafe(absolutePath);
  if (!sha256) {
    return {
      ...base,
      contentHashStatus: "not_hashed",
      contentHashReason: "File content hash could not be captured within safe hashing rules."
    };
  }

  return {
    ...base,
    sha256,
    contentHashStatus: "hashed"
  };
}

export function ensurePathInside(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return (
    relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative))
  );
}
