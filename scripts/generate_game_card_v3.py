from __future__ import annotations

import argparse
import base64
import concurrent.futures
import json
import mimetypes
import os
import sys
import time
import urllib.request
import urllib.error
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "public" / "portfolio-assets" / "ui" / "game-card-system-v1"
ART_DIR = ASSET_DIR / "art-v3"
TEMPLATE_DIR = ASSET_DIR / "templates"
PLAN_PATH = ROOT / "docs" / "game-card-system" / "generation-plan-v3.json"
MEDIA_SKILL = Path(
    r"C:\Users\vivix\Documents\Codex\2026-07-13\https-gitlab-vivix-work-link-media"
    r"\media-skills\.agent\skills\media-generation"
)

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

CATEGORY_LABELS = {
    "game-design": "GAME DESIGN",
    "game-research": "SYSTEM ANALYSIS",
    "articles": "CULTURE WRITING",
    "scripts": "SCRIPT WRITING",
    "reviews": "CRITICISM",
    "experience": "PLAY HISTORY",
    "short-films": "SHORT FILMS",
    "photography": "PHOTOGRAPHY",
}

NEGATIVE = (
    "photorealistic product photo, 3d render, cyan outline, red outline, neon rim, "
    "glowing edge, blurred pixels, copied poster, screenshot, collage, watermark, "
    "manufacturer logo, platform logo, ESRB badge, PEGI badge, Nintendo, Sony, PlayStation, Xbox"
)


def internal_tokens() -> list[str]:
    tokens: list[str] = []
    for key in ("INTERNAL_TOKEN", "INTERNAL_TOKEN_3", "PROXY_INTERNAL_TOKEN"):
        token = (os.environ.get(key) or "").strip()
        if token and token not in tokens:
            tokens.append(token)
    secrets = MEDIA_SKILL / ".secrets.env"
    for line in secrets.read_text(encoding="utf-8").splitlines():
        if not line.startswith(("INTERNAL_TOKEN=", "INTERNAL_TOKEN_3=")):
            continue
        token = line.split("=", 1)[1].strip().strip('"').strip("'")
        if token and token not in tokens:
            tokens.append(token)
    if not tokens:
        raise RuntimeError("No proxy token is configured")
    return tokens


