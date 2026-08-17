"""Split a chroma-keyed three-object game-card sheet into project assets."""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image


def visible_components(image: Image.Image) -> list[tuple[int, int, int, int]]:
    alpha = image.getchannel("A")
    mask = alpha.point(lambda value: 255 if value >= 72 else 0)
    width, height = mask.size
    pixels = mask.load()
    visited = bytearray(width * height)
    boxes: list[tuple[int, int, int, int, int]] = []

    for y in range(height):
        for x in range(width):
            index = y * width + x
            if visited[index] or not pixels[x, y]:
                continue
            queue = deque([(x, y)])
            visited[index] = 1
            min_x = max_x = x
            min_y = max_y = y
            area = 0
            while queue:
                cx, cy = queue.popleft()
                area += 1
                min_x = min(min_x, cx)
                max_x = max(max_x, cx)
                min_y = min(min_y, cy)
                max_y = max(max_y, cy)
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue
                    neighbor = ny * width + nx
                    if visited[neighbor] or not pixels[nx, ny]:
                        continue
                    visited[neighbor] = 1
                    queue.append((nx, ny))
            if area >= width * height * 0.006:
                boxes.append((min_x, min_y, max_x + 1, max_y + 1, area))

    boxes.sort(key=lambda box: box[0])
    return [box[:4] for box in boxes]


def padded_crop(image: Image.Image, bounds: tuple[int, int, int, int]) -> Image.Image:
    left, top, right, bottom = bounds
    width = right - left
    height = bottom - top
    margin = max(12, round(max(width, height) * 0.035))
    crop = image.crop((left, top, right, bottom))
    canvas = Image.new("RGBA", (width + margin * 2, height + margin * 2), (0, 0, 0, 0))
    canvas.alpha_composite(crop, (margin, margin))
    return canvas


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("slug")
    args = parser.parse_args()

    image = Image.open(args.input).convert("RGBA")
    boxes = visible_components(image)
    if len(boxes) != 3:
        raise ValueError(f"Expected 3 large isolated objects, found {len(boxes)}: {boxes}")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    names = ("case", "open-raw", "cartridge")
    for name, bounds in zip(names, boxes):
        output = args.output_dir / f"{name}-{args.slug}-v1.png"
        padded_crop(image, bounds).save(output)
        print(f"Wrote {output} from {bounds}")


if __name__ == "__main__":
    main()
