# Edge blue-green releases on Coolify

This production layout keeps the public UI and core API online during releases.
Two Coolify edge applications alternate behind Traefik while a third application
runs the stable AI, app-host, Gotenberg, docs, and core background worker.

This is Level 2 availability: backend promotion happens after edge cutover and
can briefly interrupt `/ai`. Fully uninterrupted AI streams and workers require
rolling backend replicas and are intentionally outside this design.

## Topology

| Coolify application | Compose file | Public routing |
|---|---|---|
| `engenty-edge-blue` | `docker-compose.edge.prebuilt.yaml` | Production + blue health domain |
| `engenty-edge-green` | `docker-compose.edge.prebuilt.yaml` | Production + green health domain |
| `engenty-backend` | `docker-compose.backend.prebuilt.yaml` | None |

Both edge applications are configured for the production domain, but only the
active color normally runs. During promotion Traefik adds the healthy candidate,
the orchestrator verifies it directly, then stops the previous color.

## One-time host preparation

Create the shared network and durable app-host directory:

```bash
apt-get install -y curl jq util-linux
docker network create engenty-runtime
install -d -m 700 /opt/engenty/app-host-data
install -d -m 700 /etc/engenty /var/lib/engenty-deploy
```

The old combined stack used a named `engenty-app-host-data` volume. Before
starting the new backend, copy that volume's contents into the bind directory.
Confirm the source volume with `docker volume ls`; do not guess its name.

```bash
docker run --rm \
  -v <existing-app-host-volume>:/source:ro \
  -v /opt/engenty/app-host-data:/target \
  alpine sh -c 'cp -a /source/. /target/'
```

Verify `/opt/engenty/app-host-data/.rivetkit` exists when deployed Apps already
exist. Keep the old stack stopped but intact until the new backend has passed
its health checks.

## Create the stable backend

Create a Docker Compose application using
`deploy/docker-compose.backend.prebuilt.yaml`.

1. Set `ENGENTY_BACKEND_RELEASE_TAG` to the currently deployed immutable tag.
2. Copy the existing runtime variables to the application.
3. Enable `COMPOSE_PROFILES=docs,studio` only for enabled optional services.
4. Do not assign a public domain.
5. Deploy and verify `engenty-ai`, `engenty-app-host`, and
   `engenty-core-worker` are healthy.

The worker uses the edge image with
`ENGENTY_CORE_BACKGROUND_SERVICES_ENABLED=true`. Public edges set it to `false`,
so queue consumers and registered plugin loops never run twice during overlap.

## Create the two edge applications

Create two Docker Compose applications using
`deploy/docker-compose.edge.prebuilt.yaml`.

For each color:

1. Set `ENGENTY_DEPLOY_COLOR` to `blue` or `green`.
2. Set `ENGENTY_RELEASE_TAG` to the currently deployed immutable tag.
3. Copy the core runtime variables from the old application.
4. Assign two domains to service `engenty-edge` on port 8787:
   - the shared production domain;
   - a color-specific health domain.
5. Keep `traefik.docker.network=coolify` and attach the application to the
   external `engenty-runtime` network through the Compose file.

Start one color, verify both of its domains, then stop the other. Record the
running color:

```bash
printf '%s\n' blue >/var/lib/engenty-deploy/active-color
```

## Install the release orchestrator

Copy `deploy/blue-green.env.example` to
`/etc/engenty/blue-green.env` and replace every placeholder. Create:

- `/etc/engenty/coolify-api-token`: a Coolify token scoped to application
  environment updates, deploys, deployment reads, and stops;
- `/etc/engenty/migration.env`: one line containing `SUPABASE_DB_URL=...`.

Protect and install the files:

```bash
chmod 600 /etc/engenty/blue-green.env \
  /etc/engenty/coolify-api-token \
  /etc/engenty/migration.env
install -m 750 deploy/scripts/coolify-deploy.sh /opt/coolify-deploy.sh
```

Pin the CI public key in `/root/.ssh/authorized_keys`:

```text
command="/opt/coolify-deploy.sh",no-pty,no-port-forwarding,no-x11-forwarding,no-agent-forwarding <ci-public-key>
```

The script validates `SSH_ORIGINAL_COMMAND` and accepts only
`deploy vX.Y.Z`. It serializes releases with `flock`.

## Release sequence

The tag workflow:

1. Builds and pushes immutable GHCR images.
2. Pre-pulls the release on the VPS while the active edge serves.
3. Runs the migration image before candidate startup.
4. Updates and deploys the inactive edge color.
5. Requires the candidate `/api/ready` and `/api/openapi.json` to pass.
6. Stops the old color and verifies the production domain.
7. Records the new active color.
8. Promotes the stable backend and waits for `/ai/health`.

A failure before edge promotion stops the candidate and leaves the active color
untouched. A failed public cutover restarts the previous color.

## Migration contract

Every release migration must be compatible with both old and new code:

- Add nullable columns/tables/indexes before code starts using them.
- Backfill separately from request-path DDL.
- Deploy reads/writes that tolerate both schemas.
- Drop or tighten constraints only in a later release after rollback is no
  longer required.
- Avoid long blocking DDL; use concurrent/index-safe forms where supported.

The migration container remains idempotent through Supabase's migration history.

## Manual rollback

If the candidate has not been promoted, stop it; the old color is still active.
After promotion, deploy the previous immutable tag to the inactive color and run
the normal promotion command. Do not retag `latest`.

If automation is unavailable:

1. Start the previous color from Coolify.
2. Verify its color health domain.
3. Stop the bad color with Docker cleanup disabled.
4. Update `/var/lib/engenty-deploy/active-color`.

Database rollback is not automatic. Forward-fix migrations are preferred; the
expand/contract policy preserves old-code compatibility during application
rollback.
