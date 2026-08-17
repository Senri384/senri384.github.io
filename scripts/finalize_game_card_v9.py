from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PLAN_PATH = ROOT / "docs" / "game-card-system" / "generation-plan-v3.json"
ASSET_ROOT = ROOT / "public" / "portfolio-assets" / "ui" / "game-card-system-v9"
MASTER_ROOT = ROOT / "public" / "portfolio-assets" / "ui" / "game-card-system-v5" / "masters"
FONT_PATH = ROOT / "public" / "fonts" / "oxanium-600.ttf"

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
OUTPUT_DIRS = {
    "case": ASSET_ROOT / "cases",
    "inside": ASSET_ROOT / "insides",
    "cartridge": ASSET_ROOT / "cartridges",
}


def digest(image: Image.Image) -> str:
    return hashlib.sha256(image.tobytes()).hexdigest()


def chamfer_mask(size: tuple[int, int], inset: int) -> Image.Image:
    width, height = size
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).polygon(
        [
            (inset, 0),
            (width - inset, 0),
            (width, inset),
            (width, height - inset),
            (width - inset, height),
            (inset, height),
            (0, height - inset),
            (0, inset),
        ],
        fill=255,
    )
    return mask


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if not current or draw.textbbox((0, 0), candidate, font=font, stroke_width=1)[2] <= width:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def pixel_title(size: tuple[int, int], text: str, *, cartridge: bool = False) -> Image.Image:
    scale = 3
    low_size = (max(1, size[0] // scale), max(1, size[1] // scale))
    layer = Image.new("RGBA", low_size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    start = 20 if not cartridge else 15
    minimum = 10 if not cartridge else 9
    max_lines = 3 if not cartridge else 2
    font = ImageFont.truetype(FONT_PATH, start)
    lines = wrap_text(draw, text, font, low_size[0] - 18)
    while (len(lines) > max_lines or any(draw.textbbox((0, 0), line, font=font, stroke_width=1)[2] > low_size[0] - 18 for line in lines)) and start > minimum:
        start -= 1
        font = ImageFont.truetype(FONT_PATH, start)
        lines = wrap_text(draw, text, font, low_size[0] - 18)

    line_height = start + 3
    total_height = line_height * len(lines)
    y = 8 if not cartridge else low_size[1] - total_height - 8
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font, stroke_width=1)
        x = (low_size[0] - (bbox[2] - bbox[0])) // 2
        draw.text(
            (x, y),
            line,
            font=font,
            fill=(232, 218, 186, 255),
            stroke_width=1,
            stroke_fill=(14, 12, 12, 245),
        )
        y += line_height
    return layer.resize(size, Image.Resampling.NEAREST)


def cover_title(work: dict, rules: dict) -> str | None:
    overrides = rules["coverTitleOverrides"]
    if work["slug"] in overrides:
        return overrides[work["slug"]]
    return work["label"].split("/")[0].strip()


def cartridge_title(work: dict, rules: dict) -> str:
    slug = work["slug"]
    if slug in {"rock-kingdom-world-breakdown", "rock-kingdom-farewell"}:
        return "ROCO KINGDOM"
    if slug in {"iron-superman", "short-film-iron-superman"}:
        return "SUPER IRON WHERE"
    return work["label"].split("/")[0].strip()


def finalize(kind: str, work: dict, rules: dict) -> Image.Image:
    slug = work["slug"]
    master = Image.open(MASTERS[kind]).convert("RGBA")
    raw_path = ASSET_ROOT / "raw" / kind / f"{slug}.png"
    raw = Image.open(raw_path).convert("RGB").resize(master.size, Image.Resampling.LANCZOS)
    raw = raw.filter(ImageFilter.UnsharpMask(radius=0.65, percent=120, threshold=3))
    left, top, right, bottom = PANELS[kind]
    artwork = raw.crop((left, top, right, bottom)).convert("RGBA")

    if kind == "case":
        title = cover_title(work, rules)
        if title:
            artwork.alpha_composite(pixel_title(artwork.size, title))
    elif kind == "cartridge":
        artwork.alpha_composite(pixel_title(artwork.size, cartridge_title(work, rules), cartridge=True))

    output = master.copy()
    mask = chamfer_mask(artwork.size, 4 if kind == "inside" else 8)
    output.paste(artwork, (left, top), mask)
    output.putalpha(master.getchannel("A"))
    return output


def contact_sheet(items: list[tuple[str, Image.Image]], output: Path, thumb: tuple[int, int]) -> None:
    columns = 5
    rows = (len(items) + columns - 1) // columns
    cell = (thumb[0] + 30, thumb[1] + 44)
    sheet = Image.new("RGB", (columns * cell[0], rows * cell[1]), (53, 21, 38))
    draw = ImageDraw.Draw(sheet)
    for index, (slug, image) in enumerate(items):
        preview = image.copy()
        preview.thumbnail(thumb, Image.Resampling.LANCZOS)
        x = (index % columns) * cell[0] + (cell[0] - preview.width) // 2
        y = (index // columns) * cell[1] + 6
        checker = Image.new("RGB", preview.size, (78, 51, 63))
        checker.paste(preview, mask=preview.getchannel("A"))
        sheet.paste(checker, (x, y))
        draw.text(((index % columns) * cell[0] + 6, (index // columns) * cell[1] + thumb[1] + 14), slug[:34], fill=(245, 230, 233))
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, quality=94)


def main() -> None:
    plan = json.loads(PLAN_PATH.read_text(encoding="utf-8"))
    works = plan["works"]
    rules = plan["productionRules"]
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
            image = finalize(kind, work, rules)
            output_path = OUTPUT_DIRS[kind] / f"{slug}.png"
            image.save(output_path, optimize=True)
            alpha_exact = image.getchannel("A").tobytes() == master_alpha
            outside = Image.composite(image, Image.new("RGBA", image.size), outside_mask)
            outside_exact = outside.tobytes() == outside_master.tobytes()
            panel_hash = digest(image.crop(PANELS[kind]).convert("RGB"))
            duplicate = panel_hashes.get(panel_hash)
            panel_hashes[panel_hash] = slug
            corners = [
                image.getpixel((0, 0))[3],
                image.getpixel((image.width - 1, 0))[3],
                image.getpixel((0, image.height - 1))[3],
                image.getpixel((image.width - 1, image.height - 1))[3],
            ]
            valid = alpha_exact and outside_exact and duplicate is None and corners == [0, 0, 0, 0]
            if not valid:
                report["failures"].append(f"invalid final {kind}/{slug}")
            kind_report["items"][slug] = {
                "alphaExact": alpha_exact,
                "outsidePanelExact": outside_exact,
                "duplicatePanelOf": duplicate,
                "cornerAlpha": corners,
                "sha256": digest(image),
            }
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
