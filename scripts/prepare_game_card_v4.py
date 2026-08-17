from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageOps


ROOT = Path(__file__).resolve().parents[1]
V1 = ROOT / "public" / "portfolio-assets" / "ui" / "game-card-system-v1"
V4 = ROOT / "public" / "portfolio-assets" / "ui" / "game-card-system-v4"
PLAN = ROOT / "docs" / "game-card-system" / "generation-plan-v3.json"


@dataclass(frozen=True)
class AssetSpec:
    kind: str
    source: Path
    size: tuple[int, int]
    aperture: tuple[int, int, int, int]
    margin: float


SPECS = {
    "case": AssetSpec(
        "case",
        V1 / "templates" / "case-shell-rango-master.png",
        (1024, 1536),
        (58, 25, 435, 596),
        0.055,
    ),
    "inside": AssetSpec(
        "inside",
        V1 / "templates" / "open-shell-rango-master.png",
        (1536, 1024),
        (91, 79, 818, 1066),
        0.035,
    ),
    "cart": AssetSpec(
        "cart",
        V1 / "templates" / "cartridge-shell-rango-master.png",
        (1024, 1536),
        (41, 62, 269, 360),
        0.055,
    ),
}

REFERENCE_OVERRIDES = {
    "peak-social-design": ["references/game-card-plan/peak-social-design.png"],
    "rock-kingdom-world-breakdown": ["references/game-card-plan/rock-kingdom-world-breakdown.png"],
    "transformers-ip-games": ["references/game-card-plan/transformers-ip-games.png"],
    "rock-kingdom-farewell": ["references/game-card-plan/rock-kingdom-farewell.png"],
    "pokemon-character-design": ["references/game-card-plan/pokemon-character-design.png"],
    "fujimoto-cinematic-sense": ["references/game-card-plan/fujimoto-cinematic-sense.png"],
    "rango-review": ["references/game-card-plan/rango-review.png"],
    "twelve-angry-men-review": ["references/game-card-plan/twelve-angry-men-review.png"],
    "2001-space-odyssey-review": ["references/game-card-plan/2001-space-odyssey-review.png"],
}


def fit_rgba(source: Image.Image, size: tuple[int, int], margin: float) -> tuple[Image.Image, tuple[float, float, float]]:
    source = source.convert("RGBA")
    max_w = round(size[0] * (1 - margin * 2))
    max_h = round(size[1] * (1 - margin * 2))
    scale = min(max_w / source.width, max_h / source.height)
    width = round(source.width * scale)
    height = round(source.height * scale)
    resized = source.resize((width, height), Image.Resampling.NEAREST)
    left = (size[0] - width) // 2
    top = (size[1] - height) // 2
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    canvas.alpha_composite(resized, (left, top))
    return canvas, (scale, left, top)


def scale_rect(rect: tuple[int, int, int, int], transform: tuple[float, float, float]) -> tuple[int, int, int, int]:
    scale, left, top = transform
    x0, y0, x1, y1 = rect
    return (
        round(left + x0 * scale),
        round(top + y0 * scale),
        round(left + x1 * scale),
        round(top + y1 * scale),
    )


def make_edit_mask(size: tuple[int, int], aperture: tuple[int, int, int, int], inset: int) -> Image.Image:
    mask = Image.new("RGBA", size, (255, 255, 255, 255))
    draw = ImageDraw.Draw(mask)
    x0, y0, x1, y1 = aperture
    draw.rectangle((x0 + inset, y0 + inset, x1 - inset, y1 - inset), fill=(0, 0, 0, 0))
    return mask


def visible_edit_mask(mask: Image.Image) -> Image.Image:
    alpha = mask.getchannel("A")
    return ImageOps.invert(alpha).convert("L")