def encode_image(path: Path) -> str:
    mime, _ = mimetypes.guess_type(path)
    mime = mime or "image/png"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def qwen_request(prompt: str, size: str, references: list[Path] | None = None, seed: int = 4192026) -> bytes:
    url = (
        "https://link-api-gateway.vivix.work/proxy/dashscope-intl"
        "/api/v1/services/aigc/multimodal-generation/generation"
    )
    content = [{"image": encode_image(path)} for path in (references or []) if path.exists()][:3]
    content.append({"text": prompt})
    payload = {
        "model": "qwen-image-2.0-pro",
        "input": {"messages": [{"role": "user", "content": content}]},
        "parameters": {
            "size": size,
            "n": 1,
            "negative_prompt": NEGATIVE,
            "prompt_extend": False,
            "watermark": False,
            "seed": seed,
        },
    }
    request_body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    result = None
    last_error: urllib.error.HTTPError | None = None
    for token in internal_tokens():
        request = urllib.request.Request(
            url,
            data=request_body,
            headers={"x-internal-token": token, "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=240) as response:
                result = json.loads(response.read().decode("utf-8"))
            break
        except urllib.error.HTTPError as error:
            last_error = error
            if error.code not in (401, 403):
                raise
    if result is None:
        raise RuntimeError(f"All configured proxy tokens were rejected ({last_error.code if last_error else 'unknown'})")
    image_url = next(
        item["image"]
        for item in result["output"]["choices"][0]["message"]["content"]
        if item.get("image")
    )
    with urllib.request.urlopen(image_url, timeout=90) as download:
        return download.read()


def work_prompt(work: dict[str, object]) -> str:
    title = str(work["label"])
    return f"""
为同一部作品设计一张横向三联像素美术稿，三栏等宽，栏间用纯品红色竖线明确分隔，禁止互相重叠。画布不包含游戏盒外壳，只包含三幅可直接印刷的平面美术：
左栏是竖版游戏卡带盒封面，主标题只写 "{title}"，构图为：{work['cover']}；
中栏是完全不同于封面的竖版左内页插画，构图为：{work['inside']}；
右栏是竖版实体卡带标签，文字只写 "{title}"，构图为：{work['cartridge']}。
统一视觉：1990年代高品质32-bit像素插画，清晰受控像素网格，复古主机游戏包装美术，平面正视图，成熟编辑设计，有限色板，高对比但不刺眼。参考图片只用于提取主题元素与情绪，必须重新构图和风格化绘制，绝不直接裁剪、贴图或复制现成海报。不要厂商标识、分级标识、条码、平台标识、摄影黑框、霓虹红蓝描边。
""".strip()


def rack_prompt(label: str) -> str:
    return f"""
设计一个摆满六个统一黑色游戏卡带盒的桌面收纳架，3/4略俯视立体视图，完整物体居中，所有卡带盒尺寸和间距一致，深黑塑料与少量暗青金属细节，32-bit复古像素游戏插画风格，清晰受控像素网格。收纳架前方底座本体压印一块原生铭牌，铭牌文字准确写 "{label}"，文字必须属于底座结构和同一透视，不是后贴标签。纯品红背景用于抠图。没有厂商标识，没有平台Logo，没有霓虹红蓝描边，没有白边，物体不得出画。
""".strip()


def crop_three_panel(source: Image.Image) -> tuple[Image.Image, Image.Image, Image.Image]:
    image = ImageOps.exif_transpose(source).convert("RGB")
    width, height = image.size
    third = width // 3
    margin = max(8, width // 120)
    panels = (
        image.crop((0, 0, third - margin, height)),
        image.crop((third + margin, 0, third * 2 - margin, height)),
        image.crop((third * 2 + margin, 0, width, height)),
    )
    return panels


def pixel_finish(source: Image.Image, size: tuple[int, int], scale: int = 3) -> Image.Image:
    image = ImageOps.fit(source.convert("RGB"), size, Image.Resampling.LANCZOS)
    small = image.resize((max(1, size[0] // scale), max(1, size[1] // scale)), Image.Resampling.BOX)
    image = small.resize(size, Image.Resampling.NEAREST)
    image = ImageEnhance.Contrast(image).enhance(1.06)
    image = ImageEnhance.Color(image).enhance(0.96)
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


def remove_magenta(source: Image.Image) -> Image.Image:
    image = source.convert("RGBA")
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            dominance = r - max(g, b)
            if r > 145 and b > 85 and g < 125 and dominance > 20:
                edge = max(0, min(255, int((dominance - 18) * 7)))
                pixels[x, y] = (r, g, b, max(0, a - edge))
    alpha = image.getchannel("A").filter(ImageFilter.MedianFilter(3))
    image.putalpha(alpha)
    bbox = image.getbbox()
    if bbox:
        image = image.crop(bbox)
    canvas = Image.new("RGBA", (1200, 1200), (0, 0, 0, 0))
    image.thumbnail((1120, 1120), Image.Resampling.LANCZOS)
    canvas.alpha_composite(image, ((1200 - image.width) // 2, (1200 - image.height) // 2))
    return canvas


def generate_work(work: dict[str, object], force: bool) -> str:
    slug = str(work["slug"])
    triptych = ART_DIR / f"triptych-{slug}-v3.png"
    if force or not triptych.exists():
        refs = [ROOT / str(path) for path in work.get("references", []) if path]
        triptych.write_bytes(qwen_request(work_prompt(work), "1536*1024", refs, 4192026))
    panels = crop_three_panel(Image.open(triptych))
    for name, panel in zip(("cover", "inside", "cartridge"), panels):
        panel.save(ART_DIR / f"{name}-{slug}-v3.png")
    return slug


def generate_rack(category: str, label: str, force: bool) -> str:
    raw = ART_DIR / f"rack-{category}-raw-v3.png"
    final = ASSET_DIR / f"category-rack-{category}-v3.png"
    if force or not raw.exists():
        raw.write_bytes(qwen_request(rack_prompt(label), "1024*1024", seed=7202608))
    remove_magenta(Image.open(raw)).save(final)
    return category


def assemble(plan: dict[str, object]) -> None:
    closed_template = Image.open(TEMPLATE_DIR / "case-shell-rango-master.png").convert("RGBA")
    open_template = Image.open(TEMPLATE_DIR / "open-shell-rango-master.png").convert("RGBA")
    cartridge_template = Image.open(TEMPLATE_DIR / "cartridge-shell-rango-master.png").convert("RGBA")
    for work in plan["works"]:
        slug = work["slug"]
        cover = Image.open(ART_DIR / f"cover-{slug}-v3.png")
        inside = Image.open(ART_DIR / f"inside-{slug}-v3.png")
        cart = Image.open(ART_DIR / f"cartridge-{slug}-v3.png")
        composite(closed_template, cover, CLOSED_APERTURE).save(ASSET_DIR / f"case-{slug}-v3.png")
        composite(open_template, inside, OPEN_LEFT_APERTURE).save(ASSET_DIR / f"open-{slug}-v3.png")
        composite(cartridge_template, cart, CARTRIDGE_APERTURE).save(ASSET_DIR / f"cartridge-{slug}-v3.png")


def audit(plan: dict[str, object]) -> None:
    expected = {"case": (454, 616), "open": (1730, 1155), "cartridge": (311, 454)}
    report = {"version": 3, "works": {}, "categories": {}, "ok": True}
    for work in plan["works"]:
        slug = work["slug"]
        record = {}
        for prefix, size in expected.items():
            path = ASSET_DIR / f"{prefix}-{slug}-v3.png"
            ok = path.exists() and Image.open(path).size == size and Image.open(path).mode == "RGBA"
            record[prefix] = {"file": path.name, "size": list(Image.open(path).size) if path.exists() else None, "ok": ok}
            report["ok"] = report["ok"] and ok
        report["works"][slug] = record
    for category in CATEGORY_LABELS:
        path = ASSET_DIR / f"category-rack-{category}-v3.png"
        ok = path.exists() and Image.open(path).mode == "RGBA" and Image.open(path).getbbox() is not None
        report["categories"][category] = {"file": path.name, "ok": ok}
        report["ok"] = report["ok"] and ok
    (TEMPLATE_DIR / "v3-audit.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    if not report["ok"]:
        raise RuntimeError("v3 asset audit failed")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--only", choices=("works", "racks", "assemble", "all"), default="all")
    parser.add_argument("--slug", action="append", default=[], help="Generate only these work slugs")
    parser.add_argument("--category", action="append", default=[], help="Generate only these rack categories")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    plan = json.loads(PLAN_PATH.read_text(encoding="utf-8"))
    works = [work for work in plan["works"] if not args.slug or work["slug"] in args.slug]
    categories = {
        category: label
        for category, label in CATEGORY_LABELS.items()
        if not args.category or category in args.category
    }
    ART_DIR.mkdir(parents=True, exist_ok=True)
    if args.only in {"works", "all"}:
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = [pool.submit(generate_work, work, args.force) for work in works]
            for future in concurrent.futures.as_completed(futures):
                print(f"generated work: {future.result()}", flush=True)
    if args.only in {"racks", "all"}:
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(args.workers, 4)) as pool:
            futures = [pool.submit(generate_rack, category, label, args.force) for category, label in categories.items()]
            for future in concurrent.futures.as_completed(futures):
                print(f"generated rack: {future.result()}", flush=True)
    if args.only in {"assemble", "all"}:
        assemble(plan)
        audit(plan)
        print("assembled and audited v3 assets", flush=True)


if __name__ == "__main__":
    main()
