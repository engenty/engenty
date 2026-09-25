// Who answered the gate a run is resuming from — in memory, for this resume.
//
// A wizard's approval step is a person allowing a call the run's specialist
// wanted. The run itself continues on the service credential, and core, which
// gates the call too, only accepts it once somebody allowed to decide has
// decided its approval request. That somebody is the answerer: their bearer
// rides this context around the resume (never into the saved run state), and
// the replay spends it on core's request for exactly the approved calls. A
// process restart loses it, and the call then asks again — the safe way to
// fail.
import { AsyncLocalStorage } from "node:async_hooks";

export interface ResumeAnswerer {
  /** The answerer's own bearer, as their request carried it. */
  accessToken: string;
}

export const resumeAnswererAls = new AsyncLocalStorage<ResumeAnswerer>();
