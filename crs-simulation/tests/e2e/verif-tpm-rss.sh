#!/bin/bash
# Testeur indépendant : relevé périodique de la mémoire résidente des Chromium lancés par les scripts verif-tpm-*.
# Usage : bash tests/e2e/verif-tpm-rss.sh <fichier.log> [période s]
out="$1"; period="${2:-15}"
desc() { for c in $(pgrep -P "$1"); do echo "$c"; desc "$c"; done; }
while true; do
  now=$(date +%H:%M:%S)
  for np in $(pgrep -x node); do
    args=$(ps -o args= -p "$np" 2>/dev/null)
    case "$args" in "node tests/e2e/verif-tpm-"*) ;; *) continue;; esac
    name=$(echo "$args" | sed 's/.*verif-tpm-//' | cut -c1-44)
    br=0; rend=0; gpu=0
    for k in $(desc "$np"); do
      a=$(ps -o args= -p "$k" 2>/dev/null); r=$(ps -o rss= -p "$k" 2>/dev/null | tr -d ' '); [ -z "$r" ] && continue
      case "$a" in *chrome-headless-shell*type=renderer*) rend=$((rend + r));; *chrome-headless-shell*type=gpu-process*) gpu=$((gpu + r));; *chrome-headless-shell*type=*) ;; *chrome-headless-shell.real*) br=$((br + r));; esac
    done
    echo "$now $name navigateur=$((br / 1024))Mo rendu=$((rend / 1024))Mo gpu=$((gpu / 1024))Mo libre=$(free -m | awk 'NR==2{print $7}')Mo charge=$(cut -d' ' -f1 /proc/loadavg)" >> "$out"
  done
  sleep "$period"
done
