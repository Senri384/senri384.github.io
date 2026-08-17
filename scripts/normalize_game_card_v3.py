from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "public" / "portfolio-assets" / "ui" / "game-card-system-v1"
TEMPLATE_DIR = ASSET_DIR / "templates"
PLAN_PATH = ROOT / "docs" / "game-card-system" / "generation-plan-v3.json"


@dataclass(frozen=True)
class Aperture:
    left: int
    top: int
    right: int
    bottom: int

    @property
    def size(self) -> tuple[int, int]:
        return self.right - self.left, self.bottom - self.top


CLOSED_APERTURE = Aperture(58, 25, 435, 596)
OPEN_LEFT_APERTURE = Aperture(91, 79, 818, 1066)
CARTRIDGE_APERTURE = Aperture(41, 62, 269, 360)

CATEGORY_SOURCES = {
    "game-design": "category-rack-game-design.png",
    "game-research": "category-rack-game-research-v1.png",
    "articles": "category-rack-articles-v1.png",
    "scripts": "category-rack-scripts-v1.png",
    "reviews": "category-rack-reviews-v1.png",
    "experience": "category-rack-experience-v1.png",
    "short-films": "category-rack-short-films-v1.png",
    "photography": "category-rack-photography-v1.png",
}


def artwork_source(prefix: str, slug: str) -> Path:
    v1 = ASSET_DIR / f"{prefix}-{slug}-v1.png"
    if v1.exists():
        return v1
    v2 = ASSET_DIR / f"{prefix}-{slug}-v2.png"
    if v2.exists():
        return v2
    raise FileNotFoundError(f"No {prefix} source for {slug}")


def crop_relative(image: Image.Image, box: tuple[float, float, float, float]) -> Image.Image:
    source = ImageOps.exif_transpose(image).convert("RGBA")
    width, height = source.size
    return source.crop(
        (
            round(width * box[0]),
            round(height * box[1]),
            round(width * box[2]),
            round(height * box[3]),
        )
    )


def extract_art(prefix: str, source: Image.Image) -> Image.Image:
    if prefix == "case":
        return crop_relative(source, (0.115, 0.045, 0.955, 0.965))
    if prefix == "open":
        return crop_relative(source, (0.053, 0.068, 0.473, 0.925))
    if prefix == "cartridge":
        return crop_relative(source, (0.132, 0.135, 0.868, 0.795))
    raise ValueError(prefix)


def pixel_finish(source: Image.Image, size: tuple[int, int], scale: int = 2) -> Image.Image:
    image = ImageOps.fit(source.convert("RGB"), size, Image.Resampling.LANCZOS)
    small = image.resize(
        (max(1, size[0] // scale), max(1, size[1] // scale)),
        Image.Resampling.BOX,
    )
    image = small.resize(size, Image.Resampling.NEAREST)
    image = ImageEnhance.Contrast(image).enhance(1.04)
    return image.convert("RGBA")


def transparent_window(template: Image.Image, aperture: Aperture) -> Image.Image:
    shell = template.convert("RGBA").copy()
    shell.paste((0, 0, 0, 0), (aperture.left, aperture.top, aperture.right, aperture.bottom))
    return shell


def composite(template: Image.Image, artwork: Image.Image, aperture: Aperture) -> Image.Image:
    result = Image.new("RGBA", template.size, (0, 0, 0, 0))
    result.alpha_composite(pixel_finish(artwork, aperture.size), (aperture.left, aperture.top))
    result.alpha_composite(transparent_window(template, aperture))
    return result


def clean_rack(source: Image.Image) -> Image.Image:
    image = source.convert("RGBA")
    alpha = image.getchannel("A")
    contracted = alpha.filter(ImageFilter.MinFilter(3))
    softened = contracted.filter(ImageFilter.GaussianBlur(0.22))
    interior = alpha.filter(ImageFilter.MinFilter(7))
    pixels = image.load()
    matte = softened.load()
    interior_alpha = interior.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, _ = pixels[x, y]
            a = matte[x, y]
            if a < 245:
                white = max(0, min(r, g, b) - 96)
                r = max(0, r - white)
                g = max(0, g - white)
                b = max(0, b - white)
            if interior_alpha[x, y] < 250:
                # Generated transparent cutouts can retain a pale or neon matte
                # in the outermost pixels. Neutralize only that silhouette edge;
                # the integrated label and interior highlights stay untouched.
                spread = max(r, g, b) - min(r, g, b)
                is_pale_matte = min(r, g, b) > 112 and spread < 54
                is_cyan_matte = b > r * 1.22 and g > r * 1.12
                is_magenta_matte = r > g * 1.25 and b > g * 1.12
                if is_pale_matte or is_cyan_matte or is_magenta_matte:
                    value = max(18, min(74, round(r * 0.3 + g * 0.48 + b * 0.22)))
                    r, g, b = value, round(value * 0.9), round(value * 0.82)
            pixels[x, y] = (r, g, b, a)
    bbox = image.getbbox()
    if bbox:
        image = image.crop(bbox)
    canvas = Image.new("RGBA", (1200, 1200), (0, 0, 0, 0))
    image.thumbnail((1140, 1140), Image.Resampling.LANCZOS)
    canvas.alpha_composite(image, ((1200 - image.width) // 2, (1200 - image.height) // 2))
    return canvas


def build() -> dict[str, object]:
    plan = json.loads(PLAN_PATH.read_text(encoding="utf-8"))
    closed_template = Image.open(TEMPLATE_DIR / "case-shell-rango-master.png").convert("RGBA")
    open_template = Image.open(TEMPLATE_DIR / "open-shell-rango-master.png").convert("RGBA")
    cartridge_template = Image.open(TEMPLATE_DIR / "cartridge-shell-rango-master.png").convert("RGBA")
    templates = {
        "case": (closed_template, CLOSED_APERTURE),
        "open": (open_template, OPEN_LEFT_APERTURE),
        "cartridge": (cartridge_template, CARTRIDGE_APERTURE),
    }

    report: dict[str, object] = {"version": 3, "works": {}, "categories": {}, "ok": True}
    for work in plan["works"]:
        slug = work["slug"]
        record: dict[str, object] = {}
        for prefix, (template, aperture) in templates.items():
            source_path = artwork_source(prefix, slug)
            artwork = extract_art(prefix, Image.open(source_path))
            output = ASSET_DIR / f"{prefix}-{slug}-v3.png"
            composite(template, artwork, aperture).save(output)
            record[prefix] = {
                "source": source_path.name,
                "file": output.name,
                "size": list(Image.open(output).size),
            }
        report["works"][slug] = record

    for category, filename in CATEGORY_SOURCES.items():
        source_path = ASSET_DIR / filename
        output = ASSET_DIR / f"category-rack-{category}-v3.png"
        clean_rack(Image.open(source_path)).save(output)
        report["categories"][category] = {
            "source": filename,
            "file": output.name,
            "size": list(Image.open(output).size),
        }

    expected = {"case": (454, 616), "open": (1730, 1155), "cartridge": (311, 454)}
    for record in report["works"].values():
        for prefix, size in expected.items():
            if tuple(record[prefix]["size"]) != size:
                report["ok"] = False
    (TEMPLATE_DIR / "v3-audit.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return report


if __name__ == "__main__":
    result = build()
    print(json.dumps({"ok": result["ok"], "works": len(result["works"]), "categories": len(result["categories"])}, ensure_ascii=False))
