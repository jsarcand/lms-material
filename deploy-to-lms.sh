#!/usr/bin/env bash
# Deploy DEVELOPMENT MaterialSkin to a Lyrion Music Server host.
# Usage: ./deploy-to-lms.sh [user@host]
# Example: ./deploy-to-lms.sh pi@192.168.1.4

set -euo pipefail

TARGET="${1:-tc@192.168.1.4}"
SRC="$(cd "$(dirname "$0")/MaterialSkin" && pwd)"

PLUGIN_PATHS=(
  "/mnt/mmcblk0p2/tce/slimserver/Cache/Plugins"
  "/var/lib/lyrionmusicserver/Plugins"
  "/usr/share/lyrionmusicserver/Plugins"
  "/usr/share/squeezeboxserver/Plugins"
  "$HOME/lyrion/Plugins"
  "$HOME/Library/Application Support/Squeezebox/Plugins"
)

echo "==> Probing plugin path on ${TARGET}..."
REMOTE_PLUGINS=""
for path in "${PLUGIN_PATHS[@]}"; do
  if ssh -o ConnectTimeout=5 "$TARGET" "test -d \"$(dirname "$path")\" || test -d \"$path\"" 2>/dev/null; then
    if ssh "$TARGET" "mkdir -p \"$path\" && echo ok" 2>/dev/null | grep -q ok; then
      REMOTE_PLUGINS="$path"
      break
    fi
  fi
done

if [[ -z "$REMOTE_PLUGINS" ]]; then
  echo "Could not auto-detect Plugins folder."
  echo "SSH in and tell us the path, then run:"
  echo "  rsync -av --delete \"$SRC/\" ${TARGET}:/path/to/Plugins/MaterialSkin/"
  exit 1
fi

echo "==> Using: ${TARGET}:${REMOTE_PLUGINS}/MaterialSkin"
tar -C "$(dirname "$SRC")" -cf - "$(basename "$SRC")" | ssh "$TARGET" "mkdir -p '${REMOTE_PLUGINS}' && tar -C '${REMOTE_PLUGINS}' -xf -"

# pCP/LMS may also load from Cache/InstalledPlugins (repo-installed copy).
# Keep that tree in sync so server-side Plugin.pm changes are not shadowed.
INSTALLED_PLUGINS=""
if ssh "$TARGET" "test -d /mnt/mmcblk0p2/tce/slimserver/Cache/InstalledPlugins/Plugins" 2>/dev/null; then
  INSTALLED_PLUGINS="/mnt/mmcblk0p2/tce/slimserver/Cache/InstalledPlugins/Plugins"
elif ssh "$TARGET" "test -d /usr/local/slimserver/Cache/InstalledPlugins/Plugins" 2>/dev/null; then
  INSTALLED_PLUGINS="/usr/local/slimserver/Cache/InstalledPlugins/Plugins"
fi
if [[ -n "$INSTALLED_PLUGINS" && "$INSTALLED_PLUGINS" != "$REMOTE_PLUGINS" ]]; then
  echo "==> Also syncing to: ${TARGET}:${INSTALLED_PLUGINS}/MaterialSkin"
  tar -C "$(dirname "$SRC")" -cf - "$(basename "$SRC")" | ssh "$TARGET" "mkdir -p '${INSTALLED_PLUGINS}' && tar -C '${INSTALLED_PLUGINS}' -xf -"
fi

echo "==> Restarting Lyrion (best-effort)..."
ssh "$TARGET" "sudo /usr/local/etc/init.d/slimserver stop 2>/dev/null; sleep 2; sudo /usr/local/etc/init.d/slimserver start 2>/dev/null || sudo systemctl restart lyrion 2>/dev/null || sudo systemctl restart squeezeboxserver 2>/dev/null || true"

echo "==> Persisting to disk (pCP: RAM overlay — run pcp bu after changes in /home/tc)..."
ssh "$TARGET" "test -e /usr/local/slimserver/Plugins || ln -s /mnt/mmcblk0p2/tce/slimserver/Cache/Plugins /usr/local/slimserver/Plugins; pcp bu 2>/dev/null || true"

echo "==> Done. Open Material Skin and confirm revision shows DEV- or GIT- (not 6.4.4)."
echo "    http://192.168.1.4:9000/material/?layout=mobile&debug=json"