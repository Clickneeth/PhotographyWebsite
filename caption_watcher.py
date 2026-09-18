#!/usr/bin/env python3
"""Watches drop/ for new images, captions them with a local Ollama vision model,
renumbers them into assets/, and updates gallery.json for the portfolio site."""

import base64
import json
import shutil
import subprocess
import time
from pathlib import Path

import requests
from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

ROOT = Path(__file__).parent
DROP_DIR = ROOT / "drop"
ASSETS_DIR = ROOT / "assets"
GALLERY_JSON = ROOT / "gallery.json"
OLLAMA_URL = "http://localhost:11434/api/generate"
VISION_MODEL = "llava-phi3"
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def _applescript_escape(text: str) -> str:
    """Escape backslashes and double quotes so text can't break out of an
    AppleScript string literal (e.g. via a crafted filename or caption)."""
    return text.replace("\\", "\\\\").replace('"', '\\"')


def notify(title: str, message: str) -> None:
    safe_title = _applescript_escape(title)
    safe_message = _applescript_escape(message)
    script = f'display notification "{safe_message}" with title "{safe_title}"'
    subprocess.run(["osascript", "-e", script], check=False)


def load_gallery() -> list:
    if GALLERY_JSON.exists():
        return json.loads(GALLERY_JSON.read_text())
    return []


def save_gallery(data: list) -> None:
    GALLERY_JSON.write_text(json.dumps(data, indent=2))


def next_index(gallery: list) -> int:
    max_num = 0
    for entry in gallery:
        stem = Path(entry["file"]).stem
        if stem.isdigit():
            max_num = max(max_num, int(stem))
    return max_num + 1


def caption_image(image_path: Path) -> str:
    b64 = base64.b64encode(image_path.read_bytes()).decode("utf-8")
    payload = {
        "model": VISION_MODEL,
        "prompt": "Write one short, evocative caption (under 15 words) for this "
        "photograph, suitable for a photography portfolio. No quotes, no prefix.",
        "images": [b64],
        "stream": False,
    }
    resp = requests.post(OLLAMA_URL, json=payload, timeout=120)
    resp.raise_for_status()
    return resp.json().get("response", "").strip()


def process_image(path: Path) -> None:
    if path.suffix.lower() not in IMAGE_EXTS:
        return
    # wait for the file to finish being written (drag-and-drop copy)
    prev_size = -1
    while True:
        try:
            size = path.stat().st_size
        except FileNotFoundError:
            return
        if size == prev_size:
            break
        prev_size = size
        time.sleep(0.5)

    try:
        caption = caption_image(path)
    except Exception as exc:  # noqa: BLE001
        notify("Portfolio Caption", f"Failed to caption {path.name}: {exc}")
        return

    gallery = load_gallery()
    idx = next_index(gallery)
    new_name = f"{idx}{path.suffix.lower()}"
    dest = ASSETS_DIR / new_name
    shutil.move(str(path), str(dest))

    gallery.append({"file": new_name, "caption": caption})
    save_gallery(gallery)

    notify("Portfolio Caption Added", f"{new_name}: {caption}")
    print(f"Captioned {new_name}: {caption}")


class DropHandler(FileSystemEventHandler):
    def on_created(self, event):
        if not event.is_directory:
            process_image(Path(event.src_path))

    def on_moved(self, event):
        if not event.is_directory:
            process_image(Path(event.dest_path))


def main() -> None:
    DROP_DIR.mkdir(exist_ok=True)
    ASSETS_DIR.mkdir(exist_ok=True)
    # catch anything already sitting in drop/ at startup
    for existing in DROP_DIR.iterdir():
        process_image(existing)

    observer = Observer()
    observer.schedule(DropHandler(), str(DROP_DIR), recursive=False)
    observer.start()
    print(f"Watching {DROP_DIR} for new photos...")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()


if __name__ == "__main__":
    main()
