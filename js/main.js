'use strict';

/* ==========================================================
   장선도 포트폴리오 — 모든 콘텐츠는 data/*.json 에서 렌더링
   ========================================================== */

const DATA_FILES = ['profile', 'projects', 'parameters', 'certs', 'personal'];
const FILTER_TAGS = ['LPBF', 'DfAM', '파라미터', '조선', '발사체', '엔진'];
const CATEGORY_LABEL = { project: 'Project', parameter: 'Parameter Development', personal: 'Personal Work' };
const WORK_SECTIONS = ['projects', 'parameters', 'personal'];

const state = {
  data: null,
  images: null, // Set of existing image paths (data/images.json) — null 이면 onerror 로 처리
  byId: new Map(),
  tag: null,
  blobUrls: new Map(), // 관리자 모드에서 업로드했지만 아직 게시 전인 이미지: 경로 → blob URL
};

/* ---------- DOM helpers ---------- */

const $ = (sel, root = document) => root.querySelector(sel);

function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value; // 내부 SVG 아이콘 전용
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

const ICONS = {
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" width="16" height="16"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.75h4v11H3v-11Zm6.5 0h3.8v1.5h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1v5.45h-4v-4.83c0-1.15-.02-2.63-1.6-2.63-1.6 0-1.85 1.25-1.85 2.55v4.91h-4v-11Z"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" width="18" height="18" style="flex:none;margin-top:3px"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
};

const icon = (name) => h('span', { html: ICONS[name], style: 'display:contents' });

/** "TODO" 또는 빈 값은 화면에 표시하지 않는다 */
const isFilled = (v) => typeof v === 'string' && v.trim() !== '' && v.trim().toUpperCase() !== 'TODO';

/* ---------- Data loading ---------- */

