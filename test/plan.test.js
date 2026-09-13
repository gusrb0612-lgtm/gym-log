'use strict';
const P = require('../plan.js');

let pass = 0, fail = 0;
function is(label, got, want, tol = 0.05){
  const ok = typeof want === 'number' ? Math.abs(got - want) <= tol : JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${label} = ${got}`); }
  else    { fail++; console.log(`  FAIL ${label}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`); }
}
function section(t){ console.log('\n' + t); }

/* 기준 인물: 80kg, 체지방 20%, 주 3~5회 운동 */
section('기본 계산 — 80kg / 체지방 20% / 활동 1.55');
is('제지방량',   P.leanMass(80, 20), 64);
is('기초대사량', P.bmr(64), 1752.4);         // 370 + 21.6×64
is('활동대사량', P.tdee(1752.4, 1.55), 2716.22);

section('현실적인 목표 — 12주에 80 → 70kg');
const a = P.buildPlan({ sex:'m', weightKg:80, bodyFatPct:20, activity:1.55, goalWeightKg:70, weeks:12 });
is('주당 감량',      a.kgPerWeek, -0.83);
is('하루 목표 kcal', a.target.kcal, 1800, 2);
is('하한에 걸림',    a.target.clamped, false);
is('목표 유형',      a.goalType, 'cut');

section('과한 목표는 기초대사량에서 잡힌다 — 6주에 80 → 70kg');
const b = P.buildPlan({ sex:'m', weightKg:80, bodyFatPct:20, activity:1.55, goalWeightKg:70, weeks:6 });
is('요구된 주당 감량', b.kgPerWeek, -1.67);
is('하한에 걸림',      b.target.clamped, true);
is('하루 목표 = 기초대사량', b.target.kcal, 1752, 1);
is('실제 가능한 주당 감량',  b.target.actualKgPerWeek, -0.88, 0.02);
is('속도 경고 뜸',     b.rate.level, 'warn');

section('여성 최저선 1200 kcal');
const c = P.dailyTarget({ tdeeKcal:1400, bmrKcal:1100, sex:'f', kgPerWeek:-1 });
is('하한 1200 적용', c.kcal, 1200);
is('하한에 걸림',    c.clamped, true);

section('탄단지 — 합이 목표 칼로리와 맞아야 한다');
const m = P.macros(1800, 64, 80, 'cut');
is('단백질 g', m.protein, 141);
is('지방 g',   m.fat, 64);
is('탄수 g',   m.carb, 165);
is('합산 kcal', m.protein*4 + m.fat*9 + m.carb*4, 1800, 4);
is('초과 없음', m.overflow, false);

section('소모 칼로리 추정');
is('러닝머신 30분 (MET 9.8, 80kg)',
   P.burn({ cardio:{min:30} }, { kind:'cardio', met:9.8 }, 80), 412, 1);
is('근력 3세트 (MET 5, 80kg, 세트당 3분)',
   P.burn({ sets:[[60,10],[60,8],[60,8]] }, { kind:'strength', met:5 }, 80), 63, 1);
is('체중 없으면 0', P.burn({ sets:[[60,10]] }, { kind:'strength' }, 0), 0);

section('속도 판정');
is('감량 0.8%/주',  P.rateCheck(-0.64, 80).level, 'ok');
is('감량 1.5%/주',  P.rateCheck(-1.2, 80).level, 'warn');
is('증량 0.4%/주',  P.rateCheck(0.32, 80).level, 'ok');
is('증량 0.9%/주',  P.rateCheck(0.72, 80).level, 'warn');
is('유지',          P.rateCheck(0, 80).level, 'ok');

section('목표를 체지방률로 준 경우 — 20% → 12%');
const d = P.buildPlan({ sex:'m', weightKg:80, bodyFatPct:20, activity:1.55, goalFatPct:12, weeks:16 });
is('목표 체중 (제지방 유지 가정)', d.goalWeightKg, 72.7, 0.1);   // 64 / 0.88
is('감량폭', d.deltaKg, -7.3, 0.1);
is('목표 유형', d.goalType, 'cut');

section('증량');
const e = P.buildPlan({ sex:'m', weightKg:70, bodyFatPct:12, activity:1.55, goalWeightKg:74, weeks:16 });
is('목표 유형', e.goalType, 'bulk');
is('잉여 칼로리', e.target.kcal > e.tdee, true);
is('단백질 계수 2.0', e.macro.protein, Math.round(70*0.88*2.0), 1);

console.log(`\n${pass}개 통과, ${fail}개 실패`);
process.exit(fail ? 1 : 0);
