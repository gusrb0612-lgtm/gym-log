'use strict';

const KEY = 'gym-log';
const VERSION = 5;
let DB = { parts: {}, exercises: [] };   // data/exercises.json (기본 제공)
let S  = blank();
let pendingSets = [];

/* ---------- 저장 ---------- */
function blank(){ return { version: VERSION, meals: [], sessions: [], custom: [], customRegions: {}, profile: null, hidden: [] }; }

/* v4 까지는 목표가 '체중' 또는 '체지방률' 이었다. 이제 골격근량 + 체지방률로 받는다.
 * 옛 목표는 그대로 쓸 수 없으니 비우되, 인바디 수치는 살려서 다시 묻는 수고를 줄인다. */
function migrateProfile(p){
  if (!p || typeof p !== 'object') return null;
  return {
    sex: p.sex || 'm',
    weightKg: p.weightKg, bodyFatPct: p.bodyFatPct, smmKg: p.smmKg || null,
    activity: p.activity || 1.55,
    goalSmmKg: p.goalSmmKg != null ? p.goalSmmKg : null,
    goalFatPct: p.goalFatPct != null ? p.goalFatPct : null,
    weeks: p.weeks || null
  };
}

const profileReady = p => !!p && [p.weightKg, p.bodyFatPct, p.smmKg, p.goalSmmKg, p.goalFatPct, p.weeks]
  .every(v => Number.isFinite(v) && v > 0);