async function loadData() {
  // file:// 로 직접 열면 fetch 가 막히므로 data/bundle.js(scripts/build_data.py 로 생성)를 사용
  if (location.protocol === 'file:') return loadBundle();
  const entries = await Promise.all(
    DATA_FILES.map(async (name) => {
      const res = await fetch(`data/${name}.json`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`data/${name}.json → ${res.status}`);
      return [name, await res.json()];
    })
  );
  const data = Object.fromEntries(entries);
  data.images = await fetch('data/images.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return data;
}

function loadBundle() {
  return new Promise((resolve, reject) => {
    const script = h('script', { src: 'data/bundle.js' });
    script.onload = () =>
      window.PORTFOLIO_DATA ? resolve(window.PORTFOLIO_DATA) : reject(new Error('bundle.js is empty'));
    script.onerror = () => reject(new Error('data/bundle.js not found — python scripts/build_data.py 실행 필요'));
    document.head.append(script);
    console.info('[portfolio] file:// 모드: data/bundle.js 사용. JSON 수정 후 python scripts/build_data.py 를 다시 실행하세요.');
  });
}

/* ---------- Images ---------- */

const hasImage = (path) => !!path && (!state.images || state.images.has(path));

/** 게시 전 업로드 이미지는 blob URL 로 미리보기 */
const resolveSrc = (path) => state.blobUrls.get(path) || path;

/** WebP 변환본이 있으면 카드용 썸네일(.thumb.webp)을 우선 사용 */
function thumbCandidates(path) {
  if (!path) return [];
  return path.endsWith('.webp') ? [path.replace(/\.webp$/, '.thumb.webp'), path] : [path];
}

/** 카드 썸네일 후보: 이미지 → YouTube 포스터 순 */
function cardCandidates(item) {
  const list = [...(item.images || []), item.poster].flatMap(thumbCandidates);
  return list.filter(hasImage);
}

/** 모달/라이트박스용 실제 이미지 목록 */
const galleryImages = (item) => (item.images || []).filter(hasImage);

function placeholder(label = '이미지 준비 중', nda = false) {
  return h('div', { class: 'placeholder', role: 'img', 'aria-label': label }, icon(nda ? 'lock' : 'image'), h('span', { 'aria-hidden': 'true' }, label));
}

/** 후보 경로를 순서대로 시도하고, 모두 실패하면 placeholder 로 교체 */
function mediaFrame(candidates, { alt, label, nda, eager = false } = {}) {
  const frame = h('div', { class: 'media' });
  if (!candidates.length) {
    frame.append(placeholder(label, nda));
    return frame;
  }
  let index = 0;
  const img = h('img', { alt, loading: eager ? 'eager' : 'lazy', decoding: 'async' });
  img.addEventListener('error', () => {
    index += 1;
    if (index < candidates.length) img.src = resolveSrc(candidates[index]);
    else img.replaceWith(placeholder(label, nda));
  });
  img.src = resolveSrc(candidates[0]);
  frame.append(img);
  return frame;
}

function badges(item, { featured = false } = {}) {
  const list = [];
  if (featured) list.push(h('span', { class: 'badge badge-featured' }, 'Featured'));
  if (item.nda) list.push(h('span', { class: 'badge badge-nda' }, icon('lock'), 'NDA · 대체 이미지'));
  if (item.youtube) list.push(h('span', { class: 'badge' }, icon('play'), '영상'));
  return list.length ? h('div', { class: 'badges' }, list) : null;
}

const tagList = (tags = []) => h('ul', { class: 'tags', 'aria-label': '태그' }, tags.map((t) => h('li', { class: 'tag' }, t)));

/* ---------- Hero ---------- */

function careerYears({ start, end }) {
  const [sy, sm] = start.split('.').map(Number);
  const [ey, em] = end.split('.').map(Number);
  const months = (ey - sy) * 12 + (em - sm);
  return Math.round((months / 12) * 10) / 10;
}

function heroVisual() {
  // LPBF 적층 레이어 + 레이저 스캔 도식
  const layers = Array.from({ length: 9 }, (_, i) => {
    const y = 300 - i * 18;
    const w = 220 - Math.abs(4 - i) * 14;
    return `<rect x="${200 - w / 2}" y="${y}" width="${w}" height="12" rx="2" fill="${i === 8 ? '#ff8a3d' : '#1a2a47'}" stroke="${i === 8 ? '#ffa464' : '#38507c'}"/>`;
  }).join('');
  return h('div', {
    class: 'hero-visual',
    'aria-hidden': 'true',
    html: `<svg viewBox="0 0 400 400" fill="none">
      <circle cx="200" cy="200" r="190" stroke="#26375a" stroke-dasharray="4 8"/>
      <circle cx="200" cy="200" r="140" stroke="#26375a"/>
      <path d="M200 40 L200 150" stroke="#ff8a3d" stroke-width="2"/>
      <path d="M200 40 L160 150 M200 40 L240 150" stroke="#ff8a3d" stroke-opacity=".35"/>
      <rect x="170" y="22" width="60" height="22" rx="4" fill="#14213a" stroke="#38507c"/>
      <text x="200" y="37" fill="#a9b5c7" font-size="11" font-family="monospace" text-anchor="middle">LASER</text>
      ${layers}
      <rect x="70" y="316" width="260" height="16" rx="2" fill="#26375a"/>
      <text x="200" y="360" fill="#8d9bb0" font-size="12" font-family="monospace" text-anchor="middle">LAYER-BY-LAYER · 30–60 μm</text>
    </svg>`,
  });
}

function renderHero({ profile, projects, parameters }) {
  $('#brand').replaceChildren(profile.name, h('small', {}, profile.role));
  const years = careerYears(profile.career);
  const stats = [
    { value: projects.length, unit: '건', label: '프로젝트' },
    { value: parameters.length, unit: '건', label: '파라미터 연구' },
    { value: years, unit: '년', label: `${profile.career.label} (${profile.career.start} ~ ${profile.career.end})` },
  ];

  $('#hero-content').replaceChildren(
    h('div', { class: 'hero-grid' },
      h('div', {},
        h('p', { class: 'hero-eyebrow' }, profile.target),
        h('h1', { id: 'hero-name' }, profile.name, h('span', { class: 'name-en' }, profile.nameEn)),
        h('p', { class: 'hero-role' }, profile.role, h('span', { class: 'role-en' }, profile.roleEn)),
        h('p', { class: 'hero-tagline' }, profile.tagline),
        h('ul', { class: 'keywords', 'aria-label': '핵심 키워드' }, profile.keywords.map((k) => h('li', { class: 'keyword' }, k))),
        h('div', { class: 'hero-actions' },
          h('a', { class: 'btn btn-primary', href: '#featured' }, '대표 프로젝트 보기', icon('arrow')),
          h('a', { class: 'btn', href: '#contact' }, '연락하기'),
          isFilled(profile.resume) && h('a', { class: 'btn', href: resolveSrc(profile.resume), download: '' }, icon('download'), '이력서 PDF')
        )
      ),
      heroVisual()
    ),
    h('dl', { class: 'stats', 'aria-label': '숫자로 보는 역량' },
      stats.map((s) =>
        h('div', { class: 'stat' },
          h('dt', { class: 'stat-label' }, s.label),
          h('dd', { class: 'stat-value' }, String(s.value), h('span', {}, s.unit))
        )
      )
    )
  );
}

/* ---------- Featured ---------- */

function renderFeatured(items) {
  const featured = items.filter((i) => i.featured).sort((a, b) => (a.featuredOrder ?? 99) - (b.featuredOrder ?? 99));
  $('#featured-list').replaceChildren(
    ...featured.map((item, idx) => {
      const star = [
        ['S/T', item.summary],
        ['A', item.role],
        ['R', item.result],
      ].filter(([, v]) => isFilled(v));
      return h('article', { class: 'feature', 'data-id': item.id },
        h('div', { style: 'position:relative' },
          badges(item),
          mediaFrame(cardCandidates(item), { alt: `${item.title} 대표 이미지`, label: item.nda ? 'NDA · 이미지 비공개' : '이미지 준비 중', nda: item.nda, eager: idx === 0 })
        ),
        h('div', { class: 'feature-body' },
          h('p', { class: 'feature-rank' }, h('b', {}, String(idx + 1).padStart(2, '0')), item.featuredReason || ''),
          h('h3', { class: 'feature-title' },
            h('button', { class: 'card-link', type: 'button', 'aria-haspopup': 'dialog', onclick: (e) => openDetail(item.id, e.currentTarget) }, item.title)
          ),
          item.period && h('p', { class: 'card-period' }, item.period),
          star.length
            ? h('dl', { class: 'feature-star' }, star.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v))))
            : null,
          tagList(item.tags),
          h('span', { class: 'feature-more', 'aria-hidden': 'true' }, '자세히 보기', icon('arrow'))
        )
      );
    })
  );
}

