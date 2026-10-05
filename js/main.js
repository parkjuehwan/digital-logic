/* ==========================================================
   Digital Logic from Zero — main.js

   이 파일은 크게 세 부분으로 나뉩니다.

   [A] 공통 데이터와 "회로 로직" 함수
       - 논리 게이트 정의 (LOGIC_GATES)
       - 7-Segment 진리표 (SEGMENT_TABLE)
       - Counter / Auto Clock / Decoder 함수
       → Binary Counter, MOD-10 Counter, Final Demo가 모두 같은 함수를 재사용합니다.

   [B] 그리기(렌더링) 도우미
       - 논리 게이트 SVG, 7-Segment SVG, 타이밍 파형, Truth Table

   [C] 페이지 UI
       - 사이드바 / breadcrumb / 이전·다음 버튼
       - 챕터별 인터랙티브 데모 초기화

   프레임워크나 빌드 도구 없이 index.html을 바로 열어도 동작하도록
   일반 <script>로 불러옵니다.
   ========================================================== */

'use strict';

/* ==========================================================
   [A] 공통 데이터와 회로 로직
   ========================================================== */

/** 7-Segment의 segment 이름 (진리표의 열 순서와 같음) */
const SEGMENT_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

/**
 * 숫자별 segment 진리표 (Common Cathode: 1 = ON, 0 = OFF)
 * SEGMENT_TABLE[숫자] = [a, b, c, d, e, f, g]
 */
const SEGMENT_TABLE = [
  [1, 1, 1, 1, 1, 1, 0], // 0
  [0, 1, 1, 0, 0, 0, 0], // 1
  [1, 1, 0, 1, 1, 0, 1], // 2
  [1, 1, 1, 1, 0, 0, 1], // 3
  [0, 1, 1, 0, 0, 1, 1], // 4
  [1, 0, 1, 1, 0, 1, 1], // 5
  [1, 0, 1, 1, 1, 1, 1], // 6
  [1, 1, 1, 0, 0, 0, 0], // 7
  [1, 1, 1, 1, 1, 1, 1], // 8
  [1, 1, 1, 1, 0, 1, 1], // 9
];

/** 모든 segment가 꺼진 상태 (잘못된 BCD 입력일 때 CD4511처럼 화면을 끔) */
const BLANK_SEGMENTS = [0, 0, 0, 0, 0, 0, 0];

/**
 * 논리 게이트 정의
 * - inputs: 입력 개수
 * - evaluate: 입력(0/1)을 받아 출력(0/1)을 돌려주는 함수
 */
const LOGIC_GATES = {
  NOT: {
    inputs: 1,
    evaluate: (a) => (a ? 0 : 1),
    expression: 'Q = A̅',
    meaning: '입력을 뒤집습니다. 0이면 1, 1이면 0.',
  },
  AND: {
    inputs: 2,
    evaluate: (a, b) => a & b,
    expression: 'Q = A · B',
    meaning: '두 입력이 모두 1일 때만 1. ("A 그리고 B")',
  },
  OR: {
    inputs: 2,
    evaluate: (a, b) => a | b,
    expression: 'Q = A + B',
    meaning: '하나라도 1이면 1. ("A 또는 B")',
  },
  XOR: {
    inputs: 2,
    evaluate: (a, b) => a ^ b,
    expression: 'Q = A ⊕ B',
    meaning: '두 입력이 서로 다를 때만 1. (Exclusive OR)',
  },
  NAND: {
    inputs: 2,
    evaluate: (a, b) => (a & b ? 0 : 1),
    expression: 'Q = ¬(A · B)',
    meaning: 'AND의 결과를 뒤집은 것. 둘 다 1일 때만 0.',
  },
  NOR: {
    inputs: 2,
    evaluate: (a, b) => (a | b ? 0 : 1),
    expression: 'Q = ¬(A + B)',
    meaning: 'OR의 결과를 뒤집은 것. 둘 다 0일 때만 1.',
  },
};

/**
 * 숫자를 bit 배열로 바꿉니다. (MSB가 앞)
 * 예: toBits(5, 4) → [0, 1, 0, 1]
 */
function toBits(value, width = 4) {
  const bits = [];
  for (let position = width - 1; position >= 0; position--) {
    bits.push((value >> position) & 1);
  }
  return bits;
}

/** 예: toBinaryString(5, 4) → "0101" */
function toBinaryString(value, width = 4) {
  return toBits(value, width).join('');
}

/**
 * Counter 만들기
 * modulus = 16 → 4-bit Binary Counter (0~15)
 * modulus = 10 → MOD-10 Counter (0~9)
 *
 * Binary Counter, MOD-10 Counter, Final Demo가 모두 이 함수를 사용합니다.
 * 실제 회로에서 Flip-Flop들이 "현재 값"을 기억하는 역할을
 * 여기서는 변수 currentValue가 대신합니다.
 */
function createCounter(modulus) {
  let currentValue = 0;

  return {
    get value() {
      return currentValue;
    },

    /**
     * Clock Rising Edge가 한 번 들어왔을 때 호출합니다.
     * 반환값:
     * - previous: 이전 값
     * - beforeReset: +1 직후의 값 (MOD-10에서 9 다음에는 10 = 1010)
     * - value: 최종 값
     * - wrapped: 한 바퀴 돌아서 0으로 돌아왔는지
     */
    tick() {
      const previous = currentValue;
      const beforeReset = currentValue + 1;
      const wrapped = beforeReset >= modulus;
      currentValue = wrapped ? 0 : beforeReset;
      return { previous, beforeReset, value: currentValue, wrapped };
    },

    reset() {
      currentValue = 0;
    },
  };
}

/**
 * 일정 간격으로 onTick을 호출하는 "자동 Clock"
 * (실제 회로의 Clock Generator 역할)
 */
function createAutoClock(onTick, intervalMs = 1000) {
  let timerId = null;

  const clock = {
    get running() {
      return timerId !== null;
    },
    start() {
      if (timerId !== null) return;
      timerId = setInterval(onTick, intervalMs);
    },
    stop() {
      clearInterval(timerId);
      timerId = null;
    },
    toggle() {
      if (clock.running) clock.stop();
      else clock.start();
      return clock.running;
    },
    setInterval(newIntervalMs) {
      intervalMs = newIntervalMs;
      if (clock.running) {
        clock.stop();
        clock.start();
      }
    },
  };

  return clock;
}

/**
 * BCD → 7-Segment Decoder
 * 입력: 0~15 (4bit)
 * 출력: [a, b, c, d, e, f, g]
 * 0~9가 아닌 값(1010~1111)은 BCD가 아니므로 모든 segment를 끕니다.
 */
function decodeBcdToSegments(bcdValue) {
  if (bcdValue < 0 || bcdValue > 9) return BLANK_SEGMENTS.slice();
  return SEGMENT_TABLE[bcdValue].slice();
}

/* ==========================================================
   [B] 그리기 도우미
   ========================================================== */

/** id로 요소 찾기 (짧게 쓰기 위한 도우미) */
function byId(id) {
  return document.getElementById(id);
}

/** 0/1 값에 맞는 CSS class ("on" / "off") */
function onOff(value) {
  return value ? 'on' : 'off';
}

/* ---------- 7-Segment SVG ---------- */

/** 가로 segment 육각형 좌표 (a, g, d) */
function horizontalSegmentPoints(centerY, x1 = 22, x2 = 98) {
  const h = 7;
  return `${x1},${centerY} ${x1 + h},${centerY - h} ${x2 - h},${centerY - h} ${x2},${centerY} ${x2 - h},${centerY + h} ${x1 + h},${centerY + h}`;
}

/** 세로 segment 육각형 좌표 (b, c, e, f) */
function verticalSegmentPoints(centerX, y1, y2) {
  const w = 7;
  return `${centerX},${y1} ${centerX + w},${y1 + w} ${centerX + w},${y2 - w} ${centerX},${y2} ${centerX - w},${y2 - w} ${centerX - w},${y1 + w}`;
}