def collage_reference(paths: list[Path], size: tuple[int, int]) -> Image.Image | None:
    images: list[Image.Image] = []
    for path in paths[:3]:
        if not path.exists():
            continue
        try:
            images.append(ImageOps.exif_transpose(Image.open(path)).convert("RGB"))
        except OSError:
            continue
    if not images:
        return None
    canvas = Image.new("RGB", size, (12, 12, 15))
    slot_w = max(1, size[0] // len(images))
    for index, image in enumerate(images):
        box = (slot_w, size[1])
        fitted = ImageOps.fit(image, box, Image.Resampling.LANCZOS)
        fitted = ImageEnhance.Contrast(fitted).enhance(0.92)
        canvas.paste(fitted, (index * slot_w, 0))
    return canvas.convert("RGBA")


def reference_paths(work: dict[str, object]) -> list[Path]:
    rel_paths = REFERENCE_OVERRIDES.get(str(work["slug"]), list(work.get("references") or []))
    return [ROOT / str(path) for path in rel_paths]


def prepare_input(master: Image.Image, mask: Image.Image, refs: list[Path]) -> Image.Image:
    result = master.copy()
    editable = visible_edit_mask(mask)
    bbox = editable.getbbox()
    if not bbox:
        return result
    art = collage_reference(refs, (bbox[2] - bbox[0], bbox[3] - bbox[1]))
    if art is None:
        fill = Image.new("RGBA", (bbox[2] - bbox[0], bbox[3] - bbox[1]), (17, 18, 22, 255))
        result.alpha_composite(fill, (bbox[0], bbox[1]))
        return result
    result.alpha_composite(art, (bbox[0], bbox[1]))
    return result


def prepare_rack() -> dict[str, object]:
    source = Image.open(V1 / "category-rack-game-design-v2.png").convert("RGBA")
    master, transform = fit_rgba(source, (1024, 1024), 0.045)
    # Only the flat inner face of the plaque may be regenerated.
    plaque = scale_rect((79, 786, 707, 960), transform)
    rack_mask = make_edit_mask(master.size, plaque, 9)
    master.save(V4 / "masters" / "rack-master.png")
    rack_mask.save(V4 / "masks" / "rack-mask.png")
    return {"size": list(master.size), "editable": list(visible_edit_mask(rack_mask).getbbox() or ())}


def main() -> None:
    for directory in ("masters", "masks", "inputs", "raw", "racks", "cases", "insides", "carts", "qa"):
        (V4 / directory).mkdir(parents=True, exist_ok=True)

    manifest: dict[str, object] = {"version": 4, "works": [], "specs": {}, "rack": prepare_rack()}
    plan = json.loads(PLAN.read_text(encoding="utf-8"))

    masters: dict[str, Image.Image] = {}
    masks: dict[str, Image.Image] = {}
    for kind, spec in SPECS.items():
        source = Image.open(spec.source).convert("RGBA")
        master, transform = fit_rgba(source, spec.size, spec.margin)
        aperture = scale_rect(spec.aperture, transform)
        inset = max(5, round(min(spec.size) * 0.007))
        mask = make_edit_mask(spec.size, aperture, inset)
        master.save(V4 / "masters" / f"{kind}-master.png")
        mask.save(V4 / "masks" / f"{kind}-mask.png")
        masters[kind] = master
        masks[kind] = mask
        manifest["specs"][kind] = {
            "size": list(spec.size),
            "aperture": list(aperture),
            "editable": list(visible_edit_mask(mask).getbbox() or ()),
        }

    for index, work in enumerate(plan["works"], 1):
        refs = reference_paths(work)
        record = dict(work)
        record["number"] = index
        record["references"] = [str(path.relative_to(ROOT)).replace("\\", "/") for path in refs if path.exists()]
        manifest["works"].append(record)
        for kind in ("case", "inside", "cart"):
            prepare_input(masters[kind], masks[kind], refs).save(
                V4 / "inputs" / f"{kind}-{work['slug']}.png"
            )

    (V4 / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Prepared {len(manifest['works'])} works in {V4}")


if __name__ == "__main__":
    main()