/* ---------- Cards ---------- */

function card(item) {
  return h('article', { class: 'card', 'data-id': item.id, 'data-tags': (item.tags || []).join('|') },
    h('div', { style: 'position:relative' },
      badges(item, { featured: item.featured }),
      mediaFrame(cardCandidates(item), { alt: `${item.title} 대표 이미지`, label: item.nda ? 'NDA · 이미지 비공개' : '이미지 준비 중', nda: item.nda })
    ),
    h('div', { class: 'card-body' },
      item.period && h('p', { class: 'card-period' }, item.period),
      h('h3', { class: 'card-title' },
        h('button', { class: 'card-link', type: 'button', 'aria-haspopup': 'dialog', onclick: (e) => openDetail(item.id, e.currentTarget) }, item.title)
      ),
      isFilled(item.summary) && h('p', { class: 'card-summary' }, item.summary),
      tagList(item.tags)
    )
  );
}

function renderGrid(section, items) {
  $(`#${section}-list`).replaceChildren(...items.map(card));
  updateCount(section);
}

function updateCount(section) {
  const cards = [...document.querySelectorAll(`#${section}-list .card`)];
  const visible = cards.filter((c) => !c.hidden).length;
  $(`#${section}-count`).textContent = state.tag ? `${visible} / ${cards.length}` : `${cards.length}`;
  let empty = $(`#${section}-list + .filter-empty`);
  if (!visible && cards.length) {
    if (!empty) {
      empty = h('p', { class: 'star-empty filter-empty' });
      $(`#${section}-list`).after(empty);
    }
    empty.textContent = `‘${state.tag}’ 태그에 해당하는 항목이 없습니다.`;
  } else if (empty) {
    empty.remove();
  }
}

/* ---------- Tag filter ---------- */

