from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "public" / "portfolio-assets" / "ui" / "game-card-system-v2"
MASTER_PATH = ASSET_DIR / "category-rack-master-source.png"
FONT_PATH = Path(r"C:\Windows\Fonts\consolab.ttf")

LABELS = {
    "game-design": "GAME DESIGN",
    "game-research": "SYSTEM ANALYSIS",
    "articles": "CULTURE WRITING",
    "scripts": "SCRIPT",
    "reviews": "REVIEW",
    "experience": "GAME EXPERIENCE",
    "short-films": "SHORT FILM",
    "photography": "PHOTOGRAPHY",
}

OUTPUT_SIZE = 1200


def normalize_master() -> Image.Image:
    source = Image.open(MASTER_PATH).convert("RGBA")
    alpha = source.getchannel("A")
    bounds = alpha.getbbox()
    if bounds is None:
        raise RuntimeError("The generated rack master has no visible pixels")

    subject = source.crop(bounds)
    scale = min(1080 / subject.width, 1080 / subject.height)
    fitted = subject.resize(
        (round(subject.width * scale), round(subject.height * scale)),
        Image.Resampling.NEAREST,
    )
    canvas = Image.new("RGBA", (OUTPUT_SIZE, OUTPUT_SIZE), (0, 0, 0, 0))
    x = (OUTPUT_SIZE - fitted.width) // 2
    y = (OUTPUT_SIZE - fitted.height) // 2 + 6
    canvas.alpha_composite(fitted, (x, y))
    pixels = canvas.load()
    for py in range(canvas.height):
        for px in range(canvas.width):
            red, green, blue, alpha_value = pixels[px, py]
            if alpha_value and red > green * 1.14 and red > blue * 1.1:
                neutral = round(red * 0.3 + green * 0.42 + blue * 0.28)
                pixels[px, py] = (neutral, neutral, min(255, neutral + 3), alpha_value)
    return canvas


def fit_font(text: str, max_width: int) -> ImageFont.FreeTypeFont:
    for size in range(38, 19, -1):
        font = ImageFont.truetype(str(FONT_PATH), size)
        left, _, right, _ = font.getbbox(text, stroke_width=1)
        if right - left <= max_width:
            return font
    return ImageFont.truetype(str(FONT_PATH), 20)


def build_label(text: str) -> Image.Image:
    # Render at half resolution and scale with nearest-neighbour sampling so the
    # lettering shares the rack's deliberate pixel stair-step instead of looking
    # like smooth browser text pasted over the generated object.
    low = Image.new("RGBA", (310, 54), (0, 0, 0, 0))
    draw = ImageDraw.Draw(low)
    font = fit_font(text, 286)
    bounds = draw.textbbox((0, 0), text, font=font, stroke_width=1)
    width = bounds[2] - bounds[0]
    height = bounds[3] - bounds[1]
    x = (low.width - width) // 2 - bounds[0]
    y = (low.height - height) // 2 - bounds[1] - 1

    # Recess, body, and top-edge glint form one engraved letter profile.
    draw.text(
        (x + 2, y + 2),
        text,
        font=font,
        fill=(22, 21, 25, 244),
        stroke_width=1,
        stroke_fill=(10, 10, 12, 248),
    )
    draw.text(
        (x, y),
        text,
        font=font,
        fill=(171, 167, 159, 255),
        stroke_width=1,
        stroke_fill=(57, 55, 59, 255),
    )
    draw.text(
        (x - 1, y - 1),
        text,
        font=font,
        fill=(206, 202, 192, 138),
        stroke_width=0,
    )

    label = low.resize((620, 108), Image.Resampling.NEAREST)
    return label.rotate(-4.2, resample=Image.Resampling.NEAREST, expand=True)


def build_variant(master: Image.Image, slug: str, text: str) -> None:
    image = master.copy()
    label = build_label(text)
    image.alpha_composite(label, ((OUTPUT_SIZE - label.width) // 2 + 96, 834))

    image.save(ASSET_DIR / f"category-rack-{slug}-v2.png", optimize=True)


def main() -> None:
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    master = normalize_master()
    master.save(ASSET_DIR / "category-rack-master-v2.png", optimize=True)
    for slug, label in LABELS.items():
        build_variant(master, slug, label)


if __name__ == "__main__":
    main()
