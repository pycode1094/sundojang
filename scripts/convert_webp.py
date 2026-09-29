"""assets/img 의 JPG/PNG 를 WebP 로 변환하고 data/*.json 경로를 .webp 로 바꾼다.

  {name}.webp        긴 변 최대 1600px, 모달 · 라이트박스용
  {name}.thumb.webp  폭 720px, 카드 썸네일용
  원본은 assets/img/_original/ 로 이동 (.gitignore 대상, 배포에서 제외)

이미지를 새로 넣을 때마다 다시 실행하면 된다 (이미 변환된 파일은 건너뜀).
끝나면 scripts/build_data.py 를 호출해 images.json / bundle.js 를 갱신한다.

사용법: pip install pillow && python scripts/convert_webp.py
"""

import json
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageOps

import build_data

ROOT = Path(__file__).resolve().parent.parent
IMG_DIR = ROOT / "assets" / "img"
ORIGINAL_DIR = IMG_DIR / "_original"
DATA_FILES = ["projects", "parameters", "personal", "certs"]
FULL_MAX = 1600
THUMB_WIDTH = 720


def save_webp(img, dest, max_w, max_h, quality):
    im = img.copy()
    im.thumbnail((max_w, max_h), Image.LANCZOS)
    im.save(dest, "WEBP", quality=quality, method=6)
    return dest.stat().st_size


def convert_all():
    ORIGINAL_DIR.mkdir(exist_ok=True)
    converted = {}
    for src in sorted(IMG_DIR.iterdir()):
        if not src.is_file() or src.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
            continue
        full = src.with_suffix(".webp")
        thumb = src.with_name(f"{src.stem}.thumb.webp")
        with Image.open(src) as raw:
            img = ImageOps.exif_transpose(raw)
            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGBA" if "transparency" in img.info else "RGB")
            before = src.stat().st_size
            after = save_webp(img, full, FULL_MAX, FULL_MAX, 82)
            save_webp(img, thumb, THUMB_WIDTH, THUMB_WIDTH * 2, 76)
        shutil.move(str(src), ORIGINAL_DIR / src.name)
        converted[f"assets/img/{src.name}"] = f"assets/img/{full.name}"
        print(f"  {src.name:<40} {before / 1024:7.0f}KB → {after / 1024:6.0f}KB")
    return converted


def rewrite_paths():
    """JSON 의 .jpg/.png 경로 중 대응하는 .webp 가 있으면 교체"""
    changed = 0

    def fix(path):
        nonlocal changed
        if isinstance(path, str) and Path(path).suffix.lower() in {".jpg", ".jpeg", ".png"}:
            webp = str(Path(path).with_suffix(".webp").as_posix())
            if (ROOT / webp).exists():
                changed += 1
                return webp
        return path

    for name in DATA_FILES:
        file = ROOT / "data" / f"{name}.json"
        data = json.loads(file.read_text(encoding="utf-8"))
        items = data["training"] + data["awards"] if name == "certs" else data
        for item in items:
            if "images" in item:
                item["images"] = [fix(p) for p in item["images"]]
            for key in ("image", "poster"):
                if key in item:
                    item[key] = fix(item[key])
        file.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return changed


def main():
    print("== WebP 변환 ==")
    converted = convert_all()
    print(f"  {len(converted)}개 변환")
    print(f"== JSON 경로 갱신 == {rewrite_paths()}개 경로를 .webp 로 교체\n")
    return build_data.main()


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
