#!/usr/bin/env bash
# Manual EC2 user-data, Amazon Linux 2023 / Graviton. Does not deploy the app.
set -euo pipefail

# Sourceable for a checksum-failure test; deployment calls this after dnf below.
install_ffmpeg() {
  local task_dir=$1 target_dir=$2 link_dir=$3
  local ffmpeg_version=7.0.2
  local ffmpeg_archive=ffmpeg-7.0.2-arm64-static.tar.xz
  local ffmpeg_sha256=f4149bb2b0784e30e99bdda85471c9b5930d3402014e934a5098b41d0f7201b1
  curl --fail --location --silent --show-error --proto '=https' --tlsv1.2 --max-filesize 33554432 --max-time 120 \
    "https://johnvansickle.com/ffmpeg/releases/$ffmpeg_archive" -o "$task_dir/$ffmpeg_archive"
  # Verify the pinned archive before extraction or replacing any installed binary.
  printf '%s  %s\n' "$ffmpeg_sha256" "$task_dir/$ffmpeg_archive" | sha256sum --check --strict || return 1
  tar -xJf "$task_dir/$ffmpeg_archive" -C "$task_dir" --no-same-owner --no-same-permissions \
    "ffmpeg-$ffmpeg_version-arm64-static/ffmpeg" "ffmpeg-$ffmpeg_version-arm64-static/GPLv3.txt" "ffmpeg-$ffmpeg_version-arm64-static/readme.txt"
  "$task_dir/ffmpeg-$ffmpeg_version-arm64-static/ffmpeg" -version > "$task_dir/ffmpeg-version.txt"
  head -n 1 "$task_dir/ffmpeg-version.txt" | grep -F "ffmpeg version $ffmpeg_version-static" >/dev/null
  install -d -m 755 "$target_dir" "$link_dir"
  install -m 755 "$task_dir/ffmpeg-$ffmpeg_version-arm64-static/ffmpeg" "$target_dir/ffmpeg"
  install -m 644 "$task_dir/ffmpeg-$ffmpeg_version-arm64-static/GPLv3.txt" "$task_dir/ffmpeg-$ffmpeg_version-arm64-static/readme.txt" "$target_dir/"
  ln -sfn "$target_dir/ffmpeg" "$link_dir/ffmpeg"
}
if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then return; fi

test "$(id -u)" = 0
test "$(uname -m)" = aarch64
# AL2023 already supplies curl-minimal, which supports every HTTPS download below.
# Installing the full curl package conflicts with curl-minimal on current AMIs.
dnf install -y nginx tar gzip xz
task_tmp=$(mktemp -d /tmp/snag-setup.XXXXXX)
trap 'rm -rf "$task_tmp"' EXIT
install_ffmpeg "$task_tmp" /opt/ffmpeg-7.0.2 /usr/local/bin
node_archive=node-v24.20.0-linux-arm64.tar.xz
curl --fail --silent --show-error "https://nodejs.org/dist/v24.20.0/$node_archive" -o "$task_tmp/$node_archive"
curl --fail --silent --show-error https://nodejs.org/dist/v24.20.0/SHASUMS256.txt -o "$task_tmp/SHASUMS256.txt"
(cd "$task_tmp"; awk -v name="$node_archive" '$2 == name' SHASUMS256.txt | sha256sum --check --strict)
tar -xJf "$task_tmp/$node_archive" -C /opt
ln -sfn /opt/node-v24.20.0-linux-arm64 /opt/node
export PATH=/opt/node/bin:$PATH
npm install --global pnpm@12.10.1
if ! id snag >/dev/null 2>&1; then useradd --system --home-dir /var/lib/snag --create-home --shell /sbin/nologin snag; fi
install -d -o snag -g snag -m 755 /opt/snag/app
# No swap or core dump can persist player buffers.
swapoff -a
printf '* hard core 0\n' >/etc/security/limits.d/99-snag-core.conf
printf 'kernel.core_pattern=/dev/null\n' >/etc/sysctl.d/99-snag-core.conf
sysctl --system >/dev/null
printf 'Storage=volatile\nRuntimeMaxUse=32M\n' >/etc/systemd/journald.conf.d-snag.tmp
mkdir -p /etc/systemd/journald.conf.d
mv /etc/systemd/journald.conf.d-snag.tmp /etc/systemd/journald.conf.d/snag.conf
systemctl restart systemd-journald
# App release installs its nginx.conf/unit and starts both services in README step 4.
