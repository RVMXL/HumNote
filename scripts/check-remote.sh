#!/usr/bin/env bash
# HumNote — сверка локального состояния проекта с remote на GitHub.
#
# ЗАЧЕМ: песочница может быть откачена к старому снапшоту, при этом файлы
# «выглядят» рабочими. Чтобы не терять время, любая сессия начинается с
# `bun run sync:check` — скрипт показывает дрейф между локалкой и GitHub.
#
# Режимы:
#   check    (по умолчанию) — отчёт: локальный/удалённый SHA, ahead/behind,
#                            грязные файлы, теги. Коды выхода: 0 = синхронно,
#                            2 = есть дрейф, 3 = remote недоступен, 1 = ошибка.
#   pull     — fast-forward локального main до origin/main (если чисто).
#   push     — запушить main в origin (токен берётся из $GITHUB_TOKEN
#              или .env.local, в git config НЕ сохраняется).
#   restore  — восстановить .git/репозиторий, если песочница его потеряла:
#              1) /home/sync/repo.tar (локальный бэкап), 2) clone с GitHub.
#
# Примеры:
#   bash scripts/check-remote.sh check
#   bash scripts/check-remote.sh push          # GITHUB_TOKEN=ghp_xxx ...
set -u

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

ORIGIN_URL="https://github.com/RVMXL/HumNote.git"
BRANCH="main"
TAR_BACKUP="/home/sync/repo.tar"
BARE_BACKUP="/home/z/humnote-backup.git"

# GITHUB_TOKEN: env → .env.local (в репозиторий не попадает, .gitignore)
if [ -z "${GITHUB_TOKEN:-}" ] && [ -f .env.local ]; then
  GITHUB_TOKEN="$(grep -E "^GITHUB_TOKEN=" .env.local | head -1 | cut -d= -f2-)"
fi

c_green=$'\033[32m'; c_red=$'\033[31m'; c_yel=$'\033[33m'; c_dim=$'\033[2m'; c_off=$'\033[0m'
ok()   { echo "${c_green}✔${c_off} $*"; }
warn() { echo "${c_yel}⚠${c_off} $*"; }
bad()  { echo "${c_red}✘${c_off} $*"; }
dim()  { echo "${c_dim}  $*${c_off}"; }

auth_url() {
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    echo "https://x-access-token:${GITHUB_TOKEN}@github.com/RVMXL/HumNote.git"
  else
    echo "$ORIGIN_URL"
  fi
}

# ---------- restore ----------
do_restore() {
  if [ -d .git ]; then
    ok ".git на месте — restore не нужен"
    exit 0
  fi
  warn ".git отсутствует (откат песочницы?) — восстанавливаю"
  if [ -f "$TAR_BACKUP" ]; then
    echo "→ распаковываю $TAR_BACKUP ..."
    tar -xf "$TAR_BACKUP" -C "$REPO_DIR"
    if [ -d .git ]; then
      ok "восстановлено из repo.tar"
      exit 0
    fi
  fi
  echo "→ клонирую с GitHub ..."
  git clone --branch "$BRANCH" "$(auth_url)" "$REPO_DIR" \
    || { bad "clone не удался"; exit 1; }
  ok "клонировано с GitHub"
  exit 0
}

