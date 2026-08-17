from __future__ import annotations

import argparse
import base64
import io
import json
import mimetypes
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "public" / "portfolio-assets" / "ui" / "game-card-system-v8"
MANIFEST = ASSET_ROOT / "manifest.json"
MASTER_ROOT = ROOT / "public" / "portfolio-assets" / "ui" / "game-card-system-v5" / "masters"
MASTERS = {
    "case": MASTER_ROOT / "case-master.png",
    "inside": MASTER_ROOT / "inside-master.png",
    "cartridge": MASTER_ROOT / "cart-master.png",
}
SIZES = {
    "case": "1800x2200",
    "inside": "2496x1664",
    "cartridge": "1680x2400",
}

SKILL_ROOT = Path(
    r"C:\Users\vivix\Documents\Codex\2026-07-13\https-gitlab-vivix-work-link-media"
) / "media-skills" / ".agent" / "skills" / "media-generation"
sys.path.insert(0, str(SKILL_ROOT / "_lib"))
from my_skills.config import load_skill_config, request_with_fallback  # noqa: E402


BASE_STYLE = (
    "整体为1990年代动作游戏选关画面的高质量像素美术，硬边像素、克制的抖色与磨损，"
    "暖黑和深灰塑料材质。不要照片写实，不要3D渲染感，不要光滑矢量感。"
    "严禁青色或桃红色霓虹描边，严禁红蓝轮廓光，标签文字也不得使用霓虹双色描边，"
    "严禁厂商Logo、平台Logo、评级标记、"
    "条形码、水印和真实游戏商标。画面中只保留一个目标物体，背景完全透明。"
)


def prompt_for(kind: str, work: dict, reference_count: int) -> str:
    refs = "后续图片仅作为作品内容与构图元素参考，不得直接裁剪、贴图或逐像素转换。" if reference_count else ""
    if kind == "case":
        return (
            "图1是唯一允许使用的统一卡带盒结构母版。保持图1的正面主视图、外轮廓、尺寸比例、"
            "铰链、边框厚度、暖黑塑料材质、位置和透明留白完全不变，只在正面凹槽内生成一张"
            "完整且真正经过游戏包装设计的原创像素封面，不得改变盒体。"
            f"{refs}封面标题只写 \"{work['label']}\"，融入封面设计而非贴一块文字标签。"
            f"封面构图：{work['cover']}。{BASE_STYLE}"
        )
    if kind == "inside":
        return (
            "图1是唯一允许使用的统一卡带盒打开平铺母版。保持图1的主视图、左右内页外壳、"
            "中轴、卡扣、尺寸比例和透明留白完全不变。只在左侧内页凹槽中生成独立的像素内页插图；"
            "右侧内页必须保持纯暖黑塑料，右下卡带槽必须完整、清晰且为空，不能放入卡带。"
            f"{refs}左内页不能复用封面构图，要像正式游戏包装内页。左内页方案：{work['inside']}。"
            f"{BASE_STYLE}"
        )
    return (
        "图1是唯一允许使用的统一卡带结构母版。保持图1的正面主视图、外轮廓、切角、卡榫、"
        "尺寸比例、暖黑塑料材质、位置和透明留白完全不变，只在中央凹槽标签区生成原创像素标签。"
        f"{refs}标签上沿写 \"{work['label'].split('/')[0].strip()}\"，文字必须是单色米黄像素字，"
        "没有任何外描边、投影、发光或第二种轮廓色。"
        f"图案方案：{work['cartridge']}。"
        f"{BASE_STYLE}"
    )


def data_uri(path: Path, reference: bool = False) -> str:
    if not reference:
        mime = mimetypes.guess_type(path.name)[0] or "image/png"
        payload = path.read_bytes()
    else:
        with Image.open(path) as source:
            source.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
            canvas = Image.new("RGB", source.size, (18, 16, 18))
            if source.mode in ("RGBA", "LA"):
                canvas.paste(source.convert("RGBA"), mask=source.convert("RGBA").getchannel("A"))
            else:
                canvas.paste(source.convert("RGB"))
            buffer = io.BytesIO()
            canvas.save(buffer, format="JPEG", quality=88, optimize=True)
            payload = buffer.getvalue()
            mime = "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(payload).decode('ascii')}"