function renderFilter() {
  const all = WORK_SECTIONS.flatMap((s) => state.data[s]);
  const countOf = (tag) => all.filter((i) => (i.tags || []).includes(tag)).length;
  const chip = (tag, label) =>
    h('button', { class: 'chip', type: 'button', 'data-tag': tag ?? '', 'aria-pressed': String(state.tag === tag), onclick: () => applyFilter(tag) },
      label,
      h('span', { class: 'chip-count' }, String(tag ? countOf(tag) : all.length))
    );
  $('#filter-bar').replaceChildren(chip(null, '전체'), ...FILTER_TAGS.map((t) => chip(t, t)));
}

function applyFilter(tag) {
  state.tag = state.tag === tag ? null : tag;
  syncFilter();
}

/** 현재 state.tag 를 카드 · 칩 · 카운트에 반영 */
function syncFilter() {
  document.querySelectorAll('#filter-bar .chip').forEach((c) => {
    c.setAttribute('aria-pressed', String((c.dataset.tag || null) === state.tag));
  });
  for (const section of WORK_SECTIONS) {
    document.querySelectorAll(`#${section}-list .card`).forEach((c) => {
      c.hidden = !!state.tag && !c.dataset.tags.split('|').includes(state.tag);
    });
    updateCount(section);
  }
  const status = $('#filter-status');
  if (state.tag) {
    const n = document.querySelectorAll('.card-grid .card:not([hidden])').length;
    status.replaceChildren(
      `‘${state.tag}’ 태그 ${n}건 표시 중 (Projects · Parameter · 개인 작품)`,
      h('button', { type: 'button', onclick: () => applyFilter(null) }, '필터 해제')
    );
  } else {
    status.textContent = '';
  }
}

/* ---------- Certifications ---------- */

function renderCerts({ training, awards, note }) {
  const certItem = (c, award) => {
    const src = [c.image].flatMap(thumbCandidates).filter(hasImage);
    const full = [c.image].filter(hasImage);
    const thumb = full.length
      ? h('button', { class: 'cert-thumb', type: 'button', 'aria-label': `${c.title} 증서 이미지 크게 보기`, onclick: (e) => openLightbox([{ src: full[0], alt: `${c.title} 증서`, caption: c.title }], 0, e.currentTarget) },
          mediaFrame(src, { alt: '', label: '' }))
      : h('div', { class: 'cert-thumb is-empty' }, placeholder('', false));
    return h('li', { class: `cert${award ? ' is-award' : ''}`, 'data-id': c.id },
      thumb,
      h('div', {},
        h('p', { class: 'cert-title' }, c.title),
        (c.issuer || c.date) && h('p', { class: 'cert-issuer' }, [c.issuer, c.date].filter(Boolean).join(' · '))
      )
    );
  };
  const group = (title, list, award) =>
    h('div', { class: 'cert-group' },
      h('h3', {}, title, h('span', { class: 'count' }, `${list.length}건`)),
      h('ul', { class: 'cert-list' }, list.map((c) => certItem(c, award)))
    );
  $('#certs-content').replaceChildren(
    ...[
      group('교육 · 수료', training, false),
      group('수상', awards, true),
      isFilled(note) && h('p', { class: 'cert-note' }, icon('info'), note),
    ].filter(Boolean)
  );
}

/* ---------- Contact / Footer ---------- */

function renderContact(profile) {
  $('#contact-body').replaceChildren(
    ...[
      isFilled(profile.contactMessage) && h('p', { class: 'contact-lead' }, profile.contactMessage),
      h('div', { class: 'contact-list' },
        h('a', { class: 'contact-item', href: `mailto:${profile.email}` },
          icon('mail'), h('span', {}, h('small', {}, 'E-mail'), h('strong', {}, profile.email))),
        h('a', { class: 'contact-item', href: profile.linkedin, target: '_blank', rel: 'noopener noreferrer' },
          icon('linkedin'), h('span', {}, h('small', {}, 'LinkedIn (새 창)'), h('strong', {}, String(profile.linkedin).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))))
      ),
      isFilled(profile.resume) &&
        h('div', { class: 'contact-actions' }, h('a', { class: 'btn btn-primary', href: resolveSrc(profile.resume), download: '' }, icon('download'), '이력서 PDF 다운로드')),
    ].filter(Boolean)
  );
  $('#footer-content').replaceChildren(
    h('span', {}, `© ${new Date().getFullYear()} ${profile.name} (${profile.nameEn})`),
    h('span', {}, `${profile.role} · ${profile.keywords.join(' · ')}`),
    h('button', { class: 'admin-entry', type: 'button', onclick: openAdmin }, '관리자')
  );
}

