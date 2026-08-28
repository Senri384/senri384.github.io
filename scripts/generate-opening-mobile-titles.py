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
    stripe = ((255, 255, 255, 255), (218, 255, 255, 255), (148, 246, 255, 245), (238, 255, 255, 255))
    for y in range(mask.height):
        draw.line((0, y, mask.width, y), fill=stripe[(y // 7) % len(stripe)])
    outlined_art(mask, fill, (239, 255, 255, 230), 2).save(
        OUTPUT / "opening-senri-impact.webp", "WEBP", lossless=True, method=6
    )


def make_homepage() -> None:
    mask = title_mask("HOMEPAGE")
    stops = (
        (255, 255, 255, 255),
        (226, 255, 255, 255),
        (178, 247, 255, 255),
        (121, 221, 239, 255),
        (232, 255, 255, 255),
        (192, 214, 255, 255),
        (151, 128, 224, 255),
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


if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    make_senri()
    make_homepage()
