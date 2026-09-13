'use strict';
/*
 * 졸라맨 자세 렌더러.
 *
 * 종목마다 그림을 따로 그리지 않는다. 관절 각도 몇 개로 자세를 정의하고
 * 여기서 SVG 를 만든다 — 그래야 사용자가 새로 추가한 종목에도 그림이 붙는다.
 *
 * 각도는 수학 좌표계 기준(0 = 오른쪽, 90 = 위). SVG 는 y 가 아래로 가므로 dir() 에서 뒤집는다.
 * face 는 몸이 바라보는 쪽: 1 이면 몸통각-90 방향이 몸의 앞면, -1 이면 반대.
 */

const SEG = { torso: 58, head: 12, upperArm: 29, foreArm: 27, thigh: 36, shin: 34 };
const HIP = [100, 172];
const NS = 'http://www.w3.org/2000/svg';

const rad = d => d * Math.PI / 180;
const dir = d => [Math.cos(rad(d)), -Math.sin(rad(d))];
const add = (p, d, len) => [p[0] + d[0] * len, p[1] + d[1] * len];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

/* 자세 프리셋 — 사용자가 새 종목을 만들 때 이 이름 중에서 고른다. */
const POSES = {
  '누워서 밀기':      { torso:   0, face:-1, arm:[ 90,  90], leg:[190, 255], props:['bench','bar'] },
  '기대 누워 밀기':   { torso:  32, face:-1, arm:[122, 122], leg:[205, 268], props:['bench','bar'] },
  '앉아서 위로 밀기': { torso:  88, face: 1, arm:[105,  95], leg:[  0, 270], props:['seat','dumbbell'] },
  '앉아서 앞으로 밀기':{ torso:  88, face: 1, arm:[ 15,   5], leg:[  0, 270], props:['seat','handle'] },
  '앉아서 모으기':    { torso:  88, face: 1, arm:[ 10,  35], leg:[  0, 270], props:['seat','handle'] },
  '몸 들어올리기':    { torso:  80, face: 1, arm:[272, 270], leg:[238, 296], props:['dip-bars'] },
  '위에서 당기기':    { torso:  98, face: 1, arm:[ 78,  88], leg:[  0, 270], props:['seat','cable-up','bar'] },
  '앉아서 당기기':    { torso:  90, face: 1, arm:[ 10, 170], leg:[  5, 275], props:['seat','cable-front','handle'] },
  '숙여서 당기기':    { torso:  40, face: 1, arm:[285, 285], leg:[290, 265], props:['floor','bar'] },
  '힙 힌지':          { torso:  35, face: 1, arm:[280, 280], leg:[285, 265], props:['floor'] },
  '옆으로 들기':      { torso:  90, face: 1, arm:[  5,   0], leg:[275, 272], props:['floor','dumbbell'] },
  '뒤로 벌리기':      { torso:  88, face: 1, arm:[ 20, 350], leg:[  0, 270], props:['seat','handle'] },
  '스쿼트':           { torso:  62, face: 1, arm:[195, 115], leg:[352, 252], props:['floor','bar-shoulder'] },
  '누워서 다리 밀기': { torso:   8, face:-1, arm:[175, 175], leg:[ 62, 100], props:['bench','plate'] },
  '앉아서 다리 펴기': { torso:  88, face: 1, arm:[280, 300], leg:[  0,   0], props:['seat','pad-shin'] },
  '엎드려 다리 접기': { torso: 182, face: 1, arm:[175, 175], leg:[352, 300], props:['bench','pad-shin'] },
  '서서 발목':        { torso:  90, face: 1, arm:[272, 272], leg:[272, 270], props:['step'] },
  '서서 컬':          { torso:  90, face: 1, arm:[272,  25], leg:[273, 271], props:['floor','bar'] },
  '서서 아래로 밀기': { torso:  88, face: 1, arm:[278, 285], leg:[273, 271], props:['floor','cable-up','handle'] },
  '매달리기':         { torso:  92, face: 1, arm:[ 88,  90], leg:[315, 300], props:['bar-overhead'] },
  '비틀기':           { torso:  90, face: 1, arm:[ 15,  10], leg:[272, 270], props:['floor','cable-side','handle'] },
  '달리기':           { torso:  82, face: 1, arm:[300,  10], leg:[325, 255], props:['floor'] },
  '자전거':           { torso:  58, face: 1, arm:[  8,   0], leg:[ 10, 290], props:['bike'] },
  '없음':             null
};

