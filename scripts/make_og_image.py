"""링크 공유 미리보기용 OG 이미지(assets/og-image.png, 1200x630)를 data/profile.json 으로 생성.

사용법: python scripts/make_og_image.py [Pretendard OTF 폴더]
  폰트 폴더를 주지 않으면 Windows 맑은 고딕을 사용한다.
  Pretendard: https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/public/static/
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
W, H = 1200, 630
NAVY, GRID, LINE = (11, 19, 32), (22, 34, 54), (56, 80, 124)
TEXT, MUTED, METAL, ACCENT, ACCENT_INK = (233, 238, 245), (169, 181, 199), (141, 155, 176), (255, 138, 61), (28, 15, 4)


def fonts(font_dir):
    if font_dir:
        d = Path(font_dir)
        return {w: str(d / f"Pretendard-{n}.otf") for w, n in (("xb", "ExtraBold"), ("b", "Bold"), ("m", "Medium"))}
    win = Path("C:/Windows/Fonts")
    return {"xb": str(win / "malgunbd.ttf"), "b": str(win / "malgunbd.ttf"), "m": str(win / "malgun.ttf")}


def main():
    profile = json.loads((ROOT / "data" / "profile.json").read_text(encoding="utf-8"))
    f = fonts(sys.argv[1] if len(sys.argv) > 1 else None)
    font = lambda w, size: ImageFont.truetype(f[w], size)

    img = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(img)
    for x in range(0, W, 32):
        d.line([(x, 0), (x, H)], fill=GRID)
    for y in range(0, H, 32):
        d.line([(0, y), (W, y)], fill=GRID)

    # 오른쪽: LPBF 적층 레이어 도식
    cx, base = 960, 470
    for i in range(10):
        w = 300 - abs(4.5 - i) * 22
        y = base - i * 24
        top = i == 9
        d.rounded_rectangle([cx - w / 2, y, cx + w / 2, y + 16], radius=3,
                            fill=ACCENT if top else (26, 42, 71), outline=(255, 164, 100) if top else LINE, width=2)
    d.rectangle([cx - 190, base + 26, cx + 190, base + 46], fill=(38, 55, 90))
    d.line([(cx, 70), (cx, base - 9 * 24 - 4)], fill=ACCENT, width=4)

    # 왼쪽: 텍스트
    x = 80
    d.rectangle([x, 96, x + 40, 100], fill=ACCENT)
    d.text((x + 56, 84), profile["target"].upper(), font=font("b", 24), fill=ACCENT)
    d.text((x, 136), profile["name"], font=font("xb", 104), fill=TEXT)
    d.text((x, 272), f"{profile['role']} 포트폴리오", font=font("b", 44), fill=TEXT)

    tagline = profile["tagline"]
    cut = tagline.find("부터") + 2 if "부터" in tagline else len(tagline) // 2
    d.text((x, 346), tagline[:cut].strip(), font=font("m", 28), fill=MUTED)
    d.text((x, 386), tagline[cut:].strip(), font=font("m", 28), fill=MUTED)

    kx = x
    for i, kw in enumerate(profile["keywords"]):
        kf = font("b", 28)
        tw = d.textlength(kw, font=kf)
        box = [kx, 470, kx + tw + 44, 526]
        if i == 0:
            d.rounded_rectangle(box, radius=28, fill=ACCENT)
            d.text((kx + 22, 480), kw, font=kf, fill=ACCENT_INK)
        else:
            d.rounded_rectangle(box, radius=28, outline=LINE, width=2, fill=(20, 33, 58))
            d.text((kx + 22, 480), kw, font=kf, fill=TEXT)
        kx = box[2] + 14

    d.rectangle([0, H - 8, W, H], fill=ACCENT)
    out = ROOT / "assets" / "og-image.png"
    img.save(out, optimize=True)
    print(f"{out.relative_to(ROOT)} 생성 ({out.stat().st_size // 1024}KB)")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