/** segment 모양과 이름 라벨 위치 */
const SEGMENT_GEOMETRY = {
  a: { points: horizontalSegmentPoints(14), label: [60, 14] },
  b: { points: verticalSegmentPoints(105, 20, 96), label: [105, 58] },
  c: { points: verticalSegmentPoints(105, 104, 180), label: [105, 142] },
  d: { points: horizontalSegmentPoints(186), label: [60, 186] },
  e: { points: verticalSegmentPoints(15, 104, 180), label: [15, 142] },
  f: { points: verticalSegmentPoints(15, 20, 96), label: [15, 58] },
  g: { points: horizontalSegmentPoints(100), label: [60, 100] },
};

/**
 * 7-Segment SVG 마크업 생성
 * 각 segment는 class="segment segment-a" 처럼 이름이 붙고,
 * 켜질 때 "active" class가 추가됩니다.
 */
function createSevenSegmentSVG() {
  const polygons = SEGMENT_NAMES.map(
    (name) => `<polygon class="segment segment-${name}" data-segment="${name}" points="${SEGMENT_GEOMETRY[name].points}"/>`
  ).join('');
  const labels = SEGMENT_NAMES.map((name) => {
    const [x, y] = SEGMENT_GEOMETRY[name].label;
    return `<text class="seg-label" data-segment="${name}" x="${x}" y="${y}">${name}</text>`;
  }).join('');
  return `<svg viewBox="0 0 120 200" role="img" aria-label="7-Segment Display">${polygons}${labels}</svg>`;
}

/**
 * 7-Segment 표시 갱신
 * segmentBits = [a, b, c, d, e, f, g] (1이면 해당 segment에 active class)
 */
function renderSevenSegment(container, segmentBits) {
  SEGMENT_NAMES.forEach((name, index) => {
    const isOn = segmentBits[index] === 1;
    container.querySelectorAll(`[data-segment="${name}"]`).forEach((element) => {
      element.classList.toggle('active', isOn);
    });
  });
  const litNames = SEGMENT_NAMES.filter((_, i) => segmentBits[i]).join(', ');
  const svg = container.querySelector('svg');
  if (svg) svg.setAttribute('aria-label', `7-Segment Display (켜진 segment: ${litNames || '없음'})`);
}

/* ---------- 논리 게이트 SVG ----------
   각 게이트는 (0,0)~(100,70) 크기의 로컬 좌표에 그립니다.
   - 2입력 게이트: 입력 핀 y=20, y=50 / 출력 핀 y=35
   - NOT: 입력 핀 y=35
   inX = 입력 전선이 닿는 x, outX = 출력 전선이 시작하는 x
*/
const AND_BODY = '<path class="gate-body" d="M20,5 H50 A30,30 0 0 1 50,65 H20 Z"/>';
const OR_BODY = '<path class="gate-body" d="M15,5 Q55,5 80,35 Q55,65 15,65 Q32,35 15,5 Z"/>';

const GATE_GEOMETRY = {
  AND: { body: AND_BODY, inX: 20, outX: 80, labelX: 44 },
  NAND: { body: AND_BODY + '<circle class="gate-body" cx="85" cy="35" r="5"/>', inX: 20, outX: 90, labelX: 44 },
  OR: { body: OR_BODY, inX: 22, outX: 80, labelX: 44 },
  NOR: { body: OR_BODY + '<circle class="gate-body" cx="85" cy="35" r="5"/>', inX: 22, outX: 90, labelX: 44 },
  XOR: {
    body: '<path class="gate-line" d="M11,5 Q28,35 11,65"/><path class="gate-body" d="M21,5 Q61,5 86,35 Q61,65 21,65 Q38,35 21,5 Z"/>',
    inX: 18,
    outX: 86,
    labelX: 51,
  },
  NOT: {
    body: '<path class="gate-body" d="M20,8 L20,62 L66,35 Z"/><circle class="gate-body" cx="71" cy="35" r="5"/>',
    inX: 20,
    outX: 76,
    labelX: 35,
  },
};

/** (originX, originY) 위치에 게이트 몸체를 그립니다. */
function drawGate(type, originX, originY) {
  const geometry = GATE_GEOMETRY[type];
  return `<g transform="translate(${originX},${originY})">${geometry.body}<text class="gate-name" x="${geometry.labelX}" y="35">${type}</text></g>`;
}

/** 게이트 핀(전선이 연결되는 점)의 절대 좌표 */
function gatePins(type, originX, originY) {
  const geometry = GATE_GEOMETRY[type];
  return {
    in1: [originX + geometry.inX, originY + 20],
    in2: [originX + geometry.inX, originY + 50],
    inSingle: [originX + geometry.inX, originY + 35],
    out: [originX + geometry.outX, originY + 35],
  };
}

/** 전선 class: 값이 없으면 기본(검정), 있으면 on(초록)/off(회색) */
function wireClass(value) {
  if (value === undefined) return 'wire';
  return `wire ${onOff(value)}`;
}

/** 꺾인 선(polyline) 전선 */
function wire(points, value) {
  return `<polyline class="${wireClass(value)}" points="${points.map((p) => p.join(',')).join(' ')}"/>`;
}

/** 전선 위에 작은 0/1 값 표시 */
function valueTag(x, y, value) {
  if (value === undefined) return '';
  return `<text class="value-label ${onOff(value)}" x="${x}" y="${y}">${value}</text>`;
}

/**
 * 게이트 하나짜리 회로도 SVG
 * values가 주어지면 ({a, b, q}) 전선에 색과 값이 표시됩니다.
 */
function renderGateFigure(type, values = {}) {
  const originX = 56;
  const originY = 10;
  const pins = gatePins(type, originX, originY);
  const isSingleInput = LOGIC_GATES[type].inputs === 1;
  let markup = '';

  if (isSingleInput) {
    const [x, y] = pins.inSingle;
    markup += wire([[24, y], [x, y]], values.a);
    markup += `<text class="pin-label" x="6" y="${y}">A</text>`;
    markup += valueTag(32, y - 10, values.a);
  } else {
    const [x1, y1] = pins.in1;
    const [x2, y2] = pins.in2;
    markup += wire([[24, y1], [x1, y1]], values.a);
    markup += wire([[24, y2], [x2, y2]], values.b);
    markup += `<text class="pin-label" x="6" y="${y1}">A</text>`;
    markup += `<text class="pin-label" x="6" y="${y2}">B</text>`;
    markup += valueTag(32, y1 - 10, values.a);
    markup += valueTag(32, y2 - 10, values.b);
  }

  const [outX, outY] = pins.out;
  markup += wire([[outX, outY], [184, outY]], values.q);
  markup += `<text class="pin-label" x="190" y="${outY}">Q</text>`;
  markup += valueTag(168, outY - 10, values.q);
  markup += drawGate(type, originX, originY);

  return `<svg class="circuit-svg" viewBox="0 0 206 90" role="img" aria-label="${type} 게이트 회로 기호">${markup}</svg>`;
}

/* ---------- Truth Table ---------- */

/** 0/1 값을 담은 표 칸 */
function bitCell(value, extraClass = '') {
  return `<td class="${value ? 'one' : 'zero'} ${extraClass}">${value}</td>`;
}

/** 게이트 진리표 HTML (<table> 안쪽) */
function gateTruthTableHTML(type) {
  const gate = LOGIC_GATES[type];
  if (gate.inputs === 1) {
    const rows = [0, 1]
      .map((a) => `<tr data-row="${a}">${bitCell(a)}${bitCell(gate.evaluate(a), 'out-start')}</tr>`)
      .join('');
    return `<thead><tr><th>A</th><th class="out-start">Q</th></tr></thead><tbody>${rows}</tbody>`;
  }
  let rows = '';
  for (let a = 0; a <= 1; a++) {
    for (let b = 0; b <= 1; b++) {
      rows += `<tr data-row="${a * 2 + b}">${bitCell(a)}${bitCell(b)}${bitCell(gate.evaluate(a, b), 'out-start')}</tr>`;
    }
  }
  return `<thead><tr><th>A</th><th>B</th><th class="out-start">Q</th></tr></thead><tbody>${rows}</tbody>`;
}

