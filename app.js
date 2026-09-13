'use strict';

const KEY = 'gym-log';
const VERSION = 2;
let DB = { parts: {}, exercises: [] };   // data/exercises.json (기본 제공)
let S  = blank();
let pendingSets = [];

/* ---------- 저장 ---------- */
function blank(){ return { version: VERSION, meals: [], sessions: [], custom: [], customRegions: {} }; }

function migrate(d){
  if (!d || typeof d !== 'object') return blank();
  // v1 에는 custom / customRegions 가 없었다. 기록은 그대로 두고 빈 값만 채운다.
  return {
    version: VERSION,
    meals: Array.isArray(d.meals) ? d.meals : [],
    sessions: Array.isArray(d.sessions) ? d.sessions : [],
    custom: Array.isArray(d.custom) ? d.custom : [],
    customRegions: (d.customRegions && typeof d.customRegions === 'object') ? d.customRegions : {}
  };
}

function load(){
  try { const raw = localStorage.getItem(KEY); return raw ? migrate(JSON.parse(raw)) : blank(); }
  catch (e) { console.warn('저장된 기록을 읽지 못했습니다.', e); return blank(); }
}
function save(){
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { console.warn('저장하지 못했습니다.', e); alert('저장에 실패했습니다. 사파리 비공개 탭이면 기록이 남지 않습니다.'); }
}

