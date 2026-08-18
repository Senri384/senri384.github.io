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
ASSET_ROOT = ROOT / "public" / "portfolio-assets" / "ui" / "game-card-system-v12"
MASTER_ROOT = ROOT / "public" / "portfolio-assets" / "ui" / "game-card-system-v5" / "masters"
DISPLAY_FONT_ROOT = ROOT / "assets" / "fonts" / "game-card-v12"

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
    "cinzel-decorative": DISPLAY_FONT_ROOT / "cinzel-decorative-bold.ttf",
    "creepster": DISPLAY_FONT_ROOT / "creepster.ttf",
    "iceberg": DISPLAY_FONT_ROOT / "iceberg.ttf",
    "bungee": DISPLAY_FONT_ROOT / "bungee.ttf",
    "uncial-antiqua": DISPLAY_FONT_ROOT / "uncial-antiqua.ttf",
    "black-ops-one": DISPLAY_FONT_ROOT / "black-ops-one.ttf",
    "orbitron": DISPLAY_FONT_ROOT / "orbitron.ttf",
    "metal-mania": DISPLAY_FONT_ROOT / "metal-mania.ttf",
    "pirata-one": DISPLAY_FONT_ROOT / "pirata-one.ttf",
    "audiowide": DISPLAY_FONT_ROOT / "audiowide.ttf",
    "rubik-dirt": DISPLAY_FONT_ROOT / "rubik-dirt.ttf",
    "racing-sans-one": DISPLAY_FONT_ROOT / "racing-sans-one.ttf",
    "alfa-slab-one": DISPLAY_FONT_ROOT / "alfa-slab-one.ttf",
    "jolly-lodger": DISPLAY_FONT_ROOT / "jolly-lodger.ttf",
    "righteous": DISPLAY_FONT_ROOT / "righteous.ttf",
    "monoton": DISPLAY_FONT_ROOT / "monoton.ttf",
}

