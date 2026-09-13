'use strict';

const KEY = 'gym-log';
const VERSION = 1;
let DB = { parts: {}, exercises: [] };   // data/exercises.json
let S  = blank();                        // 저장된 기록
let pendingSets = [];

/* ---------- 저장 ---------- */
function blank(){ return { version: VERSION, meals: [], sessions: [] }; }

function migrate(d){
  if (!d || typeof d !== 'object') return blank();
  return { version: VERSION, meals: d.meals || [], sessions: d.sessions || [] };
}

function load(){
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? migrate(JSON.parse(raw)) : blank();
  } catch (e) {
    console.warn('저장된 기록을 읽지 못했습니다.', e);
    return blank();
  }
}

function save(){
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { console.warn('저장하지 못했습니다.', e); alert('저장에 실패했습니다. 사파리 비공개 탭이면 기록이 남지 않습니다.'); }
}

/* ---------- 날짜 ---------- */
const pad = n => String(n).padStart(2, '0');
function today(){ const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function daysSince(dateStr){
  const [y,m,d] = dateStr.split('-').map(Number);
  const then = new Date(y, m-1, d), now = new Date();
  return Math.round((new Date(now.getFullYear(),now.getMonth(),now.getDate()) - then) / 86400000);
}
function agoText(n){ return n === 0 ? '오늘' : n === 1 ? '어제' : `${n}일 전`; }

/* ---------- 조회 ---------- */
const exById = id => DB.exercises.find(e => e.id === id);

function lastByPart(){
  const out = {};
  for (const part of Object.keys(DB.parts)) out[part] = { date: null, regions: {} };
  for (const s of S.sessions) {
    const ex = exById(s.exerciseId);
    if (!ex || !out[ex.part]) continue;
    const slot = out[ex.part];
    if (!slot.date || s.date > slot.date) slot.date = s.date;
    for (const r of ex.regions) if (!slot.regions[r] || s.date > slot.regions[r]) slot.regions[r] = s.date;
  }
  return out;
}

/* ---------- 렌더 ---------- */
const $ = sel => document.querySelector(sel);

function renderToday(){
  const t = today();
  const mine = S.meals.filter(m => m.date === t);
  const total = mine.reduce((a, m) => a + m.kcal, 0);
  $('#kcal-total').textContent = total.toLocaleString('ko-KR');
  $('#meal-empty').hidden = mine.length > 0;
  $('#meal-list').replaceChildren(...mine.slice().reverse().map(m => {
    const li = document.createElement('li');
    const g = document.createElement('div'); g.className = 'grow';
    const t1 = document.createElement('div'); t1.className = 'ttl'; t1.textContent = m.name;
    g.append(t1);
    const n = document.createElement('span'); n.className = 'num'; n.textContent = m.kcal.toLocaleString('ko-KR');
    const b = document.createElement('button');
    b.className = 'del'; b.type = 'button'; b.textContent = '✕';
    b.setAttribute('aria-label', `${m.name} 삭제`);
    b.onclick = () => { S.meals = S.meals.filter(x => x.id !== m.id); save(); renderToday(); };
    li.append(g, n, b);
    return li;
  }));
}

function renderWorkout(){
  const last = lastByPart();
  const parts = Object.keys(DB.parts).sort((a, b) => {
    const da = last[a].date, db = last[b].date;
    if (!da && !db) return a.localeCompare(b, 'ko');
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

    const chips = document.createElement('div'); chips.className = 'chips';
    for (const region of DB.parts[part]) {
      const rd = info.regions[region];
      const c = document.createElement('span');
      const rn = rd ? daysSince(rd) : null;
      c.className = 'chip' + (rn === null ? ' never' : rn <= 3 ? ' fresh' : '');
      c.textContent = rn === null ? region : `${region} ${rn}d`;
      chips.append(c);
    }
    card.append(top, chips);
    return card;
  }));

  const recent = S.sessions.slice().sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, 12);
  $('#session-empty').hidden = recent.length > 0;
  $('#session-list').replaceChildren(...recent.map(s => {
    const ex = exById(s.exerciseId);
    const li = document.createElement('li');
    const g = document.createElement('div'); g.className = 'grow';
    const t1 = document.createElement('div'); t1.className = 'ttl';
    t1.textContent = ex ? ex.name : '(삭제된 종목)';
    const t2 = document.createElement('div'); t2.className = 'sub';
    const sets = s.sets.map(([w, r]) => `${w}×${r}`).join('  ');
    t2.textContent = `${agoText(daysSince(s.date))} · ${ex ? ex.regions.join('/') : '—'} · ${sets}`;
    g.append(t1, t2);
    const vol = s.sets.reduce((a, [w, r]) => a + w * r, 0);
    const n = document.createElement('span'); n.className = 'num';
    n.textContent = vol ? `${vol.toLocaleString('ko-KR')}kg` : `${s.sets.length}세트`;
    const b = document.createElement('button');
    b.className = 'del'; b.type = 'button'; b.textContent = '✕';
    b.setAttribute('aria-label', '기록 삭제');
    b.onclick = () => { S.sessions = S.sessions.filter(x => x.id !== s.id); save(); renderWorkout(); };
    li.append(g, n, b);
    return li;
  }));
}