/* ---------- Detail modal ---------- */

const modal = () => $('#detail-modal');
let modalReturnFocus = null;
let slider = null;

function openDetail(id, trigger) {
  const item = state.byId.get(id);
  if (!item) return;
  modalReturnFocus = trigger || document.activeElement;

  const star = [
    { key: 'S·T', title: '문제 · 상황', text: item.summary },
    { key: 'A', title: '접근 · 역할', text: item.role },
    { key: 'R', title: '결과', text: item.result },
  ].filter((s) => isFilled(s.text));

  const body = $('#modal-body');
  body.replaceChildren(
    h('button', { class: 'modal-close', type: 'button', 'aria-label': '닫기', onclick: () => modal().close() }, icon('close')),
    h('header', { class: 'modal-head' },
      h('p', { class: 'modal-category' }, CATEGORY_LABEL[item.category] || item.category),
      h('h2', { id: 'modal-title' }, item.title),
      h('div', { class: 'modal-meta' },
        item.period && h('span', { class: 'period' }, item.period),
        item.nda && h('span', { class: 'badge badge-nda' }, icon('lock'), 'NDA · 대체 이미지'),
        tagList(item.tags)
      ),
      item.nda && h('p', { class: 'nda-note' }, item.ndaNote || 'NDA로 인해 실제 부품 대신 대체 이미지를 사용했습니다.')
    ),
    buildSlider(item),
    star.length
      ? h('div', { class: 'star' },
          star.map((s) => h('section', { class: 'star-block' }, h('h3', {}, h('b', {}, s.key), s.title), h('p', {}, s.text))))
      : h('p', { class: 'star-empty' }, '상세 내용은 면접에서 자세히 설명드리겠습니다.')
  );

  document.body.classList.add('is-locked');
  modal().showModal();
  body.scrollTop = 0;
  modal().scrollTop = 0;
}

function buildSlider(item) {
  const slides = [];
  if (item.youtube) slides.push({ type: 'video', id: item.youtube, poster: hasImage(item.poster) ? item.poster : `https://i.ytimg.com/vi/${item.youtube}/hqdefault.jpg` });
  const images = galleryImages(item);
  images.forEach((src, i) => slides.push({ type: 'image', src, index: i }));
  if (!slides.length) slides.push({ type: 'empty' });

  const lightboxItems = images.map((src, i) => ({ src, alt: `${item.title} 이미지 ${i + 1}`, caption: `${item.title} (${i + 1}/${images.length})` }));

  const nodes = slides.map((s, i) => {
    let content;
    if (s.type === 'video') {
      content = h('button', { class: 'yt-poster', type: 'button', 'aria-label': `${item.title} 영상 재생 (YouTube)`, onclick: (e) => loadYouTube(e.currentTarget, s.id, item.title) },
        h('img', { src: resolveSrc(s.poster), alt: '', loading: 'lazy', decoding: 'async' }),
        h('span', { class: 'yt-play' }, h('span', {}, icon('play'), 'YouTube 영상 재생'))
      );
    } else if (s.type === 'image') {
      content = h('button', { class: 'slide-zoom', type: 'button', 'aria-label': `이미지 ${s.index + 1} 크게 보기`, onclick: (e) => openLightbox(lightboxItems, s.index, e.currentTarget) },
        h('img', { src: resolveSrc(s.src), alt: `${item.title} 이미지 ${s.index + 1}`, loading: 'lazy', decoding: 'async' })
      );
    } else {
      content = placeholder(item.nda ? 'NDA · 이미지 비공개' : '이미지 준비 중', item.nda);
    }
    return h('div', { class: 'slide', role: 'group', 'aria-roledescription': 'slide', 'aria-label': `${i + 1} / ${slides.length}`, hidden: i !== 0 }, content);
  });

  const counter = h('span', { class: 'slider-counter', 'aria-live': 'polite' });
  const go = (delta) => show((current + delta + nodes.length) % nodes.length);
  let current = 0;
  const show = (i) => {
    nodes[current].hidden = true;
    current = i;
    nodes[current].hidden = false;
    counter.textContent = `${current + 1} / ${nodes.length}`;
  };
  counter.textContent = `1 / ${nodes.length}`;
  slider = nodes.length > 1 ? { go } : null;

  const multi = nodes.length > 1;
  return h('div', { class: 'slider', role: 'region', 'aria-roledescription': 'carousel', 'aria-label': '사진 · 영상' },
    h('div', { class: 'slider-stage' }, nodes),
    h('div', { class: 'slider-nav', hidden: !multi },
      h('button', { class: 'slider-btn', type: 'button', 'aria-label': '이전', onclick: () => go(-1) }, icon('prev')),
      counter,
      h('button', { class: 'slider-btn', type: 'button', 'aria-label': '다음', onclick: () => go(1) }, icon('next'))
    ),
    images.length ? h('p', { class: 'slider-hint' }, '이미지를 클릭하면 크게 볼 수 있습니다.') : null
  );
}