TITLELESS_SIGNAL_ARTICLES = {
    "transformers-ip-games",
    "rock-kingdom-farewell",
    "pokemon-character-design",
    "helldivers2-community-ops",
    "alien-meme-culture",
    "chainsaw-man-dream",
    "fujimoto-cinematic-sense",
    "bbno-internet-playbook",
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


def fitted_font(font_name: str, text: str, size: int, max_width: int) -> ImageFont.FreeTypeFont:
    path = FONT_PATHS[font_name]
    probe = ImageDraw.Draw(Image.new("L", (max_width, max(80, size * 2))))
    current = size
    while current >= 9:
        font = ImageFont.truetype(path, current)
        if probe.textbbox((0, 0), text, font=font, stroke_width=2)[2] <= max_width:
            return font
        current -= 1
    return ImageFont.truetype(path, 9)


def title_layer(size: tuple[int, int], policy: dict, artwork: Image.Image, slug: str) -> Image.Image:
    """Draw a bespoke cover wordmark, not a generic type label."""
    logical = (288, 468)
    layer = Image.new("RGBA", logical, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    style_key = {
        "short-film-iron-superman": "iron-superman",
        "short-film-disappear": "disappear",
    }.get(slug, slug)

    def word(
        text: str,
        font_name: str,
        font_size: int,
        y: int,
        *,
        x: int = 144,
        max_width: int = 260,
        fill: tuple[int, int, int] = (246, 236, 210),
        stroke: tuple[int, int, int] = (18, 16, 18),
        stroke_width: int = 2,
        align: str = "center",
        shadow: tuple[int, int, int, int] = (0, 0, 0, 210),
        shadow_offset: tuple[int, int] = (3, 4),
        highlight: tuple[int, int, int] | None = None,
    ) -> tuple[int, int, int, int]:
        font = fitted_font(font_name, text, font_size, max_width)
        bbox = draw.textbbox((0, 0), text, font=font, stroke_width=stroke_width)
        width = bbox[2] - bbox[0]
        left = x if align == "left" else x - width if align == "right" else x - width // 2
        draw.text((left + shadow_offset[0], y + shadow_offset[1]), text, font=font, fill=shadow, stroke_width=stroke_width + 1, stroke_fill=shadow)
        draw.text((left, y), text, font=font, fill=(*fill, 255), stroke_width=stroke_width, stroke_fill=(*stroke, 255))
        if highlight is not None:
            draw.text((left, y - 1), text, font=font, fill=(*highlight, 135), stroke_width=0)
        return left, y, left + width, y + (bbox[3] - bbox[1])

    if style_key == "dwarf-lost-in-the-dark-forest":
        draw.polygon([(16, 10), (272, 10), (280, 26), (270, 86), (18, 86), (8, 26)], fill=(9, 12, 17, 205), outline=(169, 160, 143, 255))
        draw.line((28, 81, 260, 81), fill=(126, 150, 129, 255), width=2)
        word("DWARF", "cinzel-decorative", 45, 14, fill=(197, 191, 172), stroke=(28, 30, 29), stroke_width=2, highlight=(241, 234, 208))
        word("LOST IN THE DARK FOREST", "rubik-dirt", 14, 61, max_width=238, fill=(223, 211, 180), stroke=(20, 22, 20), stroke_width=1, shadow_offset=(2, 2))
        for px, py in [(60, 27), (91, 18), (170, 31), (222, 24)]:
            draw.line((px, py, px + 8, py + 6), fill=(76, 75, 70, 210), width=1)

    elif style_key == "stones-feast":
        draw.polygon([(7, 10), (281, 10), (274, 79), (18, 86)], fill=(13, 9, 9, 225), outline=(224, 210, 184, 255))
        draw.rectangle((14, 72, 273, 79), fill=(112, 7, 10, 255))
        word("STONE'S FEAST", "bungee", 35, 17, max_width=264, fill=(184, 22, 24), stroke=(244, 235, 211), stroke_width=2, shadow=(22, 0, 0, 240), shadow_offset=(4, 5), highlight=(255, 82, 48))
        for x in (34, 78, 133, 191, 244):
            draw.polygon([(x, 74), (x + 5, 68), (x + 10, 74)], fill=(224, 210, 184, 255))

    elif style_key == "the-cold-trial":
        draw.polygon([(12, 12), (231, 12), (276, 48), (248, 91), (12, 91)], fill=(9, 20, 34, 205), outline=(135, 199, 225, 230))
        word("THE COLD", "iceberg", 31, 16, x=22, align="left", max_width=220, fill=(220, 242, 248), stroke=(17, 51, 77), stroke_width=2, highlight=(255, 255, 255))
        word("TRIAL", "iceberg", 43, 45, x=24, align="left", max_width=215, fill=(126, 196, 224), stroke=(8, 27, 47), stroke_width=2, highlight=(226, 250, 255))
        for x in (233, 248, 260):
            draw.polygon([(x, 20), (x + 8, 54), (x - 3, 45)], fill=(176, 225, 241, 220))

    elif style_key == "peak-social-design":
        draw.rounded_rectangle((66, 16, 278, 76), radius=19, fill=(48, 33, 68, 225), outline=(255, 210, 124, 255), width=3)
        draw.arc((71, 48, 273, 90), 190, 350, fill=(255, 161, 90, 255), width=3)
        word("PEAK", "racing-sans-one", 38, 23, x=173, max_width=172, fill=(255, 226, 149), stroke=(63, 35, 70), stroke_width=2, highlight=(255, 249, 215))
        draw.ellipse((78, 31, 88, 41), outline=(255, 226, 149, 255), width=2)

    elif style_key == "rock-kingdom-world-breakdown":
        draw.polygon([(28, 10), (260, 10), (278, 52), (246, 91), (42, 91), (10, 52)], fill=(17, 48, 39, 220), outline=(225, 194, 102, 255))
        word("ROCO", "uncial-antiqua", 32, 17, fill=(244, 214, 126), stroke=(30, 65, 45), stroke_width=2, highlight=(255, 241, 178))
        word("KINGDOM", "cinzel-decorative", 22, 51, max_width=220, fill=(207, 174, 76), stroke=(23, 54, 41), stroke_width=2)
        draw.regular_polygon((144, 84, 9), 4, rotation=45, fill=(241, 214, 122, 255))

    elif style_key == "rock-kingdom-farewell":
        draw.rounded_rectangle((44, 15, 244, 64), radius=24, fill=(230, 226, 244, 150), outline=(255, 250, 255, 205), width=2)
        word("ROCO KINGDOM", "uncial-antiqua", 21, 25, max_width=178, fill=(108, 91, 148), stroke=(247, 240, 255), stroke_width=1, shadow=(88, 67, 125, 90), shadow_offset=(2, 2))
        for x in (58, 226):
            draw.arc((x - 18, 47, x + 18, 72), 200, 340, fill=(255, 243, 253, 210), width=2)

    elif style_key == "pokemon-character-design":
        draw.rounded_rectangle((18, 12, 270, 91), radius=22, fill=(15, 44, 78, 220), outline=(229, 248, 255, 255), width=2)
        draw.ellipse((26, 21, 71, 66), fill=(83, 210, 183, 230), outline=(245, 255, 236, 255), width=2)
        draw.ellipse((217, 37, 261, 81), fill=(239, 93, 161, 230), outline=(255, 236, 247, 255), width=2)
        word("CREATURE", "bungee", 25, 20, max_width=200, fill=(247, 242, 211), stroke=(27, 77, 110), stroke_width=2, highlight=(255, 255, 255))
        word("DESIGN", "righteous", 31, 49, max_width=186, fill=(101, 224, 190), stroke=(228, 85, 151), stroke_width=2, shadow=(0, 20, 48, 230), shadow_offset=(3, 3))
        draw.arc((48, 62, 237, 104), 185, 355, fill=(107, 211, 245, 255), width=2)

    elif style_key == "helldivers2-community-ops":
        draw.polygon([(10, 11), (232, 11), (269, 30), (244, 88), (10, 88)], fill=(25, 21, 22, 225), outline=(231, 128, 55, 255))
        for x in (17, 32, 47):
            draw.polygon([(x, 16), (x + 10, 16), (x + 4, 25)], fill=(231, 128, 55, 255))
        word("COMMUNITY", "black-ops-one", 21, 27, x=21, align="left", max_width=218, fill=(240, 219, 176), stroke=(50, 25, 20), stroke_width=1)
        word("OPS", "black-ops-one", 39, 48, x=22, align="left", max_width=145, fill=(222, 100, 39), stroke=(29, 20, 19), stroke_width=2, highlight=(255, 176, 89))
        draw.polygon([(196, 48), (213, 38), (230, 48), (224, 70), (202, 70)], outline=(234, 129, 53, 255))

    elif style_key == "disappear":
        draw.rectangle((14, 404, 274, 456), fill=(12, 21, 24, 205), outline=(214, 190, 145, 220), width=1)
        draw.line((20, 413, 87, 413), fill=(202, 140, 69, 255), width=3)
        draw.line((201, 447, 268, 447), fill=(202, 140, 69, 255), width=3)
        word("DISAPPEAR", "audiowide", 27, 417, max_width=238, fill=(228, 219, 191), stroke=(13, 23, 26), stroke_width=2, shadow_offset=(3, 3))

    elif style_key == "iron-superman":
        draw.polygon([(12, 378), (276, 366), (270, 457), (18, 457)], fill=(21, 18, 14, 220), outline=(230, 181, 47, 255))
        draw.polygon([(144, 371), (151, 385), (167, 387), (155, 398), (158, 414), (144, 406), (130, 414), (133, 398), (121, 387), (137, 385)], fill=(230, 181, 47, 255))
        word("SUPER IRON", "metal-mania", 30, 386, max_width=246, fill=(235, 224, 192), stroke=(124, 27, 22), stroke_width=2, highlight=(255, 247, 218))
        word("WHERE", "bungee", 28, 420, max_width=182, fill=(226, 174, 42), stroke=(111, 25, 22), stroke_width=2, shadow_offset=(4, 3))

    elif style_key == "rain-alley-pagoda-tree":
        draw.polygon([(12, 10), (233, 10), (270, 44), (238, 86), (12, 86)], fill=(8, 27, 35, 215), outline=(106, 153, 154, 255))
        word("RAIN ALLEY", "pirata-one", 32, 19, x=23, align="left", max_width=222, fill=(212, 224, 205), stroke=(17, 53, 60), stroke_width=2)
        word("PAGODA TREE", "cinzel-decorative", 15, 57, x=25, align="left", max_width=205, fill=(129, 181, 174), stroke=(10, 38, 45), stroke_width=1)
        draw.line((239, 20, 239, 72), fill=(135, 188, 180, 255), width=2)
        draw.line((246, 26, 246, 66), fill=(78, 122, 126, 255), width=1)

    elif style_key == "short-film-sanction":
        font = ImageFont.truetype(FONT_PATHS["rubik-dirt"], 31)
        axis_x = 252
        start_y = 43
        step_y = 47
        for index, letter in enumerate("SANCTION"):
            y = start_y + index * step_y
            bbox = draw.textbbox((0, 0), letter, font=font, stroke_width=1)
            letter_width = bbox[2] - bbox[0]
            x = axis_x - letter_width // 2
            draw.text(
                (x + 2, y + 3),
                letter,
                font=font,
                fill=(25, 0, 2, 180),
                stroke_width=2,
                stroke_fill=(25, 0, 2, 180),
            )
            draw.text(
                (x, y),
                letter,
                font=font,
                fill=(174, 4, 19, 255),
                stroke_width=1,
                stroke_fill=(247, 230, 217, 230),
            )

    else:
        word(policy["text"], "righteous", 26, 22, max_width=252)

    return layer.resize(size, Image.Resampling.NEAREST)


def finalize(kind: str, work: dict) -> tuple[Image.Image, float, int]:
    master = Image.open(MASTERS[kind]).convert("RGBA")
    raw_path = ASSET_ROOT / "raw" / kind / f"{work['slug']}.png"
    raw = Image.open(raw_path).convert("RGB")
    logical = medium_pixel_art(raw, GRIDS[kind], COLORS[kind])
    left, top, right, bottom = PANELS[kind]
    artwork = logical.resize((right-left, bottom-top), Image.Resampling.NEAREST)
    if kind == "case" and work["slug"] not in TITLELESS_SIGNAL_ARTICLES and work["titlePolicy"]["show"]:
        artwork.alpha_composite(title_layer(artwork.size, work["titlePolicy"], artwork, work["slug"]))
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
