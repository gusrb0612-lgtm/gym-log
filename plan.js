'use strict';
/*
 * 인바디 수치와 목표로 하루 목표 칼로리·영양소·운동량을 계산한다.
 *
 * 전부 순수 함수다 — DOM 도 저장소도 건드리지 않는다. node 로 단위 테스트가 된다.
 *
 * 근거로 쓴 공식:
 *  - 기초대사량: Katch-McArdle (370 + 21.6 × 제지방량). 체지방률을 알 때 쓰는 식이고,
 *    인바디가 그걸 주므로 키/나이만 쓰는 식보다 이 사람에게 맞다.
 *  - 소모 칼로리: MET × 3.5 × 체중 / 200 = 분당 kcal
 *  - 체지방 1kg ≈ 7700 kcal
 *
 * 이건 추정치다. 의학적 조언이 아니다.
 */

const KCAL_PER_KG_FAT = 7700;

const ACTIVITY = [
  { id: 1.2,   label: '거의 안 움직임',     hint: '앉아서 일하고 따로 운동 안 함' },
  { id: 1.375, label: '가벼움 (주 1~3회)',  hint: '가벼운 운동' },
  { id: 1.55,  label: '보통 (주 3~5회)',    hint: '꾸준히 운동' },
  { id: 1.725, label: '활발 (주 6~7회)',    hint: '거의 매일 운동' },
  { id: 1.9,   label: '매우 활발',          hint: '육체노동 또는 하루 2회 운동' }
];

/* 제지방량 — 인바디 체지방률에서 바로 나온다 */
const leanMass = (weightKg, fatPct) => weightKg * (1 - fatPct / 100);

/* 기초대사량 (Katch-McArdle) */
const bmr = lbmKg => 370 + 21.6 * lbmKg;

/* 활동대사량 */
const tdee = (bmrKcal, activity) => bmrKcal * activity;

/* 하루 칼로리 목표.
 * 안전장치: 기초대사량과 성별 최저선(남 1500 / 여 1200) 아래로는 절대 내려가지 않는다.
 * 목표가 그보다 공격적이면 잡아서 실제 가능한 속도를 되돌려준다. */
function dailyTarget({ tdeeKcal, bmrKcal, sex, kgPerWeek }){
  const wanted = tdeeKcal + (kgPerWeek * KCAL_PER_KG_FAT) / 7;
  const floor = Math.max(bmrKcal, sex === 'f' ? 1200 : 1500);
  const kcal = Math.max(wanted, floor);
  const clamped = kcal > wanted + 0.5;
  return {
    kcal: Math.round(kcal),
    floor: Math.round(floor),
    clamped,
    // 잡혔다면 이 칼로리로 실제 낼 수 있는 속도
    actualKgPerWeek: +(((kcal - tdeeKcal) * 7) / KCAL_PER_KG_FAT).toFixed(2)
  };
}

/* 주당 변화 속도가 안전 범위인지.
 * 감량은 체중의 0.5~1.0%/주, 증량은 0.25~0.5%/주가 일반적인 권장 범위다. */
function rateCheck(kgPerWeek, weightKg){
  const pct = Math.abs(kgPerWeek) / weightKg * 100;
  if (kgPerWeek === 0) return { level:'ok', text:'체지방 유지' };
  if (kgPerWeek < 0) {
    if (pct > 1.0) return { level:'warn', text:`주당 체지방 ${Math.abs(kgPerWeek).toFixed(2)}kg — 너무 빠릅니다. 근육 손실이 커집니다` };
    if (pct < 0.25) return { level:'slow', text:`주당 체지방 ${Math.abs(kgPerWeek).toFixed(2)}kg — 느리지만 안전합니다` };
    return { level:'ok', text:`주당 체지방 ${Math.abs(kgPerWeek).toFixed(2)}kg — 적정 범위입니다` };
  }
  if (pct > 0.5) return { level:'warn', text:`주당 체중의 ${pct.toFixed(1)}% 증량 — 체지방이 같이 붙습니다` };
  return { level:'ok', text:`주당 체중의 ${pct.toFixed(2)}% 증량 — 적정 범위입니다` };
}

/* 탄단지. 단백질은 제지방량 기준으로 잡는다 — 체중 기준으로 잡으면
 * 체지방이 많을수록 과하게 나온다. */
function macros(kcal, lbmKg, weightKg, goalType){
  const proteinPerLbm = (goalType === 'cut' || goalType === 'recomp') ? 2.2
                      : goalType === 'bulk' ? 2.0 : 1.8;
  const protein = Math.round(lbmKg * proteinPerLbm);
  const fat = Math.max(Math.round(kcal * 0.25 / 9), Math.round(weightKg * 0.8));
  const carbKcal = kcal - protein * 4 - fat * 9;
  return {
    protein, fat,
    carb: Math.max(0, Math.round(carbKcal / 4)),
    // 단백질과 지방만으로 목표 칼로리를 넘으면 탄수를 0으로 깎아도 초과한다
    overflow: carbKcal < 0
  };
}