/** YouTube 지연 로딩: 클릭 시에만 iframe 생성 */
function loadYouTube(button, id, title) {
  const iframe = h('iframe', {
    src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0`,
    title: `${title} — YouTube 영상`,
    allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
    allowfullscreen: true,
    referrerpolicy: 'strict-origin-when-cross-origin',
  });
  // iframe 안으로 포커스가 들어가면 ESC 가 모달에 전달되지 않으므로 슬라이더 영역에 포커스를 둔다
  const region = button.closest('.slider');
  button.replaceWith(iframe);
  region.tabIndex = -1;
  region.focus({ preventScroll: true });
}

/* ---------- Lightbox ---------- */

const lightbox = () => $('#lightbox');
const lb = { items: [], index: 0, returnFocus: null };

function openLightbox(items, index, trigger) {
  if (!items.length) return;
  lb.items = items;
  lb.index = index;
  lb.returnFocus = trigger || document.activeElement;
  renderLightbox();
  document.body.classList.add('is-locked');
  lightbox().showModal();
  $('.lightbox-close', lightbox()).focus();
}

function renderLightbox() {
  const it = lb.items[lb.index];
  const multi = lb.items.length > 1;
  $('#lightbox-body').replaceChildren(
    h('button', { class: 'lightbox-close', type: 'button', 'aria-label': '확대 보기 닫기', onclick: () => lightbox().close() }, icon('close')),
    h('figure', { class: 'lightbox-figure' }, h('img', { src: resolveSrc(it.src), alt: it.alt })),
    h('div', { class: 'lightbox-bar' },
      multi && h('button', { class: 'slider-btn', type: 'button', 'aria-label': '이전 이미지', onclick: () => stepLightbox(-1) }, icon('prev')),
      h('p', { class: 'lightbox-caption', 'aria-live': 'polite' }, it.caption),
      multi && h('button', { class: 'slider-btn', type: 'button', 'aria-label': '다음 이미지', onclick: () => stepLightbox(1) }, icon('next'))
    )
  );
}

function stepLightbox(delta) {
  lb.index = (lb.index + delta + lb.items.length) % lb.items.length;
  const focusedLabel = document.activeElement?.getAttribute('aria-label');
  renderLightbox();
  const again = focusedLabel && $(`#lightbox-body [aria-label="${focusedLabel}"]`);
  (again || $('.lightbox-close', lightbox())).focus();
}

/* ---------- Dialog wiring (ESC / 배경 클릭 / 방향키) ---------- */

function setupDialogs() {
  const m = modal();
  const l = lightbox();

  m.addEventListener('close', () => {
    $('#modal-body').replaceChildren(); // 재생 중인 영상 정지
    slider = null;
    if (!l.open) document.body.classList.remove('is-locked');
    modalReturnFocus?.focus();
  });
  l.addEventListener('close', () => {
    $('#lightbox-body').replaceChildren();
    if (!m.open) document.body.classList.remove('is-locked');
    lb.returnFocus?.focus();
  });

  // 배경(backdrop) 클릭 시 닫기
  for (const d of [m, l]) {
    d.addEventListener('click', (e) => {
      if (e.target === d || e.target.classList.contains('lightbox-inner') || e.target.classList.contains('lightbox-figure')) d.close();
    });
  }

  m.addEventListener('keydown', (e) => {
    if (!slider || e.target.closest('iframe')) return;
    if (e.key === 'ArrowLeft') { slider.go(-1); e.preventDefault(); }
    if (e.key === 'ArrowRight') { slider.go(1); e.preventDefault(); }
  });
  l.addEventListener('keydown', (e) => {
    if (lb.items.length < 2) return;
    if (e.key === 'ArrowLeft') { stepLightbox(-1); e.preventDefault(); }
    if (e.key === 'ArrowRight') { stepLightbox(1); e.preventDefault(); }
  });
}

/* ---------- Nav highlight ---------- */

function setupNav() {
  const links = [...document.querySelectorAll('.site-nav a')];
  const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
  const nav = $('.site-nav');
  const setActive = (id) => {
    links.forEach((a) => (a === map.get(id) ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
    // 모바일 가로 스크롤 내비에서 활성 링크가 보이도록 (페이지 스크롤에는 영향 없음)
    const active = map.get(id);
    if (!active || nav.scrollWidth <= nav.clientWidth) return;
    const nr = nav.getBoundingClientRect();
    const ar = active.getBoundingClientRect();
    if (ar.left < nr.left || ar.right > nr.right - 32) nav.scrollBy({ left: ar.left - nr.left - 24, behavior: 'smooth' });
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setActive(map.has(entry.target.id) ? entry.target.id : null);
      });
    },
    { rootMargin: '-45% 0px -50% 0px' }
  );
  document.querySelectorAll('main > section[id]').forEach((s) => observer.observe(s));

  // 페이지 맨 아래에서는 Contact 를 활성화
  window.addEventListener('scroll', () => {
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) setActive('contact');
  }, { passive: true });
}

