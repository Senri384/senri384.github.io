from __future__ import annotations

import colorsys
import hashlib
import json
import math
import statistics
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PLAN_PATH = ROOT / "docs" / "game-card-system" / "generation-plan-v5.json"
ASSET_ROOT = ROOT / "public" / "portfolio-assets" / "ui" / "game-card-system-v11"
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
GRIDS = {"case": (144, 234), "inside": (136, 222), "cartridge": (100, 146)}
COLORS = {"case": 12, "inside": 12, "cartridge": 7}
OUTPUT_DIRS = {kind: ASSET_ROOT / f"{kind}s" for kind in MASTERS}
FONT_PATHS = {
    "georgia": Path("C:/Windows/Fonts/georgiab.ttf"),
    "impact": Path("C:/Windows/Fonts/impact.ttf"),
    "consolas": Path("C:/Windows/Fonts/consolab.ttf"),
    "trebuchet": Path("C:/Windows/Fonts/trebucbd.ttf"),
    "palatino": Path("C:/Windows/Fonts/palab.ttf"),
    "book-antiqua": Path("C:/Windows/Fonts/palabi.ttf"),
    "arial-black": Path("C:/Windows/Fonts/ariblk.ttf"),
    "franklin": Path("C:/Windows/Fonts/framd.ttf"),
    "bahnschrift": Path("C:/Windows/Fonts/bahnschrift.ttf"),
    "rockwell": Path("C:/Windows/Fonts/constanb.ttf"),
    "cambria": Path("C:/Windows/Fonts/cambriab.ttf"),
    "segoe-black": Path("C:/Windows/Fonts/seguibl.ttf"),
}


def digest(image: Image.Image) -> str:
    return hashlib.sha256(image.tobytes()).hexdigest()


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


def medium_pixel_art(image: Image.Image, size: tuple[int, int], colors: int) -> Image.Image:
    low = cover_crop(image, size)
    return low.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGBA")


def chamfer_mask(size: tuple[int, int], inset: int) -> Image.Image:
    width, height = size
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).polygon(
        [(inset, 0), (width-inset, 0), (width, inset), (width, height-inset),
         (width-inset, height), (inset, height), (0, height-inset), (0, inset)],
        fill=255,
    )
    return mask


def luminance(color: tuple[int, int, int]) -> float:
    return 0.2126*color[0] + 0.7152*color[1] + 0.0722*color[2]


def artwork_colors(image: Image.Image) -> tuple[tuple[int, int, int], tuple[int, int, int], tuple[int, int, int]]:
    colors = image.convert("RGB").resize((48, 72), Image.Resampling.NEAREST).getcolors(48*72) or []
    ordered = [color for _, color in sorted(colors, reverse=True)]
    dark = min(ordered, key=luminance) if ordered else (18, 20, 28)
    light = max(ordered, key=luminance) if ordered else (240, 226, 192)
    accent = max(ordered, key=lambda c: colorsys.rgb_to_hsv(*(v/255 for v in c))[1]) if ordered else (218, 84, 66)
    return dark, light, accent


def tracked_text(text: str, tracking: int) -> str:
    if tracking <= 0:
        return text
    return (" " * tracking).join(text)


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, width: int, tracking: int = 0) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        rendered = tracked_text(candidate, tracking)
        if not current or draw.textbbox((0, 0), rendered, font=font, stroke_width=1)[2] <= width:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def text_block(draw: ImageDraw.ImageDraw, text: str, font_path: Path, size: int, width: int, tracking: int) -> tuple[ImageFont.FreeTypeFont, list[str], int]:
    current = size
    while current >= 12:
        font = ImageFont.truetype(font_path, current)
        lines = wrap_text(draw, text, font, width, tracking)
        if len(lines) <= 3 and all(draw.textbbox((0, 0), tracked_text(line, tracking), font=font, stroke_width=1)[2] <= width for line in lines):
            return font, lines, current
        current -= 1
    font = ImageFont.truetype(font_path, 12)
    return font, wrap_text(draw, text, font, width, tracking), 12


