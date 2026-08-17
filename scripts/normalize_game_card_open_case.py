"""Normalize generated open-case art to the website's animation geometry."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


CLOSED_CASE_ASPECT = 880 / 1047


def alpha_bounds(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    bounds = alpha.getbbox()
    if bounds is None:
        raise ValueError("Input image has no visible pixels")
    return bounds


def normalize(input_path: Path, output_path: Path, spine_center_ratio: float) -> None:
    image = Image.open(input_path).convert("RGBA")
    left, top, right, bottom = alpha_bounds(image)
    subject = image.crop((left, top, right, bottom))
    subject_width, subject_height = subject.size

    spine_center = round(subject_width * spine_center_ratio)
    alpha = subject.getchannel("A")
    column_coverage = [
        alpha.crop((x, 0, x + 1, subject_height)).getbbox() is not None
        for x in range(subject_width)
    ]

    spine_left = spine_center
    while spine_left > 0 and column_coverage[spine_left - 1]:
        spine_left -= 1
    spine_right = spine_center
    while spine_right < subject_width and column_coverage[spine_right]:
        spine_right += 1

    # Generated cases often keep the spine connected to both leaves. Use a
    # compact central band when the alpha silhouette cannot isolate it.
    if spine_right - spine_left < 8 or spine_right - spine_left > subject_width * 0.14:
        spine_width = max(28, round(subject_height * 0.075))
        spine_left = spine_center - spine_width // 2
        spine_right = spine_left + spine_width

    left_leaf = subject.crop((0, 0, spine_left, subject_height))
    spine = subject.crop((spine_left, 0, spine_right, subject_height))
    right_leaf = subject.crop((spine_right, 0, subject_width, subject_height))

    target_leaf_width = round(subject_height * CLOSED_CASE_ASPECT)
    left_leaf = left_leaf.resize((target_leaf_width, subject_height), Image.Resampling.NEAREST)
    right_leaf = right_leaf.resize((target_leaf_width, subject_height), Image.Resampling.NEAREST)

    margin_x = max(24, round(subject_height * 0.035))
    margin_y = max(24, round(subject_height * 0.045))
    canvas_width = margin_x * 2 + target_leaf_width * 2 + spine.width
    canvas_height = margin_y * 2 + subject_height
    canvas = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))

    x = margin_x
    canvas.alpha_composite(left_leaf, (x, margin_y))
    x += target_leaf_width
    canvas.alpha_composite(spine, (x, margin_y))
    x += spine.width
    canvas.alpha_composite(right_leaf, (x, margin_y))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output_path)
    print(
        f"Wrote {output_path} ({canvas_width}x{canvas_height}); "
        f"leaf={target_leaf_width}x{subject_height}; spine={spine.width}px"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument(
        "--spine-center-ratio",
        type=float,
        default=0.5,
        help="Horizontal spine center within the visible subject",
    )
    args = parser.parse_args()
    normalize(args.input, args.output, args.spine_center_ratio)


if __name__ == "__main__":
    main()
