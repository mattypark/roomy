#!/usr/bin/env python3
"""roomy pi-agent — ceiling camera capture loop.

Standalone: no imports from the roomy backend. Runs on a Raspberry Pi
(picamera2) or any machine with a webcam (OpenCV fallback), so the whole
loop is testable on a laptop before the hardware is mounted.

Usage:
    python3 capture.py --server http://192.168.1.50:8000            # every 5 min
    python3 capture.py --server http://localhost:8000 --once        # single test shot
    python3 capture.py --server http://localhost:8000 --auto-scan   # scan after each frame

Deps: pip install requests  (+ opencv-python when not on a Pi)
"""

import argparse
import logging
import sys
import time

import requests

DEFAULT_INTERVAL_S = 300
REQUEST_TIMEOUT_S = 30
MAX_BACKOFF_S = 600
JPEG_QUALITY = 90

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("roomy-pi")


# --- camera sources ---------------------------------------------------------


class PiCamera:
    """Raspberry Pi camera module via picamera2."""

    def __init__(self) -> None:
        from picamera2 import Picamera2  # only importable on Pi OS

        self.camera = Picamera2()
        config = self.camera.create_still_configuration(main={"size": (1920, 1080)})
        self.camera.configure(config)
        self.camera.start()
        time.sleep(2)  # sensor warm-up

    def capture_jpeg(self) -> bytes:
        import io

        buffer = io.BytesIO()
        self.camera.capture_file(buffer, format="jpeg")
        return buffer.getvalue()


class WebCamera:
    """USB webcam / laptop camera via OpenCV — the dev-machine fallback."""

    def __init__(self, index: int = 0) -> None:
        import cv2

        self.cv2 = cv2
        self.capture = cv2.VideoCapture(index)
        if not self.capture.isOpened():
            raise RuntimeError(f"no camera at index {index}")
        self.capture.set(cv2.CAP_PROP_FRAME_WIDTH, 1920)
        self.capture.set(cv2.CAP_PROP_FRAME_HEIGHT, 1080)

    def capture_jpeg(self) -> bytes:
        # a few grabs so auto-exposure settles
        for _ in range(3):
            self.capture.read()
        ok, frame = self.capture.read()
        if not ok:
            raise RuntimeError("camera read failed")
        ok, encoded = self.cv2.imencode(
            ".jpg", frame, [self.cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY]
        )
        if not ok:
            raise RuntimeError("jpeg encode failed")
        return encoded.tobytes()


def open_camera(preference: str):
    """picamera2 on a Pi, OpenCV webcam elsewhere."""
    if preference in ("auto", "picamera2"):
        try:
            camera = PiCamera()
            log.info("camera: picamera2 (raspberry pi)")
            return camera
        except ImportError:
            if preference == "picamera2":
                raise
    camera = WebCamera()
    log.info("camera: opencv webcam")
    return camera


# --- upload loop ------------------------------------------------------------


def post_frame(server: str, jpeg: bytes) -> dict:
    response = requests.post(
        f"{server}/frames",
        files={"file": ("frame.jpg", jpeg, "image/jpeg")},
        timeout=REQUEST_TIMEOUT_S,
    )
    response.raise_for_status()
    return response.json()


def trigger_scan(server: str) -> dict:
    response = requests.post(f"{server}/scan", timeout=REQUEST_TIMEOUT_S)
    response.raise_for_status()
    return response.json()


def run(server: str, interval_s: int, once: bool, auto_scan: bool, camera_pref: str) -> int:
    camera = open_camera(camera_pref)
    backoff_s = 5

    while True:
        try:
            jpeg = camera.capture_jpeg()
            frame = post_frame(server, jpeg)
            log.info("frame stored: %s (%d KB)", frame["id"], len(jpeg) // 1024)
            if auto_scan:
                scan = trigger_scan(server)
                log.info(
                    "scan: rank %s, clutter %.1f%%",
                    scan["rank"],
                    scan["overallScore"] * 100,
                )
            backoff_s = 5  # healthy — reset backoff
            if once:
                return 0
            time.sleep(interval_s)
        except KeyboardInterrupt:
            log.info("stopped")
            return 0
        except Exception as exc:  # camera/network hiccup — retry, don't die on the ceiling
            log.warning("cycle failed: %s — retrying in %ds", exc, backoff_s)
            if once:
                return 1
            time.sleep(backoff_s)
            backoff_s = min(backoff_s * 2, MAX_BACKOFF_S)


def main() -> int:
    parser = argparse.ArgumentParser(description="roomy ceiling camera agent")
    parser.add_argument("--server", required=True, help="roomy backend URL, e.g. http://192.168.1.50:8000")
    parser.add_argument("--interval", type=int, default=DEFAULT_INTERVAL_S, help="seconds between frames (default 300)")
    parser.add_argument("--once", action="store_true", help="capture one frame and exit (testing)")
    parser.add_argument("--auto-scan", action="store_true", help="run a local CV scan after each frame")
    parser.add_argument("--camera", choices=["auto", "picamera2", "opencv"], default="auto")
    args = parser.parse_args()
    return run(args.server, args.interval, args.once, args.auto_scan, args.camera)


if __name__ == "__main__":
    sys.exit(main())
