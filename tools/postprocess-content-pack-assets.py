from __future__ import annotations

import base64
import json
import urllib.request
from io import BytesIO
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "logs" / "image2-content-pack" / "raw"
OUT = ROOT / "public" / "assets" / "legacy" / "image2-restored"
FAST = ROOT / "public" / "assets" / "legacy" / "fast" / "image2-restored"
MAP_SIZE = (960, 640)
SPRITE_CANVAS = (512, 512)
FAST_SPRITE_SIZE = (192, 192)
FAST_OBJECT_SIZE = (192, 192)
KEY = (255, 0, 255)


def main() -> None:
    decode_generation_jsons()
    process_maps()
    process_pet_sheets()
    process_cutout_sprites()


def decode_generation_jsons() -> None:
    pairs = {
        "pet_aurora_deer_retry_generation.json": "pet_aurora_deer.png",
        "npc_coral_merchant_generation.json": "npc_coral_merchant.png",
        "npc_star_cartographer_generation.json": "npc_star_cartographer.png",
        "npc_storm_keeper_generation.json": "npc_storm_keeper.png",
        "object_coral_market_generation.json": "object_coral_market.png",
        "object_star_observatory_generation.json": "object_star_observatory.png",
        "object_storm_ruins_generation.json": "object_storm_ruins.png",
    }
    for json_name, png_name in pairs.items():
        src = RAW / json_name
        dst = RAW / png_name
        if not src.exists():
            raise FileNotFoundError(src)
        dst.write_bytes(image_bytes_from_json(src))
        print(f"decoded {json_name} -> {png_name}")


def image_bytes_from_json(path: Path) -> bytes:
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    item = data["data"][0]
    if "b64_json" in item:
        return base64.b64decode(item["b64_json"])
    if "url" in item:
        with urllib.request.urlopen(item["url"], timeout=180) as response:
            return response.read()
    raise ValueError(f"No image payload in {path}")


def process_maps() -> None:
    maps = {
        "legacy_coral_market_clean": "maps/legacy_coral_market_clean_image2.png",
        "legacy_star_observatory_clean": "maps/legacy_star_observatory_clean_image2.png",
        "legacy_storm_ruins_clean": "maps/legacy_storm_ruins_clean_image2.png",
    }
    for raw_name, rel in maps.items():
        src = RAW / f"{raw_name}.png"
        if not src.exists():
            raise FileNotFoundError(src)
        img = Image.open(src).convert("RGB")
        img = resize_cover(img, MAP_SIZE)
        final = OUT / rel
        final.parent.mkdir(parents=True, exist_ok=True)
        img.save(final, optimize=True)
        save_fast(img, fast_path_for(final), MAP_SIZE, quality=76)
        print(f"map {raw_name} -> {final.relative_to(ROOT)}")


def process_pet_sheets() -> None:
    pets = [
        "cloud_ferret",
        "coral_lantern",
        "star_jelly",
        "storm_ray",
        "crystal_golem",
        "aurora_deer",
    ]
    for pet in pets:
        src = RAW / f"pet_{pet}.png"
        if not src.exists():
            raise FileNotFoundError(src)
        sheet = remove_chroma(Image.open(src).convert("RGBA"))
        w, h = sheet.size
        cuts = detect_sheet_cuts(sheet)
        suffixes = ["", "_stage1", "_stage2"]
        for (left, right), suffix in zip(cuts, suffixes):
            frame = sheet.crop((left, 0, right, h))
            cutout = center_cutout(keep_primary_component(remove_chroma(frame)), SPRITE_CANVAS, pad=26)
            final = OUT / "pets" / f"legacy_pet_{pet}{suffix}_image2.png"
            final.parent.mkdir(parents=True, exist_ok=True)
            cutout.save(final, optimize=True)
            save_fast(cutout, fast_path_for(final), FAST_SPRITE_SIZE, quality=82)
        print(f"pet sheet {pet} -> 3 stages")


def process_cutout_sprites() -> None:
    groups = {
        "characters": [
            "npc_coral_merchant",
            "npc_star_cartographer",
            "npc_storm_keeper",
        ],
        "objects": [
            "object_coral_market",
            "object_star_observatory",
            "object_storm_ruins",
        ],
    }
    for group, names in groups.items():
        for name in names:
            src = RAW / f"{name}.png"
            if not src.exists():
                raise FileNotFoundError(src)
            img = Image.open(src).convert("RGBA")
            cutout = center_cutout(keep_primary_component(remove_chroma(img)), SPRITE_CANVAS, pad=24)
            final = OUT / group / f"{name}_image2.png"
            final.parent.mkdir(parents=True, exist_ok=True)
            cutout.save(final, optimize=True)
            fast_size = FAST_OBJECT_SIZE if group == "objects" else FAST_SPRITE_SIZE
            save_fast(cutout, fast_path_for(final), fast_size, quality=82)
            print(f"cutout {name} -> {final.relative_to(ROOT)}")


