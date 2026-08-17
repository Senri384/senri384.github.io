from __future__ import annotations

import argparse
import base64
import json
import sys
from pathlib import Path

import requests


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SKILL_ROOT = Path(
    r"C:\Users\vivix\Documents\Codex\2026-07-13\https-gitlab-vivix-work-link-media\media-skills\.agent\skills\media-generation"
)
sys.path.insert(0, str(SKILL_ROOT / "_lib"))

from my_skills.config import load_skill_config, request_with_fallback  # noqa: E402


OLD_ASSET_ROOT = PROJECT_ROOT / "public" / "portfolio-assets" / "vehicles" / "home-v51"
OUTPUT_ROOT = PROJECT_ROOT / "output" / "breakdown-v54" / "raw"
G1_REFERENCE = Path(
    r"C:\Users\vivix\Documents\Tencent Files\3074024735\nt_qq\nt_data\Pic\2026-08\Ori\024360cecedb6ba36ec01fd8dcf48e34.png"
)


COMMON = """
This is a game-ready raster sprite for a synthwave portfolio racing game. Render a complete, coherent car from scratch while using the supplied old game sprite as a strict camera, silhouette, scale, wheel placement, spoiler alignment, and perspective template. The car is the G1 Transformers Breakdown vehicle mode, based on an early Lamborghini Countach with a rear wing. Use crisp high-resolution 1990s arcade pixel-art rendering: controlled hard-edged pixel clusters, clean panel boundaries, restrained highlights, and no photographic background.

The permanent paint map must be identical in every view and state: warm ivory-silver main body; a large deep navy-blue rear fascia enclosing the taillights and license-plate recess; deep navy-blue rear bumper; deep navy-blue wheel-arch guards around every wheel; one continuous deep navy-blue lower sill stripe running from the rear wheel arch along the bottom of the side body to the front wheel arch and front lip. The rear wing remains ivory-silver. Glass is dark blue-gray. Tires are black. There is no purple emblem, no lettering, no decal, and no visible red body paint in a normal rear view. The red hood paint exists only on the forward hood surface and therefore remains hidden from these normal rear-facing cameras.

Place the car alone on a perfectly uniform chroma-magenta #ff00ff background, with no ground plane, no cast shadow, no glow, no outline, no text, and generous empty margin. Keep the whole car fully inside the image.
""".strip()


STAGES: dict[str, dict[str, object]] = {
    "normal-center": {
        "refs": [OLD_ASSET_ROOT / "breakdown-normal-center.png", G1_REFERENCE],
        "prompt": COMMON
        + """

The first supplied image is the mandatory center-lane geometry template. Match its centered rear three-quarter elevated game camera exactly: the vehicle centerline is vertical, left and right sides are symmetric, the horizontal spoiler and wheel contact baseline are level with the image horizon, the roof and engine deck have believable height, and the exhaust assembly is tucked upward inside the rear body rather than hanging level with the tire bottoms. Preserve the compact proportions that previously aligned correctly with the road. This is the undamaged normal-state base frame.
""",
    },
    "normal-left": {
        "refs": [
            OLD_ASSET_ROOT / "breakdown-normal-left.png",
            OUTPUT_ROOT / "normal-center.png",
            G1_REFERENCE,
        ],
        "prompt": COMMON
        + """

The first supplied image is the mandatory old left-side-lane geometry template; the second is the newly approved center-lane color-and-design master. Rebuild the exact same car for the left lane. Preserve the old template's elevated rear three-quarter view, yaw toward the road center, visible right side, wheel sizes, body height, and road-compatible foreshortening. The front and rear center points must lie on one straight longitudinal centerline: the body must not twist. All cross-car construction lines, the spoiler, rear fascia, axle/wheel baselines, and tire contact line must be mutually consistent and level with the horizon. Do not add side mirrors. Match every paint boundary and mechanical detail to the center master. This is the undamaged normal-state base frame.
""",
    },
    "normal-left-clean": {
        "refs": [OUTPUT_ROOT / "normal-left.png", OLD_ASSET_ROOT / "breakdown-normal-left.png"],
        "prompt": """
Edit the first supplied game vehicle sprite with surgical precision. Preserve the car's identity, pixel-art rendering, camera, body proportions, paint colors, rear fascia, spoiler, vents, windows, wheels, exhausts, scale, and chroma-magenta background. Use the second old sprite only to understand the intended clean side-body geometry.

Remove the large rectangular side mirror completely and reconstruct the ivory-silver door/window frame behind it as uninterrupted original Countach bodywork. Correct the stance so the bottoms of the two visible tires lie on exactly one horizontal line and the car has no roll; keep the spoiler perfectly horizontal. Keep the front and rear center points on a single straight longitudinal centerline, with no twisted body. Make no other design or color changes. The output remains a single complete car on a perfectly uniform #ff00ff background with no shadow, outline, text, logo, or decal.
""".strip(),
    },
    "damaged-center": {
        "refs": [
            OUTPUT_ROOT / "normal-center.png",
            OLD_ASSET_ROOT / "breakdown-damaged-front-center.png",
            G1_REFERENCE,
        ],
        "prompt": COMMON
        + """

Create the center-lane front-collision destroyed state of the exact normal car in the first image. The second image is only a structural damage reference. The player has rear-ended a car, so the entire front end is severely crushed: the forward hood is buckled upward, front fenders are compressed, windshield is cracked, and dark charcoal engine-bay mechanics are exposed. The raised hood must read as exterior painted sheet metal: show one coherent red-painted hood outer panel, folded and lifted at the far/front end of the car, with clean red paint surfaces and ivory-silver broken edges. Red appears only on that exterior hood sheet metal. Every cavity, engine component, cable, shadow, and interior surface is charcoal black, dark steel, or blue-gray, never red. Keep the rear half, rear wing, deep navy rear fascia, blue bumper, blue wheel-arch guards, and blue lower sill paint map identical to the normal master. Keep the centered camera, scale, wheel positions, and level horizon unchanged.
""",
    },
    "damaged-left": {
        "refs": [
            OUTPUT_ROOT / "normal-left-clean.png",
            OUTPUT_ROOT / "damaged-center.png",
            OLD_ASSET_ROOT / "breakdown-damaged-front-left.png",
            G1_REFERENCE,
        ],
        "prompt": COMMON
        + """

Create the left-side-lane front-collision destroyed state of the exact normal car in the first image. The second image is the approved damage and color master; the third supplies only the old side-lane damage geometry. Preserve the first image's camera, scale, spoiler alignment, wheel placement, straight longitudinal centerline, and level tire contact line exactly. The entire front end is severely crushed from a rear-end collision: the forward hood is buckled upward, the front fenders are compressed, the windshield is cracked, and dark charcoal engine mechanics are exposed. The raised hood reads as a coherent red-painted exterior hood sheet-metal panel with ivory-silver broken edges. Red exists only on that raised exterior hood panel; all interior cavities and mechanical parts are charcoal black, dark steel, or blue-gray. Keep all surviving body paint boundaries identical to the normal side master, including the large deep navy rear fascia, rear bumper, blue wheel-arch guards, and continuous blue lower sill stripe. Do not add a side mirror.
""",
    },
}


