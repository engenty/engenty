#!/usr/bin/env bash
# Snapshot the spaces tree — every App's source repository and /data directory.
#
# It is tenant data with no other copy: the repositories are not mirrored
# anywhere and the SQLite files under data/ are the Apps' databases. Run it
# from cron on the host that binds /opt/engenty/spaces, e.g. daily:
#
#   15 3 * * * /opt/engenty/deploy/scripts/backup-spaces.sh >> /var/log/engenty-backup.log 2>&1
#
# An App writes its database as one whole file at close(), so a copy taken
# mid-write can catch a torn file. `rsync` first makes a consistent local
# mirror (a second pass is cheap and settles anything that moved), then the
# mirror is archived. Keeps the newest $KEEP archives.
set -euo pipefail

SPACES_DIR="${ENGENTY_SPACES_DIR:-/opt/engenty/spaces}"
BACKUP_DIR="${ENGENTY_BACKUP_DIR:-/opt/engenty/backups}"
KEEP="${ENGENTY_BACKUP_KEEP:-14}"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
mirror="$BACKUP_DIR/spaces-mirror"
archive="$BACKUP_DIR/spaces-$stamp.tar.zst"

install -d -m 700 "$BACKUP_DIR"
rsync -a --delete "$SPACES_DIR/" "$mirror/"
rsync -a --delete "$SPACES_DIR/" "$mirror/"
tar --zstd -cf "$archive" -C "$mirror" .

# Prune, newest first.
ls -1t "$BACKUP_DIR"/spaces-*.tar.zst 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f

echo "$(date -u +%FT%TZ) wrote $archive ($(du -h "$archive" | cut -f1))"
