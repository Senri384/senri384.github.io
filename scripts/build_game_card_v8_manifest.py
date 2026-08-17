from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PLAN = ROOT / "docs" / "game-card-system" / "generation-plan-v3.json"
OUT = ROOT / "public" / "portfolio-assets" / "ui" / "game-card-system-v8"


def main() -> None:
    data = json.loads(PLAN.read_text(encoding="utf-8"))
    works = data["works"]
    if len(works) != 30:
        raise SystemExit(f"Expected 30 works, found {len(works)}")

    seen: set[str] = set()
    normalized = []
    for index, work in enumerate(works, start=1):
        slug = work["slug"].strip()
        if slug in seen:
            raise SystemExit(f"Duplicate slug: {slug}")
        seen.add(slug)

        references = []
        for value in work.get("references", []):
            path = ROOT / value
            references.append(
                {
                    "path": value,
                    "exists": path.is_file(),
                }
            )

        normalized.append(
            {
                "index": index,
                "slug": slug,
                "category": work["category"],
                "label": work["label"],
                "cover": work["cover"],
                "inside": work["inside"],
                "cartridge": work["cartridge"],
                "references": references,
                "outputs": {
                    "case": f"cases/{slug}.png",
                    "inside": f"insides/{slug}.png",
                    "cartridge": f"cartridges/{slug}.png",
                },
            }
        )

    for folder in ("raw", "cases", "insides", "cartridges", "qa", "logs"):
        (OUT / folder).mkdir(parents=True, exist_ok=True)

    manifest = {
        "version": "v8",
        "source": str(PLAN.relative_to(ROOT)).replace("\\", "/"),
        "count": len(normalized),
        "masters": {
            "case": "../game-card-system-v5/masters/case-master.png",
            "inside": "../game-card-system-v5/masters/inside-master.png",
            "cartridge": "../game-card-system-v5/masters/cart-master.png",
        },
        "works": normalized,
    }
    (OUT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    missing = sum(
        not ref["exists"] for work in normalized for ref in work["references"]
    )
    print(json.dumps({"works": len(normalized), "missingReferences": missing}))


if __name__ == "__main__":
    main()
