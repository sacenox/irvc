#!/usr/bin/env bash
# Installs the IRVC + LiveKit services. Run with sudo from this directory.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
caller="$(getent passwd "${SUDO_USER:-$USER}" | cut -d: -f6)"
lk_bin_src="$caller/.local/bin/livekit-server"

[[ $EUID -eq 0 ]] || { echo "run with sudo" >&2; exit 1; }
[[ -x "$lk_bin_src" ]] || { echo "missing $lk_bin_src (download it first)" >&2; exit 1; }
for f in livekit.yaml irvc.env livekit.service irvc.service; do
  [[ -f "$here/$f" ]] || { echo "missing $here/$f" >&2; exit 1; }
done

install -m 755 "$lk_bin_src" /usr/local/bin/livekit-server
install -o root -g user -m 640 "$here/livekit.yaml" /etc/livekit.yaml
install -o root -g root -m 600 "$here/irvc.env"    /etc/irvc.env
install -m 644 "$here/livekit.service" /etc/systemd/system/livekit.service
install -m 644 "$here/irvc.service"    /etc/systemd/system/irvc.service

systemctl daemon-reload
systemctl enable --now livekit.service irvc.service

systemctl --no-pager --full status livekit.service irvc.service || true
