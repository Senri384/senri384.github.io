from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "public" / "portfolio-assets" / "ui" / "game-card-system-v8"
MANIFEST = ASSET_ROOT / "manifest.json"
MASTER_ROOT = ROOT / "public" / "portfolio-assets" / "ui" / "game-card-system-v5" / "masters"
MASTERS = {
    "case": MASTER_ROOT / "case-master.png",
    "inside": MASTER_ROOT / "inside-master.png",
    "cartridge": MASTER_ROOT / "cart-master.png",
}
OUTPUT_DIRS = {
    "case": ASSET_ROOT / "cases",
    "inside": ASSET_ROOT / "insides",
    "cartridge": ASSET_ROOT / "cartridges",
}
PANELS = {
    "case": (176, 78, 753, 1018),
    "inside": (170, 66, 716, 958),
    "cartridge": (150, 205, 550, 790),
}


def chamfer_mask(size: tuple[int, int], inset: int) -> Image.Image:
    width, height = size
    mask = Image.new("L", size, 0)
    points = [
        (inset, 0),
        (width - inset, 0),
        (width, inset),
        (width, height - inset),
        (width - inset, height),
        (inset, height),
        (0, height - inset),
        (0, inset),
    ]
    ImageDraw.Draw(mask).polygon(points, fill=255)
    return mask


def normalize_raw(raw: Image.Image, size: tuple[int, int]) -> Image.Image:
    return raw.convert("RGB").resize(size, Image.Resampling.LANCZOS).filter(
        ImageFilter.UnsharpMask(radius=0.7, percent=125, threshold=3)
    )


def tone_cartridge_label(image: Image.Image) -> Image.Image:
    # Keep artwork color, but pull electric cyan/magenta away from neon signage.
    source = image.convert("HSV")
    h, s, v = source.split()
    hp = h.load()
    sp = s.load()
    vp = v.load()
    width, height = source.size
    for y in range(height):
        for x in range(width):
            hue = hp[x, y]
            saturation = sp[x, y]
            if saturation > 170 and (hue < 18 or 105 < hue < 220):
                sp[x, y] = min(saturation, 118)
                vp[x, y] = min(vp[x, y], 220)
    return Image.merge("HSV", (h, s, v)).convert("RGB")


def finalize(kind: str, slug: str) -> Image.Image:
    master = Image.open(MASTERS[kind]).convert("RGBA")
    raw_path = ASSET_ROOT / "raw" / kind / f"{slug}.png"
    raw = normalize_raw(Image.open(raw_path), master.size)
    if kind == "cartridge":
        raw = tone_cartridge_label(raw)

    output = master.copy()
    left, top, right, bottom = PANELS[kind]
    artwork = raw.crop((left, top, right, bottom))
    mask = chamfer_mask(artwork.size, 8 if kind != "inside" else 4)
    output.paste(artwork, (left, top), mask)
    output.putalpha(master.getchannel("A"))
    return output


def digest(image: Image.Image) -> str:
    return hashlib.sha256(image.tobytes()).hexdigest()


def panel_digest(image: Image.Image, kind: str) -> str:
    return digest(image.crop(PANELS[kind]).convert("RGB"))


def contact_sheet(items: list[tuple[str, Image.Image]], output: Path, thumb: tuple[int, int]) -> None:
    columns = 5
    rows = (len(items) + columns - 1) // columns
    cell_width = thumb[0] + 34
    cell_height = thumb[1] + 48
    sheet = Image.new("RGB", (columns * cell_width, rows * cell_height), (42, 12, 27))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for index, (slug, image) in enumerate(items):
        column = index % columns
        row = index // columns
        preview = image.copy()
        preview.thumbnail(thumb, Image.Resampling.LANCZOS)
        x = column * cell_width + (cell_width - preview.width) // 2
        y = row * cell_height + 8
        checker = Image.new("RGB", preview.size, (78, 51, 63))
        checker.paste(preview, mask=preview.getchannel("A"))
        sheet.paste(checker, (x, y))
        label = slug[:34]
        draw.text((column * cell_width + 8, row * cell_height + thumb[1] + 16), label, fill=(245, 230, 233), font=font)
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, quality=92)


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    report = {
        "ok": True,
        "expectedWorks": manifest["count"],
        "kinds": {},
        "failures": [],
    }
    sheets: dict[str, list[tuple[str, Image.Image]]] = {kind: [] for kind in MASTERS}

    for kind, master_path in MASTERS.items():
        master = Image.open(master_path).convert("RGBA")
        master_alpha = master.getchannel("A").tobytes()
        outside_mask = Image.new("L", master.size, 255)
        ImageDraw.Draw(outside_mask).rectangle(PANELS[kind], fill=0)
        outside_master = Image.composite(master, Image.new("RGBA", master.size), outside_mask)
        kind_report = {"count": 0, "size": list(master.size), "items": {}}
        panel_hashes: dict[str, str] = {}
        OUTPUT_DIRS[kind].mkdir(parents=True, exist_ok=True)

        for work in manifest["works"]:
            slug = work["slug"]
            raw_path = ASSET_ROOT / "raw" / kind / f"{slug}.png"
            if not raw_path.is_file():
                report["failures"].append(f"missing raw {kind}/{slug}")
                continue
            image = finalize(kind, slug)
            output_path = OUTPUT_DIRS[kind] / f"{slug}.png"
            image.save(output_path, optimize=True)

            alpha_exact = image.getchannel("A").tobytes() == master_alpha
            outside = Image.composite(image, Image.new("RGBA", image.size), outside_mask)
            outside_exact = outside.tobytes() == outside_master.tobytes()
            phash = panel_digest(image, kind)
            duplicate = panel_hashes.get(phash)
            panel_hashes[phash] = slug
            corner_alpha = [
                image.getpixel((0, 0))[3],
                image.getpixel((image.width - 1, 0))[3],
                image.getpixel((0, image.height - 1))[3],
                image.getpixel((image.width - 1, image.height - 1))[3],
            ]
            valid = alpha_exact and outside_exact and not duplicate and corner_alpha == [0, 0, 0, 0]
            if not valid:
                report["failures"].append(f"invalid final {kind}/{slug}")
            kind_report["items"][slug] = {
                "size": list(image.size),
                "alphaExact": alpha_exact,
                "outsidePanelExact": outside_exact,
                "cornerAlpha": corner_alpha,
                "duplicatePanelOf": duplicate,
                "sha256": digest(image),
            }
            kind_report["count"] += 1
            sheets[kind].append((slug, image))

        report["kinds"][kind] = kind_report

    report["ok"] = not report["failures"] and all(
        value["count"] == manifest["count"] for value in report["kinds"].values()
    )
    contact_sheet(sheets["case"], ASSET_ROOT / "qa" / "contact-cases.jpg", (190, 230))
    contact_sheet(sheets["inside"], ASSET_ROOT / "qa" / "contact-insides.jpg", (270, 180))
    contact_sheet(sheets["cartridge"], ASSET_ROOT / "qa" / "contact-cartridges.jpg", (170, 240))
    (ASSET_ROOT / "qa" / "report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "ok": report["ok"],
                "failures": len(report["failures"]),
                "counts": {key: value["count"] for key, value in report["kinds"].items()},
            },
            ensure_ascii=False,
        )
    )
    if not report["ok"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
