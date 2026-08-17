from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "public" / "portfolio-assets" / "ui" / "game-card-system-v1"
TEMPLATE_DIR = ASSET_DIR / "templates"


@dataclass(frozen=True)
class Aperture:
    left: int
    top: int
    right: int
    bottom: int

    @property
    def size(self) -> tuple[int, int]:
        return self.right - self.left, self.bottom - self.top


# These apertures are measured from the current Rango triplet. The outer shell is
# never regenerated; only the artwork beneath these windows changes.
CLOSED_APERTURE = Aperture(58, 25, 435, 596)
OPEN_LEFT_APERTURE = Aperture(91, 79, 818, 1066)
CARTRIDGE_APERTURE = Aperture(41, 62, 269, 360)

ART_DIR = ASSET_DIR / "art-v2"
GENERATED_PEAK = ART_DIR / "peak-social-design-generated.png"

# Every entry is artwork-only. Shell geometry always comes from the Rango master.
WORKS: dict[str, dict[str, object]] = {
    "dwarf-lost-in-the-dark-forest": {"cover": "public/portfolio-assets/games/dwarf-cover.png", "inside": "public/portfolio-assets/games/dwarf-forest.png", "title": "DWARF: LOST IN THE DARK FOREST"},
    "stones-feast": {"cover": "public/portfolio-assets/games/stones-feast-cover.png", "inside": "public/portfolio-assets/games/stones-feast-kitchen.png", "title": "STONE'S FEAST"},
    "the-cold-trial": {"cover": "public/portfolio-assets/games/cold-trial-cover.png", "inside": "public/portfolio-assets/games/cold-trial-courtroom.png", "title": "THE COLD TRIAL"},
    "peak-social-design": {"cover": "public/portfolio-assets/ui/game-card-system-v1/art-v2/peak-social-design-generated.png", "inside": "references/game-card-plan/peak-social-design.png", "title": "PEAK"},
    "rock-kingdom-world-breakdown": {"cover": "public/portfolio-assets/ui/game-card-system-v1/art-v2/rock-kingdom-world-breakdown-generated.png", "inside": "public/portfolio-assets/extracted/rock-kingdom-world-breakdown/page-1.png", "title": "ROCO KINGDOM"},
    "transformers-ip-games": {"cover": "public/portfolio-assets/ui/game-card-system-v1/art-v2/transformers-ip-games-generated.png", "inside": "public/portfolio-assets/extracted/transformers-ip-games/image-002.png", "title": "TRANSFORMERS"},
    "rock-kingdom-farewell": {"cover": "public/portfolio-assets/ui/game-card-system-v1/art-v2/rock-kingdom-farewell-generated.png", "inside": "public/portfolio-assets/extracted/rock-kingdom-farewell/image-003.jpg", "title": "FAREWELL"},
    "pokemon-character-design": {"cover": "public/portfolio-assets/ui/game-card-system-v1/art-v2/pokemon-character-design-generated.png", "inside": "public/portfolio-assets/extracted/pokemon-character-design/image-001.png", "title": "POKEMON"},
    "helldivers2-community-ops": {"cover": "public/portfolio-assets/ui/game-card-system-v1/art-v2/helldivers2-community-ops-generated.png", "inside": "public/portfolio-assets/extracted/helldivers2-community-ops/image-012.png", "title": "HELLDIVERS 2"},
    "alien-meme-culture": {"cover": "public/portfolio-assets/ui/game-card-system-v1/art-v2/alien-meme-culture-generated.png", "inside": "public/portfolio-assets/extracted/alien-meme-culture/image-004.png", "title": "ALIEN MEME"},
    "chainsaw-man-dream": {"cover": "public/portfolio-assets/ui/game-card-system-v1/art-v2/chainsaw-man-dream-generated.png", "inside": "public/portfolio-assets/extracted/chainsaw-man-dream/image-003.png", "title": "CHAINSAW MAN"},
    "fujimoto-cinematic-sense": {"cover": "public/portfolio-assets/ui/game-card-system-v1/art-v2/fujimoto-cinematic-sense-generated.png", "inside": "public/portfolio-assets/extracted/fujimoto-cinematic-sense/image-003.png", "title": "FUJIMOTO"},
    "bbno-internet-playbook": {"cover": "public/portfolio-assets/ui/game-card-system-v1/art-v2/bbno-internet-playbook-generated.png", "inside": "output/bbno-docx-media/image18.png", "title": "BBNO$ ONLINE"},
    "disappear": {"fallback": "case-disappear-v1.png", "title": "DISAPPEAR"},
    "iron-superman": {"fallback": "case-iron-superman-v1.png", "title": "SUPER IRON WHERE"},
    "rain-alley-pagoda-tree": {"fallback": "case-rain-alley-pagoda-tree-v1.png", "title": "RAIN ALLEY"},
    "caines-mutiny-stage-review": {"fallback": "case-caines-mutiny-stage-review-v1.png", "title": "THE CAINE MUTINY"},
    "rango-review": {"cover": "public/portfolio-assets/ui/game-card-system-v1/art-v2/rango-review-generated.png", "inside": "references/game-card-plan/rango-review.png", "title": "RANGO"},
    "twelve-angry-men-review": {"cover": "public/portfolio-assets/ui/game-card-system-v1/art-v2/twelve-angry-men-review-generated.png", "inside": "references/game-card-plan/twelve-angry-men-review.png", "title": "12 ANGRY MEN"},
    "2001-space-odyssey-review": {"cover": "public/portfolio-assets/ui/game-card-system-v1/art-v2/2001-space-odyssey-review-generated.png", "inside": "references/game-card-plan/2001-space-odyssey-review.png", "title": "2001: A SPACE ODYSSEY"},
    "film-ranking-analysis": {"cover": "public/portfolio-assets/extracted/film-ranking-analysis/image-001.jpg", "inside": "public/portfolio-assets/extracted/film-ranking-analysis/image-003.jpg", "title": "FILM RANKING"},
    "game-experience-table": {"fallback": "case-game-experience-table-v1.png", "title": "GAME EXPERIENCE"},
    "short-film-iron-superman": {"cover": "public/portfolio-assets/films/iron-superman/poster.webp", "inside": "public/portfolio-assets/films/iron-superman/still-02.webp", "title": "SUPER IRON WHERE"},
    "short-film-sanction": {"cover": "public/portfolio-assets/films/sanction/poster.webp", "inside": "public/portfolio-assets/films/sanction/still-02.webp", "title": "SANCTION"},
    "short-film-disappear": {"cover": "public/portfolio-assets/films/disappear/poster.webp", "inside": "public/portfolio-assets/films/disappear/player-poster.webp", "title": "DISAPPEAR"},
    "wangu": {"cover": "public/portfolio-assets/photography/wangu/cover.webp", "inside": "public/portfolio-assets/photography/wangu/01.webp", "title": None},
    "liuguang": {"cover": "public/portfolio-assets/photography/liuguang/cover.webp", "inside": "public/portfolio-assets/photography/liuguang/01.webp", "title": None},
    "cangmang": {"cover": "public/portfolio-assets/photography/cangmang/cover.webp", "inside": "public/portfolio-assets/photography/cangmang/01.webp", "title": None},
    "shenhai": {"cover": "public/portfolio-assets/photography/shenhai/cover.webp", "inside": "public/portfolio-assets/photography/shenhai/01.webp", "title": None},
    "zhejin": {"cover": "public/portfolio-assets/photography/zhejin/cover.webp", "inside": "public/portfolio-assets/photography/zhejin/01.webp", "title": None},
}