/* 세부부위가 몸의 어디인지 — [뼈대 segment, 위치 0~1, 앞(1)/옆(0)/뒤(-1)] */
const REGION_AT = {
  '상부':      ['torso', 0.78,  1], '중앙':     ['torso', 0.55,  1], '하부':   ['torso', 0.34,  1],
  '광배 상부': ['torso', 0.72, -1], '광배 하부':['torso', 0.45, -1],
  '중앙/승모': ['torso', 0.88, -1], '기립근':   ['torso', 0.25, -1],
  '전면':      ['torso', 0.9,   1], '측면':     ['torso', 0.9,   0], '후면':   ['torso', 0.9,  -1],
  '대퇴사두':  ['thigh', 0.5,   1], '햄스트링': ['thigh', 0.5,  -1],
  '둔근':      ['torso', 0.06, -1], '종아리':   ['shin',  0.5,  -1],
  '이두':      ['upperArm', 0.5,  1], '삼두':   ['upperArm', 0.5, -1],
  '복직근':    ['torso', 0.3,   1], '복사근':   ['torso', 0.34,  0]
};

function joints(p){
  const hip = HIP;
  const tD = dir(p.torso);
  const neck  = add(hip,  tD, SEG.torso);
  const head  = add(neck, tD, SEG.head + 3);
  const shoulder = add(hip, tD, SEG.torso * 0.9);   // 어깨는 목보다 아래다
  const elbow = add(shoulder, dir(p.arm[0]), SEG.upperArm);
  const hand  = add(elbow,    dir(p.arm[1]), SEG.foreArm);
  const knee  = add(hip,   dir(p.leg[0]), SEG.thigh);
  const foot  = add(knee,  dir(p.leg[1]), SEG.shin);
  return { hip, neck, head, shoulder, elbow, hand, knee, foot, tD };
}

function el(tag, attrs){
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}
const line = (a, b, cls) => el('line', { x1:a[0].toFixed(1), y1:a[1].toFixed(1), x2:b[0].toFixed(1), y2:b[1].toFixed(1), class:cls });

/* 세부부위 표시 위치 계산 — 몸 앞쪽이 어디인지로 좌우를 정하므로 자세가 바뀌어도 따라간다. */
function regionPoint(p, J, region){
  const spec = REGION_AT[region];
  if (!spec) return null;
  const [segName, t, side] = spec;
  const front = dir(p.torso - 90 * p.face);

  let a, b, ang;
  if (segName === 'torso')        { a = J.hip;   b = J.neck;  ang = p.torso; }
  else if (segName === 'thigh')   { a = J.hip;   b = J.knee;  ang = p.leg[0]; }
  else if (segName === 'shin')    { a = J.knee;  b = J.foot;  ang = p.leg[1]; }
  else if (segName === 'upperArm'){ a = J.shoulder; b = J.elbow; ang = p.arm[0]; }
  else return null;

  const base = [a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t];
  if (side === 0) return base;

  // 두 수직 방향 중 몸 앞쪽과 같은 편을 고른다
  const p1 = dir(ang + 90), p2 = dir(ang - 90);
  const frontPerp = dot(p1, front) >= dot(p2, front) ? p1 : p2;
  return add(base, frontPerp, 9 * side);
}