def remove_chroma(img: Image.Image, tolerance: int = 62, soft: int = 48) -> Image.Image:
    rgba = img.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    samples = [
        pixels[0, 0][:3],
        pixels[width - 1, 0][:3],
        pixels[0, height - 1][:3],
        pixels[width - 1, height - 1][:3],
    ]
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            dist = min(abs(r - kr) + abs(g - kg) + abs(b - kb) for kr, kg, kb in samples)
            fallback_dist = abs(r - KEY[0]) + abs(g - KEY[1]) + abs(b - KEY[2])
            dist = min(dist, fallback_dist)
            if dist <= tolerance:
                pixels[x, y] = (r, g, b, 0)
            elif is_magenta_background(r, g, b):
                pixels[x, y] = (r, g, b, 0)
            elif dist <= tolerance + soft:
                alpha = int(a * (dist - tolerance) / soft)
                pixels[x, y] = (r, g, b, alpha)
    return rgba


def is_magenta_background(r: int, g: int, b: int) -> bool:
    return r >= 185 and b >= 165 and g <= 95 and abs(r - b) <= 115


def detect_sheet_cuts(sheet: Image.Image) -> list[tuple[int, int]]:
    width, height = sheet.size
    alpha = sheet.getchannel("A")
    data = alpha.tobytes()
    active: list[bool] = []
    for x in range(width):
        count = 0
        for y in range(height):
            if data[y * width + x] > 20:
                count += 1
        active.append(count > 8)

    segments: list[tuple[int, int]] = []
    start: int | None = None
    for x, is_active in enumerate(active):
        if is_active and start is None:
            start = x
        elif not is_active and start is not None:
            segments.append((start, x))
            start = None
    if start is not None:
        segments.append((start, width))

    merged: list[tuple[int, int]] = []
    for left, right in segments:
        if right - left < 6:
            continue
        if merged and left - merged[-1][1] < 10:
            merged[-1] = (merged[-1][0], right)
        else:
            merged.append((left, right))

    if len(merged) >= 3:
        ranked = sorted(merged, key=lambda seg: seg[1] - seg[0], reverse=True)[:3]
        return [
            (max(0, left - 18), min(width, right + 18))
            for left, right in sorted(ranked, key=lambda seg: (seg[0] + seg[1]) / 2)
        ]

    return [(0, width // 3), (width // 3, (width * 2) // 3), ((width * 2) // 3, width)]


def keep_primary_component(img: Image.Image, alpha_threshold: int = 20) -> Image.Image:
    rgba = img.convert("RGBA")
    width, height = rgba.size
    alpha = rgba.getchannel("A")
    data = alpha.tobytes()
    visited = bytearray(width * height)
    best: tuple[float, int, tuple[int, int, int, int]] | None = None
    center_x = width / 2
    center_y = height / 2

    for start in range(width * height):
        if visited[start] or data[start] <= alpha_threshold:
            continue
        stack = [start]
        visited[start] = 1
        area = 0
        min_x = width
        min_y = height
        max_x = 0
        max_y = 0
        sum_x = 0
        sum_y = 0
        while stack:
            idx = stack.pop()
            y, x = divmod(idx, width)
            area += 1
            sum_x += x
            sum_y += y
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x)
            max_y = max(max_y, y)
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if nx < 0 or nx >= width or ny < 0 or ny >= height:
                    continue
                nidx = ny * width + nx
                if visited[nidx] or data[nidx] <= alpha_threshold:
                    continue
                visited[nidx] = 1
                stack.append(nidx)
        if area < 24:
            continue
        comp_x = sum_x / area
        comp_y = sum_y / area
        dist_sq = (comp_x - center_x) ** 2 + (comp_y - center_y) ** 2
        score = area - dist_sq * 0.8
        if best is None or score > best[0]:
            best = (score, area, (min_x, min_y, max_x + 1, max_y + 1))

    if best is None:
        return rgba

    mask = Image.new("L", rgba.size, 0)
    bbox = best[2]
    crop_alpha = alpha.crop(bbox)
    mask.paste(crop_alpha, bbox)
    out = rgba.copy()
    out.putalpha(mask)
    return out


def center_cutout(img: Image.Image, size: tuple[int, int], pad: int) -> Image.Image:
    bbox = img.getbbox()
    if not bbox:
        return Image.new("RGBA", size, (0, 0, 0, 0))
    subject = img.crop(bbox)
    max_w = max(1, size[0] - pad * 2)
    max_h = max(1, size[1] - pad * 2)
    scale = min(max_w / subject.width, max_h / subject.height)
    resized = subject.resize(
        (max(1, int(subject.width * scale)), max(1, int(subject.height * scale))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    x = (size[0] - resized.width) // 2
    y = (size[1] - resized.height) // 2
    canvas.alpha_composite(resized, (x, y))
    return canvas


def resize_cover(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    target_w, target_h = size
    scale = max(target_w / img.width, target_h / img.height)
    resized = img.resize(
        (max(1, int(img.width * scale)), max(1, int(img.height * scale))),
        Image.Resampling.LANCZOS,
    )
    left = (resized.width - target_w) // 2
    top = (resized.height - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))


def save_fast(img: Image.Image, path: Path, size: tuple[int, int], quality: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fast = img.copy()
    if fast.size != size:
        if fast.mode == "RGBA":
            fast = center_cutout(fast, size, pad=6)
        else:
            fast = resize_cover(fast, size)
    fast.save(path, "WEBP", quality=quality, method=6)


def fast_path_for(final: Path) -> Path:
    rel = final.relative_to(OUT)
    return (FAST / rel).with_name(f"{rel.stem}_fast.webp")


if __name__ == "__main__":
    main()
