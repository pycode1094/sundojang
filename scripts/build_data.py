"""data/*.json 검증 + 부가 파일 생성.

생성물
  data/images.json  실제로 존재하는 이미지 경로 목록 (없는 이미지 요청 → 404 방지, placeholder 표시)
  data/bundle.js    index.html 을 file:// 로 직접 열 때 쓰는 데이터 번들

출력
  항목 수 검증 결과 (Projects 12 / Parameter 11 / 개인 6 / 교육·수료 9 / 수상 2)
  "TODO" 로 남은 필드 목록

사용법: python scripts/build_data.py
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
IMG_DIR = ROOT / "assets" / "img"
FILES = ["profile", "projects", "parameters", "certs", "personal"]
EXPECTED = {"projects": 12, "parameters": 11, "personal": 6, "training": 9, "awards": 2}
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}
STAR_FIELDS = ["summary", "role", "result"]


def load():
    return {name: json.loads((DATA / f"{name}.json").read_text(encoding="utf-8")) for name in FILES}


def existing_images():
    return sorted(
        p.relative_to(ROOT).as_posix()
        for p in IMG_DIR.glob("*")
        if p.is_file() and p.suffix.lower() in IMAGE_EXT
    )


def is_todo(value):
    return not isinstance(value, str) or value.strip() == "" or value.strip().upper() == "TODO"


def report(data, images):
    ok = True
    counts = {
        "projects": len(data["projects"]),
        "parameters": len(data["parameters"]),
        "personal": len(data["personal"]),
        "training": len(data["certs"]["training"]),
        "awards": len(data["certs"]["awards"]),
    }
    print("== 항목 수 검증 ==")
    for key, expected in EXPECTED.items():
        mark = "OK " if counts[key] == expected else "NG "
        ok &= counts[key] == expected
        print(f"  [{mark}] {key:<11} {counts[key]:>2} / 기대 {expected}")

    works = data["projects"] + data["parameters"] + data["personal"]
    ids = [w["id"] for w in works]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        ok = False
        print(f"  [NG ] 중복 id: {sorted(dupes)}")

    featured = [w["id"] for w in works if w.get("featured")]
    print(f"  Featured {len(featured)}건: {', '.join(featured)}")

    have = set(images)
    missing = [p for w in works for p in w.get("images", []) if p not in have]
    missing += [c["image"] for c in data["certs"]["training"] + data["certs"]["awards"] if c.get("image") not in have]
    print(f"\n== 이미지 == 존재 {len(images)}개 · 아직 없는 경로 {len(missing)}개 (placeholder 로 표시)")

    print("\n== TODO 필드 ==")
    featured_todo, other_todo = [], []
    for w in works:
        fields = [f for f in STAR_FIELDS if is_todo(w.get(f))]
        if fields:
            (featured_todo if w.get("featured") else other_todo).append((w, fields))
    for title, rows in (("Featured (STAR 전부 필요)", featured_todo), ("기타 (최소 summary 1줄)", other_todo)):
        print(f"  -- {title}: {len(rows)}건")
        for w, fields in rows:
            print(f"     {w['category']:<9} {w['id']:<26} {', '.join(fields)}")
    return ok


def main():
    data = load()
    images = existing_images()

    (DATA / "images.json").write_text(json.dumps(images, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    bundle = dict(data, images=images)
    (DATA / "bundle.js").write_text(
        "// 자동 생성 파일 — 직접 수정하지 말고 data/*.json 수정 후 python scripts/build_data.py 실행\n"
        f"window.PORTFOLIO_DATA = {json.dumps(bundle, ensure_ascii=False)};\n",
        encoding="utf-8",
    )
    print("data/images.json, data/bundle.js 생성 완료\n")
    return 0 if report(data, images) else 1


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