/* ---------- 날짜 ---------- */
const pad = n => String(n).padStart(2, '0');
function today(){ const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function daysSince(s){
  const [y,m,d] = s.split('-').map(Number);
  const then = new Date(y, m-1, d), now = new Date();
  return Math.round((new Date(now.getFullYear(),now.getMonth(),now.getDate()) - then) / 86400000);
}
const agoText = n => n === 0 ? '오늘' : n === 1 ? '어제' : `${n}일 전`;

/* ---------- 종목 (기본 + 내가 추가한 것) ---------- */
const allExercises = () => DB.exercises.concat(S.custom);
const exById = id => allExercises().find(e => e.id === id);
const partNames = () => Object.keys(DB.parts);
const regionsOf = part => (DB.parts[part] || []).concat(S.customRegions[part] || []);

/* ---------- 렌더 ---------- */
const $ = sel => document.querySelector(sel);

function delButton(label, onClick){
  const b = document.createElement('button');
  b.className = 'del'; b.type = 'button'; b.textContent = '✕';
  b.setAttribute('aria-label', label);
  b.onclick = onClick;
  return b;
}
function row(title, sub, num){
  const li = document.createElement('li');
  const g = document.createElement('div'); g.className = 'grow';
  const t = document.createElement('div'); t.className = 'ttl'; t.textContent = title;
  g.append(t);
  if (sub) { const s = document.createElement('div'); s.className = 'sub'; s.textContent = sub; g.append(s); }
  li.append(g);
  if (num) { const n = document.createElement('span'); n.className = 'num'; n.textContent = num; li.append(n); }
  return li;
}

function renderToday(){
  const t = today();
  const mine = S.meals.filter(m => m.date === t);
  $('#kcal-total').textContent = mine.reduce((a,m) => a + m.kcal, 0).toLocaleString('ko-KR');
  $('#meal-empty').hidden = mine.length > 0;
  $('#meal-list').replaceChildren(...mine.slice().reverse().map(m => {
    const li = row(m.name, null, m.kcal.toLocaleString('ko-KR'));
    li.append(delButton(`${m.name} 삭제`, () => {
      S.meals = S.meals.filter(x => x.id !== m.id); save(); renderToday();
    }));
    return li;
  }));
}

function lastByPart(){
  const out = {};
  for (const p of partNames()) out[p] = { date: null, regions: {} };
  for (const s of S.sessions) {
    const ex = exById(s.exerciseId);
    if (!ex || !out[ex.part]) continue;
    const slot = out[ex.part];
    if (!slot.date || s.date > slot.date) slot.date = s.date;
    for (const r of ex.regions) if (!slot.regions[r] || s.date > slot.regions[r]) slot.regions[r] = s.date;
  }
  return out;
}

function sessionSummary(s){
  if (s.cardio) {
    const bits = [`${s.cardio.min}분`];
    if (s.cardio.km) bits.push(`${s.cardio.km}km`);
    return { text: bits.join(' · '), num: `${s.cardio.min}분` };
  }
  const sets = (s.sets || []).map(([w,r]) => `${w}×${r}`).join('  ');
  const vol = (s.sets || []).reduce((a,[w,r]) => a + w*r, 0);
  return { text: sets, num: vol ? `${vol.toLocaleString('ko-KR')}kg` : `${(s.sets||[]).length}세트` };
}

function renderWorkout(){
  const last = lastByPart();
  const parts = partNames().sort((a,b) => {
    const da = last[a].date, db = last[b].date;
    if (!da && !db) return a.localeCompare(b,'ko');
    if (!da) return -1;
    if (!db) return 1;
    return da.localeCompare(db);
  });

  $('#part-grid').replaceChildren(...parts.map(part => {
    const info = last[part];
    const n = info.date ? daysSince(info.date) : null;
    const card = document.createElement('div');
    card.className = 'part' + (n === null || n >= 4 ? ' stale' : '');
    const top = document.createElement('div'); top.className = 'part-top';
    const nm = document.createElement('span'); nm.className = 'part-name'; nm.textContent = part;
    const ago = document.createElement('span'); ago.className = 'ago';
    ago.textContent = n === null ? '기록 없음' : agoText(n);
    top.append(nm, ago);
    card.append(top);

    const regions = regionsOf(part);
    if (regions.length) {
      const chips = document.createElement('div'); chips.className = 'chips';
      for (const region of regions) {
        const rd = info.regions[region];
        const rn = rd ? daysSince(rd) : null;
        const c = document.createElement('span');
        c.className = 'chip' + (rn === null ? ' never' : rn <= 3 ? ' fresh' : '');
        c.textContent = rn === null ? region : `${region} ${rn}d`;
        chips.append(c);
      }
      card.append(chips);
    }
    return card;
  }));

  const recent = S.sessions.slice().sort((a,b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, 12);
  $('#session-empty').hidden = recent.length > 0;
  $('#session-list').replaceChildren(...recent.map(s => {
    const ex = exById(s.exerciseId);
    const sum = sessionSummary(s);
    const where = ex && ex.regions.length ? ex.regions.join('/') : (ex ? ex.part : '—');
    const li = row(ex ? ex.name : '(삭제된 종목)', `${agoText(daysSince(s.date))} · ${where} · ${sum.text}`, sum.num);
    li.append(delButton('기록 삭제', () => {
      S.sessions = S.sessions.filter(x => x.id !== s.id); save(); renderWorkout();
    }));
    return li;
  }));
}

function renderSettings(){
  $('#stat-line').textContent = `식사 ${S.meals.length}건 · 운동 ${S.sessions.length}건 저장됨`;
  $('#custom-count').textContent = S.custom.length ? `${S.custom.length}개` : '';
  $('#custom-list').replaceChildren(...S.custom.map(e => {
    const li = row(e.name, `${e.part}${e.regions.length ? ' · ' + e.regions.join('/') : ''} · ${e.pose}`);
    li.append(delButton(`${e.name} 삭제`, () => {
      const used = S.sessions.filter(s => s.exerciseId === e.id).length;
      const msg = used ? `"${e.name}" 을(를) 지웁니다. 이 종목으로 남긴 기록 ${used}건은 "(삭제된 종목)"으로 표시됩니다.`
                       : `"${e.name}" 을(를) 지웁니다.`;
      if (!confirm(msg)) return;
      S.custom = S.custom.filter(x => x.id !== e.id); save(); renderSettings();
    }));
    return li;
  }));
}

/* ---------- 탭 ---------- */
const TITLES = { today:'오늘', workout:'운동', settings:'설정' };
function show(view){
  for (const el of document.querySelectorAll('.view')) el.hidden = el.id !== `view-${view}`;
  for (const b of document.querySelectorAll('.tabbar button')) b.classList.toggle('on', b.dataset.view === view);
  $('#view-title').textContent = TITLES[view];
  if (view === 'workout') renderWorkout();
  if (view === 'settings') renderSettings();
}

/* ---------- 자세 그림 ---------- */
function paintFigure(box, poseName, regions){
  box.replaceChildren();
  const svg = poseName ? figureSVG(poseName, regions || []) : null;
  if (svg) { box.append(svg); box.hidden = false; }
  else box.hidden = true;
}

/* ---------- 운동 기록 시트 ---------- */
function fillExercises(){
  const part = $('#sel-part').value;
  const list = allExercises().filter(e => e.part === part);
  $('#sel-ex').replaceChildren(...list.map(e => new Option(e.name, e.id)));
  onExerciseChange();
}
function onExerciseChange(){
  const ex = exById($('#sel-ex').value);
  $('#ex-how').textContent = ex ? ex.how : '';
  $('#ex-how').hidden = !(ex && ex.how);
  paintFigure($('#ex-figure'), ex && ex.pose, ex ? ex.regions : []);

  const isCardio = !!ex && ex.kind === 'cardio';
  $('#strength-input').hidden = isCardio;
  $('#cardio-input').hidden = !isCardio;

  const wrap = $('#ex-link-wrap');
  if (ex && ex.link && /^https?:\/\//i.test(ex.link)) { $('#ex-link').href = ex.link; wrap.hidden = false; }
  else wrap.hidden = true;
}
function renderSets(){
  $('#set-list').replaceChildren(...pendingSets.map(([w,r], i) => {
    const li = document.createElement('li');
    li.append(document.createTextNode(`${w}kg × ${r}`));
    li.append(delButton(`${i+1}번째 세트 삭제`, () => { pendingSets.splice(i,1); renderSets(); }));
    return li;
  }));
}
function openSheet(){
  pendingSets = []; renderSets();
  $('#in-min').value = ''; $('#in-km').value = '';
  $('#sel-part').replaceChildren(...partNames().map(p => new Option(p, p)));
  fillExercises();
  $('#sheet').hidden = false;
}

/* ---------- 새 종목 ---------- */
function renderRegionPicker(){
  const part = $('#nx-part').value;
  const regions = regionsOf(part);
  $('#nx-region-wrap').hidden = $('#nx-kind').value === 'cardio' || !regions.length;
  $('#nx-regions').replaceChildren(...regions.map((r, i) => {
    const id = `nxr-${i}`;
    const lab = document.createElement('label');
    lab.className = 'pick';
    lab.htmlFor = id;
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.id = id; cb.value = r;
    lab.append(cb, document.createTextNode(r));
    return lab;
  }));
}
function openExSheet(){
  $('#ex-form').reset();
  $('#nx-kind').value = 'strength';
  syncKind();
  $('#nx-pose').replaceChildren(...POSE_NAMES.map(n => new Option(n, n)));
  $('#nx-pose').value = '없음';
  paintFigure($('#nx-preview'), null, []);
  $('#ex-sheet').hidden = false;
}
function syncKind(){
  const cardio = $('#nx-kind').value === 'cardio';
  const parts = cardio ? partNames().filter(p => p === '유산소') : partNames().filter(p => p !== '유산소');
  $('#nx-part').replaceChildren(...parts.map(p => new Option(p, p)));
  if (cardio) $('#nx-pose').value = '달리기';
  renderRegionPicker();
  paintFigure($('#nx-preview'), $('#nx-pose').value, []);
}

/* ---------- 백업 ---------- */
function exportData(){
  const blob = new Blob([JSON.stringify(S, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `gym-log-${today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function importData(file){
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const incoming = migrate(JSON.parse(fr.result));
      if (!confirm(`식사 ${incoming.meals.length}건, 운동 ${incoming.sessions.length}건, 내 종목 ${incoming.custom.length}개로 덮어씁니다. 지금 기록은 사라집니다.`)) return;
      S = incoming; save(); renderToday(); renderSettings();
      alert('불러왔습니다.');
    } catch (e) {
      alert('이 파일을 읽을 수 없습니다. gym-log 에서 내보낸 JSON 이 맞는지 확인해 주세요.');
    }
  };
  fr.readAsText(file);
}

/* ---------- 시작 ---------- */
async function init(){
  S = load();
  const d = new Date();
  $('#today-label').textContent =
    `${d.getFullYear()}. ${pad(d.getMonth()+1)}. ${pad(d.getDate())} (${'일월화수목금토'[d.getDay()]})`;

  try {
    const res = await fetch('data/exercises.json');
    if (!res.ok) throw new Error(res.status);
    DB = await res.json();
  } catch (e) {
    console.warn('운동 목록을 불러오지 못했습니다.', e);
    $('#part-grid').textContent = '운동 목록을 불러오지 못했습니다.';
  }

  renderToday();

  $('#meal-form').addEventListener('submit', ev => {
    ev.preventDefault();
    const name = $('#meal-name').value.trim();
    const kcal = parseInt($('#meal-kcal').value, 10);
    if (!name || !Number.isFinite(kcal)) return;
    S.meals.push({ id: Date.now(), date: today(), name, kcal });
    save(); ev.target.reset(); $('#meal-name').focus(); renderToday();
  });

  for (const b of document.querySelectorAll('.tabbar button')) b.onclick = () => show(b.dataset.view);

  $('#open-log').onclick = openSheet;
  $('#sheet-close').onclick = () => { $('#sheet').hidden = true; };
  $('#sheet').addEventListener('click', ev => { if (ev.target.id === 'sheet') $('#sheet').hidden = true; });
  $('#sel-part').onchange = fillExercises;
  $('#sel-ex').onchange = onExerciseChange;

  $('#btn-addset').onclick = () => {
    const w = parseFloat($('#in-weight').value);
    const r = parseInt($('#in-reps').value, 10);
    if (!Number.isFinite(r) || r <= 0) { $('#in-reps').focus(); return; }
    pendingSets.push([Number.isFinite(w) ? w : 0, r]);
    $('#in-reps').value = ''; renderSets(); $('#in-reps').focus();
  };

  $('#btn-save').onclick = () => {
    const ex = exById($('#sel-ex').value);
    if (!ex) return;
    if (ex.kind === 'cardio') {
      const min = parseInt($('#in-min').value, 10);
      const km  = parseFloat($('#in-km').value);
      if (!Number.isFinite(min) || min <= 0) { alert('시간을 분 단위로 입력해 주세요.'); $('#in-min').focus(); return; }
      S.sessions.push({ id: Date.now(), date: today(), exerciseId: ex.id,
                        cardio: { min, km: Number.isFinite(km) && km > 0 ? km : null } });
    } else {
      if (!pendingSets.length) { alert('세트를 하나 이상 추가해 주세요.'); return; }
      S.sessions.push({ id: Date.now(), date: today(), exerciseId: ex.id, sets: pendingSets });
    }
    save(); $('#sheet').hidden = true; renderWorkout();
  };

  // 새 종목
  $('#open-new-ex').onclick = openExSheet;
  $('#quick-new').onclick = openExSheet;
  $('#ex-sheet-close').onclick = () => { $('#ex-sheet').hidden = true; };
  $('#ex-sheet').addEventListener('click', ev => { if (ev.target.id === 'ex-sheet') $('#ex-sheet').hidden = true; });
  $('#nx-kind').onchange = syncKind;
  $('#nx-part').onchange = renderRegionPicker;
  $('#nx-pose').onchange = () => paintFigure($('#nx-preview'), $('#nx-pose').value, []);

  $('#ex-form').addEventListener('submit', ev => {
    ev.preventDefault();
    const name = $('#nx-name').value.trim();
    if (!name) return;
    const part = $('#nx-part').value;
    const kind = $('#nx-kind').value;

    let regions = [...document.querySelectorAll('#nx-regions input:checked')].map(c => c.value);
    const fresh = $('#nx-newregion').value.split(',').map(s => s.trim()).filter(Boolean);
    if (fresh.length && kind !== 'cardio') {
      S.customRegions[part] = (S.customRegions[part] || []).concat(fresh.filter(r => !regionsOf(part).includes(r)));
      regions = regions.concat(fresh);
    }
    if (kind === 'cardio') regions = [];

    const link = $('#nx-link').value.trim();
    S.custom.push({
      id: 'my-' + Date.now(), name, part, regions, kind,
      how: $('#nx-how').value.trim(),
      link: /^https?:\/\//i.test(link) ? link : '',
      pose: $('#nx-pose').value, custom: true
    });
    save();
    $('#ex-sheet').hidden = true;
    if (!$('#sheet').hidden) { $('#sel-part').value = part; fillExercises(); $('#sel-ex').value = S.custom.at(-1).id; onExerciseChange(); }
    if (!$('#view-settings').hidden) renderSettings();
  });

  $('#btn-export').onclick = exportData;
  $('#file-import').onchange = ev => { if (ev.target.files[0]) importData(ev.target.files[0]); ev.target.value = ''; };

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('오프라인 캐시를 켜지 못했습니다.', e));
  }
}

init();