def fit_cover(source: Image.Image, size: tuple[int, int]) -> Image.Image:
    image = ImageOps.exif_transpose(source).convert("RGBA")
    image = ImageOps.fit(image, size, method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    return image


def pixel_finish(source: Image.Image, size: tuple[int, int], pixel_scale: int = 3) -> Image.Image:
    fitted = fit_cover(source, size)
    small = fitted.resize(
        (max(1, size[0] // pixel_scale), max(1, size[1] // pixel_scale)),
        Image.Resampling.BOX,
    )
    pixel = small.resize(size, Image.Resampling.NEAREST)
    pixel = ImageEnhance.Contrast(pixel).enhance(1.08)
    pixel = ImageEnhance.Color(pixel).enhance(0.92)
    return pixel


def title_font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(r"C:\Windows\Fonts\impact.ttf", size=size)


def add_cover_title(source: Image.Image, title: str | None, size: tuple[int, int]) -> Image.Image:
    image = fit_cover(source, size)
    if not title:
        return image
    draw = ImageDraw.Draw(image)
    max_width = int(image.width * 0.88)
    size = max(22, image.width // 8)
    while size > 22:
        font = title_font(size)
        bbox = draw.textbbox((0, 0), title, font=font, stroke_width=max(1, size // 22))
        if bbox[2] - bbox[0] <= max_width:
            break
        size -= 2
    font = title_font(size)
    bbox = draw.textbbox((0, 0), title, font=font, stroke_width=max(1, size // 22))
    x = (image.width - (bbox[2] - bbox[0])) // 2
    y = int(image.height * 0.045)
    shadow = max(2, size // 15)
    draw.text((x + shadow, y + shadow), title, font=font, fill=(129, 18, 52, 255), stroke_width=max(1, size // 22), stroke_fill=(8, 6, 14, 255))
    draw.text((x, y), title, font=font, fill=(244, 238, 203, 255), stroke_width=max(1, size // 22), stroke_fill=(8, 6, 14, 255))
    return image


def fallback_art(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    # Discard the old case silhouette and retain only its central illustration.
    left = int(image.width * 0.11)
    top = int(image.height * 0.075)
    right = int(image.width * 0.90)
    bottom = int(image.height * 0.93)
    return image.crop((left, top, right, bottom))


def transparent_window(template: Image.Image, aperture: Aperture) -> Image.Image:
    shell = template.convert("RGBA").copy()
    shell.paste((0, 0, 0, 0), (aperture.left, aperture.top, aperture.right, aperture.bottom))
    return shell


def composite(template: Image.Image, artwork: Image.Image, aperture: Aperture) -> Image.Image:
    result = Image.new("RGBA", template.size, (0, 0, 0, 0))
    result.alpha_composite(pixel_finish(artwork, aperture.size), (aperture.left, aperture.top))
    result.alpha_composite(transparent_window(template, aperture))
    return result


def make_template_triplet() -> dict[str, object]:
    closed = Image.open(ASSET_DIR / "case-rango-review-v1.png").convert("RGBA")
    opened = Image.open(ASSET_DIR / "open-rango-review-v1.png").convert("RGBA")
    cartridge = Image.open(ASSET_DIR / "cartridge-rango-review-v1.png").convert("RGBA")

    TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)
    transparent_window(closed, CLOSED_APERTURE).save(TEMPLATE_DIR / "case-shell-rango-master.png")
    transparent_window(opened, OPEN_LEFT_APERTURE).save(TEMPLATE_DIR / "open-shell-rango-master.png")
    transparent_window(cartridge, CARTRIDGE_APERTURE).save(
        TEMPLATE_DIR / "cartridge-shell-rango-master.png"
    )

    manifest = {
        "version": 1,
        "source": "Rango review triplet",
        "closed": {"size": list(closed.size), "aperture": CLOSED_APERTURE.__dict__},
        "open": {"size": list(opened.size), "aperture": OPEN_LEFT_APERTURE.__dict__},
        "cartridge": {
            "size": list(cartridge.size),
            "aperture": CARTRIDGE_APERTURE.__dict__,
        },
        "invariants": [
            "front orthographic view",
            "identical shell silhouette and hardware",
            "identical canvas size and transparent bounds",
            "artwork-only variation",
        ],
    }
    (TEMPLATE_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return manifest


def build_triplet(slug: str, cover: Path, inside: Path | None, label: Path | None) -> None:
    closed_template = Image.open(ASSET_DIR / "case-rango-review-v1.png").convert("RGBA")
    open_template = Image.open(ASSET_DIR / "open-rango-review-v1.png").convert("RGBA")
    cartridge_template = Image.open(ASSET_DIR / "cartridge-rango-review-v1.png").convert("RGBA")
    cover_art = Image.open(cover)
    inside_art = Image.open(inside or cover)
    label_art = Image.open(label or cover)

    composite(closed_template, cover_art, CLOSED_APERTURE).save(ASSET_DIR / f"case-{slug}-v2.png")
    composite(open_template, inside_art, OPEN_LEFT_APERTURE).save(ASSET_DIR / f"open-{slug}-v2.png")
    composite(cartridge_template, label_art, CARTRIDGE_APERTURE).save(
        ASSET_DIR / f"cartridge-{slug}-v2.png"
    )


def build_all() -> None:
    ART_DIR.mkdir(parents=True, exist_ok=True)
    closed_template = Image.open(ASSET_DIR / "case-rango-review-v1.png").convert("RGBA")
    open_template = Image.open(ASSET_DIR / "open-rango-review-v1.png").convert("RGBA")
    cartridge_template = Image.open(ASSET_DIR / "cartridge-rango-review-v1.png").convert("RGBA")

    for slug, spec in WORKS.items():
        if spec.get("cover"):
            cover = Image.open(ROOT / str(spec["cover"]))
        else:
            cover = fallback_art(ASSET_DIR / str(spec["fallback"]))
        inside_path = spec.get("inside")
        inside = Image.open(ROOT / str(inside_path)) if inside_path else cover
        titled_cover = add_cover_title(cover, spec.get("title"), CLOSED_APERTURE.size)
        composite(closed_template, titled_cover, CLOSED_APERTURE).save(ASSET_DIR / f"case-{slug}-v2.png")
        composite(open_template, inside, OPEN_LEFT_APERTURE).save(ASSET_DIR / f"open-{slug}-v2.png")
        composite(cartridge_template, titled_cover, CARTRIDGE_APERTURE).save(ASSET_DIR / f"cartridge-{slug}-v2.png")


def audit_v2() -> dict[str, object]:
    groups = {
        "case": [ASSET_DIR / f"case-{slug}-v2.png" for slug in WORKS],
        "open": [ASSET_DIR / f"open-{slug}-v2.png" for slug in WORKS],
        "cartridge": [ASSET_DIR / f"cartridge-{slug}-v2.png" for slug in WORKS],
    }
    report: dict[str, object] = {"groups": {}, "ok": True}
    expected = {
        "case": Image.open(ASSET_DIR / "case-rango-review-v1.png").size,
        "open": Image.open(ASSET_DIR / "open-rango-review-v1.png").size,
        "cartridge": Image.open(ASSET_DIR / "cartridge-rango-review-v1.png").size,
    }
    masters = {
        "case": Image.open(ASSET_DIR / "case-rango-review-v1.png").convert("RGBA"),
        "open": Image.open(ASSET_DIR / "open-rango-review-v1.png").convert("RGBA"),
        "cartridge": Image.open(ASSET_DIR / "cartridge-rango-review-v1.png").convert("RGBA"),
    }
    apertures = {
        "case": CLOSED_APERTURE,
        "open": OPEN_LEFT_APERTURE,
        "cartridge": CARTRIDGE_APERTURE,
    }
    for name, files in groups.items():
        rows = []
        shell_mask = Image.new("L", expected[name], 255)
        aperture = apertures[name]
        ImageDraw.Draw(shell_mask).rectangle(
            (aperture.left, aperture.top, aperture.right - 1, aperture.bottom - 1),
            fill=0,
        )
        for path in files:
            image = Image.open(path).convert("RGBA")
            bbox = image.getchannel("A").getbbox()
            shell_diff = ImageChops.difference(masters[name], image)
            shell_only = Image.new("RGBA", image.size, (0, 0, 0, 0))
            shell_only.paste(shell_diff, (0, 0), shell_mask)
            shell_match = shell_only.getbbox() is None
            valid = image.size == expected[name] and shell_match
            report["ok"] = bool(report["ok"] and valid)
            rows.append({
                "file": path.name,
                "size": list(image.size),
                "bbox": bbox,
                "shellMatch": shell_match,
                "ok": valid,
            })
        report["groups"][name] = {"expected": list(expected[name]), "assets": rows}
    (TEMPLATE_DIR / "v2-audit.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return report


def contact_sheet() -> Path:
    files = [ASSET_DIR / f"case-{slug}-v2.png" for slug in WORKS]
    thumb_size = (170, 230)
    label_height = 34
    columns = 6
    rows = (len(files) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * thumb_size[0], rows * (thumb_size[1] + label_height)), (18, 16, 22))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype(r"C:\Windows\Fonts\arial.ttf", 12)
    for index, path in enumerate(files):
        image = Image.open(path).convert("RGBA")
        image.thumbnail((thumb_size[0] - 18, thumb_size[1] - 12), Image.Resampling.LANCZOS)
        x = (index % columns) * thumb_size[0] + (thumb_size[0] - image.width) // 2
        y = (index // columns) * (thumb_size[1] + label_height) + (thumb_size[1] - image.height) // 2
        sheet.paste(image, (x, y), image)
        label = path.name.removeprefix("case-").removesuffix("-v2.png")
        draw.text(((index % columns) * thumb_size[0] + 8, y + image.height + 4), label[:24], font=font, fill=(226, 222, 212))
    path = ROOT / "output" / "game-card-v2-contact-sheet.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(path)
    return path


def relabel_category_racks() -> None:
    labels = {
        "experience": "GAME EXPERIENCE",
        "scripts": "SCRIPT",
        "reviews": "REVIEW",
        "short-films": "SHORT FILM",
    }
    for slug, label in labels.items():
        source_path = ASSET_DIR / f"category-rack-{slug}-v1.png"
        image = Image.open(source_path).convert("RGBA")
        draw = ImageDraw.Draw(image)
        # Repaint the inset face, then set the replacement label on the same
        # receding plane. The rack body and plaque rim remain untouched.
        plaque = [
            (int(image.width * 0.070), int(image.height * 0.730)),
            (int(image.width * 0.655), int(image.height * 0.830)),
            (int(image.width * 0.628), int(image.height * 0.938)),
            (int(image.width * 0.040), int(image.height * 0.835)),
        ]
        draw.polygon(plaque, fill=(29, 27, 25, 255))
        plaque_mask = Image.new("L", image.size, 0)
        ImageDraw.Draw(plaque_mask).polygon(plaque, fill=255)
        texture = Image.new("RGBA", image.size, (0, 0, 0, 0))
        texture_draw = ImageDraw.Draw(texture)
        for y in range(int(image.height * 0.75), int(image.height * 0.96), 4):
            texture_draw.line(
                (int(image.width * 0.03), y, int(image.width * 0.66), y + int(image.height * 0.078)),
                fill=(40, 37, 34, 120),
                width=1,
            )
        image.paste(texture, (0, 0), ImageChops.multiply(texture.getchannel("A"), plaque_mask))

        label_width = int(image.width * 0.57)
        label_height = int(image.height * 0.11)
        label_layer = Image.new("RGBA", (label_width, label_height), (0, 0, 0, 0))
        label_draw = ImageDraw.Draw(label_layer)
        size = int(image.width * 0.060)
        while size > 20:
            font = title_font(size)
            bbox = label_draw.textbbox((0, 0), label, font=font, stroke_width=2)
            if bbox[2] - bbox[0] <= int(label_width * 0.88):
                break
            size -= 2
        font = title_font(size)
        bbox = label_draw.textbbox((0, 0), label, font=font, stroke_width=2)
        x = (label_width - (bbox[2] - bbox[0])) // 2
        y = (label_height - (bbox[3] - bbox[1])) // 2 - bbox[1]
        label_draw.text(
            (x + 3, y + 5),
            label,
            font=font,
            fill=(5, 4, 4, 255),
            stroke_width=2,
            stroke_fill=(5, 4, 4, 255),
        )
        label_draw.text(
            (x, y),
            label,
            font=font,
            fill=(205, 194, 170, 255),
            stroke_width=2,
            stroke_fill=(48, 43, 38, 255),
        )
        label_layer = label_layer.rotate(-7.2, resample=Image.Resampling.BICUBIC, expand=True)
        label_x = int(image.width * 0.065)
        label_y = int(image.height * 0.765)
        image.alpha_composite(label_layer, (label_x, label_y))
        image.save(ASSET_DIR / f"category-rack-{slug}-v2.png")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build fixed-geometry game card assets.")
    parser.add_argument("--init-templates", action="store_true")
    parser.add_argument("--slug")
    parser.add_argument("--cover", type=Path)
    parser.add_argument("--inside", type=Path)
    parser.add_argument("--label", type=Path)
    parser.add_argument("--audit", action="store_true")
    parser.add_argument("--all", action="store_true", help="Build every work with fixed geometry.")
    parser.add_argument("--contact-sheet", action="store_true")
    parser.add_argument("--relabel-racks", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.init_templates:
        print(json.dumps(make_template_triplet(), ensure_ascii=False, indent=2))
    if args.slug:
        if not args.cover:
            raise SystemExit("--cover is required with --slug")
        build_triplet(args.slug, args.cover, args.inside, args.label)
    if args.all:
        build_all()
    if args.audit:
        print(json.dumps(audit_v2(), ensure_ascii=False, indent=2))
    if args.contact_sheet:
        print(contact_sheet())
    if args.relabel_racks:
        relabel_category_racks()


if __name__ == "__main__":
    main()
