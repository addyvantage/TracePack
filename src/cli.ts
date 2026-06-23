#!/usr/bin/env node
import { Command } from "commander";
import { TRACEPACK_VERSION } from "./core/manifest.js";
import { registerAssert } from "./commands/assert.js";
import { registerClean } from "./commands/clean.js";
import { registerDoctor } from "./commands/doctor.js";
import { registerFinish } from "./commands/finish.js";
import { registerReport } from "./commands/report.js";
import { registerRun } from "./commands/run.js";
import { registerStart } from "./commands/start.js";
import { registerStatus } from "./commands/status.js";

const program = new Command();

program
  .name("tracepack")
  .description("Local-first review evidence bundles for AI-assisted code changes.")
  .version(TRACEPACK_VERSION);

registerStart(program);
registerRun(program);
registerStatus(program);
registerFinish(program);
registerReport(program);
registerAssert(program);
registerClean(program);
registerDoctor(program);

program.showHelpAfterError();

try {
  await program.parseAsync(process.argv);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`TracePack error: ${message}`);
  process.exitCode = 1;
}