/** 표에서 data-row 값이 rowKey인 행만 강조 */
function highlightTableRow(table, rowKey) {
  table.querySelectorAll('tbody tr').forEach((row) => {
    row.classList.toggle('highlight', row.dataset.row === String(rowKey));
  });
}

/* ---------- 타이밍 파형 (Flip-Flop 데모) ---------- */

/**
 * 디지털 파형 그리기
 * rows: [{ label, values: [0/1, ...], className }]
 *       values의 한 칸 = 반 Clock 주기
 * edgeSlots: Rising Edge 위치(칸 번호) — 점선으로 표시
 */
function renderWaveform(container, rows, edgeSlots, totalSlots) {
  const labelWidth = 44;
  const slotWidth = 24;
  const rowHeight = 42;
  const amplitude = 22;
  const width = labelWidth + totalSlots * slotWidth + 8;
  const height = rows.length * rowHeight + 8;
  let markup = '';

  edgeSlots.forEach((slot) => {
    const x = labelWidth + slot * slotWidth;
    markup += `<line class="edge-mark" x1="${x}" y1="4" x2="${x}" y2="${height - 4}"/>`;
  });

  rows.forEach((row, rowIndex) => {
    const baseY = rowIndex * rowHeight + rowHeight - 6; // LOW 위치
    const highY = baseY - amplitude;
    let path = '';
    row.values.forEach((value, slot) => {
      const x0 = labelWidth + slot * slotWidth;
      const x1 = x0 + slotWidth;
      const y = value ? highY : baseY;
      path += slot === 0 ? `M${x0},${y} L${x1},${y}` : ` L${x0},${y} L${x1},${y}`;
    });
    markup += `<text class="wave-label" x="4" y="${baseY - amplitude / 2}">${row.label}</text>`;
    markup += `<path class="wave-line ${row.className}" d="${path}"/>`;
  });

  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="타이밍 다이어그램">${markup}</svg>`;
}

/* ---------- 0 → 1 → … → 9 순환 표시 ---------- */

function renderDigitLoop(container) {
  let row = '';
  for (let digit = 0; digit <= 9; digit++) {
    row += `<span class="d" data-digit="${digit}">${digit}</span>`;
    if (digit < 9) row += '<span class="arr">→</span>';
  }
  container.innerHTML = `<div class="digit-loop-row">${row}</div><div class="digit-loop-return" aria-hidden="true"></div>`;
}

function highlightDigitLoop(container, value) {
  container.querySelectorAll('.d').forEach((cell) => {
    cell.classList.toggle('current', Number(cell.dataset.digit) === value);
  });
}

/* ---------- 출력 LED (Counter 데모) ---------- */

/** Q3 Q2 Q1 Q0 LED 4개 만들기 */
function createBitLeds(container, width = 4) {
  let markup = '';
  for (let position = width - 1; position >= 0; position--) {
    markup += `<div class="bit-led" data-position="${position}"><div class="led">0</div><span class="led-name">Q${position}</span><span class="led-weight">${2 ** position}</span></div>`;
  }
  container.innerHTML = markup;
}

/** LED 갱신. changedMask에 해당하는 bit는 방금 바뀐 것으로 표시 */
function renderBitLeds(container, value, changedMask = 0) {
  container.querySelectorAll('.bit-led').forEach((led) => {
    const position = Number(led.dataset.position);
    const bit = (value >> position) & 1;
    led.classList.toggle('on', bit === 1);
    led.classList.toggle('changed', ((changedMask >> position) & 1) === 1);
    led.querySelector('.led').textContent = bit;
  });
}

/** 0~N 순서를 보여주는 칸 띠 (skippedFrom 이상은 점선으로) */
function renderSequenceStrip(container, count, skippedFrom = count) {
  let markup = '';
  for (let value = 0; value < count; value++) {
    const skipped = value >= skippedFrom ? ' skipped' : '';
    markup += `<div class="cell${skipped}" data-value="${value}"><b>${value}</b><small>${toBinaryString(value)}</small></div>`;
  }
  container.innerHTML = markup;
}

function highlightSequenceStrip(container, value) {
  container.querySelectorAll('.cell').forEach((cell) => {
    cell.classList.toggle('current', Number(cell.dataset.value) === value);
  });
}

/** 0/1 토글 버튼 표시 갱신 */
function renderBitToggle(button, value) {
  button.classList.toggle('on', value === 1);
  button.setAttribute('aria-pressed', value === 1 ? 'true' : 'false');
  button.querySelector('.bit-value').textContent = value;
}

/** Auto 버튼 모양 갱신 */
function renderAutoButton(button, running) {
  button.classList.toggle('running', running);
  button.textContent = running ? 'Auto ■ 정지' : 'Auto ▶';
}

/* ==========================================================
   [C] 페이지 UI
   ========================================================== */

/* ---------- 사이드바 / breadcrumb / 이전·다음 ---------- */

function initNavigation() {
  const sections = Array.from(document.querySelectorAll('section[data-group]'));
  const nav = byId('sidebar-nav');
  const breadcrumb = byId('breadcrumb');

  // 1) 사이드바 메뉴 만들기: data-group 순서대로 묶습니다.
  let currentGroup = null;
  let currentList = null;
  sections.forEach((section) => {
    if (section.dataset.group !== currentGroup) {
      currentGroup = section.dataset.group;
      const title = document.createElement('div');
      title.className = 'nav-group-title';
      title.textContent = currentGroup;
      currentList = document.createElement('ul');
      currentList.className = 'nav-list';
      nav.append(title, currentList);
    }
    const item = document.createElement('li');
    item.innerHTML = `<a class="nav-link" href="#${section.id}" data-target="${section.id}"><span class="nav-num">${section.dataset.num}</span><span>${section.dataset.title}</span></a>`;
    currentList.append(item);
  });

  // 2) 각 챕터 끝에 "이전 / 다음" 버튼 추가
  sections.forEach((section, index) => {
    if (!section.classList.contains('chapter')) return;
    const previous = sections[index - 1];
    const next = sections[index + 1];
    const navBox = document.createElement('div');
    navBox.className = 'chapter-nav';
    if (previous) {
      navBox.innerHTML += `<a class="prev" href="#${previous.id}"><small>← 이전 챕터</small>${previous.dataset.title}</a>`;
    }
    if (next) {
      navBox.innerHTML += `<a class="next" href="#${next.id}"><small>다음 챕터 →</small>${next.dataset.title}</a>`;
    } else {
      navBox.innerHTML += `<a class="next" href="#intro"><small>처음으로 ↑</small>최종 목표 다시 보기</a>`;
    }
    section.append(navBox);
  });

  // 3) "최종 회로와 연결" 상자에 현재 위치를 보여주는 미니 파이프라인 추가
  const PIPELINE = ['Clock', 'Counter', 'BCD', 'Decoder', '7-Segment'];
  document.querySelectorAll('.connect-box[data-stage]').forEach((box) => {
    const stage = box.dataset.stage;
    const pipeline = document.createElement('div');
    pipeline.className = 'mini-pipeline';
    pipeline.setAttribute('aria-label', '최종 회로에서의 위치');
    pipeline.innerHTML = PIPELINE.map((name) => {
      const here = stage === 'all' || stage === name ? ' class="here"' : '';
      return `<span${here}>${name}</span>`;
    }).join('<i>→</i>');
    box.append(pipeline);
  });

  // 4) 스크롤 위치에 따라 현재 챕터 강조 + breadcrumb 갱신
  const links = Array.from(nav.querySelectorAll('.nav-link'));
  let activeId = null;

  function updateActiveSection() {
    const offset = 120; // 상단바 아래 이 정도 지점에 걸친 섹션을 "현재"로 판단
    let current = sections[0];
    for (const section of sections) {
      if (section.getBoundingClientRect().top - offset <= 0) current = section;
    }
    // 페이지 맨 아래에 닿으면 마지막 챕터를 현재로
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
      current = sections[sections.length - 1];
    }
    if (current.id === activeId) return;
    activeId = current.id;

    links.forEach((link) => {
      const isActive = link.dataset.target === activeId;
      link.classList.toggle('active', isActive);
      if (isActive) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });

    breadcrumb.innerHTML =
      `<span>Digital Logic</span><span class="crumb-sep">/</span>` +
      `<span>${current.dataset.group}</span><span class="crumb-sep">/</span>` +
      `<span class="crumb-current">${current.dataset.title}</span>`;
  }

  let scheduled = false;
  window.addEventListener(
    'scroll',
    () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        updateActiveSection();
      });
    },
    { passive: true }
  );
  window.addEventListener('resize', updateActiveSection);
  updateActiveSection();

  // 5) 모바일 햄버거 메뉴
  const menuButton = byId('menu-button');
  const backdrop = byId('sidebar-backdrop');

  function setSidebarOpen(open) {
    document.body.classList.toggle('sidebar-open', open);
    menuButton.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuButton.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
  }

  menuButton.addEventListener('click', () => {
    setSidebarOpen(!document.body.classList.contains('sidebar-open'));
  });
  backdrop.addEventListener('click', () => setSidebarOpen(false));
  nav.addEventListener('click', (event) => {
    if (event.target.closest('.nav-link')) setSidebarOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setSidebarOpen(false);
  });
}

/* ---------- 모든 7-Segment 자리에 SVG 넣기 ---------- */

function initSevenSegmentDisplays() {
  document.querySelectorAll('[data-seven-seg]').forEach((container) => {
    container.innerHTML = createSevenSegmentSVG();
  });
  // Ch11 구조 설명용: 모든 segment 켜기 (= 숫자 8)
  renderSevenSegment(byId('seg-anatomy'), SEGMENT_TABLE[8]);
}

/* ---------- Intro: 자동으로 돌아가는 미리보기 ---------- */

function initIntroPreview() {
  const display = byId('intro-seg');
  const bcdLabel = byId('intro-preview-bcd');
  const loop = byId('intro-loop');
  const counter = createCounter(10);
  renderDigitLoop(loop);

  function render() {
    renderSevenSegment(display, decodeBcdToSegments(counter.value));
    bcdLabel.textContent = `BCD ${toBinaryString(counter.value)}`;
    highlightDigitLoop(loop, counter.value);
  }

  render();
  createAutoClock(() => {
    counter.tick();
    render();
  }, 1000).start();
}

/* ---------- Ch1: 전압 → 논리값 ---------- */

function initVoltageDemo() {
  const slider = byId('voltage-slider');
  const needle = byId('voltage-needle');
  const valueLabel = byId('voltage-value');
  const logicLabel = byId('voltage-logic');

  // 개념 설명용 경계 (아래 1.5V 이하 → 0, 3.5V 이상 → 1)
  const LOW_LIMIT = 1.5;
  const HIGH_LIMIT = 3.5;

  function render() {
    const voltage = Number(slider.value);
    needle.style.left = `${(voltage / 5) * 100}%`;
    valueLabel.textContent = `${voltage.toFixed(1)} V`;
    if (voltage <= LOW_LIMIT) {
      logicLabel.textContent = '0 (LOW)';
      logicLabel.style.color = 'var(--text-muted)';
    } else if (voltage >= HIGH_LIMIT) {
      logicLabel.textContent = '1 (HIGH)';
      logicLabel.style.color = 'var(--accent-ink)';
    } else {
      logicLabel.textContent = '? (애매함)';
      logicLabel.style.color = 'var(--warn)';
    }
  }

  slider.addEventListener('input', render);
  render();
}

/* ---------- Ch2: 이진수 변환기 ---------- */

function initBinaryConverter() {
  const picker = byId('binary-number-picker');
  const bitsContainer = byId('binary-bits');
  const decimalLabel = byId('binary-decimal');
  const binaryLabel = byId('binary-binary');
  const placeValues = byId('binary-place-values');
  const table = byId('binary-table');
  let currentValue = 7;

  // 0~15 표 만들기
  let rows = '';
  for (let value = 0; value <= 15; value++) {
    const bits = toBits(value);
    rows += `<tr data-row="${value}"><td>${value}</td><td class="out-start">${bits.join('')}</td>${bits.map((b) => bitCell(b)).join('')}</tr>`;
  }
  table.querySelector('tbody').innerHTML = rows;

  // 숫자 선택 버튼
  for (let value = 0; value <= 15; value++) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn';
    button.textContent = value;
    button.dataset.value = value;
    button.addEventListener('click', () => {
      currentValue = value;
      render();
    });
    picker.append(button);
  }

  // bit 토글 버튼 (클릭하면 해당 자리 bit를 뒤집음)
  for (let position = 3; position >= 0; position--) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'bit-toggle';
    button.innerHTML = `<span class="bit-name">2${'⁰¹²³'[position]} = ${2 ** position}</span><span class="bit-value">0</span>`;
    button.dataset.position = position;
    button.addEventListener('click', () => {
      currentValue ^= 1 << position; // XOR로 해당 bit만 뒤집기
      render();
    });
    bitsContainer.append(button);
  }

  function render() {
    const bits = toBits(currentValue);
    decimalLabel.textContent = currentValue;
    binaryLabel.textContent = bits.join(' ');

    picker.querySelectorAll('.btn').forEach((button) => {
      button.classList.toggle('selected', Number(button.dataset.value) === currentValue);
    });
    bitsContainer.querySelectorAll('.bit-toggle').forEach((button) => {
      renderBitToggle(button, (currentValue >> Number(button.dataset.position)) & 1);
    });

    const weights = [8, 4, 2, 1];
    const terms = bits.map((bit, i) => `<span class="${onOff(bit)}">${bit}×${weights[i]}</span>`);
    placeValues.innerHTML = `${terms.join(' + ')} = <strong>${currentValue}</strong>`;

    highlightTableRow(table, currentValue);
  }

  render();
}

/* ---------- Ch3: Boolean 연산 진리표 ---------- */

function initBooleanTables() {
  const container = byId('boolean-tables');
  const order = ['NOT', 'AND', 'OR', 'XOR', 'NAND', 'NOR'];
  container.innerHTML = order
    .map((type) => {
      const gate = LOGIC_GATES[type];
      return `<div>
        <div class="op-head"><strong>${type}</strong><span class="mono">${gate.expression}</span></div>
        <p class="op-desc">${gate.meaning}</p>
        <div class="table-wrap"><table class="truth compact">${gateTruthTableHTML(type)}</table></div>
      </div>`;
    })
    .join('');
}

/* ---------- Ch4: 게이트 갤러리 + 조작 데모 ---------- */

function initGateGallery() {
  const container = byId('gate-gallery');
  const order = ['NOT', 'AND', 'OR', 'NAND', 'NOR', 'XOR'];
  container.innerHTML = order
    .map((type) => {
      const gate = LOGIC_GATES[type];
      return `<div class="gate-item">
        <h4>${type} <span class="mono" style="font-weight:400;color:var(--text-muted);font-size:14px">${gate.expression}</span></h4>
        <div class="gate-figure">${renderGateFigure(type)}</div>
        <p class="op-desc">${gate.meaning}</p>
        <div class="table-wrap"><table class="truth compact">${gateTruthTableHTML(type)}</table></div>
      </div>`;
    })
    .join('');
}

function initGateDemo() {
  const selector = byId('gate-select');
  const inputA = byId('gate-input-a');
  const inputB = byId('gate-input-b');
  const svgContainer = byId('gate-demo-svg');
  const outputLabel = byId('gate-output');
  const expressionLabel = byId('gate-expression');
  const table = byId('gate-demo-table');

  const state = { type: 'AND', a: 0, b: 0 };

  ['AND', 'OR', 'XOR', 'NAND', 'NOR', 'NOT'].forEach((type) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn';
    button.textContent = type;
    button.dataset.type = type;
    button.addEventListener('click', () => {
      state.type = type;
      table.innerHTML = gateTruthTableHTML(type);
      render();
    });
    selector.append(button);
  });

  inputA.addEventListener('click', () => {
    state.a ^= 1;
    render();
  });
  inputB.addEventListener('click', () => {
    state.b ^= 1;
    render();
  });

  function render() {
    const gate = LOGIC_GATES[state.type];
    const isSingleInput = gate.inputs === 1;
    const output = isSingleInput ? gate.evaluate(state.a) : gate.evaluate(state.a, state.b);

    selector.querySelectorAll('.btn').forEach((button) => {
      button.classList.toggle('selected', button.dataset.type === state.type);
    });
    renderBitToggle(inputA, state.a);
    renderBitToggle(inputB, state.b);
    inputB.disabled = isSingleInput;
    inputB.style.opacity = isSingleInput ? '0.35' : '';

    svgContainer.innerHTML = renderGateFigure(state.type, { a: state.a, b: state.b, q: output });
    outputLabel.textContent = output;
    outputLabel.style.color = output ? 'var(--accent-ink)' : 'var(--text-faint)';
    expressionLabel.textContent = gate.expression;
    highlightTableRow(table, isSingleInput ? state.a : state.a * 2 + state.b);
  }

  table.innerHTML = gateTruthTableHTML(state.type);
  render();
}

/* ---------- Ch5: Half Adder ---------- */

/** Half Adder 회로도: A, B가 XOR(Sum)과 AND(Carry)에 동시에 들어감 */
function renderHalfAdderSVG(a, b, sum, carry) {
  const xorPins = gatePins('XOR', 160, 10);
  const andPins = gatePins('AND', 160, 95);
  let markup = '';

  // 입력 A: XOR 위쪽 입력 + 아래로 갈라져 AND 위쪽 입력
  markup += wire([[30, 30], xorPins.in1], a);
  markup += wire([[90, 30], [90, andPins.in1[1]], andPins.in1], a);
  // 입력 B: XOR 아래쪽 입력 + 아래로 갈라져 AND 아래쪽 입력
  markup += wire([[30, 60], xorPins.in2], b);
  markup += wire([[120, 60], [120, andPins.in2[1]], andPins.in2], b);
  markup += `<circle class="dot ${onOff(a)}" cx="90" cy="30" r="4"/><circle class="dot ${onOff(b)}" cx="120" cy="60" r="4"/>`;

  // 출력
  markup += wire([xorPins.out, [320, xorPins.out[1]]], sum);
  markup += wire([andPins.out, [320, andPins.out[1]]], carry);

  markup += drawGate('XOR', 160, 10) + drawGate('AND', 160, 95);
  markup += `<text class="pin-label" x="10" y="30">A</text><text class="pin-label" x="10" y="60">B</text>`;
  markup += `<text class="pin-label" x="326" y="${xorPins.out[1]}">Sum</text>`;
  markup += `<text class="pin-label" x="326" y="${andPins.out[1]}">Carry</text>`;
  markup += valueTag(40, 20, a) + valueTag(40, 50, b);
  markup += valueTag(290, xorPins.out[1] - 10, sum) + valueTag(290, andPins.out[1] - 10, carry);

  return `<svg class="circuit-svg" viewBox="0 0 380 170" role="img" aria-label="Half Adder 회로: XOR 게이트가 Sum, AND 게이트가 Carry를 만든다">${markup}</svg>`;
}

function initHalfAdderDemo() {
  const inputA = byId('ha-a');
  const inputB = byId('ha-b');
  const table = byId('ha-table');
  const state = { a: 0, b: 0 };

  let rows = '';
  for (let a = 0; a <= 1; a++) {
    for (let b = 0; b <= 1; b++) {
      rows += `<tr data-row="${a * 2 + b}">${bitCell(a)}${bitCell(b)}${bitCell(a & b, 'out-start')}${bitCell(a ^ b)}</tr>`;
    }
  }
  table.querySelector('tbody').innerHTML = rows;

  function render() {
    const sum = state.a ^ state.b; // XOR
    const carry = state.a & state.b; // AND
    renderBitToggle(inputA, state.a);
    renderBitToggle(inputB, state.b);
    byId('ha-svg').innerHTML = renderHalfAdderSVG(state.a, state.b, sum, carry);
    byId('ha-sum').textContent = sum;
    byId('ha-carry').textContent = carry;
    byId('ha-equation').textContent = `${state.a} + ${state.b} = ${carry}${sum}₂`;
    highlightTableRow(table, state.a * 2 + state.b);
  }

  inputA.addEventListener('click', () => {
    state.a ^= 1;
    render();
  });
  inputB.addEventListener('click', () => {
    state.b ^= 1;
    render();
  });
  render();
}

/* ---------- Ch6: SR Latch ---------- */

/** NOR 두 개를 cross-coupling한 SR Latch 회로도 */
function renderLatchSVG(s, r, q, qBar) {
  const top = gatePins('NOR', 160, 20); // 출력 Q
  const bottom = gatePins('NOR', 160, 140); // 출력 Q̅
  let markup = '';

  markup += wire([[40, top.in1[1]], top.in1], r);
  markup += wire([[40, bottom.in2[1]], bottom.in2], s);

  // 출력
  markup += wire([top.out, [350, top.out[1]]], q);
  markup += wire([bottom.out, [350, bottom.out[1]]], qBar);

  // feedback: Q → 아래 NOR 입력, Q̅ → 위 NOR 입력 (서로 교차)
  markup += wire([[300, top.out[1]], [300, 95], [130, 125], [130, bottom.in1[1]], bottom.in1], q);
  markup += wire([[300, bottom.out[1]], [300, 135], [130, 105], [130, top.in2[1]], top.in2], qBar);
  markup += `<circle class="dot ${onOff(q)}" cx="300" cy="${top.out[1]}" r="4"/>`;
  markup += `<circle class="dot ${onOff(qBar)}" cx="300" cy="${bottom.out[1]}" r="4"/>`;

  markup += drawGate('NOR', 160, 20) + drawGate('NOR', 160, 140);
  markup += `<text class="pin-label" x="8" y="${top.in1[1]}">R</text>`;
  markup += `<text class="pin-label" x="8" y="${bottom.in2[1]}">S</text>`;
  markup += `<text class="pin-label" x="358" y="${top.out[1]}">Q</text>`;
  markup += `<text class="pin-label" x="358" y="${bottom.out[1]}">Q̅</text>`;
  markup += valueTag(56, top.in1[1] - 10, r) + valueTag(56, bottom.in2[1] - 10, s);
  markup += valueTag(330, top.out[1] - 10, q) + valueTag(330, bottom.out[1] - 10, qBar);

  return `<svg class="circuit-svg" viewBox="0 0 380 230" role="img" aria-label="NOR 게이트 두 개를 교차 연결한 SR Latch">${markup}</svg>`;
}

function initLatchDemo() {
  const inputS = byId('latch-s');
  const inputR = byId('latch-r');
  const status = byId('latch-status');
  const state = { s: 0, r: 0, q: 0, qBar: 1, wasInvalid: false };

  /** 입력이 바뀔 때마다 Latch의 다음 상태를 계산 */
  function updateLatch() {
    status.classList.remove('alert');
    if (state.s && state.r) {
      // 금지 입력: 두 NOR의 출력이 모두 0
      state.q = 0;
      state.qBar = 0;
      state.wasInvalid = true;
      status.textContent = 'S = R = 1: Q와 Q̅가 모두 0이 되어 "서로 반대"라는 약속이 깨집니다. 사용하지 않는 입력입니다.';
      status.classList.add('alert');
    } else if (state.s) {
      state.q = 1;
      state.qBar = 0;
      state.wasInvalid = false;
      status.textContent = 'Set: Q = 1. 이제 S를 0으로 내려 보세요.';
    } else if (state.r) {
      state.q = 0;
      state.qBar = 1;
      state.wasInvalid = false;
      status.textContent = 'Reset: Q = 0. 이제 R을 0으로 내려 보세요.';
    } else {
      // S = R = 0 → Hold (feedback이 값을 유지)
      if (state.wasInvalid) {
        state.q = 0;
        state.qBar = 1;
        state.wasInvalid = false;
        status.textContent = 'S, R을 동시에 1 → 0으로 내리면 실제 회로에서는 결과를 예측할 수 없습니다(race). 여기서는 Q = 0으로 정했습니다.';
        status.classList.add('alert');
      } else {
        status.textContent = `Hold: 입력이 모두 0인데도 Q = ${state.q}를 기억하고 있습니다. feedback 고리가 값을 붙잡고 있기 때문입니다.`;
      }
    }
  }

  function render() {
    renderBitToggle(inputS, state.s);
    renderBitToggle(inputR, state.r);
    byId('latch-svg').innerHTML = renderLatchSVG(state.s, state.r, state.q, state.qBar);
    byId('latch-q').textContent = state.q;
    byId('latch-q').style.color = state.q ? 'var(--accent-ink)' : 'var(--text-faint)';
    byId('latch-qbar').textContent = state.qBar;
  }

  inputS.addEventListener('click', () => {
    state.s ^= 1;
    updateLatch();
    render();
  });
  inputR.addEventListener('click', () => {
    state.r ^= 1;
    updateLatch();
    render();
  });

  status.textContent = '현재 Q = 0을 기억하고 있습니다. S를 1로 바꿔 보세요.';
  render();
}

/* ---------- Ch7: Flip-Flop 데모 ---------- */

const MAX_VISIBLE_CLOCKS = 10; // 파형에 보여 줄 최대 Clock 수

/**
 * Clock 기록을 파형 데이터로 바꿉니다.
 * Clock 하나 = 칸 2개 (앞 칸 LOW, 뒤 칸 HIGH). 뒤 칸이 시작하는 지점이 Rising Edge.
 * qHistory[k]: k번째 Clock 이전의 Q / qHistory[k+1]: k번째 Clock 이후의 Q
 */
function buildFlipFlopWaveRows(qHistory, extraRow) {
  const clockCount = qHistory.length - 1;
  const clockValues = [];
  const qValues = [];
  const edgeSlots = [];
  for (let k = 0; k < clockCount; k++) {
    clockValues.push(0, 1);
    qValues.push(qHistory[k], qHistory[k + 1]);
    edgeSlots.push(2 * k + 1);
  }
  clockValues.push(0);
  qValues.push(qHistory[clockCount]);

  const rows = [];
  if (extraRow) rows.push(extraRow);
  rows.push({ label: 'CLK', values: clockValues, className: 'wave-clock' });
  rows.push({ label: 'Q', values: qValues, className: 'wave-data' });
  return { rows, edgeSlots };
}

function initToggleFlipFlopDemo() {
  const led = byId('tff-led');
  const countLabel = byId('tff-count');
  const wave = byId('tff-wave');
  let qHistory = [0];
  let clockCount = 0;

  function render() {
    const q = qHistory[qHistory.length - 1];
    led.classList.toggle('on', q === 1);
    led.querySelector('.led').textContent = q;
    countLabel.textContent = clockCount;
    const { rows, edgeSlots } = buildFlipFlopWaveRows(qHistory);
    renderWaveform(wave, rows, edgeSlots, MAX_VISIBLE_CLOCKS * 2 + 1);
  }

  byId('tff-clock').addEventListener('click', () => {
    const q = qHistory[qHistory.length - 1];
    qHistory.push(q ? 0 : 1); // T = 1 이므로 Clock마다 toggle
    if (qHistory.length > MAX_VISIBLE_CLOCKS + 1) qHistory.shift();
    clockCount++;
    render();
  });

  byId('tff-reset').addEventListener('click', () => {
    qHistory = [0];
    clockCount = 0;
    render();
  });

  render();
}

function initDataFlipFlopDemo() {
  const inputD = byId('dff-d');
  const qLabel = byId('dff-q');
  const wave = byId('dff-wave');
  let d = 0;
  let qHistory = [0];
  let dHistory = []; // 각 Clock 순간에 찍힌 D 값

  function render() {
    renderBitToggle(inputD, d);
    const q = qHistory[qHistory.length - 1];
    qLabel.textContent = q;
    qLabel.style.color = q ? 'var(--accent-ink)' : 'var(--text-faint)';

    // D 파형: k번째 Clock 구간에는 그때 찍힌 D, 마지막 칸에는 현재 D
    const dValues = [];
    dHistory.forEach((value) => dValues.push(value, value));
    dValues.push(d);
    const { rows, edgeSlots } = buildFlipFlopWaveRows(qHistory, { label: 'D', values: dValues, className: 'wave-input' });
    renderWaveform(wave, rows, edgeSlots, MAX_VISIBLE_CLOCKS * 2 + 1);
  }

  inputD.addEventListener('click', () => {
    d ^= 1; // D가 바뀌어도 Q는 그대로 (Clock 에지가 아니므로)
    render();
  });

  byId('dff-clock').addEventListener('click', () => {
    dHistory.push(d);
    qHistory.push(d); // Rising Edge 순간: Q ← D
    if (qHistory.length > MAX_VISIBLE_CLOCKS + 1) {
      qHistory.shift();
      dHistory.shift();
    }
    render();
  });

  byId('dff-reset').addEventListener('click', () => {
    d = 0;
    qHistory = [0];
    dHistory = [];
    render();
  });

  render();
}

/* ---------- Ch8: 4-bit Binary Counter ---------- */

function initBinaryCounterDemo() {
  const counter = createCounter(16);
  const bits = byId('bc-bits');
  const strip = byId('bc-strip');
  const status = byId('bc-status');
  const autoButton = byId('bc-auto');

  createBitLeds(bits);
  renderSequenceStrip(strip, 16);

  function render(changedMask = 0) {
    renderBitLeds(bits, counter.value, changedMask);
    byId('bc-decimal').textContent = counter.value;
    highlightSequenceStrip(strip, counter.value);
  }

  /** 어떤 Flip-Flop이 toggle 되었는지 설명 문장 만들기 */
  function describeToggle(previous, value) {
    const changedMask = previous ^ value;
    const toggled = [];
    for (let position = 0; position < 4; position++) {
      if ((changedMask >> position) & 1) toggled.push(`Q${position}`);
    }
    let message = `${toBinaryString(previous)} → ${toBinaryString(value)} : ${toggled.join(', ')} toggle`;
    if (toggled.length > 1) message += ` (아래 bit가 1 → 0으로 떨어지면서 다음 bit로 전파)`;
    if (previous === 15) message += ' — 15 다음은 overflow로 0000!';
    return message;
  }

  function clockTick() {
    const { previous, value } = counter.tick();
    render(previous ^ value);
    status.textContent = describeToggle(previous, value);
  }

  const autoClock = createAutoClock(clockTick, 700);

  byId('bc-clock').addEventListener('click', clockTick);
  autoButton.addEventListener('click', () => renderAutoButton(autoButton, autoClock.toggle()));
  byId('bc-reset').addEventListener('click', () => {
    counter.reset();
    render();
    status.textContent = 'Reset: 모든 Flip-Flop을 0으로.';
  });

  render();
}

/* ---------- Ch9: MOD-10 Counter ---------- */

function initMod10CounterDemo() {
  const counter = createCounter(10);
  const bits = byId('mod-bits');
  const strip = byId('mod-strip');
  const status = byId('mod-status');
  const resetLogic = byId('mod-reset-logic');
  const autoButton = byId('mod-auto');
  let pendingResetTimer = null;

  createBitLeds(bits);
  renderSequenceStrip(strip, 16, 10); // 10~15는 점선 (사용 안 함)

  /** 화면에 shownValue를 표시 (10은 Reset 직전의 순간 상태) */
  function render(shownValue, changedMask = 0) {
    renderBitLeds(bits, shownValue, changedMask);
    byId('mod-decimal').textContent = shownValue;
    highlightSequenceStrip(strip, shownValue);

    // CLEAR = Q3 AND Q1
    const q3 = (shownValue >> 3) & 1;
    const q1 = (shownValue >> 1) & 1;
    const clear = q3 & q1;
    resetLogic.innerHTML =
      `<span>Reset 감지:</span><span class="pill">Q3 = ${q3}</span><span>AND</span>` +
      `<span class="pill">Q1 = ${q1}</span><span>→</span><span class="pill ${clear ? 'on' : ''}">CLEAR = ${clear}</span>`;
  }

  /** 지연 중인 Reset 표시가 있으면 즉시 마무리 */
  function finishPendingReset() {
    if (pendingResetTimer !== null) {
      clearTimeout(pendingResetTimer);
      pendingResetTimer = null;
      render(counter.value);
    }
  }

  function clockTick() {
    finishPendingReset();
    const { previous, beforeReset, value, wrapped } = counter.tick();

    if (wrapped) {
      // 실제 회로에서는 수 ns 동안만 1010이 존재합니다.
      // 눈으로 볼 수 있도록 잠깐(0.45초) 보여 준 뒤 0000으로 바꿉니다.
      render(beforeReset, previous ^ beforeReset);
      status.textContent = `1001 → 1010 : Q3·Q1 = 1 감지! CLEAR 신호로 모든 Flip-Flop Reset (실제로는 수 ns, 여기선 느리게 표시)`;
      status.classList.add('alert');
      pendingResetTimer = setTimeout(() => {
        pendingResetTimer = null;
        render(value, beforeReset ^ value);
        status.textContent = '1010 → 0000 : 사용자 눈에는 9 → 0 으로 보입니다.';
        status.classList.remove('alert');
      }, 450);
    } else {
      render(value, previous ^ value);
      status.classList.remove('alert');
      status.textContent = `${toBinaryString(previous)} → ${toBinaryString(value)}  (${previous} → ${value})`;
    }
  }

  const autoClock = createAutoClock(clockTick, 800);

  byId('mod-clock').addEventListener('click', clockTick);
  autoButton.addEventListener('click', () => renderAutoButton(autoButton, autoClock.toggle()));
  byId('mod-reset').addEventListener('click', () => {
    finishPendingReset();
    counter.reset();
    render(0);
    status.classList.remove('alert');
    status.textContent = 'Reset: 0000.';
  });

  render(0);
}

/* ---------- Ch10: BCD ---------- */

function initBcdChapter() {
  // 4bit 값 16개를 Binary / BCD로 읽은 비교표
  let rows = '';
  for (let value = 0; value <= 15; value++) {
    const isValidBcd = value <= 9;
    rows += `<tr class="${isValidBcd ? '' : 'muted'}"><td>${toBinaryString(value)}</td><td class="out-start">${value}</td>` +
      `<td class="text">${isValidBcd ? value : '사용 안 함 (invalid)'}</td></tr>`;
  }
  byId('bcd-table').querySelector('tbody').innerHTML = rows;

  // 0~99: 일반 Binary vs BCD
  const slider = byId('bcd-input');
  function render() {
    const number = Number(slider.value);
    const tens = Math.floor(number / 10);
    const ones = number % 10;
    const binary = number.toString(2);
    byId('bcd-input-value').textContent = number;
    byId('bcd-binary-out').textContent = `${binary}  (${binary.length} bit)`;
    byId('bcd-bcd-out').textContent = `${toBinaryString(tens)} ${toBinaryString(ones)}  (십의 자리 ${tens} | 일의 자리 ${ones}, 8 bit)`;
  }
  slider.addEventListener('input', render);
  render();
}

/* ---------- Ch11: 7-Segment ---------- */

function initSevenSegmentDemo() {
  const picker = byId('seg-picker');
  const display = byId('seg-display');
  const bitsContainer = byId('seg-bits');
  const table = byId('seg-table');
  let currentDigit = 0;

  // 진리표 만들기
  table.querySelector('tbody').innerHTML = SEGMENT_TABLE.map(
    (segments, digit) =>
      `<tr data-row="${digit}"><td><strong>${digit}</strong></td>${segments.map((bit, i) => bitCell(bit, i === 0 ? 'out-start' : '')).join('')}</tr>`
  ).join('');

  // segment 비트 표시칸
  bitsContainer.innerHTML = SEGMENT_NAMES.map(
    (name) => `<div class="seg-bit" data-name="${name}"><span class="seg-bit-name">${name}</span><span class="seg-bit-value">0</span></div>`
  ).join('');

  for (let digit = 0; digit <= 9; digit++) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn';
    button.textContent = digit;
    button.dataset.value = digit;
    button.addEventListener('click', () => {
      currentDigit = digit;
      render();
    });
    picker.append(button);
  }

  byId('seg-labels-toggle').addEventListener('change', (event) => {
    display.classList.toggle('with-labels', event.target.checked);
  });

  function render() {
    const segments = decodeBcdToSegments(currentDigit);
    renderSevenSegment(display, segments);
    byId('seg-pattern').textContent = segments.join('');
    bitsContainer.querySelectorAll('.seg-bit').forEach((cell, i) => {
      cell.classList.toggle('on', segments[i] === 1);
      cell.querySelector('.seg-bit-value').textContent = segments[i];
    });
    picker.querySelectorAll('.btn').forEach((button) => {
      button.classList.toggle('selected', Number(button.dataset.value) === currentDigit);
    });
    highlightTableRow(table, currentDigit);
  }

  render();
}

/* ---------- Ch12: Decoder + segment 탐색기 ---------- */

function initDecoderDemo() {
  const inputsContainer = byId('dec-inputs');
  const outputsContainer = byId('dec-outputs');
  const display = byId('dec-display');
  const status = byId('dec-status');
  let inputValue = 5; // 0101

  // D C B A 입력 토글 (D = 8, A = 1)
  const INPUT_NAMES = ['D', 'C', 'B', 'A'];
  INPUT_NAMES.forEach((name, index) => {
    const position = 3 - index;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'bit-toggle';
    button.dataset.position = position;
    button.innerHTML = `<span class="bit-name">${name} (${2 ** position})</span><span class="bit-value">0</span>`;
    button.addEventListener('click', () => {
      inputValue ^= 1 << position;
      render();
    });
    inputsContainer.append(button);
  });

  outputsContainer.innerHTML = SEGMENT_NAMES.map(
    (name) => `<div class="seg-bit"><span class="seg-bit-name">${name}</span><span class="seg-bit-value">0</span></div>`
  ).join('');

  function render() {
    inputsContainer.querySelectorAll('.bit-toggle').forEach((button) => {
      renderBitToggle(button, (inputValue >> Number(button.dataset.position)) & 1);
    });

    const segments = decodeBcdToSegments(inputValue);
    outputsContainer.querySelectorAll('.seg-bit').forEach((cell, i) => {
      cell.classList.toggle('on', segments[i] === 1);
      cell.querySelector('.seg-bit-value').textContent = segments[i];
    });
    renderSevenSegment(display, segments);

    const bitsText = toBinaryString(inputValue);
    if (inputValue <= 9) {
      byId('dec-input-label').textContent = `입력 ${bitsText} = ${inputValue}`;
      status.classList.remove('alert');
      status.textContent = `${bitsText} → a~g = ${segments.join('')} → 숫자 ${inputValue} 표시`;
    } else {
      byId('dec-input-label').textContent = `입력 ${bitsText} = BCD 아님`;
      status.classList.add('alert');
      status.textContent = `${bitsText}(=${inputValue})는 올바른 BCD가 아닙니다. CD4511처럼 모든 segment를 끕니다. MOD-10 Counter를 쓰면 이런 입력은 절대 들어오지 않습니다.`;
    }
  }

  render();
}

function initSegmentExplorer() {
  const picker = byId('explorer-picker');
  const grid = byId('explorer-grid');
  const summary = byId('explorer-summary');
  let focusSegment = 'a';

  // 숫자 0~9 미니 디스플레이
  for (let digit = 0; digit <= 9; digit++) {
    const cell = document.createElement('div');
    cell.className = 'digit-cell';
    cell.innerHTML = `<span class="num">${digit}</span><div class="seven-seg light">${createSevenSegmentSVG()}</div><span class="state"></span>`;
    renderSevenSegment(cell.querySelector('.seven-seg'), SEGMENT_TABLE[digit]);
    grid.append(cell);
  }

  SEGMENT_NAMES.forEach((name) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn small';
    button.textContent = name;
    button.dataset.name = name;
    button.addEventListener('click', () => {
      focusSegment = name;
      render();
    });
    picker.append(button);
  });

  function render() {
    const segmentIndex = SEGMENT_NAMES.indexOf(focusSegment);
    const onDigits = [];
    const offDigits = [];

    grid.querySelectorAll('.digit-cell').forEach((cell, digit) => {
      const isOn = SEGMENT_TABLE[digit][segmentIndex] === 1;
      (isOn ? onDigits : offDigits).push(digit);
      cell.querySelectorAll('.segment').forEach((segment) => {
        segment.classList.toggle('focus', segment.dataset.segment === focusSegment);
      });
      const state = cell.querySelector('.state');
      state.textContent = isOn ? 'ON' : 'OFF';
      state.className = `state ${onOff(isOn)}`;
    });

    picker.querySelectorAll('.btn').forEach((button) => {
      button.classList.toggle('selected', button.dataset.name === focusSegment);
    });

    summary.textContent =
      `segment ${focusSegment} 회로의 일:\n` +
      `  입력이 ${onDigits.join(', ')} 이면 → 1 (ON)\n` +
      `  입력이 ${offDigits.join(', ')} 이면 → 0 (OFF)`;
  }

  render();
}

/* ---------- Ch13: Clock Generator ---------- */

function initClockDemo() {
  const led = byId('clk-led');
  const levelLabel = byId('clk-level');
  const periodLabel = byId('clk-period');
  const edgesLabel = byId('clk-edges');
  const startButton = byId('clk-start');
  const frequencyButtons = byId('clk-freq').querySelectorAll('.btn');
  let frequencyHz = 1;
  let level = 0;
  let edgeCount = 0;

  // 반 주기마다 HIGH ↔ LOW 를 바꿉니다. (주기 T = 1 / f)
  const halfPeriodMs = () => 1000 / frequencyHz / 2;

  const clock = createAutoClock(() => {
    level ^= 1;
    if (level === 1) edgeCount++; // LOW → HIGH = Rising Edge
    render();
  }, halfPeriodMs());

  function render() {
    led.classList.toggle('on', level === 1);
    levelLabel.textContent = level ? 'HIGH' : 'LOW';
    levelLabel.style.color = level ? 'var(--accent-ink)' : 'var(--text-faint)';
    periodLabel.textContent = `${1 / frequencyHz} s`;
    edgesLabel.textContent = edgeCount;
  }

  frequencyButtons.forEach((button) => {
    button.addEventListener('click', () => {
      frequencyHz = Number(button.dataset.hz);
      frequencyButtons.forEach((b) => b.classList.toggle('selected', b === button));
      clock.setInterval(halfPeriodMs());
      render();
    });
  });

  startButton.addEventListener('click', () => {
    const running = clock.toggle();
    startButton.textContent = running ? '정지 ■' : '시작 ▶';
    if (!running) {
      level = 0;
      render();
    }
  });

  render();
}

/* ---------- Ch14: Final Demo ---------- */

function initFinalDemo() {
  const counter = createCounter(10); // ← Ch9와 같은 MOD-10 Counter 로직
  const clockPin = byId('final-clock-pin');
  const bitsContainer = byId('final-bits');
  const segmentList = byId('final-seglist');
  const display = byId('final-display');
  const loop = byId('final-loop');
  const status = byId('final-status');
  const autoButton = byId('final-auto');
  const speedButtons = byId('final-speed').querySelectorAll('.btn');
  const stages = ['final-stage-clock', 'final-stage-counter', 'final-stage-decoder', 'final-stage-display'].map(byId);
  let intervalMs = 1000;
  let edgeCount = 0;
  let highlightTimers = [];

  bitsContainer.innerHTML = '<span class="b"></span>'.repeat(4);
  renderDigitLoop(loop);

  /** Counter 값 하나가 Decoder를 거쳐 Display까지 가는 과정을 모두 그립니다. */
  function render() {
    const value = counter.value;
    const bits = toBits(value); // [D, C, B, A]
    const segments = decodeBcdToSegments(value); // Decoder

    // ② Counter / BCD
    bitsContainer.querySelectorAll('.b').forEach((cell, i) => {
      cell.textContent = bits[i];
      cell.classList.toggle('on', bits[i] === 1);
    });
    byId('final-bcd').textContent = `BCD ${bits.join('')} = ${value}`;

    // ③ Decoder 출력 a~g
    segmentList.innerHTML = SEGMENT_NAMES.map(
      (name, i) => `<span class="${onOff(segments[i])}">${name} = ${segments[i]}</span>`
    ).join('');

    // ④ 7-Segment
    renderSevenSegment(display, segments);
    byId('final-decimal').textContent = `Decimal = ${value}`;
    byId('final-clock-count').textContent = `edge ${edgeCount}`;

    highlightDigitLoop(loop, value);
  }

  /** Clock → Counter → Decoder → Display 순서로 잠깐씩 강조 (데이터 흐름 시각화) */
  function showSignalFlow() {
    highlightTimers.forEach(clearTimeout);
    highlightTimers = [];
    stages.forEach((stage) => stage.classList.remove('pulse'));
    const step = Math.min(110, intervalMs / 8);
    stages.forEach((stage, index) => {
      highlightTimers.push(setTimeout(() => stage.classList.add('pulse'), index * step));
      highlightTimers.push(setTimeout(() => stage.classList.remove('pulse'), index * step + step * 2.5));
    });

    // Clock 핀: Rising Edge 순간 HIGH, 잠시 뒤 LOW
    clockPin.classList.add('on');
    highlightTimers.push(setTimeout(() => clockPin.classList.remove('on'), Math.min(250, intervalMs / 2)));
  }

  function clockTick() {
    const { previous, value, wrapped } = counter.tick();
    edgeCount++;
    render();
    showSignalFlow();

    const bitsText = toBinaryString(value);
    const segmentsText = decodeBcdToSegments(value).join('');
    status.textContent = wrapped
      ? `Clock ↑ → Counter 1001 → (1010 감지, Reset) → 0000 → Decoder ${segmentsText} → 화면 0`
      : `Clock ↑ → Counter ${toBinaryString(previous)} → ${bitsText} → Decoder ${segmentsText} → 화면 ${value}`;
  }

  const autoClock = createAutoClock(clockTick, intervalMs);

  byId('final-manual').addEventListener('click', clockTick);

  autoButton.addEventListener('click', () => renderAutoButton(autoButton, autoClock.toggle()));

  byId('final-reset').addEventListener('click', () => {
    counter.reset();
    edgeCount = 0;
    render();
    status.textContent = 'Reset: Counter = 0000.';
  });

  speedButtons.forEach((button) => {
    button.addEventListener('click', () => {
      intervalMs = Number(button.dataset.ms);
      speedButtons.forEach((b) => b.classList.toggle('selected', b === button));
      autoClock.setInterval(intervalMs);
    });
  });

  render();
}

/* ==========================================================
   시작: 페이지가 준비되면 모든 것을 초기화
   ========================================================== */

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initSevenSegmentDisplays();
  initIntroPreview();
  initVoltageDemo();
  initBinaryConverter();
  initBooleanTables();
  initGateGallery();
  initGateDemo();
  initHalfAdderDemo();
  initLatchDemo();
  initDataFlipFlopDemo();
  initToggleFlipFlopDemo();
  initBinaryCounterDemo();
  initMod10CounterDemo();
  initBcdChapter();
  initSevenSegmentDemo();
  initDecoderDemo();
  initSegmentExplorer();
  initClockDemo();
  initFinalDemo();
});