def title_layer(size: tuple[int, int], policy: dict, artwork: Image.Image) -> Image.Image:
    logical = (288, 468)
    layer = Image.new("RGBA", logical, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    dark, light, accent = artwork_colors(artwork)
    treatment = policy["treatment"]
    placement = policy["placement"]
    font_path = FONT_PATHS.get(policy["fontFamily"], FONT_PATHS["trebuchet"])
    tracking = int(policy.get("tracking", 0))
    font, lines, font_size = text_block(draw, policy["text"], font_path, int(policy.get("size", 28)), 246, tracking)
    line_height = font_size + 7
    total_height = len(lines)*line_height

    if placement == "top-center":
        anchor_x, y, align = logical[0]//2, 22, "center"
    elif placement == "top-left":
        anchor_x, y, align = 20, 24, "left"
    elif placement == "top-right":
        anchor_x, y, align = logical[0]-20, 24, "right"
    elif placement == "bottom-left":
        anchor_x, y, align = 20, logical[1]-total_height-26, "left"
    elif placement == "bottom-center":
        anchor_x, y, align = logical[0]//2, logical[1]-total_height-24, "center"
    else:
        anchor_x, y, align = 20, 52, "left"

    # Each treatment has a different structural grammar; there is no shared title bar.
    if treatment == "engraved-serif":
        draw.line((42, y-9, 246, y-9), fill=(*accent, 230), width=2)
        draw.line((74, y+total_height+3, 214, y+total_height+3), fill=(*light, 210), width=1)
    elif treatment == "heavy-poster":
        draw.polygon([(8, y-10), (274, y-19), (266, y+total_height+9), (14, y+total_height+17)], fill=(*dark, 220))
        draw.rectangle((15, y+total_height+9, 126, y+total_height+14), fill=(*accent, 255))
    elif treatment == "technical-grid":
        draw.line((12, y-9, 12, y+total_height+9), fill=(*accent, 255), width=3)
        draw.line((12, y-9, 74, y-9), fill=(*accent, 255), width=3)
        draw.rectangle((20, y+total_height+4, 82, y+total_height+8), fill=(*light, 230))
    elif treatment == "outdoor-badge":
        draw.rounded_rectangle((34, y-12, 278, y+total_height+10), radius=18, fill=(*dark, 205), outline=(*light, 235), width=2)
    elif treatment == "fantasy-crest":
        draw.polygon([(32, y-11), (256, y-11), (270, y+total_height//2), (256, y+total_height+8), (32, y+total_height+8), (18, y+total_height//2)], fill=(*dark, 215), outline=(*accent, 255))
    elif treatment == "quiet-editorial":
        draw.line((84, y-10, 204, y-10), fill=(*accent, 190), width=1)
    elif treatment == "arcade-column":
        draw.rectangle((4, 18, 62, 450), fill=(*dark, 215))
        draw.rectangle((62, 18, 68, 450), fill=(*accent, 255))
        anchor_x, y, align = 34, 46, "center"
    elif treatment == "military-stencil":
        draw.polygon([(12, y-10), (260, y-10), (250, y+total_height+10), (12, y+total_height+10)], fill=(*dark, 225))
        for x in range(18, 74, 14):
            draw.rectangle((x, y-15, x+7, y-11), fill=(*accent, 255))
    elif treatment == "cinematic-minimal":
        draw.line((18, y-10, 112, y-10), fill=(*accent, 255), width=3)
    elif treatment == "retro-serial":
        center = (logical[0]//2, y+total_height//2)
        for radius in (138, 126):
            draw.arc((center[0]-radius, center[1]-radius//2, center[0]+radius, center[1]+radius//2), 190, 350, fill=(*accent, 220), width=2)
    elif treatment == "literary-serif":
        draw.line((18, y+total_height+4, 176, y+total_height+4), fill=(*accent, 235), width=2)
        draw.ellipse((181, y+total_height, 189, y+total_height+8), fill=(*light, 230))
    elif treatment == "judgement-block":
        draw.rectangle((92, y-10, 278, y+total_height+10), fill=(*dark, 225))
        draw.rectangle((272, y-10, 278, y+total_height+10), fill=(*accent, 255))

    for line in lines:
        rendered = tracked_text(line, tracking)
        bbox = draw.textbbox((0, 0), rendered, font=font, stroke_width=1)
        width = bbox[2]-bbox[0]
        x = anchor_x if align == "left" else anchor_x-width if align == "right" else anchor_x-width//2
        fill = light if luminance(light) > luminance(dark)+80 else (245, 235, 210)
        draw.text((x, y), rendered, font=font, fill=(*fill, 255), stroke_width=1, stroke_fill=(*dark, 245))
        y += line_height

    return layer.resize(size, Image.Resampling.NEAREST)


def finalize(kind: str, work: dict) -> tuple[Image.Image, float, int]:
    master = Image.open(MASTERS[kind]).convert("RGBA")
    raw_path = ASSET_ROOT / "raw" / kind / f"{work['slug']}.png"
    raw = Image.open(raw_path).convert("RGB")
    logical = medium_pixel_art(raw, GRIDS[kind], COLORS[kind])
    left, top, right, bottom = PANELS[kind]
    artwork = logical.resize((right-left, bottom-top), Image.Resampling.NEAREST)
    if kind == "case" and work["titlePolicy"]["show"]:
        artwork.alpha_composite(title_layer(artwork.size, work["titlePolicy"], artwork))
    output = master.copy()
    mask = chamfer_mask(artwork.size, 4 if kind == "inside" else 8)
    output.paste(artwork, (left, top), mask)
    output.putalpha(master.getchannel("A"))
    pixels = list(logical.convert("RGB").get_flattened_data())
    saturations = [colorsys.rgb_to_hsv(r/255, g/255, b/255)[1] for r, g, b in pixels]
    return output, sum(saturations)/len(saturations), len(set(pixels))


def contact_sheet(items: list[tuple[str, Image.Image]], output: Path, thumb: tuple[int, int]) -> None:
    if not items:
        return
    columns = 5
    rows = math.ceil(len(items)/columns)
    cell = (thumb[0]+30, thumb[1]+44)
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
    saturation_values: list[float] = []

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
            shared = work.get("sharedResourceWith")
            raw_path = ASSET_ROOT / "raw" / kind / f"{slug}.png"
            if shared:
                source_raw = ASSET_ROOT / "raw" / kind / f"{shared}.png"
                if source_raw.is_file() and not raw_path.is_file():
                    raw_path.write_bytes(source_raw.read_bytes())
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
            expected_duplicate = shared == duplicate if duplicate else False
            corners = [image.getpixel(point)[3] for point in [(0,0),(image.width-1,0),(0,image.height-1),(image.width-1,image.height-1)]]
            valid = alpha_exact and outside_exact and corners == [0,0,0,0] and color_count <= COLORS[kind] and (duplicate is None or expected_duplicate)
            if not valid:
                report["failures"].append(f"invalid final {kind}/{slug}")
            kind_report["items"][slug] = {"alphaExact": alpha_exact, "outsidePanelExact": outside_exact, "duplicatePanelOf": duplicate, "expectedSharedDuplicate": expected_duplicate, "cornerAlpha": corners, "meanSaturation": round(saturation, 3), "logicalColorCount": color_count, "sha256": digest(image)}
            kind_report["count"] += 1
            saturation_values.append(saturation)
            sheets[kind].append((slug, image))
        report["kinds"][kind] = kind_report

    saturation_span = max(saturation_values)-min(saturation_values) if saturation_values else 0
    report["colorVariation"] = {"minMeanSaturation": round(min(saturation_values), 3), "maxMeanSaturation": round(max(saturation_values), 3), "span": round(saturation_span, 3), "stddev": round(statistics.pstdev(saturation_values), 3)} if saturation_values else {}
    if saturation_span < 0.12:
        report["failures"].append("insufficient cross-work saturation variation")
    report["ok"] = not report["failures"] and all(item["count"] == len(works) for item in report["kinds"].values())
    qa_dir = ASSET_ROOT / "qa"
    contact_sheet(sheets["case"], qa_dir / "contact-cases.jpg", (190, 230))
    contact_sheet(sheets["inside"], qa_dir / "contact-insides.jpg", (270, 180))
    contact_sheet(sheets["cartridge"], qa_dir / "contact-cartridges.jpg", (170, 240))
    (qa_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"ok": report["ok"], "failures": report["failures"], "counts": {kind: item["count"] for kind, item in report["kinds"].items()}, "colorVariation": report["colorVariation"]}, ensure_ascii=False))
    if not report["ok"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
