#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/common-garden}"
DATA_DIR="$APP_DIR/data"
MARKER="$DATA_DIR/.qa-db-imported"

cd "$APP_DIR"
git fetch origin main
mkdir -p "$DATA_DIR"

sudo -n /usr/bin/systemctl stop common-garden
pulled=0
db_ready=0

restart_if_safe() {
  if [ "$pulled" -eq 0 ] || [ "$db_ready" -eq 1 ]; then
    sudo -n /usr/bin/systemctl start common-garden || true
  else
    echo "Deploy stopped before database initialization; service left stopped to protect garden data." >&2
  fi
}
trap restart_if_safe EXIT

# Preserve the current live database before replacing it with the QA snapshot.
if [ ! -f "$MARKER" ]; then
  python3 - "$APP_DIR/garden.sqlite3" "$DATA_DIR" <<'PY'
import datetime, pathlib, sqlite3, sys

source_path, data_dir = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
if source_path.exists():
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = data_dir / f"pre-qa-live-{stamp}.sqlite3"
    with sqlite3.connect(source_path) as source, sqlite3.connect(backup_path) as backup:
        source.backup(backup)
    print(f"Backed up live database to {backup_path}")
PY
fi

# Discard runtime changes to the old tracked DB only after the backup is complete.
git checkout -- garden.sqlite3 2>/dev/null || true
git pull --ff-only origin main
pulled=1

# The QA snapshot is the last version of garden.sqlite3 in Git history.
if [ ! -f "$MARKER" ]; then
  db_revision="$(git log -1 --format=%H -- garden.sqlite3)"
  test -n "$db_revision"
  git show "$db_revision:garden.sqlite3" > "$DATA/garden.sqlite3.tmp"
  python3 - "$DATA/garden.sqlite3.tmp" <<'PY'
import sqlite3, sys

with sqlite3.connect(sys.argv[1]) as db:
    result = db.execute("PRAGMA integrity_check").fetchone()[0]
    if result != "ok":
        raise SystemExit(f"QA database integrity check failed: {result}")
PY
  mv "$DATA/garden.sqlite3.tmp" "$DATA/garden.sqlite3"
  touch "$MARKER"
  echo "Imported the QA garden database once."
fi

db_ready=1
sudo -n /usr/bin/systemctl start common-garden
systemctl is-active --quiet common-garden
trap - EXIT
echo "Common Garden is live with its persistent database."
