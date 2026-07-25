# Phase 0 spike — `@rivet-dev/agentos-apps`

Result of the gate defined in [PLAN-engenty-apps.md](PLAN-engenty-apps.md) §6 Phase 0. Run
2026-07-25 against `@rivet-dev/agentos-apps@0.2.14` (published the same morning) and `@0.2.13`
(published the previous evening), on darwin/arm64 (node 24.14.0) and linux/arm64 in Docker
(`node:24-bookworm-slim`, node 24.18.0). Every result below was reproduced on both platforms.

**Verdict: the gate does not pass unmodified.** Self-hosting works and is genuinely self-contained,
but `deployApp()` — the package's single core function, and its own README example — fails on every
published version until the dependency is patched. Per-app SQLite, the plan's "local storage", is
additionally unproven — though a follow-up spike (§4a) narrowed *why*: SQLite works, the guest just
cannot reach any actor.

---

## 1. Self-containment — PASS

`registry.start()` spawns a **native Rivet Engine binary automatically**. No Rivet Cloud, no separate
engine deployment, no account, no token.

```
  RivetKit 2.3.9 (Engine - Serverful)
  - Endpoint:     http://127.0.0.1:6420 (local native)
  - Actors:       3
```

- Engine binary: `node_modules/@rivetkit/engine-cli-<platform>/rivet-engine start`, an
  `optionalDependencies` platform package of `rivetkit`. RSS ≈ 111 MB.
- A second native binary is also spawned: `@rivet-dev/agentos-sidecar-<platform>/agentos-sidecar`
  (the trusted sidecar that owns the guest VFS and syscall brokering).
- Persistence: `~/.rivetkit/var/engine/db` (RocksDB-style store) plus logs under
  `~/.rivetkit/var/logs/`. 176 KB with two apps deployed.

**Consequences for `apps/app-host`:** it is not "one node process" — it is one node process that
supervises two native child processes. The Docker image must contain the linux platform packages for
both `@rivetkit/engine-cli` and `@rivet-dev/agentos-sidecar`, and `~/.rivetkit` must be a mounted
volume, not container-ephemeral. Boot is ~24 s cold on first run, ~3 s once the engine store exists.

## 2. `deployApp()` is broken on every published version — the blocking finding

The README's own hello-world fails:

```
RivetError: tar failed with exit code 1
  code: 'agentos_apps_pack_failed'
  metadata: { exitCode: 1, stderr: 'tar: Permission denied (os error 2)\n', stdout: '' }
```

Identical on `0.2.13` and `0.2.14`, on darwin/arm64 and linux/arm64. It is not a platform, TMPDIR,
tar-flag or permissions-of-the-host issue. Isolated with a direct VM probe:

| operation | result |
| --- | --- |
| `tar -cf /tmp/out.tar .` (guest FS) | **exit 0** |
| `tar -cf /agentos-app-output/plain.tar .` (host-dir mount) | exit 1 — `Permission denied (os error 2)` |
| `sh -c 'echo x > /agentos-app-output/probe.txt'` | exit 1 — same error |
| same, to a file pre-created on the host | exit 1 — same error |
| `vm.writeFiles([{path:"/agentos-app-output/…"}])` (host-side API) | **success — file appears on the host** |

So the mount is wired correctly and the host side of it works; **guest processes cannot write
through `createHostDirBackend`** in `@rivet-dev/agentos-core@0.2.13/0.2.14`. `buildRelease` packs
every release by running guest `tar` into exactly that mount
(`dist/index.js` `buildRelease`, `cwd: "/release"` → `build.artifactGuestPath`), so no deployment of
any kind can succeed.

Note the errno is itself inconsistent: the message says "Permission denied" (EACCES, 13) while the
code says `os error 2` (ENOENT), which suggests a WASI errno mapping bug in the guest FS path.

### The patch that unblocks it

`createBuildVm` (`dist/index.js`) mounts a host tmpdir at `/agentos-app-output` and reads the packed
tar back off the host filesystem. Replacing that with a guest-FS path plus the host-side read API
works, and needs no other change:

