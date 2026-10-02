# 장선도 | 공정기술 엔지니어 포트폴리오

LPBF 공정 파라미터 개발부터 조선·발사체 부품 양산까지 해 본 공정기술 엔지니어 장선도의 포트폴리오 (For Hanwha Engine).

- **배포 URL:** https://pycode1094.github.io/sundojang/
- 원본: https://sites.google.com/view/sjforhanwhaengine/홈
- 스택: HTML + CSS + Vanilla JS (빌드 도구·외부 JS 라이브러리 없음), 콘텐츠는 `data/*.json`

## 폴더 구조

```
├── index.html            # 뼈대만 있음. 콘텐츠는 모두 JSON 에서 렌더링
├── css/style.css
├── css/admin.css         # 관리자 모드 스타일 (관리자 버튼을 눌렀을 때만 로드)
├── js/main.js
├── js/admin.js           # 관리자 모드 (관리자 버튼을 눌렀을 때만 로드)
├── data/
│   ├── profile.json      # 이름, 직무, 한 줄 소개, 연락처, 경력 기간, 이력서 경로
│   ├── projects.json     # 프로젝트 12건
│   ├── parameters.json   # 파라미터 개발 11건
│   ├── certs.json        # 교육·수료 9건, 수상 2건
│   ├── personal.json     # 개인 작품 6건
│   ├── admin.json        # 관리자 저장소 정보 + 비밀번호 해시 (관리자 초기 설정 시 생성)
│   ├── images.json       # (자동 생성) 실제 존재하는 이미지 목록
│   └── bundle.js         # (자동 생성) file:// 로 열 때 쓰는 데이터 번들
├── assets/
│   ├── img/              # {id}-1.webp, {id}-1.thumb.webp ...
│   ├── og-image.png      # 링크 공유 미리보기 이미지
│   └── favicon.svg
└── scripts/
    ├── build_data.py     # 항목 수 검증 + TODO 목록 + images.json/bundle.js 생성
    ├── convert_webp.py   # JPG/PNG → WebP 변환 + JSON 경로 갱신 (+ build_data 실행)
    └── make_og_image.py  # OG 이미지 재생성
```

## 로컬에서 보기

- `index.html` 더블클릭 → `data/bundle.js` 로 표시됨 (JSON 수정 후엔 `python scripts/build_data.py` 다시 실행)
- 또는 로컬 서버: `python -m http.server 8000` → http://localhost:8000

## 관리자 모드 (웹에서 사진 · 내용 수정)

사이트 맨 아래 **관리자** 버튼 (또는 주소 끝에 `#admin`) → 비밀번호 입력 → 편집 모드.

- 카드의 **수정**: 제목·기간·태그·STAR·사진(여러 장, 끌어다 놓기)·YouTube·NDA·Featured 편집, **삭제**
- 카드의 **◀ ▶**: 순서 변경 / 섹션 상단 **+ 새 항목**: 추가 (맨 앞에 생성)
- 자격사항 **수정 / + 추가**, 하단 바 **프로필 수정**(소개·연락처·이력서 PDF)
- 사진은 브라우저에서 WebP(1600px) + 썸네일(720px)로 자동 변환된다
- 수정은 화면에 바로 미리보기되고, **저장 · 게시**를 눌러야 GitHub 저장소에 커밋된다 → 1~2분 뒤 사이트 반영

### 처음 한 번: 비밀번호 · GitHub 토큰

정적 사이트(GitHub Pages)에는 서버가 없어서, 저장은 **브라우저가 GitHub API 로 직접 커밋**하는 방식이다.

1. GitHub 토큰 만들기: https://github.com/settings/personal-access-tokens/new
   - Repository access: **Only select repositories** → 이 저장소
   - Permissions → Repository permissions → **Contents: Read and write**
2. 사이트에서 **관리자** 클릭 → `data/admin.json` 이 없으면 **관리자 초기 설정** 화면이 뜬다
   → 비밀번호 2번 + 토큰 입력 → 비밀번호 해시가 저장소에 커밋되고 관리자 모드 시작
3. 이후엔 비밀번호만 입력하면 된다. 비밀번호 변경은 하단 바 **설정**에서.

> ⚠️ 보안: 비밀번호는 **편집 화면을 여는 잠금**일 뿐이다. 해시가 공개 저장소에 있으므로 짧은 비밀번호는 쉽게 풀린다.
> 실제로 사이트를 바꿀 수 있는 권한은 **GitHub 토큰**에 있으며, 토큰은 입력한 브라우저에만 저장되고 저장소에 올라가지 않는다.
> 공용 PC 에서는 "토큰 기억"을 끄고, 토큰이 유출되면 GitHub 에서 즉시 삭제(Revoke)한다.

