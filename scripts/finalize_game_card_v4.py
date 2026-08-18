from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps, ImageStat


ROOT = Path(__file__).resolve().parents[1]
V4 = ROOT / "public" / "portfolio-assets" / "ui" / "game-card-system-v4"


def edit_region(mask: Image.Image) -> Image.Image:
    return ImageChops.invert(mask.convert("RGBA").getchannel("A"))


def lock_shell(raw: Image.Image, master: Image.Image, mask: Image.Image) -> Image.Image:
    raw = raw.convert("RGBA").resize(master.size, Image.Resampling.LANCZOS)
    region = edit_region(mask)
    generated = Image.new("RGBA", master.size, (0, 0, 0, 0))
    generated.paste(raw, (0, 0), region)
    result = master.copy()
    result.alpha_composite(generated)
    return result


def masked_difference_bbox(left: Image.Image, right: Image.Image, mask: Image.Image) -> tuple[int, int, int, int] | None:
    difference = ImageChops.difference(left.convert("RGBA"), right.convert("RGBA"))
    isolated = Image.new("RGBA", left.size, (0, 0, 0, 0))
    isolated.paste(difference, (0, 0), mask.convert("L"))
    return isolated.getbbox()


def content_score(image: Image.Image, master: Image.Image, region: Image.Image) -> float:
    difference = ImageChops.difference(image.convert("RGB"), master.convert("RGB"))
    stat = ImageStat.Stat(difference, mask=region.convert("L"))
    return round(sum(stat.mean) / 3, 3)


def contact_sheet(items: list[tuple[str, Image.Image]], path: Path, thumb: tuple[int, int]) -> None:
    if not items:
        return
    cols = 5
    rows = (len(items) + cols - 1) // cols
    cell_w, cell_h = thumb[0] + 32, thumb[1] + 54
    sheet = Image.new("RGB", (cell_w * cols, cell_h * rows), (118, 20, 48))
    draw = ImageDraw.Draw(sheet)
    for i, (label, image) in enumerate(items):
        x = (i % cols) * cell_w + 16
        y = (i // cols) * cell_h + 16
        preview = image.copy()
        preview.thumbnail(thumb, Image.Resampling.LANCZOS)
        px = x + (thumb[0] - preview.width) // 2
        py = y + (thumb[1] - preview.height) // 2
        sheet.paste(preview, (px, py), preview)
        draw.text((x, y + thumb[1] + 7), label[:32], fill=(255, 246, 229))
    sheet.save(path, quality=92)


def finalize(kind: str, slug: str, raw_path: Path, out_path: Path) -> dict[str, object]:
    master = Image.open(V4 / "masters" / f"{kind}-master.png").convert("RGBA")
    mask = Image.open(V4 / "masks" / f"{kind}-mask.png").convert("RGBA")
    raw = Image.open(raw_path).convert("RGBA")
    final = lock_shell(raw, master, mask)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    final.save(out_path)
    region = edit_region(mask)
    outside = ImageChops.invert(region)
    shell_diff = ImageChops.difference(final, master)
    outside_diff = Image.new("RGBA", master.size, (0, 0, 0, 0))
    outside_diff.paste(shell_diff, (0, 0), outside)
    return {
        "slug": slug,
        "kind": kind,
        "file": str(out_path.relative_to(ROOT)).replace("\\", "/"),
        "size": list(final.size),
        "outsideShellDiff": outside_diff.getbbox() is not None,
        "contentPresent": final.getchannel("A").getbbox() is not None,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--kind", choices=("case", "inside", "cart", "rack"))
    parser.add_argument("--slug")
    parser.add_argument("--raw")
    parser.add_argument("--all", action="store_true")
    args = parser.parse_args()

    if args.kind and args.slug and args.raw:
        folder = {"case": "cases", "inside": "insides", "cart": "carts", "rack": "racks"}[args.kind]
        filename = f"rack-{args.slug}.png" if args.kind == "rack" else f"{args.kind}-{args.slug}.png"
        result = finalize(args.kind, args.slug, Path(args.raw), V4 / folder / filename)
        print(json.dumps(result, ensure_ascii=False))
        return

    manifest = json.loads((V4 / "manifest.json").read_text(encoding="utf-8"))
    report = {"version": 4, "ok": True, "works": {}, "missing": []}
    sheets: dict[str, list[tuple[str, Image.Image]]] = {"case": [], "inside": [], "cart": []}
    for work in manifest["works"]:
        slug = work["slug"]
        report["works"][slug] = {}
        for kind, folder in (("case", "cases"), ("inside", "insides"), ("cart", "carts")):
            path = V4 / folder / f"{kind}-{slug}.png"
            expected = tuple(manifest["specs"][kind]["size"])
            if not path.exists():
                report["missing"].append(str(path.relative_to(ROOT)).replace("\\", "/"))
                report["ok"] = False
                continue
            image = Image.open(path).convert("RGBA")
            master = Image.open(V4 / "masters" / f"{kind}-master.png").convert("RGBA")
            mask = Image.open(V4 / "masks" / f"{kind}-mask.png").convert("RGBA")
            region = edit_region(mask)
            outside = ImageOps.invert(region)
            outside_diff = masked_difference_bbox(image, master, outside)
            score = content_score(image, master, region)
            ok = (
                image.size == expected
                and image.getbbox() is not None
                and outside_diff is None
                and score >= 4.0
            )
            report["works"][slug][kind] = {
                "size": list(image.size),
                "outsideShellDiff": outside_diff is not None,
                "contentScore": score,
                "ok": ok,
            }
            report["ok"] = report["ok"] and ok
            sheets[kind].append((slug, image))
    for kind, items in sheets.items():
        contact_sheet(items, V4 / "qa" / f"contact-{kind}.jpg", (250, 270 if kind != "inside" else 180))
    (V4 / "qa" / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"ok": report["ok"], "missing": len(report["missing"]), "works": len(report["works"])}, ensure_ascii=False))


if __name__ == "__main__":
    main()