```js
const createBuildVm = async () => {
  const artifactGuestPath = "/agentos-app-output/agentos-app.tar";
  const vm = await AgentOs.create({ ...buildVmOptions });
  await vm.mkdir("/agentos-app-output");
  return {
    artifactGuestPath,
    writeFiles: (...args) => vm.writeFiles(...args),
    execArgv: (...args) => vm.execArgv(...args),
    artifactSize: async () => Number((await vm.stat(artifactGuestPath)).size),
    readArtifact: async () => new Uint8Array(await vm.readFile(artifactGuestPath)),
    dispose: async () => { await vm.dispose(); },
  };
};
```

Verified independently before applying: guest `tar` into the guest VFS with a 2 MB payload exits 0,
and host-side `vm.stat` + `vm.readFile` return exactly 2 100 736 bytes both ways.

Two caveats if we adopt this:

- `readFile` goes over the sidecar bridge, capped at `maxPreadBytes: 15 MiB` / `maxFdWriteBytes:
  16 MiB`. Fine for our app sizes; a large artifact would need chunked reads.
- It moves the uncompressed tar into the guest filesystem budget. The package's own
  `maxFilesystemBytes` comment already says "packaging temporarily stores both the installed
  application tree and its uncompressed tar", which suggests the guest-FS path is what the limits
  were written for and the host-dir mount is the newer, broken change.

This is a patch to a third party's `dist/`. It would ship as a `pnpm patch` and must be re-verified on
every dependency bump.

## 3. With the patch applied — static and backend apps PASS

Measured on darwin/arm64, warm engine.

| case | build | serve |
| --- | --- | --- |
| static (`index.html` only) | 34 s first, cold engine | 200 OK, 195 ms cold, 154–362 ms warm |
| backend (`package.json` + `index.js`, no deps) | 20 s | 200 OK, 104–138 ms |

The backend contract is web-standard and pleasant: `export default { fetch(request) }` returning a
`Response`. Node `v22.0.0` inside the isolate. JSON request bodies, `URL`, `Response.json` all work.
In-memory state survives across requests within a replica.

```
GET  /apps/counter-app/hello  → {"ok":true,"path":"/hello","hits":1,"node":"v22.0.0"}
POST /apps/counter-app/echo   → {"echoed":{"a":1},"hits":2}
```

## 4. Per-app SQLite — NOT PROVEN

SQLite is only reachable through the RivetKit-in-guest path: the app must declare `rivetkit` as a
dependency and `export const registry = setup(...)`, with tables on an actor's `db({ onMigrate })`.
The replica filesystem is explicitly ephemeral (releases are materialised as a temporary `.aospkg`
for the VM lifetime and deleted on disposal), so there is no simpler durable store.

Two problems, both unresolved:

1. **Build time.** Deploying a `rivetkit`-dependent app took **369 s** and logged
   `gateway_response_start_timeout … Timed out during response_start after 300000 ms` on the way
   through. Dependencies are installed inside the disposable build VM on every deploy, so this is
   the per-deploy cost, not a one-off. Six minutes per release is not an acceptable authoring loop
   for `engenty.app-coder`.
2. **Every request 500s — second independent bug, root-caused.** The guest actor registers with the
   Engine (its actor key appears in the host log) but the guest cannot open a socket to its scoped
   Engine proxy. A diagnostic app deployed to read its own environment and probe the endpoint with a
   raw `fetch` — no RivetKit client involved — returns:

   ```json
   {
     "rivetEnv": {
       "RIVETKIT_RUNTIME": "wasm",
       "RIVETKIT_RUNTIME_MODE": "serverless",
       "RIVET_ENDPOINT": "http://127.0.0.1:49327/9554c1e6…93ceae",
       "RIVET_NAMESPACE": "default",
       "RIVET_POOL": "agentos-apps-fd0791870d830def"
     },
     "probes": [
       { "url": "http://127.0.0.1:49327/9554c1e6…", "error": "Error: net.connect bridge returned an empty socket handle" },
       { "url": "http://127.0.0.1:49327/",          "error": "Error: net.connect bridge returned an empty socket handle" }
     ]
   }
   ```

   The environment is wired correctly (scoped, tokenised, per-app proxy endpoint exactly as
   `replicaGuestEnvironment` intends). The failure is in agentOS's **guest network bridge**:
   `net.connect` returns an empty socket handle for the loopback-exempt proxy port
   (`replicaLoopbackExemptPorts`). It is not a client-construction mistake and not IPv6 — a bare
   `fetch()` to the literal 127.0.0.1 endpoint fails the same way.

