# PRD — 장선도 공정기술 엔지니어 포트폴리오 (For Hanwha Engine)

> 원본: https://sites.google.com/view/sjforhanwhaengine/홈
> 목표: Google Sites 포트폴리오를 **직접 만든 정적 웹사이트**로 옮기고, GitHub Pages로 배포
> 작업 방식: VS Code + Claude Code에서 **Phase 1 → 2 → 3 순서로** 진행. Phase마다 이 문서를 첨부하고 해당 Phase 프롬프트를 사용

---

## 0. 프로젝트 개요

| 항목 | 내용 |
|---|---|
| 대상 | 장선도, 공정기술 엔지니어 (금속적층제조 LPBF · DfAM) |
| 지원처 | 한화엔진 (선박용 엔진 제조) |
| 핵심 메시지 | "LPBF 공정 파라미터 개발부터 조선·발사체 부품 양산까지 해 본 공정기술 엔지니어" |
| 주요 독자 | 채용 담당자, 현업 면접관 (첫 화면 30초 안에 역량이 보여야 함) |
| 기술 스택 | HTML + CSS + Vanilla JS, 콘텐츠는 `data/*.json`으로 분리 (빌드 도구 없음) |
| 배포 | GitHub Pages |

### 폴더 구조
```
portfolio/
├── index.html
├── css/style.css
├── js/main.js
├── data/
│   ├── profile.json        # 이름, 직무, 한 줄 소개, 연락처
│   ├── projects.json       # 프로젝트 12건
│   ├── parameters.json     # 파라미터 개발 11건
│   ├── certs.json          # 자격·수료 목록
│   └── personal.json       # 개인 작품 6건
├── assets/img/             # 원본 사이트에서 받은 이미지 (직접 다운로드)
└── README.md
```

### 공통 데이터 스키마 (projects / parameters / personal)
```json
{
  "id": "manifold-norway",
  "title": "노르웨이 K사 조선부품 매니폴드 DfAM 및 제작",
  "category": "project",
  "period": "2023.10 ~ 2025.05",
  "tags": ["DfAM", "LPBF", "조선"],
  "summary": "한두 줄 요약",
  "role": "본인 역할",
  "result": "성과 (수치가 있으면 수치로)",
  "images": ["assets/img/manifold-1.jpg"],
  "youtube": "",
  "nda": true,
  "featured": true
}
```

---

## Phase 1 — 기반 구축 (구조 · 디자인 · 콘텐츠 이관)

**목표:** 원본 사이트의 모든 콘텐츠가 새 사이트에 빠짐없이 표시된다.

### 요구사항
1. **섹션 구성 (원페이지 스크롤)**
   - Hero: 이름, 직무, 한 줄 소개, 핵심 키워드 3개(LPBF · DfAM · 공정 파라미터)
   - Projects (12건)
   - Parameter Development (11건)
   - 자격사항 (교육·수료 9건, 수상 2건)
   - 개인 작품 (6건)
   - Contact (이메일, LinkedIn)
2. **상단 고정 내비게이션** — 섹션 앵커 이동, 현재 섹션 하이라이트
3. **디자인 톤** — 산업·엔지니어링 느낌: 다크 네이비 + 금속 회색 + 강조색 1개(오렌지 계열), 산세리프(Pretendard)
4. **카드 그리드** — 썸네일, 제목, 기간, 태그 표시
5. **콘텐츠는 모두 JSON에서 렌더링** — HTML에 하드코딩 금지

### 이관할 콘텐츠
- **Projects:** 1단 엔진 펌프 / 메탄엔진 / Release nozzle / Motor heatsink / 노르웨이 K사 매니폴드 DfAM(2023.10~2025.05, NDA) / 가스발생기 / 금속산업대전 2025 / JIP ProGRAM Phase3 워크숍(2022.12~2024.12) / Sulzer Closed Impeller / 메탄 엔진 제작 / 국내 U사 발사체 부품(2022.11~2025.05, NDA) / LPBF 장비 필터 유지보수
- **Parameter:** Parameter development / Thermal shrink line test build / Delay study / 에디터 없이 파라미터 커스텀 / 자성재료 기본 공정 / Support test / Tool path function study / 저각 파라미터 / Build of Month(KAMUG 2023.11 Vol.01) / Thin wall study / 전용 CAD 서포트 개발
- **자격:** Solidworks 기초·실무·심화 / CFX 시뮬레이션 / Cimatron CAD / LPBF 과정(항공우주산학융합원) / CATIA 중급 / 기계공작실습(선반·CNC 밀링) / 머신러닝 대회 최우수 / 한국기계가공학회 캡스톤 우수
- **개인 작품:** Lattice & Computational design / Arduino CNC / G-skeletal lattice / 볼펜·받침 Computational design / 3D 스캐닝·캐스팅 / 서포트 없는 구형 탱크

> ⚠️ **공개하지 않을 것:** 성적·졸업·병적증명서, 운전면허증 등 개인 증빙 서류. 필요하면 "요청 시 제출 가능"으로만 표기한다.

### 완료 기준
- [ ] 로컬에서 `index.html`을 열면 모든 섹션이 보인다
- [ ] 원본 항목 수와 JSON 항목 수가 일치한다 (Projects 12 / Parameter 11 / 개인 6)
- [ ] 이미지가 없는 항목은 placeholder로 표시된다

