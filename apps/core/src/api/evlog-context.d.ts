import type { RequestLogger } from "evlog";

declare module "hono" {
  interface ContextVariableMap {
    evlog: RequestLogger;
  }
}