So there are **two** independent defects in the published preview: guest→host-dir-mount writes (§2)
and guest→loopback-exempt TCP. The first has a patch; the second is inside the sidecar's network
stack and is not patchable from our side. Per-app SQLite via the in-guest path therefore stays
unavailable, which is why `module_apps.app_data` is the v1 store.

### 4a. Re-spiked 2026-07-25 against the Rivet cookbooks — SQLite itself is fine

Rivet's [per-tenant database cookbook](https://rivet.dev/cookbook/per-tenant-database/) and the
kitchen-sink [`sqlite-raw.ts`](https://github.com/rivet-dev/rivet/blob/main/examples/kitchen-sink/src/actors/state/sqlite-raw.ts)
both work, so the obvious question is why ours doesn't. Answered by running the cookbook's exact
pattern in *our* process, against *our* registry:

```js
const probeActor = actor({
  db: db({ onMigrate: async (c) => { await c.execute("CREATE TABLE IF NOT EXISTS probe (…)"); } }),
  actions: { addNote: …, listNotes: … },
});
const { appsActors } = setupApps();
setup({ use: { ...appsActors, probeActor } }).start();
const handle = createClient().probeActor.getOrCreate(["tenant-spike", "app-spike"]);
```

It passed on the first run — rows written and read back out of a real per-key SQLite database.

**So `rivetkit/db` is not broken, and the cookbooks are not wrong.** The distinction the cookbooks
never have to make is *who defines the actor*:

| | Actor defined by | Reaches the Engine via | Works |
|---|---|---|---|
| Cookbook / kitchen-sink | the host process | in-process registry | **yes — verified here** |
| Our Apps, in-guest path | tenant code inside the app VM | `net.connect` to the scoped proxy | no — §4.2 |

Every Rivet cookbook is a single trusted process that owns its own actors. That is the case that
works, and it is not the case we have: an engenty App is untrusted tenant code inside an agentOS
guest VM, and the only path from there to an actor is the loopback bridge that returns an empty
socket handle. The blocker was never SQLite — it is that **the guest cannot reach any actor at all**,
and per-app SQLite was simply the first thing that needed to.

This reframes the fix. Rather than waiting on the sidecar's network bridge, the host can define a
trusted per-app storage actor itself — keyed `[tenantId, appId]`, exactly the cookbook's
key-is-the-tenant isolation model — and let the guest reach it through the *existing* engenty bridge
that already carries `data_get`/`data_set`/`data_delete`/`data_list`, which does not touch the broken
path. That swaps the `app_data` table for real per-app SQLite behind the same four operations, with
no change to any App. It is not implemented; §5's `app_data` remains what ships.

## 5. What this means for the plan

- **§6 Phase 1 (`apps/app-host`)** is buildable but would ship a patched preview dependency and two
  native child-process binaries, for a backend capability we cannot yet persist state in.
- **§6 Phases 2, 3, 4, 5, 6** do not depend on the runtime at all — the module and its schema, the
  bridged frame in the artifact pane, the proxy and capability wall, authoring, and copilot/coordinator
  consumption are all engenty-side work. An app that is inlined HTML in the pane talking to engenty
  through the manifest-scoped proxy satisfies three of the four requirements with no agentOS involved.
- The runtime therefore wants to sit behind a narrow port (`deploy` / `call` / `destroy`) so the
  agentOS adapter can land when upstream is fixed, without any of the rest waiting on it.

The two questions this leaves are which storage an App gets in the meantime, and whether we are
willing to run a patched preview dependency at all.
