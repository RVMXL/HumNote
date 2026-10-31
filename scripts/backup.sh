#!/usr/bin/env bash
# HumNote — многослойный бэкап проекта (переживает откат песочницы).
# Копия этого скрипта обязана жить в репо (scripts/backup.sh) + на /home/z/backup_all.sh.
#
# Слои:
#   1) git-коммиты (рабочий репозиторий)
#   2) bare-репозиторий /home/z/humnote-backup.git
#   3) зеркало-tgz в /tmp/humnote-backups (ротация, хранится 5)
#   4) полный tar проекта /home/sync/repo.tar — /start.sh распаковывает его
#      при рестарте песочницы (слой восстановления)
#
# Запуск: bash scripts/backup.sh   (из корня проекта)
set -eu

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# копия скрипта лежит и на /home/z/backup_all.sh — там dirname/.. не корень проекта
if [ ! -d "$REPO_DIR/.git" ]; then REPO_DIR=/home/z/my-project; fi
cd "$REPO_DIR"

BARE="/home/z/humnote-backup.git"
TMP_DIR="/tmp/humnote-backups"
TAR_LIVE="/home/sync/repo.tar"
STAMP="$(date +%Y%m%d-%H%M%S)"
SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

# Слой 2: bare-репозиторий
if [ ! -d "$BARE" ]; then
  git init --bare -b main "$BARE" >/dev/null
fi
git push -q backup main 2>/dev/null || git remote add backup "$BARE" && git push -q backup main || true
git push -q backup --tags 2>/dev/null || true

# Слой 3: зеркало в /tmp (ротация 5)
mkdir -p "$TMP_DIR"
git archive --format=tar.gz --prefix="humnote-$SHA/" -o "$TMP_DIR/project-$STAMP.tgz" HEAD
ls -1t "$TMP_DIR"/project-*.tgz 2>/dev/null | tail -n +6 | xargs -r rm -f

# Слой 4: полный tar в /home/sync (восстановление при рестарте песочницы)
mkdir -p "$(dirname "$TAR_LIVE")"
tar -cf "$TAR_LIVE" --exclude='.next' --exclude='node_modules' --exclude='out' --exclude='android/.gradle' --exclude='android/app/build' -C "$REPO_DIR" .

echo "backup OK: $SHA $(git log -1 --pretty=%s 2>/dev/null || true)"
echo "  слой 3: $TMP_DIR/project-$STAMP.tgz"
echo "  слой 4: $TAR_LIVE ($(du -h "$TAR_LIVE" | cut -f1))"
