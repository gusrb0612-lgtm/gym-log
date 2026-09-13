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

/* 기준 인물: 80kg, 체지방 20%(=제지방 64kg), 골격근량 35kg */
const ME = { sex:'m', weightKg:80, bodyFatPct:20, smmKg:35, activity:1.55 };

section('골격근량 + 체지방률 목표 — 35→36kg / 20→15% / 16주');
const a = P.buildPlan({ ...ME, goalSmmKg:36, goalFatPct:15, weeks:16 });
is('제지방/골격근 비율', a.ratio, 1.83, 0.01);
is('비율 이상 없음',     a.ratioOdd, false);
is('목표 체중 (역산)',   a.goalWeightKg, 77.4, 0.1);
is('체지방 변화',        a.fatDeltaKg, -4.4, 0.1);
is('골격근 변화',        a.smmDeltaKg, 1);
is('체중 변화',          a.weightDeltaKg, -2.6, 0.1);
is('유형 = 리컴프',      a.goalType, 'recomp');
is('하루 목표 kcal',     a.target.kcal, 2415, 2);
is('하한에 안 걸림',     a.target.clamped, false);
is('단백질 (리컴프 2.2)', a.macro.protein, 141);
is('근육 속도 판정',     a.muscle.level, 'ok');

section('체지방량 기준이라 근육이 늘어도 칼로리가 안 틀린다');
// 같은 체중 목표인데 근육만 다른 두 경우 — 체중 변화는 같지만 체지방 변화가 다르다
const keepMuscle = P.buildPlan({ ...ME, goalSmmKg:35, goalFatPct:15, weeks:16 });
is('근육 유지 시 체지방 변화', keepMuscle.fatDeltaKg, -4.7, 0.1);
is('근육 +1kg 시 체지방 변화', a.fatDeltaKg, -4.4, 0.1);
is('근육을 늘리면 적자가 작아진다', a.target.kcal > keepMuscle.target.kcal, true);

section('과한 목표 — 골격근 35→40kg / 체지방 20→10% / 8주');
const b = P.buildPlan({ ...ME, goalSmmKg:40, goalFatPct:10, weeks:8 });
is('하한에 걸림',        b.target.clamped, true);
is('하루 목표 = 기초대사량', b.target.kcal, 1752, 1);
is('체지방 속도 경고',   b.rate.level, 'warn');
is('근육 속도 경고',     b.muscle.level, 'warn');
is('근육 경고 문구', b.muscle.text.includes('월 0.5kg'), true);

section('순수 증량 — 체지방률 그대로, 골격근만 +2kg');
const c = P.buildPlan({ ...ME, goalSmmKg:37, goalFatPct:20, weeks:20 });
is('유형 = 증량',    c.goalType, 'bulk');
is('잉여 칼로리',    c.target.kcal > c.tdee, true);
is('단백질 (증량 2.0)', c.macro.protein, 128);

section('유지');
const d = P.buildPlan({ ...ME, goalSmmKg:35, goalFatPct:20, weeks:12 });
is('유형 = 유지',   d.goalType, 'maintain');
is('목표 = 활동대사량', d.target.kcal, d.tdee, 2);

section('인바디 수치가 이상하면 표시한다');
const odd = P.buildPlan({ ...ME, smmKg:60, goalSmmKg:60, goalFatPct:20, weeks:12 });
is('골격근량 > 제지방량 감지', odd.ratioOdd, true);

section('여성 최저선 1200 kcal');
const f = P.dailyTarget({ tdeeKcal:1400, bmrKcal:1100, sex:'f', kgPerWeek:-1 });
is('하한 1200 적용', f.kcal, 1200);
is('하한에 걸림',    f.clamped, true);

section('탄단지 — 합이 목표 칼로리와 맞아야 한다');
const m = P.macros(1800, 64, 80, 'cut');
is('단백질 g', m.protein, 141);
is('지방 g',   m.fat, 64);
is('탄수 g',   m.carb, 165);
is('합산 kcal', m.protein*4 + m.fat*9 + m.carb*4, 1800, 4);

section('소모 칼로리 추정');
is('러닝머신 30분 (MET 9.8, 80kg)',
   P.burn({ cardio:{min:30} }, { kind:'cardio', met:9.8 }, 80), 412, 1);
is('근력 3세트 (MET 5, 80kg, 세트당 3분)',
   P.burn({ sets:[[60,10],[60,8],[60,8]] }, { kind:'strength', met:5 }, 80), 63, 1);
is('체중 없으면 0', P.burn({ sets:[[60,10]] }, { kind:'strength' }, 0), 0);

section('속도 판정 (체지방 기준)');
is('주 0.64kg / 80kg',  P.rateCheck(-0.64, 80).level, 'ok');
is('주 1.2kg / 80kg',   P.rateCheck(-1.2, 80).level, 'warn');
is('유지',              P.rateCheck(0, 80).level, 'ok');

section('근육 증가 속도');
is('월 0.27kg', P.muscleCheck(1, 16).level, 'ok');
is('월 2.7kg',  P.muscleCheck(5, 8).level, 'warn');
is('변화 없음', P.muscleCheck(0, 12), null);

console.log(`\n${pass}개 통과, ${fail}개 실패`);
process.exit(fail ? 1 : 0);
