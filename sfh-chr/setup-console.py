#!/usr/bin/env python3
"""Configura un CHR recién arrancado vía teclado VGA (QEMU monitor sendkey).

Uso: QEMU_MON=/tmp/fased/qemu-mon.sock python3 sfh-chr/setup-console.py
Requiere que el CHR esté en la primera pantalla de login (admin sin password).
"""
import os, socket, time, struct, zlib

MON = os.environ.get("QEMU_MON", "/tmp/fased/qemu-mon.sock")
PASS = os.environ.get("CHR_PASS", "sfh-lab")
IP = os.environ.get("CHR_IP", "10.0.2.15/24")
GW = os.environ.get("CHR_GW", "10.0.2.2")
SHOT = os.environ.get("CHR_SHOT_DIR", "/tmp/fased/chr")

KEYMAP = {"/": "slash", "-": "minus", "=": "equal", " ": "spc", ".": "dot",
          ":": "shift-semicolon", "_": "shift-minus"}

def cmd(c, wait=0.06):
    s = socket.socket(socket.AF_UNIX); s.settimeout(1.0); s.connect(MON)
    time.sleep(0.1)
    try: s.recv(65536)
    except Exception: pass
    s.sendall((c + "\n").encode()); time.sleep(wait)
    try:
        while s.recv(65536): pass
    except Exception: pass
    s.close()

def typ(text, delay=0.05):
    for ch in text:
        cmd("sendkey " + KEYMAP.get(ch, ch), delay)

def enter(wait=0.25):
    cmd("sendkey ret", wait)

def shot(name):
    os.makedirs(SHOT, exist_ok=True)
    cmd(f"screendump {SHOT}/{name}.ppm", 0.6)
    raw = open(f"{SHOT}/{name}.ppm", "rb").read()
    parts = raw.split(b"\n", 3); w, h = map(int, parts[1].split()); px = parts[3]
    rows = b"".join(b"\x00" + px[y*w*3:(y+1)*w*3] for y in range(h))
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b""))
    open(f"{SHOT}/{name}.png", "wb").write(png)

# 1) login: admin + password vacío (o password ya cambiada)
typ("admin"); enter(); time.sleep(2); enter(); time.sleep(2)
# 2) primer login: responder "n" a licencia y cambiar password
typ("n"); enter(); time.sleep(1)
typ(PASS); enter(); time.sleep(1)
typ(PASS); enter(); time.sleep(2)
# 3) servicios y red
for c in [
    "/ip service enable www",
    "/ip service set www address=0.0.0.0/0",
    f"/ip address add address={IP} interface=ether1",
    f"/ip route add dst-address=0.0.0.0/0 gateway={GW}",
    "/ip service enable ssh",
]:
    typ(c); enter(); time.sleep(1)
shot("configured")
print("CHR configurado. Prueba: curl -u admin:%s http://127.0.0.1:8080/rest/system/resource" % PASS)