# ---------- check ----------
do_check() {
  echo "── HumNote sync check @ $(date '+%Y-%m-%d %H:%M') ──"

  # 0. резервные слои (работают всегда, офлайн)
  if [ -f "$TAR_BACKUP" ]; then
    dim "слой 4: $TAR_BACKUP существует ($(du -h "$TAR_BACKUP" | cut -f1), $(date -r "$TAR_BACKUP" '+%Y-%m-%d %H:%M'))"
  else
    warn "слой 4: $TAR_BACKUP отсутствует"
  fi
  if [ -d "$BARE_BACKUP" ]; then
    dim "слой 2: bare-бэкап существует (последний ref: $(git --git-dir="$BARE_BACKUP" rev-parse --short "$BRANCH" 2>/dev/null || echo '?'))"
  else
    warn "слой 2: bare-бэкап отсутствует"
  fi

  # 1. репозиторий вообще есть?
  if [ ! -d .git ]; then
    bad "локальный репозиторий ОТСУТСТВУЕТ"
    echo "  → запусти: bun run sync:restore"
    exit 1
  fi

  local_sha="$(git rev-parse --short HEAD)"
  dirty="$(git status --porcelain | wc -l)"
  echo "локально:    $local_sha на $BRANCH$( [ "$dirty" -gt 0 ] && echo ", $dirty изменённых файлов" )"

  # 2. доступен ли GitHub
  if ! git ls-remote --heads origin "$BRANCH" >/dev/null 2>&1; then
    warn "GitHub недоступен (сеть?) — сверяюсь с локальным bare-бэкапом"
    if [ -d "$BARE_BACKUP" ]; then
      backup_sha="$(git --git-dir="$BARE_BACKUP" rev-parse --short "$BRANCH" 2>/dev/null || echo '?')"
      if [ "$backup_sha" = "$local_sha" ]; then
        ok "локально == bare-бэкап ($local_sha); GitHub проверь, когда появится сеть"
        exit 0
      fi
      bad "локально ($local_sha) != bare-бэкап ($backup_sha) — есть незапушенная работа"
      exit 2
    fi
    bad "ни GitHub, ни bare-бэкап недоступны"
    exit 3
  fi

  git fetch origin --tags --quiet

  remote_sha="$(git rev-parse --short "origin/$BRANCH")"
  echo "origin/main: $remote_sha (GitHub)"

  behind="$(git rev-list --count "HEAD..origin/$BRANCH")"
  ahead="$(git rev-list --count "origin/$BRANCH..HEAD")"

  state="SYNC"
  if [ "$behind" -gt 0 ] && [ "$ahead" -gt 0 ]; then state="DIVERGED"
  elif [ "$behind" -gt 0 ]; then state="BEHIND"
  elif [ "$ahead" -gt 0 ]; then state="AHEAD"
  fi

  # 3. теги
  missing_tags="$(comm -13 <(git ls-remote --tags --refs origin | awk -F/ '{print $3}' | sort) <(git tag -l | sort) | tr '\n' ' ')"
  stale_tags="$(comm -23 <(git ls-remote --tags --refs origin | awk -F/ '{print $3}' | sort) <(git tag -l | sort) | tr '\n' ' ')"
  [ -n "$stale_tags" ] && warn "теги есть на GitHub, нет локально: $stale_tags"

  case "$state" in
    SYNC)
      ok "локально == origin/main ($local_sha)"
      [ "$dirty" -gt 0 ] && warn "есть незакоммиченные изменения ($dirty) — закоммить и запушь"
      [ -n "$missing_tags" ] && warn "локальные теги не запушены: $missing_tags"
      [ "$dirty" -eq 0 ] && [ -z "$missing_tags" ] && exit 0
      exit 2
      ;;
    BEHIND)
      bad "локально ОТСТАЁТ на $behind коммитов — песочница откатилась!"
      echo "  → bun run sync:pull   (быстрый форвард на $remote_sha)"
      exit 2
      ;;
    AHEAD)
      warn "локально ВПЕРЕДИ на $ahead коммитов — работа не запушена"
      echo "  → закоммить и bun run sync:push"
      exit 2
      ;;
    DIVERGED)
      bad "расхождение: локально +$ahead / -$behind против origin/main"
      echo "  → разберись руками (git log --oneline origin/main..HEAD и наоборот)"
      exit 2
      ;;
  esac
}

# ---------- pull ----------
do_pull() {
  git fetch origin --tags --quiet || { bad "GitHub недоступен"; exit 3; }
  dirty="$(git status --porcelain | wc -l)"
  if [ "$dirty" -gt 0 ]; then
    bad "рабочее дерево грязное ($dirty) — сначала commit/stash, pull отменён"
    exit 1
  fi
  behind="$(git rev-list --count "HEAD..origin/$BRANCH")"
  if [ "$behind" -eq 0 ]; then
    ok "обновлять нечего"
    exit 0
  fi
  git merge --ff-only "origin/$BRANCH" || { bad "fast-forward невозможен (расхождение)"; exit 1; }
  ok "обновлено до $(git rev-parse --short HEAD) (+$behind коммитов)"
}

# ---------- push ----------
do_push() {
  if [ -z "${GITHUB_TOKEN:-}" ]; then
    warn "GITHUB_TOKEN не задан — пробую push без авторизации (сработает, если git уже помнит credentials)"
  fi
  git push "$(auth_url)" "$BRANCH" || { bad "push не удался"; exit 1; }
  git push "$(auth_url)" --tags || warn "теги запушить не удалось"
  ok "запушено: $(git rev-parse --short HEAD) + теги"
}

case "${1:-check}" in
  check)   do_check ;;
  pull)    do_pull ;;
  push)    do_push ;;
  restore) do_restore ;;
  *) echo "usage: $0 {check|pull|push|restore}"; exit 1 ;;
esac