def encode_image(path: Path) -> dict[str, object]:
    if not path.is_file():
        raise FileNotFoundError(path)
    mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    return {
        "inline_data": {
            "mime_type": mime,
            "data": base64.b64encode(path.read_bytes()).decode("ascii"),
        }
    }


def generate(stage: str, model: str) -> Path:
    config = load_skill_config(SKILL_ROOT)
    provider = config["providers"]["gemini"]
    proxy = config["proxy"]
    stage_config = STAGES[stage]
    parts: list[dict[str, object]] = [{"text": str(stage_config["prompt"])}]
    parts.extend(encode_image(Path(path)) for path in stage_config["refs"])

    url = f"{provider['base_url'].rstrip('/')}{provider['base_path']}/models/{model}:generateContent"
    payload = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "responseModalities": ["IMAGE"],
            "imageConfig": {"aspectRatio": "16:9", "imageSize": "2K"},
        },
    }
    response = request_with_fallback(
        "POST",
        url,
        primary=provider.get("vendor"),
        fallback=provider.get("fallback_vendor"),
        idempotent=False,
        headers={proxy["header"]: proxy["token"], "Content-Type": "application/json"},
        json=payload,
        timeout=240,
    )
    if response.status_code == 404 and provider.get("fallback_vendor"):
        fallback_url = url.replace(
            f"/proxy/{provider['vendor']}/",
            f"/proxy/{provider['fallback_vendor']}/",
            1,
        )
        response = requests.post(
            fallback_url,
            headers={proxy["header"]: proxy["token"], "Content-Type": "application/json"},
            json=payload,
            timeout=240,
        )
    if not response.ok:
        raise RuntimeError(f"Gemini request failed ({response.status_code}): {response.text[:1200]}")
    body = response.json()
    for part in body.get("candidates", [{}])[0].get("content", {}).get("parts", []):
        inline = part.get("inlineData") or part.get("inline_data")
        if inline and inline.get("data"):
            OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
            output_path = OUTPUT_ROOT / f"{stage}.png"
            output_path.write_bytes(base64.b64decode(inline["data"]))
            (OUTPUT_ROOT / f"{stage}.response.json").write_text(
                json.dumps(
                    {
                        "model": model,
                        "mimeType": inline.get("mimeType") or inline.get("mime_type"),
                        "stage": stage,
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )
            return output_path
    raise RuntimeError("Gemini returned no image part")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("stage", choices=STAGES)
    parser.add_argument("--model", default="gemini-3-pro-image-preview")
    args = parser.parse_args()
    print(generate(args.stage, args.model))


if __name__ == "__main__":
    main()