### Claude Code 프롬프트
```
@PRD_장선도_포트폴리오.md 의 Phase 1을 구현해줘.
- 폴더 구조와 JSON 스키마를 그대로 따를 것
- 이관할 콘텐츠 목록을 data/*.json 에 모두 입력하고, summary/role/result는 "TODO"로 비워둘 것
- 이미지 경로는 assets/img/{id}-1.jpg 로 미리 지정하고, 파일이 없으면 placeholder 표시
- 완료 후 항목 수 검증 결과를 알려줘
```

---

## Phase 2 — 콘텐츠 강화 · 인터랙션

**목표:** 채용 담당자가 "무엇을, 어떻게, 얼마나 했는지"를 바로 파악할 수 있게 한다.

### 요구사항
1. **Featured 프로젝트 3건 상단 배치** (한화엔진 연관성이 높은 순서)
   - 노르웨이 K사 조선부품 매니폴드 DfAM — 조선 분야 직접 경험
   - 메탄엔진 / 가스발생기 — 엔진·연소 부품 제작 경험
   - Sulzer Closed Impeller (JIP Phase3) — 해외 산업 파트너와의 공동 프로젝트
2. **상세 모달** — 카드를 클릭하면 문제 → 접근 → 결과(STAR 형식), 이미지 슬라이드, YouTube 영상
3. **태그 필터** — LPBF / DfAM / 파라미터 / 조선 / 발사체 / 엔진
4. **이미지 라이트박스** — 원본 사이트의 "우클릭 후 새 탭에서 열기" 안내를 없애고 클릭하면 확대
5. **YouTube 지연 로딩** — 썸네일만 먼저 보여주고, 클릭하면 iframe 로드
6. **NDA 배지** — `nda: true`인 항목에 "NDA · 대체 이미지" 배지 표시
7. **숫자로 보는 역량** (Hero 아래) — 예: 프로젝트 12건 · 파라미터 연구 11건 · 산업 프로젝트 경력 2.5년

### 콘텐츠 작성 (본인이 채울 부분)
- Featured 3건의 `summary` / `role` / `result`를 직접 작성 (소재, 장비, 공정 조건, 개선 수치 등)
- 나머지 항목은 최소한 `summary` 1줄

### 완료 기준
- [ ] 필터·모달·라이트박스가 키보드(ESC, Tab)로도 동작한다
- [ ] Featured 3건의 STAR 내용이 채워져 있다
- [ ] YouTube 영상이 첫 로딩 때 불러와지지 않는다 (Network 탭에서 확인)

### Claude Code 프롬프트
```
@PRD_장선도_포트폴리오.md 의 Phase 2를 구현해줘.
- featured: true 항목을 상단 별도 섹션에 배치
- 모달은 JSON의 summary/role/result를 STAR 구조로 렌더링
- 외부 라이브러리 없이 Vanilla JS로 구현하고, ESC로 닫히게 할 것
- 구현 후 TODO로 남아 있는 JSON 필드 목록을 알려줘 (내가 직접 채울 것)
```

---

## Phase 3 — 마감 · 배포

**목표:** 어떤 기기에서도 빠르게 열리고, 링크 하나로 제출할 수 있다.

### 요구사항
1. **반응형** — 모바일(≤640px) 1열, 태블릿 2열, 데스크톱 3열
2. **성능** — 이미지 WebP 변환 + `loading="lazy"`, Lighthouse Performance 90 이상
3. **접근성** — 모든 이미지에 alt, 명도 대비 AA, Lighthouse Accessibility 90 이상
4. **메타 정보** — title "장선도 | 공정기술 엔지니어 포트폴리오", OG 이미지·설명 (카카오톡·메일로 링크 공유 시 미리보기)
5. **검색 노출 설정** — 원본처럼 비공개로 둘지 선택. 비공개면 `<meta name="robots" content="noindex">` 유지
6. **이력서 PDF 다운로드 버튼** (선택) — `assets/resume.pdf`
7. **GitHub Pages 배포** — `main` 브랜치 루트에서 배포, README에 배포 URL 기재

### 완료 기준
- [ ] 휴대폰 실기기에서 레이아웃이 깨지지 않는다
- [ ] Lighthouse 4개 항목 모두 90 이상
- [ ] `https://<계정>.github.io/<repo>/` 에 접속된다
- [ ] 링크 공유 미리보기(OG)가 뜬다

### Claude Code 프롬프트
```
@PRD_장선도_포트폴리오.md 의 Phase 3을 진행해줘.
1. 반응형·접근성·메타태그를 먼저 적용
2. assets/img 이미지를 WebP로 변환하는 스크립트를 만들고 실행
3. git init → GitHub repo 생성 → GitHub Pages 배포까지 단계별로 안내하며 진행
4. 마지막에 완료 기준 체크리스트 결과를 보고해줘
```

---

## 사전 준비 (Phase 1 시작 전)
- [ ] Google Sites에서 이미지 원본 다운로드 → `assets/img/`에 `{id}-1.jpg` 형식으로 저장
- [ ] YouTube 영상 URL 수집 (원본 사이트 영상 → "YouTube에서 보기"로 URL 확인)
- [ ] NDA 항목의 대체 이미지가 공개해도 되는지 다시 확인
- [ ] GitHub 계정, VS Code, Claude Code 설치 확인
