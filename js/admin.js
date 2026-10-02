'use strict';

/* ==========================================================
   관리자 모드
   - 비밀번호로 편집 화면 잠금 해제 (data/admin.json 의 PBKDF2 해시와 비교)
   - 콘텐츠 · 사진 등록/수정/삭제/순서 변경 → 화면에 즉시 미리보기
   - "저장 · 게시" 시 GitHub API 로 저장소에 커밋 → GitHub Pages 가 다시 배포
   정적 사이트라 비밀번호는 화면 잠금일 뿐이고, 실제 저장 권한은 GitHub 토큰에 있다.
   main.js 의 state · h · icon · renderAll 등을 그대로 사용한다.
   ========================================================== */

(() => {
  const SESSION_KEY = 'portfolio-admin';
  const TOKEN_KEY = 'portfolio-admin-token';
  const SECTION_CATEGORY = { projects: 'project', parameters: 'parameter', personal: 'personal' };
  const SECTION_LABEL = { projects: 'Projects', parameters: 'Parameter Development', personal: '개인 작품' };
  const CERT_GROUPS = { training: '교육 · 수료', awards: '수상' };
  const IMG_FULL = 1600;
  const IMG_THUMB = 720;
  const PBKDF2_ITERATIONS = 150000;
  const IMAGE_FILE_RE = /^assets\/img\/[^/]+\.(jpe?g|png|webp|gif|avif)$/i;

  const A = {
    config: null, // data/admin.json
    configLoaded: false,
    configDirty: false,
    active: false,
    baseline: {}, // 파일명 → JSON 문자열 (마지막으로 불러오거나 저장한 상태)
    uploads: new Map(), // 경로 → Blob (아직 게시 전)
    saving: false,
  };

  /* ---------- storage ---------- */

  const store = (kind) => ({
    get: (k) => { try { return window[kind].getItem(k); } catch { return null; } },
    set: (k, v) => { try { window[kind].setItem(k, v); } catch { /* 저장 불가 환경 */ } },
    del: (k) => { try { window[kind].removeItem(k); } catch { /* noop */ } },
  });
  const session = store('sessionStorage');
  const local = store('localStorage');

  const getToken = () => session.get(TOKEN_KEY) || local.get(TOKEN_KEY) || '';
  function setToken(token, remember) {
    session.del(TOKEN_KEY);
    local.del(TOKEN_KEY);
    if (token) (remember ? local : session).set(TOKEN_KEY, token);
  }

  /* ---------- config / password ---------- */

  function defaultRepo() {
    // https://<owner>.github.io/<repo>/ 에서 저장소 추정
    const m = location.hostname.match(/^([^.]+)\.github\.io$/);
    const repo = location.pathname.split('/').filter(Boolean)[0];
    return m && repo ? `${m[1]}/${repo}` : 'pycode1094/sundojang';
  }

  const repoInfo = () => ({ repo: A.config?.repo || defaultRepo(), branch: A.config?.branch || 'main' });

  async function loadConfig() {
    if (A.configLoaded) return A.config;
    let cfg = null;
    if (location.protocol === 'file:') {
      cfg = window.PORTFOLIO_DATA?.admin ?? null;
    } else {
      const res = await fetch('data/admin.json', { cache: 'no-cache' }).catch(() => null);
      if (res?.ok) cfg = await res.json().catch(() => null);
    }
    A.config = cfg;
    A.configLoaded = true;
    return cfg;
  }

  const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  const unhex = (str) => new Uint8Array(str.match(/../g).map((b) => parseInt(b, 16)));

  async function pbkdf2(password, saltHex, iterations) {
    if (!crypto?.subtle) throw new Error('이 브라우저(또는 http 주소)에서는 암호화 기능을 쓸 수 없습니다. https 주소에서 열어주세요.');
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(saltHex), iterations }, key, 256);
    return hex(new Uint8Array(bits));
  }

  async function makePasswordRecord(password) {
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    return { algorithm: 'PBKDF2-SHA256', iterations: PBKDF2_ITERATIONS, salt, hash: await pbkdf2(password, salt, PBKDF2_ITERATIONS) };
  }

  async function checkPassword(password) {
    const rec = A.config?.password;
    if (!rec?.hash) return false;
    return (await pbkdf2(password, rec.salt, rec.iterations)) === rec.hash;
  }

  /* ---------- GitHub API ---------- */

  function github(token) {
    const { repo } = repoInfo();
    return async (path, { method = 'GET', body } = {}) => {
      const res = await fetch(`https://api.github.com/repos/${repo}${path ? `/${path}` : ''}`, {
        method,
        cache: 'no-store',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      }).catch(() => {
        throw new Error('GitHub 에 연결하지 못했습니다. 인터넷 연결을 확인하세요.');
      });
      if (!res.ok) {
        const detail = await res.json().then((j) => j.message).catch(() => '');
        const msg = {
          401: '토큰이 올바르지 않거나 만료되었습니다.',
          403: '토큰 권한이 부족합니다. (Contents: Read and write 필요)',
          404: `저장소(${repo})를 찾을 수 없거나 토큰이 이 저장소에 접근할 수 없습니다.`,
          409: '저장소가 그 사이에 바뀌었습니다. 다시 저장해 주세요.',
          422: '저장소가 그 사이에 바뀌었습니다. 다시 저장해 주세요.',
        }[res.status] || `GitHub 오류 (${res.status})`;
        throw new Error(detail ? `${msg}\n(${detail})` : msg);
      }
      return res.status === 204 ? null : res.json();
    };
  }

  async function verifyToken(token) {
    const repoData = await github(token)('');
    if (repoData.permissions && !repoData.permissions.push) throw new Error('이 토큰으로는 저장소에 쓸 수 없습니다.');
    return repoData;
  }

  const blobToBase64 = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });

  const decodeBase64Utf8 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

  /* ---------- change tracking ---------- */

  function snapshot() {
    for (const f of DATA_FILES) A.baseline[f] = JSON.stringify(state.data[f]);
  }

  const changedData = () => DATA_FILES.filter((f) => JSON.stringify(state.data[f]) !== A.baseline[f]);

  /** 데이터가 참조하는 파일 경로 (WebP 는 썸네일 포함) */
  function referencedPaths(data) {
    const set = new Set();
    const add = (p) => {
      if (typeof p !== 'string' || !p.startsWith('assets/')) return;
      set.add(p);
      if (p.endsWith('.webp') && !p.endsWith('.thumb.webp')) set.add(p.replace(/\.webp$/, '.thumb.webp'));
    };
    WORK_SECTIONS.forEach((s) => data[s].forEach((item) => { (item.images || []).forEach(add); add(item.poster); }));
    [...data.certs.training, ...data.certs.awards].forEach((c) => add(c.image));
    add(data.profile.resume);
    return set;
  }

  const baselineData = () => Object.fromEntries(DATA_FILES.map((f) => [f, JSON.parse(A.baseline[f])]));

  function pendingUploads() {
    const refs = referencedPaths(state.data);
    return [...A.uploads].filter(([path]) => refs.has(path));
  }

  const hasUnsaved = () => changedData().length > 0 || A.configDirty || pendingUploads().length > 0;

  function registerUpload(path, blob) {
    A.uploads.set(path, blob);
    const old = state.blobUrls.get(path);
    if (old) URL.revokeObjectURL(old);
    state.blobUrls.set(path, URL.createObjectURL(blob));
    if (state.images && IMAGE_FILE_RE.test(path)) state.images.add(path);
  }

  function changed() {
    renderAll();
    updateStatus();
  }

  /* ---------- image processing ---------- */

  const stamp = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

  async function encodeImage(source, maxW, maxH, quality) {
    let bitmap;
    try {
      bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
    } catch {
      throw new Error(`${source.name || '이미지'}: 이 형식은 변환할 수 없습니다. JPG · PNG · WebP 로 올려주세요.`);
    }
    const scale = Math.min(1, maxW / bitmap.width, maxH / bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    let blob = await toBlob(canvas, 'image/webp', quality);
    if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', quality); // WebP 인코딩 미지원 브라우저
    return blob;
  }

  /** 사진 1장 → WebP(1600px) + 썸네일(720px) 등록, 원본 경로 반환 */
  async function addImage(source, baseName) {
    const full = await encodeImage(source, IMG_FULL, IMG_FULL, 0.82);
    const ext = full.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `assets/img/${baseName}-${stamp()}.${ext}`;
    registerUpload(path, full);
    if (ext === 'webp') registerUpload(path.replace(/\.webp$/, '.thumb.webp'), await encodeImage(source, IMG_THUMB, IMG_THUMB * 2, 0.76));
    return path;
  }

  /** YouTube 썸네일을 받아 로컬 포스터로 저장 (방문자가 YouTube 서버에 요청하지 않도록) */
  async function addYouTubePoster(videoId, baseName) {
    for (const q of ['maxresdefault', 'hqdefault']) {
      const res = await fetch(`https://i.ytimg.com/vi/${videoId}/${q}.jpg`).catch(() => null);
      if (res?.ok) return addImage(await res.blob(), `${baseName}-yt`);
    }
    return '';
  }

  function parseYouTube(value) {
    const v = value.trim();
    if (!v) return '';
    if (/^[\w-]{11}$/.test(v)) return v;
    const m = v.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/);
    return m ? m[1] : null;
  }

  /* ---------- UI helpers ---------- */

  let dialogSeq = 0;

  function openDialog({ title, body, footer, wide = false, onClose }) {
    const id = `admin-dialog-title-${++dialogSeq}`;
    const dialog = h('dialog', { class: `admin-dialog${wide ? ' is-wide' : ''}`, 'aria-labelledby': id },
      h('div', { class: 'admin-dialog-head' },
        h('h2', { id }, title),
        h('button', { class: 'admin-icon-btn', type: 'button', 'aria-label': '닫기', onclick: () => dialog.close() }, icon('close'))
      ),
      h('div', { class: 'admin-dialog-body' }, body),
      footer && h('div', { class: 'admin-dialog-foot' }, footer)
    );
    dialog.addEventListener('close', () => {
      dialog.remove();
      if (!document.querySelector('dialog[open]')) document.body.classList.remove('is-locked');
      onClose?.();
    });
    document.body.append(dialog);
    document.body.classList.add('is-locked');
    dialog.showModal();
    return dialog;
  }

  /** form 을 감싼 대화상자: submit 시 handler 실행, 오류는 대화상자 안에 표시 */
  function formDialog({ title, fields, submitLabel = '적용', extraActions = [], wide = true, note, onSubmit }) {
    const error = h('p', { class: 'admin-error', role: 'alert', hidden: true });
    const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, submitLabel);
    const form = h('form', { class: 'admin-form', novalidate: true },
      note && h('p', { class: 'admin-note' }, note),
      fields,
      error,
      h('div', { class: 'admin-dialog-foot' },
        ...extraActions,
        h('span', { class: 'admin-spacer' }),
        h('button', { class: 'btn', type: 'button', onclick: () => dialog.close() }, '취소'),
        submit
      )
    );
    const dialog = openDialog({ title, body: form, wide });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      error.hidden = true;
      if (!form.reportValidity()) return;
      submit.disabled = true;
      const label = submit.textContent;
      submit.textContent = '처리 중…';
      try {
        if ((await onSubmit(form)) !== false) dialog.close();
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
      } finally {
        submit.disabled = false;
        submit.textContent = label;
      }
    });
    dialog.showError = (msg) => { error.textContent = msg; error.hidden = !msg; };
    return dialog;
  }

  let fieldSeq = 0;
  function field(label, control, hint) {
    const id = control.id || `admin-f-${++fieldSeq}`;
    control.id = id;
    return h('div', { class: 'admin-field' },
      h('label', { for: id }, label),
      control,
      hint && h('p', { class: 'admin-hint' }, hint)
    );
  }

  const input = (name, value = '', attrs = {}) => h('input', { name, value: value ?? '', type: 'text', autocomplete: 'off', ...attrs });
  function textarea(name, value = '', attrs = {}) {
    const el = h('textarea', { name, rows: 4, ...attrs });
    el.value = value ?? '';
    return el;
  }
  function checkbox(name, checked, label) {
    return h('label', { class: 'admin-check' }, h('input', { type: 'checkbox', name, checked: !!checked }), label);
  }

  const todoToEmpty = (v) => (isFilled(v) ? v : '');
  const emptyToTodo = (v) => (v.trim() ? v.trim() : 'TODO');
  const splitList = (v) => v.split(',').map((s) => s.trim()).filter(Boolean);

  let toastTimer = null;
  function toast(message, kind = 'info') {
    let el = document.querySelector('.admin-toast');
    if (!el) {
      el = h('div', { class: 'admin-toast', role: 'status', 'aria-live': 'polite' });
      document.body.append(el);
    }
    el.textContent = message;
    el.dataset.kind = kind;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), kind === 'error' ? 9000 : 5000);
  }

  /* ---------- image manager (편집 폼 안의 사진 목록) ---------- */

  function imageManager({ getBaseName, initial = [], single = false }) {
    // 저장소에 아직 없는 예약 경로(placeholder)는 화면에 보이지 않게 보존
    let images = initial.filter((p) => hasImage(p));
    const reserved = initial.filter((p) => !hasImage(p));
    const list = h('ul', { class: 'admin-images' });
    const status = h('p', { class: 'admin-hint', 'aria-live': 'polite' });
    const fileInput = h('input', { type: 'file', accept: 'image/*', multiple: !single, class: 'admin-file' });

    function render() {
      list.replaceChildren(
        ...images.map((path, i) =>
          h('li', { class: 'admin-image' },
            h('img', { src: resolveSrc(thumbCandidates(path).find((p) => hasImage(p)) || path), alt: `사진 ${i + 1}` }),
            h('div', { class: 'admin-image-tools' },
              !single && h('button', { type: 'button', class: 'admin-icon-btn', 'aria-label': `사진 ${i + 1} 앞으로`, disabled: i === 0, onclick: () => move(i, -1) }, icon('prev')),
              !single && h('button', { type: 'button', class: 'admin-icon-btn', 'aria-label': `사진 ${i + 1} 뒤로`, disabled: i === images.length - 1, onclick: () => move(i, 1) }, icon('next')),
              h('button', { type: 'button', class: 'admin-icon-btn is-danger', 'aria-label': `사진 ${i + 1} 삭제`, onclick: () => { images.splice(i, 1); render(); } }, icon('close'))
            ),
            i === 0 && !single && h('span', { class: 'admin-image-badge' }, '대표')
          )
        )
      );
    }

    function move(i, delta) {
      const j = i + delta;
      [images[i], images[j]] = [images[j], images[i]];
      render();
    }

    async function addFiles(files) {
      const base = getBaseName();
      if (!base) return;
      const list = [...files].filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
      if (!list.length) return;
      const errors = [];
      for (const [i, file] of (single ? list.slice(0, 1) : list).entries()) {
        status.textContent = `사진 변환 중… (${i + 1}/${list.length})`;
        try {
          const path = await addImage(file, base);
          images = single ? [path] : [...images, path];
          render();
        } catch (err) {
          errors.push(err.message);
        }
      }
      status.textContent = errors.length ? errors.join(' / ') : '';
    }

    fileInput.addEventListener('change', () => {
      addFiles(fileInput.files);
      fileInput.value = '';
    });

    const drop = h('div', { class: 'admin-drop' },
      icon('image'),
      h('span', {}, single ? '사진을 끌어다 놓거나 ' : '사진들을 끌어다 놓거나 '),
      h('button', { type: 'button', class: 'admin-link', onclick: () => fileInput.click() }, single ? '파일 선택' : '파일 선택 (여러 장 가능)'),
      fileInput
    );
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('is-over');
      addFiles(e.dataTransfer.files);
    });

    render();
    return {
      element: h('div', { class: 'admin-image-manager' }, list, drop, status,
        h('p', { class: 'admin-hint' }, '자동으로 WebP(최대 1600px)와 카드용 썸네일로 변환됩니다.' + (single ? '' : ' 첫 번째 사진이 카드 대표 이미지입니다.'))),
      // 실제 사진이 생기면 예약 경로는 더 이상 필요 없음
      value: () => (images.length ? [...images] : [...reserved]),
    };
  }

  /* ---------- editors ---------- */

  const findSection = (id) => WORK_SECTIONS.find((s) => state.data[s].some((i) => i.id === id));
  const allIds = () => new Set([
    ...WORK_SECTIONS.flatMap((s) => state.data[s].map((i) => i.id)),
    ...state.data.certs.training.map((c) => c.id),
    ...state.data.certs.awards.map((c) => c.id),
  ]);

  function editItem(section, id) {
    const list = state.data[section];
    const original = id ? list.find((i) => i.id === id) : null;
    const draft = original
      ? structuredClone(original)
      : { id: `${SECTION_CATEGORY[section]}-${stamp()}`, title: '', category: SECTION_CATEGORY[section], period: '', tags: [], summary: 'TODO', role: 'TODO', result: 'TODO', images: [], youtube: '', nda: false, featured: false };

    const idInput = input('id', draft.id, { required: true, pattern: '[a-z0-9][a-z0-9\\-]*', readonly: !!original, spellcheck: 'false' });
    const tagsInput = input('tags', (draft.tags || []).join(', '), { placeholder: '예: LPBF, DfAM, 조선' });
    const quickTags = h('div', { class: 'admin-quick-tags' },
      FILTER_TAGS.map((t) =>
        h('button', {
          type: 'button',
          class: 'chip',
          'aria-pressed': String((draft.tags || []).includes(t)),
          onclick: (e) => {
            const tags = splitList(tagsInput.value);
            const on = tags.includes(t);
            tagsInput.value = (on ? tags.filter((x) => x !== t) : [...tags, t]).join(', ');
            e.currentTarget.setAttribute('aria-pressed', String(!on));
          },
        }, t)
      )
    );
    tagsInput.addEventListener('input', () => {
      const tags = splitList(tagsInput.value);
      quickTags.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(tags.includes(c.textContent))));
    });

    const gallery = imageManager({
      initial: draft.images || [],
      getBaseName: () => {
        if (!idInput.checkValidity()) {
          idInput.reportValidity();
          return '';
        }
        return idInput.value;
      },
    });

    const fields = [
      h('div', { class: 'admin-grid' },
        field('제목', input('title', draft.title, { required: true })),
        field('기간', input('period', draft.period, { placeholder: '예: 2023.10 ~ 2025.05' })),
        field('ID (영문 소문자·숫자·-)', idInput, original ? '사진 파일명에 쓰이므로 변경할 수 없습니다.' : '사진 파일명에 사용됩니다.')
      ),
      field('태그', tagsInput, '쉼표로 구분. 아래 버튼은 상단 필터에 쓰이는 태그입니다.'),
      quickTags,
      h('fieldset', { class: 'admin-fieldset' },
        h('legend', {}, '상세 내용 (STAR) — 비워두면 화면에 표시되지 않습니다'),
        field('문제 · 상황 (S·T) — 카드에도 첫 줄이 표시됩니다', textarea('summary', todoToEmpty(draft.summary), { rows: 3 })),
        field('접근 · 역할 (A)', textarea('role', todoToEmpty(draft.role))),
        field('결과 (R) — 가능하면 수치로', textarea('result', todoToEmpty(draft.result)))
      ),
      h('fieldset', { class: 'admin-fieldset' },
        h('legend', {}, '사진'),
        gallery.element
      ),
      field('YouTube 영상 (주소 또는 ID)', input('youtube', draft.youtube, { placeholder: 'https://youtu.be/...' }), '썸네일은 자동으로 저장되고, 방문자가 클릭할 때만 영상이 로드됩니다.'),
      h('div', { class: 'admin-grid' },
        h('div', { class: 'admin-field' },
          checkbox('nda', draft.nda, 'NDA 항목 (“NDA · 대체 이미지” 배지)'),
          input('ndaNote', draft.ndaNote || '', { placeholder: 'NDA 안내문 (예: NDA로 인해 대체 이미지 첨부)', 'aria-label': 'NDA 안내문' })
        ),
        h('div', { class: 'admin-field' },
          checkbox('featured', draft.featured, 'Featured (상단 대표 프로젝트)'),
          h('div', { class: 'admin-inline' },
            input('featuredOrder', draft.featuredOrder ?? '', { type: 'number', min: 1, max: 99, placeholder: '순서', 'aria-label': 'Featured 순서', style: 'max-width:90px' }),
            input('featuredReason', draft.featuredReason || '', { placeholder: '강조 문구 (예: 조선 분야 직접 경험)', 'aria-label': 'Featured 강조 문구' })
          )
        )
      ),
    ];

    const extraActions = original
      ? [h('button', {
          class: 'btn admin-danger',
          type: 'button',
          onclick: () => {
            if (!confirm(`‘${original.title}’ 항목을 삭제할까요?\n(저장 · 게시 전까지는 사이트에 반영되지 않습니다)`)) return;
            state.data[section] = state.data[section].filter((i) => i !== original);
            dialog.close();
            changed();
          },
        }, '삭제')]
      : [];

    const dialog = formDialog({
      title: original ? `${SECTION_LABEL[section]} 수정` : `${SECTION_LABEL[section]} 새 항목`,
      fields,
      extraActions,
      note: '적용하면 화면에 바로 미리보기됩니다. 사이트에 반영하려면 하단 바의 ‘저장 · 게시’를 누르세요.',
      onSubmit: async (form) => {
        const v = (name) => form.elements[name].value;
        const newId = v('id').trim();
        if (!original && allIds().has(newId)) throw new Error('이미 사용 중인 ID 입니다.');
        const youtube = parseYouTube(v('youtube'));
        if (youtube === null) throw new Error('YouTube 주소를 인식하지 못했습니다. 영상 주소나 11자리 ID 를 넣어주세요.');

        const next = {
          ...draft,
          id: newId,
          title: v('title').trim(),
          period: v('period').trim(),
          tags: splitList(v('tags')),
          summary: emptyToTodo(v('summary')),
          role: emptyToTodo(v('role')),
          result: emptyToTodo(v('result')),
          images: gallery.value(),
          youtube: youtube || '',
          nda: form.elements.nda.checked,
          featured: form.elements.featured.checked,
        };
        const ndaNote = v('ndaNote').trim();
        if (ndaNote) next.ndaNote = ndaNote; else delete next.ndaNote;
        const order = parseInt(v('featuredOrder'), 10);
        if (Number.isFinite(order)) next.featuredOrder = order; else delete next.featuredOrder;
        const reason = v('featuredReason').trim();
        if (reason) next.featuredReason = reason; else delete next.featuredReason;

        // 영상이 바뀌면 썸네일(포스터)을 새로 저장
        if (!next.youtube) delete next.poster;
        else if (next.youtube !== original?.youtube || !hasImage(next.poster)) {
          dialog.showError('');
          next.poster = (await addYouTubePoster(next.youtube, next.id)) || undefined;
          if (!next.poster) delete next.poster;
        }

        if (original) state.data[section][state.data[section].indexOf(original)] = next;
        else state.data[section].unshift(next);
        changed();
        toast(original ? '수정 내용을 적용했습니다. ‘저장 · 게시’를 눌러야 사이트에 반영됩니다.' : '새 항목을 맨 앞에 추가했습니다. 카드의 ◀ ▶ 로 순서를 바꿀 수 있습니다.');
      },
    });
  }

  function moveItem(section, id, delta) {
    const list = state.data[section];
    const i = list.findIndex((it) => it.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    changed();
    document.querySelector(`#${section}-list .card[data-id="${CSS.escape(id)}"] .admin-tools button[data-move="${delta}"]`)?.focus();
  }

  function editCert(group, id) {
    const certs = state.data.certs;
    const original = id ? certs[group].find((c) => c.id === id) : null;
    const draft = original ? structuredClone(original) : { id: `${group === 'awards' ? 'award' : 'cert'}-${stamp()}`, title: '', issuer: '', date: '', image: '' };
    const gallery = imageManager({ initial: draft.image ? [draft.image] : [], single: true, getBaseName: () => draft.id });
    const groupSelect = h('select', { name: 'group' },
      Object.entries(CERT_GROUPS).map(([k, label]) => h('option', { value: k, selected: k === group }, label)));

    const extraActions = original
      ? [h('button', {
          class: 'btn admin-danger',
          type: 'button',
          onclick: () => {
            if (!confirm(`‘${original.title}’ 을(를) 삭제할까요?`)) return;
            certs[group] = certs[group].filter((c) => c !== original);
            dialog.close();
            changed();
          },
        }, '삭제')]
      : [];

    const dialog = formDialog({
      title: original ? '자격사항 수정' : '자격사항 추가',
      wide: false,
      extraActions,
      fields: [
        field('이름', input('title', draft.title, { required: true, placeholder: '예: Solidworks 기초 수료' })),
        h('div', { class: 'admin-grid' },
          field('분류', groupSelect),
          field('발급 기관', input('issuer', draft.issuer)),
          field('날짜', input('date', draft.date, { placeholder: '예: 2023.11' }))
        ),
        h('fieldset', { class: 'admin-fieldset' }, h('legend', {}, '증서 사진'), gallery.element),
      ],
      onSubmit: (form) => {
        const v = (name) => form.elements[name].value.trim();
        const next = { ...draft, title: v('title'), issuer: v('issuer'), date: v('date'), image: gallery.value()[0] || '' };
        const target = form.elements.group.value;
        if (original) {
          const idx = certs[group].indexOf(original);
          if (target === group) certs[group][idx] = next;
          else {
            certs[group].splice(idx, 1);
            certs[target].push(next);
          }
        } else {
          certs[target].push(next);
        }
        changed();
      },
    });
  }

  function editProfile() {
    const p = state.data.profile;
    let resume = p.resume || '';
    const resumeLabel = h('span', {});
    const renderResume = () => {
      resumeLabel.textContent = resume ? `현재: ${resume.split('/').pop()}` : '등록된 이력서 없음';
      removeResume.hidden = !resume;
    };
    const resumeInput = h('input', { type: 'file', accept: 'application/pdf', class: 'admin-file' });
    const removeResume = h('button', { type: 'button', class: 'admin-link', onclick: () => { resume = ''; renderResume(); } }, '이력서 제거');
    resumeInput.addEventListener('change', () => {
      const file = resumeInput.files[0];
      resumeInput.value = '';
      if (!file) return;
      if (file.type !== 'application/pdf') return alert('PDF 파일만 올릴 수 있습니다.');
      if (file.size > 20 * 1024 * 1024) return alert('20MB 이하 PDF 만 올릴 수 있습니다.');
      resume = `assets/resume-${stamp()}.pdf`;
      registerUpload(resume, file);
      renderResume();
    });
    renderResume();

    formDialog({
      title: '프로필 · 연락처 수정',
      fields: [
        h('div', { class: 'admin-grid' },
          field('이름', input('name', p.name, { required: true })),
          field('영문 이름', input('nameEn', p.nameEn)),
          field('상단 문구', input('target', p.target, { placeholder: 'For Hanwha Engine' }))
        ),
        h('div', { class: 'admin-grid' },
          field('직무', input('role', p.role, { required: true })),
          field('영문 직무', input('roleEn', p.roleEn))
        ),
        field('한 줄 소개', textarea('tagline', p.tagline, { rows: 2, required: true })),
        field('핵심 키워드', input('keywords', (p.keywords || []).join(', ')), '쉼표로 구분 (예: LPBF, DfAM, 공정 파라미터)'),
        h('div', { class: 'admin-grid' },
          field('경력 표시 이름', input('careerLabel', p.career?.label || '')),
          field('경력 시작 (YYYY.MM)', input('careerStart', p.career?.start || '', { required: true, pattern: '\\d{4}\\.\\d{2}' })),
          field('경력 종료 (YYYY.MM)', input('careerEnd', p.career?.end || '', { required: true, pattern: '\\d{4}\\.\\d{2}' }))
        ),
        h('div', { class: 'admin-grid' },
          field('이메일', input('email', p.email, { type: 'email', required: true })),
          field('LinkedIn 주소', input('linkedin', p.linkedin, { type: 'url', placeholder: 'https://www.linkedin.com/in/...' }))
        ),
        field('Contact 문구', textarea('contactMessage', p.contactMessage || '', { rows: 2 })),
        field('자격사항 하단 안내문', textarea('certNote', state.data.certs.note || '', { rows: 2 })),
        h('fieldset', { class: 'admin-fieldset' },
          h('legend', {}, '이력서 PDF (선택)'),
          h('div', { class: 'admin-inline' }, resumeLabel, h('button', { type: 'button', class: 'btn', onclick: () => resumeInput.click() }, 'PDF 선택'), removeResume, resumeInput)
        ),
      ],
      onSubmit: (form) => {
        const v = (name) => form.elements[name].value.trim();
        if (v('linkedin') && !/^https?:\/\//.test(v('linkedin'))) throw new Error('LinkedIn 주소는 https:// 로 시작해야 합니다.');
        state.data.profile = {
          ...p,
          name: v('name'),
          nameEn: v('nameEn'),
          role: v('role'),
          roleEn: v('roleEn'),
          target: v('target'),
          tagline: v('tagline'),
          keywords: splitList(v('keywords')),
          career: { label: v('careerLabel'), start: v('careerStart'), end: v('careerEnd') },
          email: v('email'),
          linkedin: v('linkedin'),
          contactMessage: v('contactMessage'),
          resume,
        };
        state.data.certs.note = v('certNote');
        changed();
      },
    });
  }

  function openSettings(reason) {
    const { repo, branch } = repoInfo();
    const tokenInput = input('token', getToken(), { type: 'password', placeholder: 'github_pat_...', autocomplete: 'off', spellcheck: 'false' });
    const remember = checkbox('remember', !!local.get(TOKEN_KEY), '이 브라우저에 토큰 기억 (공용 PC 에서는 끄세요)');
    const result = h('p', { class: 'admin-hint', 'aria-live': 'polite' });

    formDialog({
      title: '관리자 설정',
      submitLabel: '설정 저장',
      note: reason,
      fields: [
        h('fieldset', { class: 'admin-fieldset' },
          h('legend', {}, 'GitHub 연결 (저장 · 게시에 필요)'),
          h('div', { class: 'admin-grid' },
            field('저장소', input('repo', repo, { required: true, pattern: '[\\w.\\-]+\\/[\\w.\\-]+' })),
            field('브랜치', input('branch', branch, { required: true }))
          ),
          field('GitHub 토큰', tokenInput),
          remember,
          h('p', { class: 'admin-hint' },
            '토큰 만들기: ',
            h('a', { href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener noreferrer' }, 'GitHub → Fine-grained token 생성'),
            ' → Repository access: Only select repositories (이 저장소) → Permissions: Contents “Read and write”. 토큰은 이 브라우저에만 저장되며 저장소에 올라가지 않습니다.'),
          h('div', { class: 'admin-inline' },
            h('button', {
              type: 'button',
              class: 'btn',
              onclick: async () => {
                result.textContent = '확인 중…';
                const prev = A.config;
                A.config = { ...(A.config || {}), repo: tokenInput.form.elements.repo.value.trim() };
                try {
                  const r = await verifyToken(tokenInput.value.trim());
                  result.textContent = `연결 성공: ${r.full_name}`;
                } catch (err) {
                  result.textContent = `연결 실패: ${err.message}`;
                } finally {
                  A.config = prev;
                }
              },
            }, '연결 확인'),
            result
          )
        ),
        h('fieldset', { class: 'admin-fieldset' },
          h('legend', {}, '관리자 비밀번호 변경 (바꿀 때만 입력)'),
          h('div', { class: 'admin-grid' },
            field('새 비밀번호', input('pw1', '', { type: 'password', autocomplete: 'new-password', minlength: 4 })),
            field('새 비밀번호 확인', input('pw2', '', { type: 'password', autocomplete: 'new-password' }))
          ),
          h('p', { class: 'admin-hint' }, '변경한 비밀번호는 ‘저장 · 게시’ 후 적용됩니다.')
        ),
      ],
      onSubmit: async (form) => {
        const v = (name) => form.elements[name].value.trim();
        const pw1 = form.elements.pw1.value;
        const pw2 = form.elements.pw2.value;
        if (pw1 || pw2) {
          if (pw1 !== pw2) throw new Error('새 비밀번호가 서로 다릅니다.');
          A.config = { ...(A.config || {}), password: await makePasswordRecord(pw1) };
          A.configDirty = true;
        }
        if (v('repo') !== repo || v('branch') !== branch) {
          A.config = { ...(A.config || {}), repo: v('repo'), branch: v('branch') };
          A.configDirty = true;
        }
        setToken(v('token'), form.elements.remember.checked);
        updateStatus();
        toast(pw1 ? '비밀번호를 변경했습니다. ‘저장 · 게시’ 후 적용됩니다.' : '설정을 저장했습니다.');
      },
    });
  }

  /* ---------- publish ---------- */

  function bundleText(images) {
    const bundle = { ...Object.fromEntries(DATA_FILES.map((f) => [f, state.data[f]])) };
    if (A.config) bundle.admin = A.config;
    bundle.images = images;
    return '// 자동 생성 파일 — 직접 수정하지 말고 data/*.json 수정 후 python scripts/build_data.py 실행\n' +
      `window.PORTFOLIO_DATA = ${JSON.stringify(bundle)};\n`;
  }

  /** 이 화면을 연 뒤 저장소에서 바뀐 데이터 파일 목록 */
  async function findConflicts(gh, branch) {
    const conflicts = [];
    await Promise.all(DATA_FILES.map(async (f) => {
      const file = await gh(`contents/data/${f}.json?ref=${encodeURIComponent(branch)}`);
      const remote = JSON.stringify(JSON.parse(decodeBase64Utf8(file.content)));
      if (remote !== A.baseline[f]) conflicts.push(`${f}.json`);
    }));
    return conflicts;
  }

  async function publish() {
    if (A.saving) return;
    const token = getToken();
    if (!token) return openSettings('저장 · 게시하려면 GitHub 토큰이 필요합니다. 아래에서 토큰을 입력해 주세요.');
    if (!hasUnsaved()) return toast('저장할 변경 사항이 없습니다.');

    A.saving = true;
    updateStatus('저장 중…');
    try {
      const gh = github(token);
      const { branch } = repoInfo();

      const conflicts = await findConflicts(gh, branch);
      if (conflicts.length && !confirm(
        `이 화면을 연 뒤 저장소에서 바뀐 파일이 있습니다: ${conflicts.join(', ')}\n\n` +
        '방금 저장했다면 사이트 반영(1~2분)이 끝나기 전에 새로고침했을 수 있습니다.\n' +
        '계속하면 그 변경을 지금 화면 내용으로 덮어씁니다. 덮어쓸까요?\n(취소 후 1~2분 뒤 새로고침해서 다시 편집하는 것을 권장)'
      )) return;

      const refs = referencedPaths(state.data);
      const before = referencedPaths(baselineData());
      const uploads = pendingUploads();
      const removed = [...before].filter((p) => !refs.has(p));

      const ref = await gh(`git/ref/heads/${encodeURIComponent(branch)}`);
      const headSha = ref.object.sha;
      const head = await gh(`git/commits/${headSha}`);
      const tree = await gh(`git/trees/${head.tree.sha}?recursive=1`);
      const existing = new Set(tree.tree.filter((t) => t.type === 'blob').map((t) => t.path));

      const entries = [];
      for (const [i, [path, blob]] of uploads.entries()) {
        updateStatus(`파일 올리는 중… (${i + 1}/${uploads.length})`);
        const b = await gh('git/blobs', { method: 'POST', body: { content: await blobToBase64(blob), encoding: 'base64' } });
        entries.push({ path, mode: '100644', type: 'blob', sha: b.sha });
      }
      const deletes = removed.filter((p) => existing.has(p));
      deletes.forEach((path) => entries.push({ path, mode: '100644', type: 'blob', sha: null }));

      const finalPaths = new Set(existing);
      uploads.forEach(([p]) => finalPaths.add(p));
      deletes.forEach((p) => finalPaths.delete(p));
      const images = [...finalPaths].filter((p) => IMAGE_FILE_RE.test(p)).sort();

      const texts = changedData().map((f) => [`data/${f}.json`, JSON.stringify(state.data[f], null, 2) + '\n']);
      if (A.configDirty) texts.push(['data/admin.json', JSON.stringify(A.config, null, 2) + '\n']);
      texts.push(['data/images.json', JSON.stringify(images, null, 2) + '\n']);
      texts.push(['data/bundle.js', bundleText(images)]);
      texts.forEach(([path, content]) => entries.push({ path, mode: '100644', type: 'blob', content }));

      updateStatus('커밋 만드는 중…');
      const newTree = await gh('git/trees', { method: 'POST', body: { base_tree: head.tree.sha, tree: entries } });
      const summary = [
        ...changedData().map((f) => `${f}.json`),
        uploads.length && `파일 ${uploads.length}개 추가`,
        deletes.length && `파일 ${deletes.length}개 삭제`,
        A.configDirty && '관리자 설정',
      ].filter(Boolean).join(', ');
      const commit = await gh('git/commits', {
        method: 'POST',
        body: { message: `관리자 페이지에서 콘텐츠 수정: ${summary}`, tree: newTree.sha, parents: [headSha] },
      });
      await gh(`git/refs/heads/${encodeURIComponent(branch)}`, { method: 'PATCH', body: { sha: commit.sha } });

      // 저장 완료 → 기준 상태 갱신 (미리보기용 blob URL 은 배포가 끝날 때까지 유지)
      snapshot();
      A.configDirty = false;
      uploads.forEach(([p]) => A.uploads.delete(p));
      if (state.images) {
        state.images = new Set(images);
        A.uploads.forEach((_, p) => IMAGE_FILE_RE.test(p) && state.images.add(p));
      }
      toast('저장했습니다! 1~2분 뒤 사이트에 반영됩니다.', 'success');
    } catch (err) {
      console.error(err);
      toast(`저장 실패: ${err.message}`, 'error');
    } finally {
      A.saving = false;
      updateStatus();
    }
  }

  /* ---------- toolbar / decorations ---------- */

  let statusEl = null;

  function updateStatus(text) {
    if (!statusEl) return;
    if (text) {
      statusEl.textContent = text;
      return;
    }
    const files = changedData().length + (A.configDirty ? 1 : 0);
    const uploads = pendingUploads().length;
    const parts = [];
    if (files) parts.push(`변경된 파일 ${files}개`);
    if (uploads) parts.push(`올릴 파일 ${uploads}개`);
    statusEl.textContent = parts.length ? `저장 안 됨 · ${parts.join(' · ')}` : '모든 변경이 저장됨';
    statusEl.dataset.dirty = String(parts.length > 0);
    if (!getToken()) statusEl.textContent += ' · GitHub 미연결';
  }

  function renderToolbar() {
    statusEl = h('span', { class: 'admin-status', 'aria-live': 'polite' });
    const bar = h('div', { class: 'admin-bar', role: 'region', 'aria-label': '관리자 도구' },
      h('strong', { class: 'admin-bar-title' }, '관리자 모드'),
      statusEl,
      h('span', { class: 'admin-spacer' }),
      h('button', { class: 'btn', type: 'button', onclick: editProfile }, '프로필 수정'),
      h('button', { class: 'btn', type: 'button', onclick: () => openSettings() }, '설정'),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: publish }, '저장 · 게시'),
      h('button', { class: 'btn', type: 'button', onclick: exit }, '나가기')
    );
    document.body.append(bar);
    updateStatus();
  }

  function tools(...buttons) {
    return h('div', { class: 'admin-tools', 'data-admin': '' }, buttons);
  }

  function decorate() {
    if (!A.active) return;
    // 작업 카드 · Featured 카드
    document.querySelectorAll('.card[data-id], .feature[data-id]').forEach((el) => {
      if (el.querySelector(':scope > .admin-tools')) return;
      const id = el.dataset.id;
      const section = findSection(id);
      if (!section) return;
      const isCard = el.classList.contains('card');
      el.append(tools(
        h('button', { type: 'button', class: 'admin-chip', onclick: () => editItem(section, id) }, '수정'),
        isCard && h('button', { type: 'button', class: 'admin-chip', 'data-move': '-1', 'aria-label': '앞으로 이동', onclick: () => moveItem(section, id, -1) }, '◀'),
        isCard && h('button', { type: 'button', class: 'admin-chip', 'data-move': '1', 'aria-label': '뒤로 이동', onclick: () => moveItem(section, id, 1) }, '▶')
      ));
    });

    // 섹션별 새 항목 추가
    for (const section of WORK_SECTIONS) {
      const head = document.querySelector(`#${section} .section-head`);
      if (head && !head.nextElementSibling?.matches('.admin-section-actions')) {
        head.after(h('div', { class: 'admin-section-actions', 'data-admin': '' },
          h('button', { type: 'button', class: 'btn', onclick: () => editItem(section, null) }, `+ ${SECTION_LABEL[section]} 새 항목`)));
      }
    }

    // 자격사항
    document.querySelectorAll('.cert[data-id]').forEach((el) => {
      if (el.querySelector('.admin-tools')) return;
      const id = el.dataset.id;
      const group = state.data.certs.training.some((c) => c.id === id) ? 'training' : 'awards';
      el.append(tools(h('button', { type: 'button', class: 'admin-chip', onclick: () => editCert(group, id) }, '수정')));
    });
    document.querySelectorAll('.cert-group').forEach((el, i) => {
      const heading = el.querySelector('h3');
      if (!heading || heading.querySelector('.admin-chip')) return;
      const group = i === 0 ? 'training' : 'awards';
      heading.append(h('button', { type: 'button', class: 'admin-chip', 'data-admin': '', onclick: () => editCert(group, null) }, '+ 추가'));
    });

    // Hero
    const hero = document.querySelector('#hero-content');
    if (hero && !hero.querySelector('.admin-tools')) {
      hero.prepend(tools(h('button', { type: 'button', class: 'admin-chip', onclick: editProfile }, '프로필 · 연락처 수정')));
    }
  }

  function onBeforeUnload(e) {
    if (!hasUnsaved()) return;
    e.preventDefault();
    e.returnValue = '';
  }

  function activate() {
    if (A.active) return;
    A.active = true;
    session.set(SESSION_KEY, '1');
    snapshot();
    document.body.classList.add('admin-mode');
    renderToolbar();
    document.addEventListener('portfolio:rendered', decorate);
    window.addEventListener('beforeunload', onBeforeUnload);
    decorate();
  }

  function exit() {
    if (hasUnsaved() && !confirm('저장하지 않은 변경 사항이 있습니다. 버리고 나갈까요?')) return;
    window.removeEventListener('beforeunload', onBeforeUnload);
    session.del(SESSION_KEY);
    history.replaceState(null, '', location.pathname + location.search);
    location.reload();
  }

  /* ---------- login / first-time setup ---------- */

  function showLogin() {
    if (!A.config?.password?.hash) return showSetup();
    formDialog({
      title: '관리자 로그인',
      submitLabel: '확인',
      wide: false,
      fields: [field('관리자 비밀번호', input('password', '', { type: 'password', required: true, autocomplete: 'current-password', autofocus: true }))],
      onSubmit: async (form) => {
        const password = form.elements.password.value;
        if (!(await checkPassword(password))) {
          form.elements.password.select();
          throw new Error('비밀번호가 올바르지 않습니다.');
        }
        activate();
        if (password.length < 8) toast('비밀번호가 짧습니다. ‘설정’에서 더 긴 비밀번호로 바꾸는 것을 권장합니다.');
      },
    });
  }

  /** 비밀번호가 아직 없을 때: 저장소에 쓸 수 있는 GitHub 토큰 소유자만 비밀번호를 정할 수 있다 */
  function showSetup() {
    formDialog({
      title: '관리자 초기 설정',
      submitLabel: '설정하고 시작',
      wide: false,
      note: '관리자 비밀번호가 아직 없습니다. 비밀번호와 GitHub 토큰을 입력하면 저장소에 비밀번호가 저장되고 관리자 모드가 시작됩니다.',
      fields: [
        field('새 비밀번호', input('pw1', '', { type: 'password', required: true, minlength: 4, autocomplete: 'new-password' })),
        field('새 비밀번호 확인', input('pw2', '', { type: 'password', required: true, autocomplete: 'new-password' })),
        field('GitHub 토큰', input('token', getToken(), { type: 'password', required: true, placeholder: 'github_pat_...' }),
          h('span', {}, h('a', { href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener noreferrer' }, 'Fine-grained token 생성'),
            ' → 이 저장소만 선택 → Contents: Read and write')),
        checkbox('remember', true, '이 브라우저에 토큰 기억'),
      ],
      onSubmit: async (form) => {
        const pw1 = form.elements.pw1.value;
        if (pw1 !== form.elements.pw2.value) throw new Error('비밀번호가 서로 다릅니다.');
        const token = form.elements.token.value.trim();
        await verifyToken(token);
        setToken(token, form.elements.remember.checked);
        A.config = { ...repoInfo(), ...(A.config || {}), password: await makePasswordRecord(pw1) };
        A.configDirty = true;
        activate();
        await publish();
      },
    });
  }

  async function open() {
    if (A.active) return;
    if (session.get(SESSION_KEY) === '1') {
      await loadConfig();
      return activate();
    }
    try {
      await loadConfig();
    } catch {
      /* 설정 파일이 없으면 초기 설정 */
    }
    showLogin();
  }

  window.Admin = { open };
})();