function drawProps(g, p, J){
  const front = dir(p.torso - 90 * p.face);
  for (const prop of p.props || []) {
    if (prop === 'floor')      g.append(line([28,214],[172,214],'fig-ground'));
    else if (prop === 'step')  { g.append(line([40,214],[160,214],'fig-ground')); g.append(el('rect',{x:76,y:198,width:48,height:16,class:'fig-gear'})); }
    else if (prop === 'bench') { const a = add(J.hip, front, -11), b = add(J.neck, front, -11); g.append(line(add(a,J.tD,-26), add(b,J.tD,14),'fig-bench')); }
    else if (prop === 'seat')  { g.append(line(add(J.hip,front,-10), add(add(J.hip,front,-10),J.tD,52),'fig-bench')); g.append(line([J.hip[0]-24,J.hip[1]+6],[J.hip[0]+22,J.hip[1]+6],'fig-bench')); }
    else if (prop === 'bar')   { g.append(line(add(J.hand,[1,0],-30), add(J.hand,[1,0],30),'fig-gear'));
                                 for (const dx of [-26,-22,22,26]) g.append(line([J.hand[0]+dx,J.hand[1]-9],[J.hand[0]+dx,J.hand[1]+9],'fig-gear')); }
    else if (prop === 'bar-shoulder') { g.append(line([J.neck[0]-32,J.neck[1]+3],[J.neck[0]+32,J.neck[1]+3],'fig-gear')); }
    else if (prop === 'bar-overhead') { g.append(line([36,J.hand[1]],[164,J.hand[1]],'fig-gear')); }
    else if (prop === 'dumbbell'){ g.append(line([J.hand[0]-8,J.hand[1]],[J.hand[0]+8,J.hand[1]],'fig-gear')); }
    else if (prop === 'dip-bars'){ for (const dx of [-34, 34]) g.append(line([J.hand[0]+dx-16,J.hand[1]],[J.hand[0]+dx+16,J.hand[1]],'fig-gear')); }
    else if (prop === 'handle') { g.append(el('circle',{cx:J.hand[0].toFixed(1),cy:J.hand[1].toFixed(1),r:6,class:'fig-gear'})); }
    else if (prop === 'plate')  { g.append(line(add(J.foot,dir(p.leg[1]+90),-16), add(J.foot,dir(p.leg[1]+90),16),'fig-gear')); }
    else if (prop === 'pad-shin'){ g.append(el('circle',{cx:J.foot[0].toFixed(1),cy:J.foot[1].toFixed(1),r:7,class:'fig-gear'})); }
    else if (prop === 'cable-up')   g.append(line(J.hand,[J.hand[0],30],'fig-cable'));
    else if (prop === 'cable-front')g.append(line(J.hand,[178,J.hand[1]],'fig-cable'));
    else if (prop === 'cable-side') g.append(line(J.hand,[178,J.hand[1]-16],'fig-cable'));
    else if (prop === 'bike')  { g.append(line([28,214],[172,214],'fig-ground'));
                                 g.append(el('circle',{cx:J.foot[0].toFixed(1),cy:J.foot[1].toFixed(1),r:18,class:'fig-gear'}));
                                 g.append(line([J.hip[0]-6,J.hip[1]+4],[J.hip[0]+16,J.hip[1]+4],'fig-bench')); }
  }
}

/* 공개 API — 자세 이름과 강조할 세부부위를 주면 SVG 를 돌려준다. */
function figureSVG(poseName, regions){
  const p = POSES[poseName];
  const svg = el('svg', { viewBox:'-12 26 201 220', class:'figure', role:'img',
                          'aria-label': poseName && p ? `${poseName} 자세` : '자세 그림 없음' });
  if (!p) return null;

  const J = joints(p);
  drawProps(svg, p, J);

  svg.append(
    el('circle', { cx:J.head[0].toFixed(1), cy:J.head[1].toFixed(1), r:SEG.head, class:'fig-body' }),
    line(J.hip, J.neck, 'fig-body'),
    line(J.shoulder, J.elbow, 'fig-body'), line(J.elbow, J.hand, 'fig-body'),
    line(J.hip, J.knee, 'fig-body'),   line(J.knee, J.foot, 'fig-body')
  );
  for (const j of [J.elbow, J.knee]) svg.append(el('circle',{cx:j[0].toFixed(1),cy:j[1].toFixed(1),r:2.5,class:'fig-joint'}));

  for (const r of regions || []) {
    const pt = regionPoint(p, J, r);
    if (!pt) continue;
    svg.append(el('circle', { cx:pt[0].toFixed(1), cy:pt[1].toFixed(1), r:8, class:'fig-target' }));
  }
  return svg;
}

const POSE_NAMES = Object.keys(POSES);
