"""Normalize a closed case and its open case as one animation-matched pair."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


LEAF_WIDTH = 800
SPINE_WIDTH = 60
MARGIN_X = 35
MARGIN_Y = 35


def crop_alpha(image: Image.Image) -> Image.Image:
    bounds = image.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError("Image contains no visible pixels")
    return image.crop(bounds)


def split_open_case(image: Image.Image, spine_center_ratio: float) -> tuple[Image.Image, Image.Image, Image.Image]:
    subject = crop_alpha(image)
    width, height = subject.size
    center = round(width * spine_center_ratio)
    alpha = subject.getchannel("A")
    coverage = [alpha.crop((x, 0, x + 1, height)).getbbox() is not None for x in range(width)]

    spine_left = center
    while spine_left > 0 and coverage[spine_left - 1]:
        spine_left -= 1
    spine_right = center
    while spine_right < width and coverage[spine_right]:
        spine_right += 1

    if spine_right - spine_left < 8 or spine_right - spine_left > width * 0.14:
        estimated_width = max(24, round(height * 0.075))
        spine_left = center - estimated_width // 2
        spine_right = spine_left + estimated_width

    left = crop_alpha(subject.crop((0, 0, spine_left, height)))
    spine = crop_alpha(subject.crop((spine_left, 0, spine_right, height)))
    right = crop_alpha(subject.crop((spine_right, 0, width, height)))
    return left, spine, right


def normalize_pair(
    closed_input: Path,
    open_input: Path,
    closed_output: Path,
    open_output: Path,
    spine_center_ratio: float,
) -> None:
    closed = crop_alpha(Image.open(closed_input).convert("RGBA"))
    closed_aspect = closed.width / closed.height
    leaf_height = round(LEAF_WIDTH / closed_aspect)

    left, spine, right = split_open_case(Image.open(open_input).convert("RGBA"), spine_center_ratio)
    left = left.resize((LEAF_WIDTH, leaf_height), Image.Resampling.NEAREST)
    right = right.resize((LEAF_WIDTH, leaf_height), Image.Resampling.NEAREST)
    spine = spine.resize((SPINE_WIDTH, leaf_height), Image.Resampling.NEAREST)

    canvas_width = MARGIN_X * 2 + LEAF_WIDTH * 2 + SPINE_WIDTH
    canvas_height = MARGIN_Y * 2 + leaf_height
    opened = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))
    opened.alpha_composite(left, (MARGIN_X, MARGIN_Y))
    opened.alpha_composite(spine, (MARGIN_X + LEAF_WIDTH, MARGIN_Y))
    opened.alpha_composite(right, (MARGIN_X + LEAF_WIDTH + SPINE_WIDTH, MARGIN_Y))

    closed_output.parent.mkdir(parents=True, exist_ok=True)
    open_output.parent.mkdir(parents=True, exist_ok=True)
    closed.save(closed_output)
    opened.save(open_output)
    print(
        f"Wrote {closed_output} {closed.size}; {open_output} {opened.size}; "
        f"leaf={LEAF_WIDTH}x{leaf_height}; closed_aspect={closed_aspect:.6f}"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("closed_input", type=Path)
    parser.add_argument("open_input", type=Path)
    parser.add_argument("closed_output", type=Path)
    parser.add_argument("open_output", type=Path)
    parser.add_argument("--spine-center-ratio", type=float, default=0.5)
    args = parser.parse_args()
    normalize_pair(
        args.closed_input,
        args.open_input,
        args.closed_output,
        args.open_output,
        args.spine_center_ratio,
    )


if __name__ == "__main__":
    main()
