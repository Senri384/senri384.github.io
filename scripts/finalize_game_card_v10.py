from __future__ import annotations

import colorsys
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PLAN_PATH = ROOT / "docs" / "game-card-system" / "generation-plan-v4.json"
ASSET_ROOT = ROOT / "public" / "portfolio-assets" / "ui" / "game-card-system-v10"
MASTER_ROOT = ROOT / "public" / "portfolio-assets" / "ui" / "game-card-system-v5" / "masters"

MASTERS = {
    "case": MASTER_ROOT / "case-master.png",
    "inside": MASTER_ROOT / "inside-master.png",
    "cartridge": MASTER_ROOT / "cart-master.png",
}
PANELS = {
    "case": (176, 78, 753, 1018),
    "inside": (170, 66, 716, 958),
    "cartridge": (150, 205, 550, 790),
}
GRIDS = {"case": (72, 117), "inside": (68, 111), "cartridge": (50, 73)}
OUTPUT_DIRS = {kind: ASSET_ROOT / f"{kind}s" for kind in MASTERS}
FONT_PATHS = {
    "georgia": Path("C:/Windows/Fonts/georgiab.ttf"),
    "impact": Path("C:/Windows/Fonts/impact.ttf"),
    "consolas": Path("C:/Windows/Fonts/consolab.ttf"),
    "trebuchet": Path("C:/Windows/Fonts/trebucbd.ttf"),
}


def digest(image: Image.Image) -> str:
    return hashlib.sha256(image.tobytes()).hexdigest()


def hex_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def vivid_colors(palette: list[str]) -> list[tuple[int, int, int]]:
    source = [hex_rgb(value) for value in palette]
    hsv = [colorsys.rgb_to_hsv(r/255, g/255, b/255) for r, g, b in source]
    strong_hues = [h for h, s, _ in hsv if s >= 0.35]
    fallback_hue = strong_hues[0] if strong_hues else 0.58
    result: list[tuple[int, int, int]] = []
    for index, (hue, saturation, value) in enumerate(hsv):
        if saturation < 0.35:
            hue = strong_hues[index % len(strong_hues)] if strong_hues else fallback_hue
        saturation = max(saturation, 0.55)
        value = max(value, 0.24)
        result.append(tuple(round(component*255) for component in colorsys.hsv_to_rgb(hue, saturation, value)))
    return result


def cover_crop(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    image = image.convert("RGB")
    target_ratio = size[0] / size[1]
    source_ratio = image.width / image.height
    if source_ratio > target_ratio:
        width = round(image.height * target_ratio)
        left = (image.width - width) // 2
        image = image.crop((left, 0, left + width, image.height))
    else:
        height = round(image.width / target_ratio)
        top = (image.height - height) // 2
        image = image.crop((0, top, image.width, top + height))
    return image.resize(size, Image.Resampling.LANCZOS)


def quantize_to_palette(image: Image.Image, palette: list[str], size: tuple[int, int]) -> Image.Image:
    low = cover_crop(image, size)
    colors = vivid_colors(palette)
    pixels = []
    for source in low.get_flattened_data():
        pixels.append(min(colors, key=lambda color: sum((source[i]-color[i])**2 for i in range(3))))
    result = Image.new("RGB", size)
    result.putdata(pixels)
    return result.convert("RGBA")


def chamfer_mask(size: tuple[int, int], inset: int) -> Image.Image:
    width, height = size
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).polygon(
        [(inset, 0), (width-inset, 0), (width, inset), (width, height-inset),
         (width-inset, height), (inset, height), (0, height-inset), (0, inset)],
        fill=255,
    )
    return mask


