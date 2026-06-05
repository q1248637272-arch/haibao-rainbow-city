from __future__ import annotations

import importlib.util
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "logs" / "image2-fun-pack" / "raw"
OUT = ROOT / "public" / "assets" / "legacy" / "image2-restored"
FAST = ROOT / "public" / "assets" / "legacy" / "fast" / "image2-restored"
MAP_SIZE = (960, 640)
SPRITE_CANVAS = (512, 512)
FAST_SPRITE_SIZE = (192, 192)


def load_helpers():
    helper_path = ROOT / "tools" / "postprocess-content-pack-assets.py"
    spec = importlib.util.spec_from_file_location("content_pack_helpers", helper_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not import {helper_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


H = load_helpers()


def main() -> None:
    decode_all()
    process_map("legacy_tide_playground_clean", "maps/legacy_tide_playground_clean_image2.png")
    process_pet_sheet("tide_otter")
    process_cutout("npc_tide_coach", "characters/npc_tide_coach_image2.png")
    for name in ["object_tide_playground", "object_trial_pearl", "object_trial_mine"]:
        process_cutout(name, f"objects/{name}_image2.png")


def decode_all() -> None:
    for path in RAW.glob("*_generation.json"):
      name = path.name.removesuffix("_generation.json")
      (RAW / f"{name}.png").write_bytes(H.image_bytes_from_json(path))
      print(f"decoded {path.name}")


def process_map(raw_name: str, rel: str) -> None:
    src = RAW / f"{raw_name}.png"
    img = Image.open(src).convert("RGB")
    img = H.resize_cover(img, MAP_SIZE)
    final = OUT / rel
    final.parent.mkdir(parents=True, exist_ok=True)
    img.save(final, optimize=True)
    save_fast(img, fast_path_for(final), MAP_SIZE, quality=76)
    print(f"map {raw_name} -> {final.relative_to(ROOT)}")


def process_pet_sheet(pet: str) -> None:
    src = RAW / f"pet_{pet}.png"
    sheet = H.remove_chroma(Image.open(src).convert("RGBA"))
    cuts = [(0, 288), (278, 650), (640, sheet.width)] if pet == "tide_otter" else H.detect_sheet_cuts(sheet)
    suffixes = ["", "_stage1", "_stage2"]
    for (left, right), suffix in zip(cuts, suffixes):
        frame = sheet.crop((left, 0, right, sheet.height))
        cutout = H.center_cutout(H.keep_primary_component(frame), SPRITE_CANVAS, pad=26)
        final = OUT / "pets" / f"legacy_pet_{pet}{suffix}_image2.png"
        final.parent.mkdir(parents=True, exist_ok=True)
        cutout.save(final, optimize=True)
        save_fast(cutout, fast_path_for(final), FAST_SPRITE_SIZE, quality=82)
    print(f"pet sheet {pet} -> 3 stages")


def process_cutout(raw_name: str, rel: str) -> None:
    src = RAW / f"{raw_name}.png"
    img = Image.open(src).convert("RGBA")
    cutout = H.center_cutout(H.keep_primary_component(H.remove_chroma(img)), SPRITE_CANVAS, pad=24)
    final = OUT / rel
    final.parent.mkdir(parents=True, exist_ok=True)
    cutout.save(final, optimize=True)
    save_fast(cutout, fast_path_for(final), FAST_SPRITE_SIZE, quality=82)
    print(f"cutout {raw_name} -> {final.relative_to(ROOT)}")


def fast_path_for(final: Path) -> Path:
    rel = final.relative_to(OUT)
    return (FAST / rel).with_name(f"{rel.stem}_fast.webp")


def save_fast(img: Image.Image, path: Path, size: tuple[int, int], quality: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fast = img.copy()
    if fast.size != size:
        if fast.mode == "RGBA":
            fast = H.center_cutout(fast, size, pad=6)
        else:
            fast = H.resize_cover(fast, size)
    fast.save(path, "WEBP", quality=quality, method=6)


if __name__ == "__main__":
    main()