function migrate(d){
  if (!d || typeof d !== 'object') return blank();
  // v1 에는 custom / customRegions 가 없었다. 기록은 그대로 두고 빈 값만 채운다.
  return {
    version: VERSION,
    meals: Array.isArray(d.meals) ? d.meals : [],
    sessions: Array.isArray(d.sessions) ? d.sessions : [],
    custom: Array.isArray(d.custom) ? d.custom : [],
    customRegions: (d.customRegions && typeof d.customRegions === 'object') ? d.customRegions : {},
    profile: migrateProfile(d.profile),
    hidden: Array.isArray(d.hidden) ? d.hidden : []
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
const everyExercise = () => DB.exercises.concat(S.custom);          // 숨긴 것 포함
const allExercises  = () => everyExercise().filter(e => !S.hidden.includes(e.id));  // 화면에 보일 것
const exById = id => everyExercise().find(e => e.id === id);        // 과거 기록은 숨겨도 이름이 나와야 한다
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


function renderEquip(){
  const hiddenCount = S.hidden.length;
  $('#equip-count').textContent = hiddenCount ? `${hiddenCount}개 꺼둠` : `${DB.exercises.length}개`;
  const groups = partNames().map(part => {
    const list = DB.exercises.filter(e => e.part === part);
    if (!list.length) return null;
    const wrap = document.createElement('div');
    const lab = document.createElement('p'); lab.className = 'fieldlabel'; lab.textContent = part;
    const chips = document.createElement('div'); chips.className = 'chips-pick';
    for (const e of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip pickable';
      b.textContent = e.name;
      const paint = () => {
        const off = S.hidden.includes(e.id);
        b.classList.toggle('off', off);
        b.setAttribute('aria-pressed', String(!off));
        b.setAttribute('aria-label', `${e.name} ${off ? '켜기' : '끄기'}`);
      };
      paint();
      b.onclick = () => {
        S.hidden = S.hidden.includes(e.id) ? S.hidden.filter(x => x !== e.id) : S.hidden.concat(e.id);
        save(); paint();
        $('#equip-count').textContent = S.hidden.length ? `${S.hidden.length}개 꺼둠` : `${DB.exercises.length}개`;
      };
      chips.append(b);
    }
    wrap.append(lab, chips);
    return wrap;
  }).filter(Boolean);
  $('#equip-groups').replaceChildren(...groups);
}

function renderSettings(){
  renderEquip();
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
const TITLES = { today:'오늘', workout:'운동', plan:'목표', settings:'설정' };
function show(view){
  for (const el of document.querySelectorAll('.view')) el.hidden = el.id !== `view-${view}`;
  for (const b of document.querySelectorAll('.tabbar button')) b.classList.toggle('on', b.dataset.view === view);
  $('#view-title').textContent = TITLES[view];
  renderToday();   // 헤더 kcal 배지는 어느 탭에서든 오늘 값을 보여준다
  if (view === 'workout') renderWorkout();
  if (view === 'plan') renderPlan();
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


/* ---------- 목표 탭 ---------- */
function todayBurn(){
  const t = today();
  const w = S.profile ? S.profile.weightKg : 0;
  return S.sessions.filter(s => s.date === t)
                   .reduce((a, s) => a + burn(s, exById(s.exerciseId), w), 0);
}

function kv(box, pairs){
  box.replaceChildren(...pairs.flatMap(([k, v]) => {
    const a = document.createElement('dt'); a.textContent = k;
    const b = document.createElement('dd'); b.textContent = v;
    return [a, b];
  }));
}

function cardioOffset(excessKcal){
  const w = S.profile.weightKg;
  return allExercises()
    .filter(e => e.kind === 'cardio' && e.met)
    .slice(0, 3)
    .map(e => `${e.name} ${Math.ceil(excessKcal / (e.met * 3.5 * w / 200))}분`)
    .join(' · ');
}

function renderPlan(){
  const p = S.profile;
  const ready = profileReady(p);
  $('#plan-empty').hidden = ready;
  for (const id of ['#plan-today', '#plan-advice', '#plan-detail']) $(id).hidden = !ready;
  fillProfileForm();
  if (!ready) return;

  const plan = buildPlan(p);

  const t = today();
  const eaten = S.meals.filter(m => m.date === t).reduce((a, m) => a + m.kcal, 0);
  const burned = todayBurn();
  const left = plan.target.kcal - eaten + burned;

  const KO = { cut:'체지방 감량', bulk:'근육 증량', recomp:'리컴프', maintain:'유지' };
  const deltas = [];
  if (Math.abs(plan.smmDeltaKg) >= 0.1) deltas.push(`골격근 ${plan.smmDeltaKg > 0 ? '+' : ''}${plan.smmDeltaKg}kg`);
  if (Math.abs(plan.fatDeltaKg) >= 0.1) deltas.push(`체지방 ${plan.fatDeltaKg > 0 ? '+' : ''}${plan.fatDeltaKg}kg`);
  $('#plan-goaltype').textContent = KO[plan.goalType] + (deltas.length ? ' · ' + deltas.join(' / ') : '');

  $('#b-target').textContent = plan.target.kcal.toLocaleString('ko-KR');
  $('#b-eaten').textContent  = eaten.toLocaleString('ko-KR');
  $('#b-burn').textContent   = burned.toLocaleString('ko-KR');
  $('#b-left').textContent   = left.toLocaleString('ko-KR');
  $('#b-left').classList.toggle('over', left < 0);
  $('#burn-note').textContent = burned
    ? '운동 소모는 MET 기반 추정치입니다. 근력 운동 쪽은 오차가 큽니다.'
    : '오늘 운동 기록을 남기면 소모 칼로리가 더해집니다.';

  const m = plan.macro;
  $('#macro-row').replaceChildren(...[
    ['단백질', m.protein, 4], ['탄수화물', m.carb, 4], ['지방', m.fat, 9]
  ].map(([label, g, perG]) => {
    const d = document.createElement('div'); d.className = 'macro';
    const n = document.createElement('span'); n.className = 'm-num'; n.textContent = `${g}g`;
    const l = document.createElement('span'); l.className = 'm-lab'; l.textContent = label;
    const k = document.createElement('span'); k.className = 'm-kcal'; k.textContent = `${(g*perG).toLocaleString('ko-KR')} kcal`;
    d.append(n, l, k);
    return d;
  }));

  const items = [];
  if (plan.ratioOdd) items.push({ warn:true, ttl:'인바디 수치를 확인해 주세요',
    sub:`골격근량 ${p.smmKg}kg 이 제지방량 ${plan.lbmKg}kg 과 맞지 않습니다. 보통 골격근량은 제지방량의 절반 남짓입니다.` });
  if (plan.target.clamped) items.push({ warn:true, ttl:'목표 기간이 너무 짧습니다',
    sub:`계산된 식단이 기초대사량(${plan.bmr.toLocaleString('ko-KR')} kcal) 아래로 내려가서 거기서 멈췄습니다. ` +
        `이 칼로리로는 주당 체지방 ${Math.abs(plan.target.actualKgPerWeek)}kg 정도가 한계입니다.` });
  if (plan.rate.level === 'warn')   items.push({ warn:true, ttl:'체지방 감량 속도 주의', sub:plan.rate.text });
  if (plan.muscle && plan.muscle.level === 'warn') items.push({ warn:true, ttl:'근육 증가 목표가 낙관적입니다', sub:plan.muscle.text });

  if (left < 0) items.push({ ttl:`목표보다 ${Math.abs(left).toLocaleString('ko-KR')} kcal 초과`,
                             sub:`상쇄하려면 — ${cardioOffset(Math.abs(left))}` });
  else items.push({ ttl:`${left.toLocaleString('ko-KR')} kcal 남았습니다`, sub:plan.rate.text });

  const last = lastByPart();
  const stale = partNames().filter(x => x !== '유산소')
    .map(part => ({ part, d: last[part].date ? daysSince(last[part].date) : 999 }))
    .sort((a, b) => b.d - a.d).slice(0, 3);
  for (const { part, d } of stale) {
    const coldest = regionsOf(part)
      .map(r => ({ r, d: last[part].regions[r] ? daysSince(last[part].regions[r]) : 999 }))
      .sort((a, b) => b.d - a.d)[0];
    items.push({
      ttl: part + (coldest ? ` · ${coldest.r}` : ''),
      sub: d === 999 ? '아직 기록 없음' : `마지막 ${agoText(d)}` +
           (coldest && coldest.d === 999 ? ` — ${coldest.r}는 한 번도 안 했습니다` : '')
    });
  }

  $('#advice-list').replaceChildren(...items.map(it => {
    const li = row(it.ttl, it.sub);
    if (it.warn) li.classList.add('warn-row');
    return li;
  }));

  kv($('#calc-kv'), [
    ['골격근량', `${p.smmKg} kg → ${p.goalSmmKg} kg`],
    ['체지방률', `${p.bodyFatPct}% → ${p.goalFatPct}%`],
    ['제지방량', `${plan.lbmKg} kg`],
    ['체지방량', `${plan.fatMassKg} kg → ${plan.goalFatMassKg} kg`],
    ['체중 (역산)', `${S.profile.weightKg} kg → ${plan.goalWeightKg} kg`],
    ['기초대사량', `${plan.bmr.toLocaleString('ko-KR')} kcal`],
    ['활동대사량', `${plan.tdee.toLocaleString('ko-KR')} kcal`],
    ['하루 목표', `${plan.target.kcal.toLocaleString('ko-KR')} kcal`],
    ['주당 체지방', `${plan.target.actualKgPerWeek} kg`],
    ['목표까지', plan.weeksNeeded ? `약 ${plan.weeksNeeded}주` : '—']
  ]);
}

function fillProfileForm(){
  if (!$('#pf-activity').options.length) {
    $('#pf-activity').replaceChildren(...ACTIVITY.map(a => new Option(`${a.label} — ${a.hint}`, a.id)));
    $('#pf-activity').value = 1.55;
  }
  const p = S.profile;
  if (!p) return;
  const set = (sel, v) => { if (Number.isFinite(v) && v > 0) $(sel).value = v; };
  $('#pf-sex').value = p.sex;
  set('#pf-weight', p.weightKg);
  set('#pf-fat', p.bodyFatPct);
  set('#pf-smm', p.smmKg);
  $('#pf-activity').value = p.activity;
  set('#pf-goal-smm', p.goalSmmKg);
  set('#pf-goal-fat', p.goalFatPct);
  set('#pf-weeks', p.weeks);
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


  $('#profile-form').addEventListener('submit', ev => {
    ev.preventDefault();
    const num = sel => parseFloat($(sel).value);
    const prof = {
      sex: $('#pf-sex').value,
      weightKg: num('#pf-weight'), bodyFatPct: num('#pf-fat'), smmKg: num('#pf-smm'),
      activity: parseFloat($('#pf-activity').value),
      goalSmmKg: num('#pf-goal-smm'), goalFatPct: num('#pf-goal-fat'),
      weeks: parseInt($('#pf-weeks').value, 10)
    };
    if (!profileReady(prof)) { alert('빈 칸을 모두 채워 주세요.'); return; }
    S.profile = prof; save(); renderPlan();
  });

  $('#btn-export').onclick = exportData;
  $('#file-import').onchange = ev => { if (ev.target.files[0]) importData(ev.target.files[0]); ev.target.value = ''; };

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('오프라인 캐시를 켜지 못했습니다.', e));
  }
}

init();