def wrap(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if not current or draw.textbbox((0, 0), candidate, font=font)[2] <= width:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def title_layer(size: tuple[int, int], policy: dict, palette: list[str]) -> Image.Image:
    # Titles use a 2x logical grid while artwork uses a 1x logical grid. This keeps
    # lettering readable without reintroducing fine photographic detail.
    logical = (144, 234)
    layer = Image.new("RGBA", logical, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    font_path = FONT_PATHS.get(policy.get("fontFamily"), FONT_PATHS["trebuchet"])
    treatment = policy.get("treatment", "block")
    font_size = 16 if len(policy["text"]) < 16 else 13
    font = ImageFont.truetype(font_path, font_size)
    max_width = 126
    lines = wrap(draw, policy["text"], font, max_width)
    while (len(lines) > 3 or max(draw.textbbox((0, 0), line, font=font)[2] for line in lines) > max_width) and font_size > 9:
        font_size -= 1
        font = ImageFont.truetype(font_path, font_size)
        lines = wrap(draw, policy["text"], font, max_width)
    line_height = font_size + 3
    total = len(lines) * line_height
    if treatment in {"branch-carved", "signal-strip"}:
        y = 12
    elif treatment in {"comic-horror", "industrial-stamp"}:
        y = logical[1] - total - 16
    else:
        y = 16 if sum(ord(c) for c in policy["text"]) % 2 else logical[1] - total - 16
    bg = (*hex_rgb(palette[0]), 220)
    fg = (*hex_rgb(palette[-1]), 255)
    accent = (*hex_rgb(palette[1]), 255)
    if treatment in {"comic-horror", "poster-slab"}:
        draw.polygon([(4, y-5), (140, y-9), (136, y+total+5), (8, y+total+8)], fill=bg)
    elif treatment in {"terminal", "signal-strip"}:
        draw.rectangle((0, y-5, 144, y+total+5), fill=bg)
        draw.rectangle((0, y+total+3, 144, y+total+5), fill=accent)
    else:
        draw.rounded_rectangle((5, y-5, 139, y+total+5), radius=3, fill=bg)
    for line in lines:
        box = draw.textbbox((0, 0), line, font=font, stroke_width=1)
        x = (logical[0] - (box[2] - box[0])) // 2
        draw.text((x, y), line, font=font, fill=fg, stroke_width=1, stroke_fill=bg)
        y += line_height
    return layer.resize(size, Image.Resampling.NEAREST)


def finalize(kind: str, work: dict) -> tuple[Image.Image, float, int]:
    master = Image.open(MASTERS[kind]).convert("RGBA")
    raw_path = ASSET_ROOT / "raw" / kind / f"{work['slug']}.png"
    raw = Image.open(raw_path).convert("RGB")
    logical = quantize_to_palette(raw, work["palette"], GRIDS[kind])
    left, top, right, bottom = PANELS[kind]
    artwork = logical.resize((right-left, bottom-top), Image.Resampling.NEAREST)
    if kind == "case" and work["titlePolicy"]["show"]:
        artwork.alpha_composite(title_layer(artwork.size, work["titlePolicy"], work["palette"]))
    output = master.copy()
    mask = chamfer_mask(artwork.size, 4 if kind == "inside" else 8)
    output.paste(artwork, (left, top), mask)
    output.putalpha(master.getchannel("A"))
    logical_pixels = list(logical.get_flattened_data())
    hsv = [colorsys.rgb_to_hsv(r/255, g/255, b/255)[1] for r, g, b, *_ in logical_pixels]
    return output, sum(hsv)/len(hsv), len(set(logical_pixels))


def contact_sheet(items: list[tuple[str, Image.Image]], output: Path, thumb: tuple[int, int]) -> None:
    if not items:
        return
    columns = 5
    rows = (len(items) + columns - 1) // columns
    cell = (thumb[0] + 30, thumb[1] + 44)
    sheet = Image.new("RGB", (columns*cell[0], rows*cell[1]), (53, 21, 38))
    draw = ImageDraw.Draw(sheet)
    for index, (slug, image) in enumerate(items):
        preview = image.copy()
        preview.thumbnail(thumb, Image.Resampling.NEAREST)
        x = (index % columns)*cell[0] + (cell[0]-preview.width)//2
        y = (index // columns)*cell[1] + 6
        checker = Image.new("RGB", preview.size, (78, 51, 63))
        checker.paste(preview, mask=preview.getchannel("A"))
        sheet.paste(checker, (x, y))
        draw.text(((index % columns)*cell[0]+6, (index // columns)*cell[1]+thumb[1]+14), slug[:34], fill=(245, 230, 233))
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, quality=94)


def main() -> None:
    plan = json.loads(PLAN_PATH.read_text(encoding="utf-8"))
    works = plan["works"]
    report: dict[str, object] = {"ok": True, "expectedWorks": len(works), "kinds": {}, "failures": []}
    sheets: dict[str, list[tuple[str, Image.Image]]] = {kind: [] for kind in MASTERS}
    for kind, master_path in MASTERS.items():
        master = Image.open(master_path).convert("RGBA")
        master_alpha = master.getchannel("A").tobytes()
        outside_mask = Image.new("L", master.size, 255)
        ImageDraw.Draw(outside_mask).rectangle(PANELS[kind], fill=0)
        outside_master = Image.composite(master, Image.new("RGBA", master.size), outside_mask)
        panel_hashes: dict[str, str] = {}
        kind_report: dict[str, object] = {"count": 0, "size": list(master.size), "items": {}}
        OUTPUT_DIRS[kind].mkdir(parents=True, exist_ok=True)
        for work in works:
            slug = work["slug"]
            raw_path = ASSET_ROOT / "raw" / kind / f"{slug}.png"
            if not raw_path.is_file():
                report["failures"].append(f"missing raw {kind}/{slug}")
                continue
            image, saturation, color_count = finalize(kind, work)
            output_path = OUTPUT_DIRS[kind] / f"{slug}.png"
            image.save(output_path, optimize=True)
            alpha_exact = image.getchannel("A").tobytes() == master_alpha
            outside = Image.composite(image, Image.new("RGBA", image.size), outside_mask)
            outside_exact = outside.tobytes() == outside_master.tobytes()
            panel_hash = digest(image.crop(PANELS[kind]).convert("RGB"))
            duplicate = panel_hashes.get(panel_hash)
            panel_hashes[panel_hash] = slug
            corners = [image.getpixel(point)[3] for point in [(0,0),(image.width-1,0),(0,image.height-1),(image.width-1,image.height-1)]]
            valid = alpha_exact and outside_exact and duplicate is None and corners == [0,0,0,0] and saturation >= 0.32 and color_count <= 7
            if not valid:
                report["failures"].append(f"invalid final {kind}/{slug}")
            kind_report["items"][slug] = {"alphaExact": alpha_exact, "outsidePanelExact": outside_exact, "duplicatePanelOf": duplicate, "cornerAlpha": corners, "meanSaturation": round(saturation, 3), "logicalColorCount": color_count, "sha256": digest(image)}
            kind_report["count"] += 1
            sheets[kind].append((slug, image))
        report["kinds"][kind] = kind_report
    report["ok"] = not report["failures"] and all(item["count"] == len(works) for item in report["kinds"].values())
    qa_dir = ASSET_ROOT / "qa"
    contact_sheet(sheets["case"], qa_dir / "contact-cases.jpg", (190, 230))
    contact_sheet(sheets["inside"], qa_dir / "contact-insides.jpg", (270, 180))
    contact_sheet(sheets["cartridge"], qa_dir / "contact-cartridges.jpg", (170, 240))
    (qa_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"ok": report["ok"], "failures": report["failures"], "counts": {kind: item["count"] for kind, item in report["kinds"].items()}}, ensure_ascii=False))
    if not report["ok"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
