# roomy pi-agent

Ceiling-mounted Raspberry Pi camera loop. Captures a frame every N seconds and POSTs it to the roomy backend. Auto-detects the camera: Pi camera module (picamera2) on a Pi, any USB/laptop webcam (OpenCV) elsewhere — so you can test the whole loop on a Mac today.

## Test on the dev machine (no Pi needed)

```bash
pip install requests opencv-python
python3 capture.py --server http://localhost:8000 --once --auto-scan
```

Grabs one webcam frame → stores it in the backend → runs a scan → prints the room rank.

## Raspberry Pi setup (when hardware arrives)

1. Raspberry Pi OS (Bookworm+), camera module connected + enabled
2. ```bash
   sudo apt install -y python3-picamera2 python3-requests
   ```
3. Test: `python3 capture.py --server http://<mac-ip>:8000 --once`
4. Run forever (every 5 min, scanning each frame):
   ```bash
   python3 capture.py --server http://<mac-ip>:8000 --interval 300 --auto-scan
   ```

## Run at boot (systemd)

`/etc/systemd/system/roomy-agent.service`:

```ini
[Unit]
Description=roomy ceiling camera agent
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/bin/python3 /home/pi/roomy/pi-agent/capture.py --server http://<mac-ip>:8000 --interval 300 --auto-scan
Restart=always
RestartSec=10
User=pi

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now roomy-agent
journalctl -u roomy-agent -f   # watch logs
```

## Flags

| Flag | Default | What |
|---|---|---|
| `--server` | required | Backend URL |
| `--interval` | 300 | Seconds between frames |
| `--once` | off | One frame then exit (testing) |
| `--auto-scan` | off | Run local CV scan after each frame |
| `--camera` | auto | `auto` / `picamera2` / `opencv` |

Failures (network drop, camera hiccup) retry with exponential backoff up to 10 min — the agent never dies on the ceiling.

## Mounting notes

- Center of ceiling, lens pointing straight down, widest view of the floor
- Capture the **clean baseline** from the ceiling position (not handheld) — the CV diff assumes the same viewpoint
- Re-set the baseline any time the camera moves