function renderSettings(){
  $('#stat-line').textContent = `식사 ${S.meals.length}건 · 운동 ${S.sessions.length}건 저장됨`;
}

/* ---------- 탭 ---------- */
const TITLES = { today: '오늘', workout: '운동', settings: '설정' };
function show(view){
  for (const el of document.querySelectorAll('.view')) el.hidden = el.id !== `view-${view}`;
  for (const b of document.querySelectorAll('.tabbar button')) b.classList.toggle('on', b.dataset.view === view);
  $('#view-title').textContent = TITLES[view];
  if (view === 'workout') renderWorkout();
  if (view === 'settings') renderSettings();
}

/* ---------- 운동 입력 시트 ---------- */
function fillExercises(){
  const part = $('#sel-part').value;
  const list = DB.exercises.filter(e => e.part === part);
  $('#sel-ex').replaceChildren(...list.map(e => new Option(e.name, e.id)));
  showHow();
}
function showHow(){
  const ex = exById($('#sel-ex').value);
  $('#ex-how').textContent = ex ? ex.how : '';
}
function renderSets(){
  $('#set-list').replaceChildren(...pendingSets.map(([w, r], i) => {
    const li = document.createElement('li');
    li.append(document.createTextNode(`${w}kg × ${r}`));
    const b = document.createElement('button');
    b.className = 'del'; b.type = 'button'; b.textContent = '✕';
    b.setAttribute('aria-label', `${i + 1}번째 세트 삭제`);
    b.onclick = () => { pendingSets.splice(i, 1); renderSets(); };
    li.append(b);
    return li;
  }));
}
function openSheet(){
  pendingSets = [];
  renderSets();
  $('#sel-part').replaceChildren(...Object.keys(DB.parts).map(p => new Option(p, p)));
  fillExercises();
  $('#sheet').hidden = false;
}

/* ---------- 백업 ---------- */
function exportData(){
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
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
      if (!confirm(`식사 ${incoming.meals.length}건, 운동 ${incoming.sessions.length}건으로 덮어씁니다. 지금 기록은 사라집니다.`)) return;
      S = incoming; save(); renderToday(); renderSettings();
      alert('불러왔습니다.');
    } catch (e) {
      alert('이 파일을 읽을 수 없습니다. gym-log에서 내보낸 JSON이 맞는지 확인해 주세요.');
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
    save();
    ev.target.reset();
    $('#meal-name').focus();
    renderToday();
  });

  for (const b of document.querySelectorAll('.tabbar button')) b.onclick = () => show(b.dataset.view);

  $('#open-log').onclick = openSheet;
  $('#sheet-close').onclick = () => { $('#sheet').hidden = true; };
  $('#sheet').addEventListener('click', ev => { if (ev.target.id === 'sheet') $('#sheet').hidden = true; });
  $('#sel-part').onchange = fillExercises;
  $('#sel-ex').onchange = showHow;

  $('#btn-addset').onclick = () => {
    const w = parseFloat($('#in-weight').value);
    const r = parseInt($('#in-reps').value, 10);
    if (!Number.isFinite(r) || r <= 0) { $('#in-reps').focus(); return; }
    pendingSets.push([Number.isFinite(w) ? w : 0, r]);
    $('#in-reps').value = '';
    renderSets();
    $('#in-reps').focus();
  };

  $('#btn-save').onclick = () => {
    if (!pendingSets.length) { alert('세트를 하나 이상 추가해 주세요.'); return; }
    S.sessions.push({ id: Date.now(), date: today(), exerciseId: $('#sel-ex').value, sets: pendingSets });
    save();
    $('#sheet').hidden = true;
    renderWorkout();
  };

  $('#btn-export').onclick = exportData;
  $('#file-import').onchange = ev => { if (ev.target.files[0]) importData(ev.target.files[0]); ev.target.value = ''; };

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('오프라인 캐시를 켜지 못했습니다.', e));
  }
}

init();