def generate_one(task: tuple[str, dict], force: bool, model_key: str) -> dict:
    kind, work = task
    output = ASSET_ROOT / "raw" / kind / f"{work['slug']}.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.is_file() and not force:
        return {"kind": kind, "slug": work["slug"], "status": "skipped", "path": str(output)}

    cfg = load_skill_config(SKILL_ROOT)
    provider = cfg["providers"]["seedream"]
    model = provider["models"].get(model_key, model_key)
    url = f"{provider['base_url']}{provider['base_path']}{provider['endpoints']['generate']}"
    header_name = cfg["proxy"]["header"]
    token = cfg["proxy"]["token"]

    reference_paths = [ROOT / ref["path"] for ref in work["references"] if ref["exists"]][:2]
    images = [data_uri(MASTERS[kind])] + [data_uri(path, reference=True) for path in reference_paths]
    prompt = prompt_for(kind, work, len(reference_paths))
    payload = {
        "model": model,
        "prompt": prompt,
        "image": images,
        "size": SIZES[kind],
        "watermark": False,
        "response_format": "url",
        "optimize_prompt_options": {"mode": "standard"},
    }

    last_error = ""
    for attempt in range(1, 4):
        try:
            response = request_with_fallback(
                "POST",
                url,
                primary=provider["vendor"],
                fallback=provider.get("fallback_vendor"),
                idempotent=False,
                headers={"Content-Type": "application/json", header_name: token},
                json=payload,
                timeout=180,
            )
            if response.status_code == 429:
                last_error = response.text[:500]
                time.sleep(8 * attempt)
                continue
            response.raise_for_status()
            body = response.json()
            image_url = body["data"][0]["url"]
            image_response = requests.get(image_url, timeout=60)
            image_response.raise_for_status()
            output.write_bytes(image_response.content)
            log = {
                "kind": kind,
                "slug": work["slug"],
                "model": model,
                "size": SIZES[kind],
                "prompt": prompt,
                "references": [str(path.relative_to(ROOT)).replace("\\", "/") for path in reference_paths],
                "responseSize": body["data"][0].get("size"),
                "usage": body.get("usage"),
                "attempt": attempt,
            }
            (ASSET_ROOT / "logs" / f"{kind}-{work['slug']}.json").write_text(
                json.dumps(log, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            return {"kind": kind, "slug": work["slug"], "status": "generated", "path": str(output)}
        except Exception as exc:  # noqa: BLE001
            last_error = repr(exc)
            if attempt < 3:
                time.sleep(5 * attempt)
    return {"kind": kind, "slug": work["slug"], "status": "failed", "error": last_error}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--kinds", default="case,inside,cartridge")
    parser.add_argument("--slugs", default="")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--model", default="seedream-4-5")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    works = manifest["works"]
    wanted_slugs = {value.strip() for value in args.slugs.split(",") if value.strip()}
    if wanted_slugs:
        works = [work for work in works if work["slug"] in wanted_slugs]
    if args.limit:
        works = works[: args.limit]
    kinds = [value.strip() for value in args.kinds.split(",") if value.strip()]
    tasks = [(kind, work) for work in works for kind in kinds]

    results = []
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = {
            pool.submit(generate_one, task, args.force, args.model): task for task in tasks
        }
        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            print(json.dumps(result, ensure_ascii=False), flush=True)

    failed = [result for result in results if result["status"] == "failed"]
    summary = {
        "total": len(results),
        "generated": sum(result["status"] == "generated" for result in results),
        "skipped": sum(result["status"] == "skipped" for result in results),
        "failed": len(failed),
    }
    print(json.dumps(summary, ensure_ascii=False), flush=True)
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
