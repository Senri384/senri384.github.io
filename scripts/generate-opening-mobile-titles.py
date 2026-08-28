from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "portfolio-assets" / "ui" / "text"
FONT = Path(r"C:\Windows\Fonts\impact.ttf")


def title_mask(text: str, size: int = 230) -> Image.Image:
    font = ImageFont.truetype(str(FONT), size=size)
    bounds = font.getbbox(text, stroke_width=0)
    mask = Image.new("L", (bounds[2] - bounds[0] + 48, bounds[3] - bounds[1] + 48), 0)
    draw = ImageDraw.Draw(mask)
    draw.text((24 - bounds[0], 24 - bounds[1]), text, font=font, fill=255)
    return mask


def outlined_art(mask: Image.Image, fill: Image.Image, outline_color: tuple[int, int, int, int], outline_px: int) -> Image.Image:
    outline = mask.filter(ImageFilter.MaxFilter(outline_px * 2 + 1))
    art = Image.new("RGBA", mask.size, (0, 0, 0, 0))
    art.paste(outline_color, mask=outline)
    art.paste(fill, mask=mask)
    return art


def make_senri() -> None:
    mask = title_mask("SENRI'S")
    fill = Image.new("RGBA", mask.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(fill)
    stripe = ((247, 255, 255, 255), (102, 247, 255, 245), (48, 151, 190, 210), (223, 255, 255, 250))
    for y in range(mask.height):
        draw.line((0, y, mask.width, y), fill=stripe[(y // 7) % len(stripe)])
    outlined_art(mask, fill, (239, 255, 255, 230), 2).save(
        OUTPUT / "opening-senri-impact.webp", "WEBP", lossless=True, method=6
    )


def make_homepage() -> None:
    mask = title_mask("HOMEPAGE")
    stops = (
        (255, 255, 255, 255),
        (176, 244, 255, 255),
        (73, 117, 220, 255),
        (12, 24, 76, 255),
        (235, 248, 255, 255),
        (126, 105, 216, 255),
        (26, 8, 48, 255),
    )
    fill = Image.new("RGBA", mask.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(fill)
    for y in range(mask.height):
        position = y / max(1, mask.height - 1) * (len(stops) - 1)
        index = min(int(position), len(stops) - 2)
        mix = position - index
        color = tuple(round(stops[index][channel] * (1 - mix) + stops[index + 1][channel] * mix) for channel in range(4))
        draw.line((0, y, mask.width, y), fill=color)
    outlined_art(mask, fill, (157, 252, 255, 255), 3).save(
        OUTPUT / "opening-homepage-impact.webp", "WEBP", lossless=True, method=6
    )


def make_combo_glyphs() -> None:
    glyphs = "0123456789X"
    cell_width, cell_height, scale = 48, 64, 4
    font = ImageFont.truetype(str(FONT), size=60)
    low = Image.new("RGBA", (cell_width * len(glyphs), cell_height), (0, 0, 0, 0))
    for index, glyph in enumerate(glyphs):
        mask = Image.new("L", (cell_width, cell_height), 0)
        bounds = font.getbbox(glyph)
        x = (cell_width - (bounds[2] - bounds[0])) // 2 - bounds[0]
        y = (cell_height - (bounds[3] - bounds[1])) // 2 - bounds[1]
        ImageDraw.Draw(mask).text((x, y), glyph, font=font, fill=255)
        # A hard threshold keeps the original Impact skeleton but converts its
        # curves into deliberate low-resolution pixel steps.
        mask = mask.point(lambda value: 255 if value >= 96 else 0)
        low.paste((255, 23, 68, 255), (index * cell_width, 0), mask)
    low.resize((low.width * scale, low.height * scale), Image.Resampling.NEAREST).save(
        OUTPUT / "combo-impact-pixel.webp", "WEBP", lossless=True, method=6
    )


if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    make_senri()
    make_homepage()
    make_combo_glyphs()