/* 한 기록의 소모 칼로리 추정.
 * 유산소는 실제 시간, 근력은 세트당 3분(수행+휴식)으로 잡는다.
 * 근력 쪽은 원래 오차가 크다 — 화면에 '추정'이라고 밝힌다. */
function burn(session, exercise, weightKg){
  if (!exercise || !weightKg) return 0;
  const met = exercise.met || (exercise.kind === 'cardio' ? 7 : 5);
  const minutes = session.cardio ? session.cardio.min : (session.sets || []).length * 3;
  return Math.round(met * 3.5 * weightKg / 200 * minutes);
}

/* 목표까지 남은 기간 */
function weeksToGoal(currentKg, targetKg, kgPerWeek){
  if (!kgPerWeek) return null;
  const w = (targetKg - currentKg) / kgPerWeek;
  return w > 0 ? Math.ceil(w) : null;
}

/* 근육이 붙는 속도는 한계가 있다. 월 0.5kg(골격근량 기준)을 넘으면 낙관적이다 —
 * 운동을 막 시작했다면 더 빠를 수 있지만 목표로 잡을 값은 아니다. */
function muscleCheck(smmDeltaKg, weeks){
  if (smmDeltaKg <= 0.2) return null;
  const perMonth = smmDeltaKg / (weeks / 4.345);
  if (perMonth > 0.5) return {
    level: 'warn',
    text: `골격근량을 월 ${perMonth.toFixed(2)}kg 늘리는 목표입니다. 보통 월 0.5kg 정도가 현실적인 상한입니다`
  };
  return { level:'ok', text:`골격근량 월 +${perMonth.toFixed(2)}kg — 현실적인 속도입니다` };
}

/* 인바디 수치 → 목표.
 *
 * 골격근량(SMM)과 제지방량(LBM)은 다르다. LBM 은 근육 말고 뼈·장기·수분도 포함한다.
 * 인구 평균 비율을 쓰지 않고 이 사람의 현재 인바디에서 나온 비율을 그대로 쓴다.
 *
 * 칼로리는 '체지방량' 변화로 계산한다 — 체중 변화로 잡으면 근육이 늘면서 살이 빠지는
 * 경우(리컴프) 완전히 틀린 값이 나온다. */
function buildPlan(p){
  const lbmKg = leanMass(p.weightKg, p.bodyFatPct);
  const bmrK  = bmr(lbmKg);
  const tdeeK = tdee(bmrK, p.activity);

  const ratio = lbmKg / p.smmKg;                 // 제지방량 / 골격근량
  const ratioOdd = !(ratio > 1.3 && ratio < 3.0); // 인바디 수치가 이상할 때

  const goalLbm    = p.goalSmmKg * ratio;
  const goalWeight = goalLbm / (1 - p.goalFatPct / 100);

  const fatNow  = p.weightKg  - lbmKg;
  const fatGoal = goalWeight * p.goalFatPct / 100;
  const fatDelta = fatGoal - fatNow;
  const smmDelta = p.goalSmmKg - p.smmKg;

  const fatKgPerWeek = p.weeks > 0 ? fatDelta / p.weeks : 0;
  const goalType = fatDelta < -0.5 && smmDelta > 0.5 ? 'recomp'
                 : fatDelta < -0.5 ? 'cut'
                 : smmDelta > 0.5  ? 'bulk' : 'maintain';

  const target = dailyTarget({ tdeeKcal: tdeeK, bmrKcal: bmrK, sex: p.sex, kgPerWeek: fatKgPerWeek });

  return {
    lbmKg: +lbmKg.toFixed(1),
    fatMassKg: +fatNow.toFixed(1),
    ratio: +ratio.toFixed(2), ratioOdd,
    bmr: Math.round(bmrK),
    tdee: Math.round(tdeeK),
    goalWeightKg: +goalWeight.toFixed(1),
    goalFatMassKg: +fatGoal.toFixed(1),
    fatDeltaKg: +fatDelta.toFixed(1),
    smmDeltaKg: +smmDelta.toFixed(1),
    weightDeltaKg: +(goalWeight - p.weightKg).toFixed(1),
    fatKgPerWeek: +fatKgPerWeek.toFixed(2),
    goalType, target,
    rate: rateCheck(target.actualKgPerWeek, p.weightKg),
    muscle: muscleCheck(smmDelta, p.weeks),
    macro: macros(target.kcal, lbmKg, p.weightKg, goalType),
    weeksNeeded: weeksToGoal(fatNow, fatGoal, target.actualKgPerWeek)
  };
}

if (typeof module !== 'undefined') module.exports = {
  ACTIVITY, leanMass, bmr, tdee, dailyTarget, rateCheck, macros, burn, weeksToGoal, muscleCheck, buildPlan
};
