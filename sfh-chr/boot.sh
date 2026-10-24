#!/usr/bin/env bash
# Fase D — laboratorio CHR sin root ni KVM (QEMU TCG) para validar RouterOS real.
#
# Requisitos: Ubuntu/Debian con apt, curl, unzip, dpkg-deb, gcc/glibc del sistema.
# No usa sudo: descarga los .deb de QEMU y los extrae en un prefijo de usuario.
set -euo pipefail

WORK="${WORK:-/tmp/fased}"
CHR_VERSION="${CHR_VERSION:-7.16.2}"
PORT_SSH="${PORT_SSH:-2222}"
PORT_HTTP="${PORT_HTTP:-8080}"
QEMU_DIR="$WORK/root"
QEMU_BIN="$QEMU_DIR/usr/bin/qemu-system-x86_64"
CHR_DIR="$WORK/chr"

mkdir -p "$WORK/pkgs" "$QEMU_DIR" "$CHR_DIR"

# 1) QEMU + dependencias (sin root)
if [ ! -x "$QEMU_BIN" ]; then
  echo "[1/4] Descargando QEMU y dependencias (apt-get download)…"
  ( cd "$WORK/pkgs"
    apt-cache depends --recurse --no-recommends --no-suggests --no-conflicts \
      --no-breaks --no-replaces --no-enhances qemu-system-x86 \
      | awk '/^[a-z0-9]/ {print $1}' | sort -u > deps.txt
    while read -r p; do apt-get download "$p" >/dev/null 2>&1 || true; done < deps.txt
    for d in *.deb; do dpkg-deb -x "$d" "$QEMU_DIR"; done
  )
fi

# BIOS/VGA/EFI ROMs que QEMU espera en su share
cp -n "$QEMU_DIR"/usr/share/seabios/* "$QEMU_DIR"/usr/share/qemu/ 2>/dev/null || true
cp -n "$QEMU_DIR"/usr/lib/ipxe/qemu/*.rom "$QEMU_DIR"/usr/share/qemu/ 2>/dev/null || true

# 2) Imagen CHR (free trial 60 días; sin licencia permanente)
if [ ! -f "$CHR_DIR/chr-$CHR_VERSION.img" ]; then
  echo "[2/4] Descargando CHR $CHR_VERSION…"
  curl -fsSL -o "$CHR_DIR/chr.img.zip" \
    "https://download.mikrotik.com/routeros/$CHR_VERSION/chr-$CHR_VERSION.img.zip"
  ( cd "$CHR_DIR" && unzip -o chr.img.zip >/dev/null && mv -f "chr-$CHR_VERSION.img" "chr-$CHR_VERSION.img" )
fi

# 3) Arranque headless con TCG
echo "[3/4] Arrancando CHR (TCG)… SSH=$PORT_SSH HTTP=$PORT_HTTP"
QEMU_MODULE_DIR="$QEMU_DIR/usr/lib/x86_64-linux-gnu/qemu" \
LD_LIBRARY_PATH="$QEMU_DIR/usr/lib/x86_64-linux-gnu" \
"$QEMU_BIN" \
  -m 512 -smp 1 -machine pc -accel tcg \
  -drive file="$CHR_DIR/chr-$CHR_VERSION.img",format=raw,if=ide \
  -netdev user,id=n0,hostfwd=tcp::"$PORT_SSH"-:22,hostfwd=tcp::"$PORT_HTTP"-:80 \
  -device e1000,netdev=n0 \
  -vga std -display none \
  -bios "$QEMU_DIR/usr/share/qemu/bios-256k.bin" \
  -L "$QEMU_DIR/usr/share/qemu" \
  -monitor unix:"$WORK/qemu-mon.sock",server,nowait \
  -serial file:"$CHR_DIR/serial.log" \
  > "$CHR_DIR/qemu.log" 2>&1 &

echo "[4/4] QEMU PID $! · espera ~2-4 min a que RouterOS arranque (TCG es lento)."
echo "      Configuración inicial por consola: python3 sfh-chr/setup-console.py (QEMU monitor $WORK/qemu-mon.sock)"
echo "      Prueba REST: curl -u admin:sfh-lab http://127.0.0.1:$PORT_HTTP/rest/system/resource"