- 관리자 페이지에서 저장하면 원격 저장소가 바뀌므로, 로컬에서 작업하기 전에는 `git pull` 을 먼저 한다.
- 다른 곳에서 먼저 저장된 내용이 있으면 덮어쓰기 전에 경고가 뜬다.

## 콘텐츠 수정 (JSON 직접 편집)

`data/projects.json` 등의 항목 스키마:

| 필드 | 설명 |
|---|---|
| `summary` | 문제·상황 (모달의 **S·T**) — 카드에도 1줄 표시 |
| `role` | 접근·역할 (모달의 **A**) |
| `result` | 결과, 가능하면 수치로 (모달의 **R**) |
| `images` | `assets/img/{id}-1.jpg` 형식. 파일이 없으면 placeholder 로 표시 |
| `youtube` | YouTube 영상 ID. 모달에서 클릭할 때만 iframe 로드 |
| `poster` | 영상 썸네일 (로컬 파일, YouTube 요청 없이 표시) |
| `nda` | `true` 면 "NDA · 대체 이미지" 배지 + `ndaNote` 안내문 |
| `featured` | `true` 면 상단 Featured 섹션에 표시 (`featuredOrder` 순, `featuredReason` 은 강조 문구) |

- 값이 `"TODO"` 이거나 비어 있으면 화면에 **표시하지 않는다** (STAR 가 전부 비면 "면접에서 설명" 문구로 대체).
- 남은 TODO 확인: `python scripts/build_data.py`
- 필터 태그(LPBF / DfAM / 파라미터 / 조선 / 발사체 / 엔진)는 `js/main.js` 의 `FILTER_TAGS`.
- 이력서 PDF: `assets/resume.pdf` 를 넣고 `profile.json` 의 `"resume": "assets/resume.pdf"` 로 지정하면 버튼이 나타난다.

## 이미지 추가

원본 Google Sites 이미지는 자동 다운로드가 막혀 있어(403) 직접 저장해야 한다.

1. 원본 사이트에서 이미지를 저장해 `assets/img/{id}-1.jpg`, `{id}-2.jpg` … 로 이름 붙이기
   (id 는 JSON 의 `id`. 예: `manifold-norway-1.jpg`, `cert-lpbf-1.jpg`)
2. `pip install pillow` (최초 1회)
3. `python scripts/convert_webp.py` → WebP(1600px) + 썸네일(720px) 생성, JSON 경로를 `.webp` 로 교체, 원본은 `assets/img/_original/` (git 제외)

> ⚠️ 성적·졸업·병적증명서, 운전면허증 등 개인 증빙 서류는 올리지 않는다 ("요청 시 제출 가능"으로만 표기).

## 검색 노출

현재 **비공개(링크 공유 전용)** — `index.html` 의 `<meta name="robots" content="noindex, nofollow">`.
검색에 노출하려면 이 줄을 삭제한다. (noindex 상태에서는 Lighthouse SEO 점수가 63 으로 나오는 것이 정상)

## 배포 (GitHub Pages)

```bash
git remote add origin https://github.com/<계정>/<repo>.git
git push -u origin main
```

GitHub 저장소 → **Settings → Pages → Build and deployment**: Source `Deploy from a branch`, Branch `main` / `/ (root)` → Save.
1~2분 뒤 `https://<계정>.github.io/<repo>/` 에서 열린다.

배포 URL 이 정해지면 `index.html` 의 `og:url`, `og:image` 를 실제 주소로 바꾼다
(카카오톡 미리보기는 og:image 가 **절대 URL** 이어야 뜬다). 카카오톡 캐시 갱신: https://developers.kakao.com/tool/debugger/sharing

## 완료 기준 체크리스트

- [x] Projects 12 / Parameter 11 / 개인 작품 6 / 교육·수료 9 / 수상 2 (`build_data.py` 검증)
- [x] 이미지 없는 항목 placeholder 표시
- [x] 필터·모달·라이트박스 키보드(Tab, Enter, ESC, ←/→) 동작
- [x] YouTube 는 첫 로딩 때 요청 0건 (클릭 시 youtube-nocookie iframe)
- [x] 반응형 1열(≤640px) / 2열 / 3열(≥1024px)
- [x] Lighthouse (로컬): Performance 99~100 · Accessibility 100 · Best Practices 100 · SEO 63(noindex 때문)
- [ ] Featured 3건 STAR 내용 작성
- [ ] 원본 이미지 저장 후 `convert_webp.py` 실행
- [ ] GitHub Pages 배포 · OG URL 교체 · 휴대폰 실기기 확인 · 카카오톡 미리보기 확인
