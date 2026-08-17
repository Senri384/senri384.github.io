from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "public" / "portfolio-assets" / "ui" / "game-card-system-v3"
SOURCE_PATH = ASSET_DIR / "category-rack-sheet-alpha.png"
OUTPUT_SIZE = 1200
SUBJECT_MAX_WIDTH = 1050
SUBJECT_MAX_HEIGHT = 1050

CELLS = [
    ("game-design", 0, 0),
    ("game-research", 1, 0),
    ("articles", 2, 0),
    ("scripts", 3, 0),
    ("reviews", 0, 1),
    ("experience", 1, 1),
    ("short-films", 2, 1),
    ("photography", 3, 1),
]


def fit_subject(image: Image.Image) -> Image.Image:
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha < 20 or (green > red + 10 and green > blue + 10):
                pixels[x, y] = (0, 0, 0, 0)
            elif alpha < 255:
                # Transparent chroma pixels retain green RGB values after the
                # first matte pass. Neutralize those values before resizing so
                # interpolation cannot reintroduce a green fringe.
                neutral_green = min(green, max(red, blue) + 2)
                pixels[x, y] = (red, neutral_green, blue, alpha)

    bounds = image.getchannel("A").getbbox()
    if bounds is None:
        raise RuntimeError("Generated rack cell has no visible pixels")
    subject = image.crop(bounds)
    scale = min(
        SUBJECT_MAX_WIDTH / subject.width,
        SUBJECT_MAX_HEIGHT / subject.height,
    )
    fitted = subject.resize(
        (round(subject.width * scale), round(subject.height * scale)),
        Image.Resampling.LANCZOS,
    )
    pixels = fitted.load()
    for y in range(fitted.height):
        for x in range(fitted.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha < 12 or (green > red + 8 and green > blue + 8):
                pixels[x, y] = (0, 0, 0, 0)
            elif alpha < 255:
                pixels[x, y] = (red, min(green, max(red, blue) + 2), blue, alpha)
    return fitted


def main() -> None:
    sheet = Image.open(SOURCE_PATH).convert("RGBA")
    cell_width = sheet.width // 4
    cell_height = sheet.height // 2

    for slug, column, row in CELLS:
        cell = sheet.crop(
            (
                column * cell_width,
                row * cell_height,
                (column + 1) * cell_width,
                (row + 1) * cell_height,
            )
        )
        subject = fit_subject(cell)
        canvas = Image.new("RGBA", (OUTPUT_SIZE, OUTPUT_SIZE), (0, 0, 0, 0))
        x = (OUTPUT_SIZE - subject.width) // 2
        y = (OUTPUT_SIZE - subject.height) // 2
        canvas.alpha_composite(subject, (x, y))
        canvas.save(ASSET_DIR / f"category-rack-{slug}-v3.png", optimize=True)


if __name__ == "__main__":
    main()