/* ---------- Render all / Admin ---------- */

/** state.data 전체를 다시 그린다 (관리자 모드에서 수정 후에도 호출) */
function renderAll() {
  const data = state.data;
  state.byId = new Map(WORK_SECTIONS.flatMap((s) => data[s].map((item) => [item.id, item])));
  renderHero(data);
  renderFeatured(WORK_SECTIONS.flatMap((s) => data[s]));
  renderFilter();
  WORK_SECTIONS.forEach((s) => renderGrid(s, data[s]));
  syncFilter();
  renderCerts(data.certs);
  renderContact(data.profile);
  document.dispatchEvent(new CustomEvent('portfolio:rendered'));
}

/** 관리자 기능은 방문자에게 불필요하므로 버튼을 눌렀을 때만 js/admin.js · css/admin.css 를 불러온다 */
let adminLoading = null;
function openAdmin() {
  adminLoading ??= new Promise((resolve, reject) => {
    document.head.append(h('link', { rel: 'stylesheet', href: 'css/admin.css' }));
    const script = h('script', { src: 'js/admin.js' });
    script.onload = resolve;
    script.onerror = () => {
      adminLoading = null;
      reject(new Error('js/admin.js 를 불러오지 못했습니다.'));
    };
    document.head.append(script);
  });
  adminLoading.then(() => window.Admin.open()).catch((err) => alert(err.message));
}

/* ---------- Init ---------- */

async function init() {
  try {
    const data = await loadData();
    state.data = data;
    state.images = Array.isArray(data.images) ? new Set(data.images) : null;

    renderAll();
    document.documentElement.classList.remove('is-loading');
    if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
    setupDialogs();
    setupNav();
    if (location.hash === '#admin' || sessionStorageGet('portfolio-admin') === '1') openAdmin();
  } catch (err) {
    document.documentElement.classList.remove('is-loading');
    console.error(err);
    $('#main').prepend(
      h('p', { class: 'container load-error', role: 'alert' },
        '콘텐츠를 불러오지 못했습니다. 로컬에서는 `python -m http.server` 로 실행하거나 `python scripts/build_data.py` 로 data/bundle.js 를 생성하세요.')
    );
  }
}

function sessionStorageGet(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

init();
