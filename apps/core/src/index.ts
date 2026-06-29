import { createCli } from "./cli.js";

const program = await createCli();
program.parse();
