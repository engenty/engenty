#!/usr/bin/env node
import { runStandaloneCli } from "./standalone.js";

process.exitCode = await runStandaloneCli(process.argv);
