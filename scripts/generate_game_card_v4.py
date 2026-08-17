from __future__ import annotations

import argparse
import concurrent.futures
import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
V4 = ROOT / "public" / "portfolio-assets" / "ui" / "game-card-system-v4"
EDIT = Path(
    r"C:\Users\vivix\Documents\Codex\2026-07-13\https-gitlab-vivix-work-link-media"
    r"\media-skills\.agent\skills\media-generation\providers\image\gpt-image-2\scripts\edit.py"
)
FINALIZE = ROOT / "scripts" / "finalize_game_card_v4.py"

CATEGORY_LABELS = {
    "game-design": "GAME DESIGN",
    "game-research": "SYSTEM ANALYSIS",
    "articles": "CULTURE WRITING",
    "scripts": "SCRIPT",
    "reviews": "REVIEW",
    "experience": "GAME EXPERIENCE",
    "short-films": "SHORT FILM",
    "photography": "PHOTOGRAPHY",
}

KIND_CONFIG = {
    "case": {"size": "1024x1536", "folder": "cases"},
    "inside": {"size": "1536x1024", "folder": "insides"},
    "cart": {"size": "1024x1536", "folder": "carts"},
    "rack": {"size": "1024x1024", "folder": "racks"},
}


def common_rules() -> str:
    return (
        "Crisp late-1980s/1990s game selection-screen pixel illustration with a controlled pixel grid, "
        "hard edges, limited print palette and coherent down-right lighting. The artwork must be newly "
        "composed from the supplied themes and references, never a crop, direct pixel conversion, tracing, "
        "poster copy or pasted screenshot. No manufacturer or platform logo, rating mark, barcode, watermark, "
        "neon cyan/magenta outline, photographic plastic glare, fake outer frame, or text outside the editable area."
    )


def prompt_for(work: dict[str, object], kind: str) -> str:
    title = str(work["label"])
    if kind == "case":
        return (
            "Locked-mask production edit. Redesign ONLY the printable front-cover window inside the supplied "
            "identical vertical black game case. Do not alter any shell pixel, hinge, outer edge, scale, camera, "
            "shadow or transparent margin. Create a complete professional game-packaging cover for "
            f"{title}. Visual plan: {work['cover']}. Integrate the title {title} into the illustrated cover with "
            "intentional packaging typography; it must belong to the cover design, not appear as plain overlaid text. "
            + common_rules()
        )
    if kind == "inside":
        return (
            "Locked-mask production edit. Redesign ONLY the left inner-page printable area of the supplied fully "
            "open identical black game case. Do not alter any shell pixel, hinge, right page, empty cartridge slot, "
            "scale, camera, shadow or transparent margin. The left page must be a distinct manual/insert illustration, "
            f"never the front cover. Left-page plan for {title}: {work['inside']}. Avoid a large repeated cover title. "
            + common_rules()
        )
    if kind == "cart":
        return (
            "Locked-mask production edit. Redesign ONLY the small label window of the supplied identical front-view "
            "black cartridge. Do not alter any shell pixel, contacts, chamfer, scale, camera, shadow or transparent "
            f"margin. Make a concise label for {title}. Label visual plan: {work['cartridge']}. Use short readable "
            f"label text {title}; prioritize one strong emblem that remains recognizable when reduced. " + common_rules()
        )
    raise ValueError(kind)


def rack_prompt(label: str) -> str:
    return (
        "Locked-mask production edit. Preserve the supplied original six-case storage rack exactly. Redesign ONLY "
        "the flat inner face of its existing front plaque. Keep the plaque frame, rack silhouette, six cases, slots, "
        "perspective, pixel density, scale, lighting, shadow and transparent margin unchanged. Render the exact "
        f"uppercase words {label} as native cream-gray embossed block-pixel lettering following the plaque perspective. "
        "The lettering must look manufactured into the plaque, not like a floating sticker. No other symbols or text. "
        + common_rules()
    )


def paths_for(kind: str, slug: str) -> tuple[Path, Path, Path, Path]:
    if kind == "rack":
        input_path = V4 / "masters" / "rack-master.png"
        mask_path = V4 / "masks" / "rack-mask.png"
        raw_path = V4 / "raw" / f"rack-{slug}.png"
        final_path = V4 / "racks" / f"rack-{slug}.png"
    else:
        input_path = V4 / "inputs" / f"{kind}-{slug}.png"
        mask_path = V4 / "masks" / f"{kind}-mask.png"
        raw_path = V4 / "raw" / f"{kind}-{slug}.png"
        final_path = V4 / KIND_CONFIG[kind]["folder"] / f"{kind}-{slug}.png"
    return input_path, mask_path, raw_path, final_path


def run_edit(kind: str, slug: str, prompt: str, force: bool) -> dict[str, object]:
    input_path, mask_path, raw_path, final_path = paths_for(kind, slug)
    if final_path.exists() and not force:
        return {"kind": kind, "slug": slug, "status": "cached", "file": str(final_path)}
    raw_path.parent.mkdir(parents=True, exist_ok=True)
    command = [
        sys.executable,
        str(EDIT),
        "--prompt",
        prompt,
        "--image",
        str(input_path),
        "--mask",
        str(mask_path),
        "--quality",
        "high",
        "--size",
        KIND_CONFIG[kind]["size"],
        "--out",
        str(raw_path),
        "--max-attempts",
        "4",
        "-y",
    ]
    subprocess.run(command, cwd=ROOT, check=True)
    finalize = [
        sys.executable,
        str(FINALIZE),
        "--kind",
        kind,
        "--slug",
        slug,
        "--raw",
        str(raw_path),
    ]
    subprocess.run(finalize, cwd=ROOT, check=True)
    return {"kind": kind, "slug": slug, "status": "generated", "file": str(final_path)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--slug", action="append", default=[])
    parser.add_argument("--category", action="append", default=[])
    parser.add_argument("--kind", action="append", choices=("case", "inside", "cart", "rack"), default=[])
    parser.add_argument("--workers", type=int, default=3)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    manifest = json.loads((V4 / "manifest.json").read_text(encoding="utf-8"))
    kinds = args.kind or ["case", "inside", "cart", "rack"]
    jobs: list[tuple[str, str, str]] = []
    if "rack" in kinds:
        for category, label in CATEGORY_LABELS.items():
            if not args.category or category in args.category:
                jobs.append(("rack", category, rack_prompt(label)))
    for work in manifest["works"]:
        if args.slug and work["slug"] not in args.slug:
            continue
        if args.category and work["category"] not in args.category:
            continue
        for kind in kinds:
            if kind != "rack":
                jobs.append((kind, str(work["slug"]), prompt_for(work, kind)))

    results: list[dict[str, object]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = [pool.submit(run_edit, kind, slug, prompt, args.force) for kind, slug, prompt in jobs]
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            results.append(result)
            print(json.dumps(result, ensure_ascii=False), flush=True)
    print(json.dumps({"completed": len(results)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
