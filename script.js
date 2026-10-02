(() => {
  'use strict';

  const REPO = 'uuhjeike/R-R-F';
  const BRANCH = 'main';
  const RAW = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/`;
  const SOURCES = ['posts.txt', RAW + 'posts.txt'];
  const CHUNK = 10;      // posts rendered per batch
  const LONG = 700;      // characters before a text post is collapsed

  const IMG = /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?.*)?$/i;
  const VID = /\.(mp4|webm|mov|m4v|ogv)(\?.*)?$/i;
  const AUD = /\.(mp3|wav|ogg|m4a|aac|flac|opus)(\?.*)?$/i;
  const YT = /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/i;
  const URL_RE = /https?:\/\/[^\s<>"']+/gi;

  const feed = document.getElementById('feed');
  const sentinel = document.getElementById('sentinel');
  const lb = document.getElementById('lb');
  const lbImg = lb.querySelector('img');

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  /* ---------- URL helpers ---------- */
  function resolve(src) {
    src = src.trim();
    let m = src.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/([^/]+)\/(.+?)(\?.*)?$/i);
    if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}/${m[4]}`;
    if (/^https?:\/\//i.test(src)) return src;
    let p = src.replace(/^\.?\//, '');
    try { p = decodeURI(p); } catch (e) { /* keep as is */ }
    return RAW + encodeURI(p);
  }

  function host(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return 'Open link'; }
  }

  /* ---------- parsing ---------- */
  // Posts are wrapped in lines that contain only "-"
  function parse(raw) {
    const posts = [];
    let cur = [];
    const push = () => {
      if (cur.some(l => l.trim())) posts.push(cur);
      cur = [];
    };
    for (const line of raw.replace(/^\uFEFF/, '').split(/\r?\n/)) {
      if (line.trim() === '-') push(); else cur.push(line);
    }
    push();
    return posts;
  }

  function classify(line) {
    const t = line.trim();
    if (!t) return { type: 'blank' };

    if (/\(button\)\s*$/i.test(t)) {
      const body = t.replace(/\s*\(button\)\s*$/i, '');
      const m = body.match(/https?:\/\/[^\s<>"']+/i);
      const url = m ? m[0] : body.trim();
      const label = m ? body.replace(m[0], '').replace(/[\s\-–:|]+$/, '').replace(/^[\s\-–:|]+/, '').trim() : '';
      const href = resolve(url);
      return { type: 'button', href, label: label || host(href) };
    }

    if (!/\s/.test(t)) {
      const yt = t.match(YT);
      if (yt) return { type: 'yt', id: yt[1] };
      if (IMG.test(t)) return { type: 'img', src: resolve(t) };
      if (VID.test(t)) return { type: 'video', src: resolve(t) };
      if (AUD.test(t)) return { type: 'audio', src: resolve(t) };
      if (/^https?:\/\//i.test(t)) return { type: 'link', href: t };
    }
    return { type: 'text', text: line.replace(/\s+$/, '') };
  }

  /* ---------- renderers ---------- */
  function linkify(parent, text) {
    let last = 0;
    text.replace(URL_RE, (url, idx) => {
      const clean = url.replace(/[.,;:!?)\]]+$/, '');
      parent.appendChild(document.createTextNode(text.slice(last, idx)));
      const a = el('a', null, clean);
      a.href = clean; a.target = '_blank'; a.rel = 'noopener noreferrer';
      parent.appendChild(a);
      last = idx + clean.length;
      return url;
    });
    parent.appendChild(document.createTextNode(text.slice(last)));
  }

  function textBlock(text) {
    const wrap = el('div');
    const body = el('div', 'text');
    linkify(body, text);
    wrap.appendChild(body);
    if (text.length > LONG) {
      body.classList.add('clamp', 'is-collapsed');
      const more = el('button', 'more', 'Read more');
      more.type = 'button';
      more.addEventListener('click', () => {
        const open = body.classList.toggle('is-collapsed');
        more.textContent = open ? 'Read more' : 'Show less';
      });
      wrap.appendChild(more);
    }
    return wrap;
  }

  function shot(src) {
    const box = el('div', 'shot');
    const img = new Image();
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = '';
    img.addEventListener('load', () => box.classList.add('done'), { once: true });
    img.addEventListener('error', () => box.remove(), { once: true });
    img.src = src;
    img.addEventListener('click', () => openLb(src));
    box.appendChild(img);
    return box;
  }

  function imageGroup(srcs) {
    const wrap = el('div', 'media');
    if (srcs.length === 1) { wrap.appendChild(shot(srcs[0])); return wrap; }
    const grid = el('div', 'grid' + (srcs.length % 2 ? ' odd' : ''));
    srcs.forEach(s => grid.appendChild(shot(s)));
    wrap.appendChild(grid);
    return wrap;
  }

  const lazyMedia = [];
  function mediaEl(kind, src) {
    const wrap = el('div', 'media');
    const m = document.createElement(kind);
    m.controls = true;
    m.preload = 'none';
    if (kind === 'video') { m.playsInline = true; }
    m.dataset.src = src;
    wrap.appendChild(m);
    lazyMedia.push(m);
    mediaObserver.observe(m);
    return wrap;
  }

  function ytBlock(id) {
    const wrap = el('div', 'media');
    const b = el('button', 'yt');
    b.type = 'button';
    b.setAttribute('aria-label', 'Play video');
    const t = new Image();
    t.loading = 'lazy'; t.decoding = 'async'; t.alt = '';
    t.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    b.appendChild(t);
    b.addEventListener('click', () => {
      const f = el('iframe', 'yt-frame');
      f.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      f.allowFullscreen = true;
      f.title = 'Video';
      b.replaceWith(f);
    }, { once: true });
    wrap.appendChild(b);
    return wrap;
  }

  function buttonEl(href, label) {
    const row = el('div', 'actions');
    const a = el('a', 'btn', label);
    a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
    row.appendChild(a);
    return row;
  }

  function linkEl(href) {
    const row = el('div', 'text');
    const a = el('a', 'link', href);
    a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
    row.appendChild(a);
    return row;
  }

  function buildPost(lines) {
    const art = el('article', 'post');
    let textBuf = [];
    let imgBuf = [];

    const flushText = () => {
      const txt = textBuf.join('\n').replace(/^\n+|\n+$/g, '');
      if (txt.trim()) art.appendChild(textBlock(txt));
      textBuf = [];
    };
    const flushImgs = () => {
      if (imgBuf.length) art.appendChild(imageGroup(imgBuf));
      imgBuf = [];
    };

    for (const line of lines) {
      const c = classify(line);
      if (c.type === 'text') { flushImgs(); textBuf.push(c.text); continue; }
      if (c.type === 'blank') { if (textBuf.length) textBuf.push(''); continue; }
      flushText();
      if (c.type === 'img') { imgBuf.push(c.src); continue; }
      flushImgs();
      if (c.type === 'video') art.appendChild(mediaEl('video', c.src));
      else if (c.type === 'audio') art.appendChild(mediaEl('audio', c.src));
      else if (c.type === 'yt') art.appendChild(ytBlock(c.id));
      else if (c.type === 'button') art.appendChild(buttonEl(c.href, c.label));
      else if (c.type === 'link') art.appendChild(linkEl(c.href));
    }
    flushText();
    flushImgs();
    return art;
  }

  /* ---------- lazy video/audio: load near viewport, release when far ---------- */
  const mediaObserver = new IntersectionObserver(entries => {
    for (const e of entries) {
      const m = e.target;
      if (e.isIntersecting) {
        if (!m.getAttribute('src')) {
          m.preload = 'metadata';
          m.src = m.dataset.src + (m.tagName === 'VIDEO' ? '#t=0.1' : '');
        }
      } else if (m.getAttribute('src') && m.paused) {
        m.removeAttribute('src');
        m.preload = 'none';
        m.load();
      }
    }
  }, { rootMargin: '700px 0px' });

  // only one thing plays at a time
  document.addEventListener('play', e => {
    for (const m of lazyMedia) if (m !== e.target && !m.paused) m.pause();
  }, true);

  /* ---------- lightbox ---------- */
  function openLb(src) { lbImg.src = src; lb.hidden = false; }
  function closeLb() { lb.hidden = true; lbImg.removeAttribute('src'); }
  lb.addEventListener('click', closeLb);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !lb.hidden) closeLb(); });

  /* ---------- feed (rendered in batches) ---------- */
  let queue = [];
  let shown = 0;

  function renderMore() {
    const frag = document.createDocumentFragment();
    const end = Math.min(shown + CHUNK, queue.length);
    for (; shown < end; shown++) {
      if (feed.childElementCount || frag.childElementCount) {
        const bar = el('div', 'bar');
        bar.setAttribute('aria-hidden', 'true');
        bar.appendChild(el('i'));
        frag.appendChild(bar);
      }
      frag.appendChild(buildPost(queue[shown]));
    }
    feed.appendChild(frag);
    if (shown >= queue.length) feedObserver.disconnect();
  }

  const feedObserver = new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting)) renderMore();
  }, { rootMargin: '1400px 0px' });

  async function load() {
    for (const url of SOURCES) {
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) continue;
        return await res.text();
      } catch (e) { /* try next source */ }
    }
    return null;
  }

  load().then(raw => {
    if (raw == null) { feed.appendChild(el('p', 'empty', 'posts.txt could not be loaded.')); return; }
    queue = parse(raw);
    if (!queue.length) { feed.appendChild(el('p', 'empty', 'No posts yet.')); return; }
    renderMore();
    if (shown < queue.length) feedObserver.observe(sentinel);
  });
})();
