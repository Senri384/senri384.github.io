from __future__ import annotations

import json
import posixpath
import shutil
import zipfile
from pathlib import Path, PurePosixPath
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "docs" / "信号文章" / "海外Z世代顶流歌手玩转互联网的方法分析"
DATA_PATH = ROOT / "src" / "data" / "portfolio-content.json"
PUBLIC_DIR = ROOT / "public" / "portfolio-assets" / "articles" / "bbno-internet-playbook"
SLUG = "bbno-internet-playbook"
TITLE = "海外Z世代顶流歌手玩转互联网的方法分析"
NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "pr": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def paragraph_text(node: ET.Element) -> str:
    return "".join(item.text or "" for item in node.findall(".//w:t", NS)).strip()


def role_for(text: str) -> str:
    if text.startswith(("一、", "二、", "三、", "四、", "五、")):
        return "heading"
    if len(text) < 42 and text[:2] in {"1.", "2.", "3.", "4."}:
        return "subheading"
    return "paragraph"


def extract_docx() -> tuple[list[dict[str, str]], int]:
    docx = next(SOURCE_DIR.glob("*.docx"))
    image_index = 0
    blocks: list[dict[str, str]] = []

    with zipfile.ZipFile(docx) as archive:
        document = ET.fromstring(archive.read("word/document.xml"))
        relationships = ET.fromstring(archive.read("word/_rels/document.xml.rels"))
        relationship_tag = f"{{{NS['pr']}}}Relationship"
        blip_tag = f"{{{NS['a']}}}blip"
        embed_attribute = f"{{{NS['r']}}}embed"
        relation_targets = {
            relation.attrib["Id"]: relation.attrib["Target"]
            for relation in relationships.iter(relationship_tag)
        }

        body = document.find("w:body", NS)
        if body is None:
            return blocks, image_index

        for paragraph in body.findall("w:p", NS):
            text = paragraph_text(paragraph)
            if text == TITLE and not blocks:
                continue

            if text.startswith("没有钱") and text.endswith(".mp4"):
                index = text.removeprefix("没有钱").removesuffix(".mp4")
                blocks.append({
                    "type": "video",
                    "src": f"/portfolio-assets/articles/{SLUG}/bbno-{index}.mp4",
                    "caption": f"相关视频 {index}",
                })
                continue

            if text:
                blocks.append({"type": "paragraph", "text": text, "role": role_for(text)})

            for blip in paragraph.iter(blip_tag):
                relation_id = blip.attrib.get(embed_attribute)
                target = relation_targets.get(relation_id or "")
                if not target:
                    continue
                media_path = posixpath.normpath(str(PurePosixPath("word") / target))
                if media_path not in archive.namelist():
                    continue
                image_index += 1
                extension = PurePosixPath(target).suffix.lower() or ".png"
                destination = PUBLIC_DIR / f"image-{image_index:02d}{extension}"
                destination.write_bytes(archive.read(media_path))
                blocks.append({
                    "type": "image",
                    "src": f"/portfolio-assets/articles/{SLUG}/{destination.name}",
                })

        embedded_count = sum(1 for _ in document.iter(blip_tag))
        if image_index != embedded_count:
            raise RuntimeError(
                f"DOCX media extraction mismatch: found {embedded_count} embedded images, "
                f"wrote {image_index}."
            )

    return blocks, image_index


def main() -> None:
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    for index in range(1, 5):
        shutil.copy2(SOURCE_DIR / f"没有钱{index}.mp4", PUBLIC_DIR / f"bbno-{index}.mp4")

    blocks, image_count = extract_docx()
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    existing = next((work for work in data["works"] if work.get("slug") == SLUG), {})
    replacement = {
        **existing,
        "category": "articles",
        "slug": SLUG,
        "title": TITLE,
        "kind": "互联网文化 / 社群观察",
        "format": "docx",
        "tags": ["Z世代", "互联网文化", "社群运营", "bbno$"],
        "source": str(SOURCE_DIR.relative_to(ROOT)).replace("\\", "/"),
        "image": next((block["src"] for block in blocks if block["type"] == "image"), ""),
        "blocks": blocks,
        "paragraphs": [block["text"] for block in blocks if block["type"] == "paragraph"],
        "paragraphCount": sum(block["type"] == "paragraph" for block in blocks),
        "imageCount": image_count,
        "videoCount": sum(block["type"] == "video" for block in blocks),
        "tableCount": 0,
        "pageCount": 0,
    }
    data["works"] = [replacement if work.get("slug") == SLUG else work for work in data["works"]]
    if not existing:
        data["works"].append(replacement)
    DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
