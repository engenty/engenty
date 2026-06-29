// In-process registry of live Gondolin VMs.
//
// Gondolin VMs are owned by this process (unlike Docker containers, which the
// daemon keeps and we sweep via `docker ps`). We track live VMs here so the
// shutdown hook can close them on SIGINT/SIGTERM and we don't leak QEMU/krun
// processes when `pnpm dev:ai` stops. Typed structurally (just `close()`) to
// avoid importing the heavy `@earendil-works/gondolin` package at load time.

export interface ClosableVm {
  close(): Promise<void>;
}

const liveVms = new Set<ClosableVm>();

export function registerGondolinVm(vm: ClosableVm): void {
  liveVms.add(vm);
}

export function unregisterGondolinVm(vm: ClosableVm): void {
  liveVms.delete(vm);
}

// Close every tracked VM, returning how many were closed. Best-effort: a failing
// close is logged by the caller, not retried.
export async function destroyAllEngentyGondolinVms(): Promise<number> {
  const vms = [...liveVms];
  liveVms.clear();
  let destroyed = 0;
  for (const vm of vms) {
    try {
      await vm.close();
      destroyed += 1;
    } catch {
      // Swallow — teardown is best-effort; the process is exiting anyway.
    }
  }
  return destroyed;
}
