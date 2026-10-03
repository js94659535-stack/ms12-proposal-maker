// 공모 정의(데이터)를 읽어 계획서를 만드는 범용 엔진 (10-19).
//
// 엔진은 공모 이름이나 규정을 모른다. 공모마다 다른 것은 모두 정의 파일(defs/*.js)에 있다:
//   · requirements  신청자격·제외 조건 — 원문 문장(quote)과 함께, 기관 사실(fact)에 대한 판정 규칙
//   · sourceItems   제안요청서·양식에서 뽑은 원문 항목(순서 포함). 정의가 연결하지 않은 항목도 버리지 않는다
//   · parts         계획서 구성 — 문장·표 템플릿. `{{사실}}`은 사용자 답, `{{=식}}`은 계산값
//   · choices/derive/checks  선택지(예: 차종), 계산식, 생성 후 검증식
//   · applicantFields/facts  기관에게 묻는 항목
// 흐름: preCheck(생성 전: 요구조건·기관정보 확인) → generate → postCheck(생성 후: 규정·일관성 검증).

// ---------- 식 계산기 (eval을 쓰지 않는다) ----------
const FUNCS = {
  ceil: Math.ceil, floor: Math.floor, round: Math.round, min: Math.min, max: Math.max,
  money: n => `${Math.round(n).toLocaleString('ko-KR')}원`,
  num: n => Math.round(n).toLocaleString('ko-KR'),
  pct: n => `${Math.round(n * 1000) / 10}%`
};
function tokenize(source) {
  const tokens = [];
  const re = /\s*(?:(\d+(?:\.\d+)?)|('(?:[^'\\]|\\.)*')|([A-Za-z_가-힣][\w가-힣.]*)|(&&|\|\||==|!=|<=|>=|[-+*/(),<>?:!]))/y;
  let at = 0;
  while (at < source.length) {
    re.lastIndex = at;
    const match = re.exec(source);
    if (!match) { if (/^\s*$/.test(source.slice(at))) break; throw new Error(`식을 읽을 수 없다: ${source.slice(at, at + 12)}`); }
    at = re.lastIndex;
    if (match[1] !== undefined) tokens.push({ t: 'num', v: Number(match[1]) });
    else if (match[2] !== undefined) tokens.push({ t: 'str', v: match[2].slice(1, -1) });
    else if (match[3] !== undefined) tokens.push({ t: 'id', v: match[3] });
    else tokens.push({ t: 'op', v: match[4] });
  }
  return tokens;
}
export function evalExpr(source, scope = {}) {
  const tokens = tokenize(String(source));
  let i = 0;
  const peek = () => tokens[i];
  const take = () => tokens[i++];
  const isOp = v => peek()?.t === 'op' && peek().v === v;
  const lookup = name => name.split('.').reduce((value, key) => (value === undefined || value === null ? undefined : value[key]), scope);
  function ternary() {
    const cond = or();
    if (isOp('?')) { take(); const a = ternary(); if (!isOp(':')) throw new Error('식에 :가 없다'); take(); const b = ternary(); return cond ? a : b; }
    return cond;
  }
  function or() { let l = and(); while (isOp('||')) { take(); const r = and(); l = l || r; } return l; }
  function and() { let l = eq(); while (isOp('&&')) { take(); const r = eq(); l = l && r; } return l; }
  function eq() { let l = rel(); while (isOp('==') || isOp('!=')) { const op = take().v; const r = rel(); l = op === '==' ? l === r : l !== r; } return l; }
  function rel() { let l = add(); while (['<', '>', '<=', '>='].some(isOp)) { const op = take().v; const r = add(); l = op === '<' ? l < r : op === '>' ? l > r : op === '<=' ? l <= r : l >= r; } return l; }
  function add() { let l = mul(); while (isOp('+') || isOp('-')) { const op = take().v; const r = mul(); l = op === '+' ? l + r : l - r; } return l; }
  function mul() { let l = unary(); while (isOp('*') || isOp('/')) { const op = take().v; const r = unary(); l = op === '*' ? l * r : l / r; } return l; }
  function unary() { if (isOp('-')) { take(); return -unary(); } if (isOp('!')) { take(); return !unary(); } return primary(); }
  function primary() {
    const token = take();
    if (!token) throw new Error('식이 끝났다');
    if (token.t === 'num' || token.t === 'str') return token.v;
    if (token.t === 'op' && token.v === '(') { const v = ternary(); if (!isOp(')')) throw new Error('식에 )가 없다'); take(); return v; }
    if (token.t === 'id') {
      if (isOp('(')) {
        take();
        const args = [];
        if (!isOp(')')) { args.push(ternary()); while (isOp(',')) { take(); args.push(ternary()); } }
        if (!isOp(')')) throw new Error('식에 )가 없다'); take();
        if (!FUNCS[token.v]) throw new Error(`모르는 함수: ${token.v}`);
        return FUNCS[token.v](...args);
      }
      if (token.v === 'true') return true;
      if (token.v === 'false') return false;
      const value = lookup(token.v);
      return value === undefined ? 0 : value;
    }
    throw new Error(`식을 읽을 수 없다: ${token.v}`);
  }
  const value = ternary();
  if (i < tokens.length) throw new Error('식 끝에 남은 것이 있다');
  return value;
}

// ---------- 범위(scope): 입력값 + 선택지 + 계산값 ----------
export function buildScope(def, input = {}) {
  const scope = {};
  for (const [key, spec] of Object.entries(def.inputs || {})) scope[key] = Number(input.values?.[key] ?? spec.default);
  for (const [key, choice] of Object.entries(def.choices || {})) {
    const picked = input.choices?.[key] ?? choice.default;
    scope[key] = { key: picked, ...(choice.options[picked] || {}) };
  }
  for (const item of def.derive || []) scope[item.id] = evalExpr(item.expr, scope);
  return scope;
}

// ---------- 문장 속 토큰 풀기 ----------
const TOKEN = /\{\{(=?)([^}]+)\}\}/g;
export function resolveText(def, text, scope, input = {}, usage = { unresolved: [], virtual: 0 }) {
  return String(text).replace(TOKEN, (_, calc, body) => {
    if (calc) {
      try { return String(evalExpr(body, scope)); } catch (error) { usage.unresolved.push(`식 오류: ${body}`); return `[식 오류: ${body}]`; }
    }
    const key = body.trim();
    const spec = def.facts?.[key];
    const answer = String(input.facts?.[key] ?? '').trim();
    if (answer) return answer;
    if (input.virtual && spec) { usage.virtual += 1; return `〔가상〕${spec[2]}`; }
    usage.unresolved.push(key);
    return `[확인 필요: ${spec ? spec[0] : key}]`;
  });
}
export function factKeysOf(def) {
  const keys = new Set();
  const scan = text => { for (const m of String(text).matchAll(TOKEN)) if (!m[1]) keys.add(m[2].trim()); };
  for (const part of def.parts) { (part.lines || []).forEach(scan); (part.rows || []).forEach(row => row.forEach(scan)); scan(part.when || ''); }
  return [...keys];
}

// ---------- 생성 ----------
const asTable = (rows, noHeader = false) => rows.map((row, i) => `${noHeader && i === 0 ? '▦-' : '▦'} ${row.join(' | ')}`);
function preservedPart(item) {
  return { id: `preserved:${item.no || item.name}`, item: item.name, title: item.name, preserved: true,
    lines: [`원문 항목: ${item.name}`, `원문 안내: ${item.quote || '(안내 문구 없음)'}`, `{{preserved.${item.name}}}`] };
}
// 정의가 연결하지 않은 원문 항목은 버리지 않고, 바로 앞 원문 항목 뒤에 보존 칸으로 끼운다.
export function orderedParts(def) {
  const covered = new Set(def.parts.map(part => part.item).filter(Boolean));
  const result = [...def.parts];
  const missing = [];
  def.sourceItems.forEach((item, index) => {
    if (covered.has(item.name)) return;
    const prev = [...def.sourceItems.slice(0, index)].reverse().find(p => covered.has(p.name));
    const at = prev ? result.findIndex(part => part.item === prev.name) : -1;
    const preserved = preservedPart(item);
    result.splice(at < 0 ? result.length : at + 1, 0, preserved);
    covered.add(item.name);
    missing.push(item.name);
  });
  return { parts: result, preserved: missing };
}

export function generate(def, input = {}) {
  const scope = buildScope(def, input);
  const usage = { unresolved: [], virtual: 0 };
  const { parts, preserved } = orderedParts(def);
  const lines = [];
  const emit = part => {
    if (part.when && !evalExpr(part.when, scope)) return;
    lines.push(`## ${resolveText(def, part.title, scope, input, usage)}`);
    // 표를 먼저, 그 아래 설명·서명 줄을 둔다(양식 순서). 보존 칸은 표 없이 줄만 있다.
    if (part.rows) lines.push(...asTable(part.rows.map(row => row.map(cell => resolveText(def, cell, scope, input, usage))), part.noHeader));
    if (part.area) lines.push(...asTable([[part.area.title], ...part.area.rows.map(row => row.map(cell => resolveText(def, cell, scope, input, usage)))]));
    for (const line of part.lines || []) {
      if (part.preserved && line.startsWith('{{preserved.')) {
        const answer = String(input.facts?.[`preserved.${part.item}`] ?? '').trim();
        lines.push(answer || (input.virtual ? `〔가상〕${def.preservedVirtual || '이 항목은 사용자가 직접 작성한다(가상 예시 문장)'}` : `[확인 필요: 사용자가 작성할 원문 항목 「${part.item}」]`));
        if (!answer && !input.virtual) usage.unresolved.push(`preserved.${part.item}`);
        else if (!answer && input.virtual) usage.virtual += 1;
        continue;
      }
      lines.push(resolveText(def, line, scope, input, usage));
    }
    lines.push('');
  };
  lines.push(resolveText(def, def.title, scope, input, usage), '');
  if (input.virtual) lines.push('※ 경고: 〔가상〕 표시는 예시로 지어낸 값이며 사실이 아니다. 제출 전에 모두 실제 값으로 바꾸거나 지워야 한다.', '');
  for (const part of parts) emit(part);
  return { text: lines.join('\n'), scope, unresolved: [...new Set(usage.unresolved)], virtualCount: usage.virtual, preserved, parts };
}

// ---------- 후보 문장이 규칙·구현에 연결되었는가 ----------
export function linkInfo(def, candidate) {
  const rule = (def.requirements || []).find(r => r.quote && candidate.quote.includes(r.quote));
  if (rule) return { via: '규칙', by: rule.label };
  const impl = (def.implements || []).find(i => candidate.quote.includes(i.quote));
  if (impl) return { via: '구현', by: impl.by };
  return null;
}

// ---------- 생성 전 확인 ----------
function judge(req, answer) {
  const raw = answer === undefined || answer === null ? '' : String(answer).trim();
  if (raw === '') return ['미확인', '입력 없음'];
  switch (req.op) {
    case 'is': return raw === req.value ? ['충족', `${raw}`] : ['미충족', `${raw} (요구: ${req.value})`];
    case 'date<=': { const ok = Date.parse(raw) <= Date.parse(req.value); return Number.isNaN(Date.parse(raw)) ? ['미확인', `날짜를 읽을 수 없음: ${raw}`] : ok ? ['충족', raw] : ['미충족', `${raw} (기한: ${req.value} 이전)`]; }
    case 'num>=': return Number(raw) >= req.value ? ['충족', `${raw}`] : ['미충족', `${raw} (최소 ${req.value})`];
    case 'num<=': return Number(raw) <= req.value ? ['충족', `${raw}`] : ['미충족', `${raw} (최대 ${req.value})`];
    default: return ['미확인', `알 수 없는 규칙 ${req.op}`];
  }
}
export function checkApplicant(def, facts = {}) {
  const rows = def.requirements.map(req => {
    const [result, basis] = judge(req, facts[req.fact]);
    return { id: req.id, label: req.label, required: Boolean(req.required), result, basis, quote: req.quote, file: req.file };
  });
  let status = '적격';
  if (rows.some(r => r.required && r.result === '미충족')) status = '부적격';
  else if (rows.some(r => r.required && r.result === '미확인')) status = '판단 보류';
  else if (rows.some(r => r.result !== '충족')) status = '조건부 적격';
  return { status, rows };
}
export function preCheck(def, input = {}) {
  const check = checkApplicant(def, input.applicant || {});
  const items = [];
  for (const row of check.rows.filter(r => r.result === '미충족' && r.required)) items.push({ level: '오류', message: `신청 자격 미충족 — ${row.label}: ${row.basis}` });
  for (const row of check.rows.filter(r => r.result === '미확인' && r.required)) items.push({ level: '확인', message: `필수 조건 확인 필요 — ${row.label}` });
  const sourceUncovered = orderedParts(def).preserved;
  if (sourceUncovered.length) items.push({ level: '확인', message: `정의에 연결되지 않은 원문 항목 ${sourceUncovered.length}건은 보존 칸으로 남겼다 — ${sourceUncovered.join(', ')}` });
  if (def.candidates) {
    const unlinked = def.candidates.filter(c => !linkInfo(def, c));
    if (unlinked.length) items.push({ level: '확인', message: `추출한 조건 후보 ${def.candidates.length}개 중 규칙이나 구현에 연결되지 않은 것 ${unlinked.length}개는 사용자 확인 대상이다` });
  }
  if (def.status) items.push({ level: '안내', message: def.status });
  return { status: check.status, items, rows: check.rows };
}

// ---------- 생성 후 검증 ----------
export function postCheck(def, input = {}, generated = generate(def, input)) {
  const scope = generated.scope;
  const items = [];
  for (const check of def.checks || []) {
    let ok;
    try { ok = Boolean(evalExpr(check.expr, scope)); } catch { ok = false; }
    items.push({ level: ok ? '통과' : '오류', id: check.id, message: ok ? check.label : `${check.label} — ${check.message}` });
  }
  const text = generated.text;
  if (/\{\{/.test(text)) items.push({ level: '오류', id: 'tokens', message: '풀리지 않은 토큰이 남아 있다' });
  if (generated.unresolved.length) items.push({ level: '확인', id: 'unresolved', message: `미확인 사실 ${new Set(generated.unresolved).size}건이 남아 있다` });
  if (/〔가상〕/.test(text)) items.push({ level: '오류', id: 'virtual', message: '가상 값(〔가상〕)이 남아 있다. 제출 전에 실제 값으로 바꿔야 한다' });
  const areas = def.requiredAreas || [];
  for (const area of areas) items.push({ level: text.includes(area.marker) ? '통과' : '오류', id: `area:${area.id}`, message: `${area.label} 칸이 계획서에 있다` });
  for (const item of def.sourceItems) items.push({ level: text.includes(item.name) ? '통과' : '오류', id: `item:${item.name}`, message: `원문 항목 「${item.name}」이 계획서에 있다` });
  if (def.fileName) items.push({ level: '안내', id: 'filename', message: `제출 파일 이름: ${resolveText(def, def.fileName, scope, input)}` });
  return { items, errors: items.filter(i => i.level === '오류').length };
}

// ---------- 선택지 평가와 기관 순위 ----------
export function evaluateChoices(def, key, input = {}) {
  const choice = def.choices[key];
  return Object.entries(choice.options).map(([optionKey, option]) => {
    const scope = buildScope(def, { ...input, choices: { ...(input.choices || {}), [key]: optionKey } });
    const feasible = Boolean(evalExpr(choice.feasible, scope));
    return { key: optionKey, label: option.label, feasible, rank: evalExpr(choice.rank, scope), reason: resolveText(def, feasible ? choice.okReason : choice.noReason, scope, input), scope };
  }).sort((a, b) => Number(b.feasible) - Number(a.feasible) || a.rank - b.rank);
}
export function rankApplicants(def, applicants) {
  return applicants.map(app => ({ ...app, check: checkApplicant(def, app.facts) }))
    .sort((a, b) => ['적격', '조건부 적격', '판단 보류', '부적격'].indexOf(a.check.status) - ['적격', '조건부 적격', '판단 보류', '부적격'].indexOf(b.check.status) || (b.users || 0) - (a.users || 0));
}

// ---------- 재설계와 변경 내역 ----------
export function changeLog(def, baseInput, input) {
  const a = buildScope(def, baseInput);
  const b = buildScope(def, input);
  const rows = [];
  for (const watch of def.watch || []) {
    const before = evalExpr(watch.expr, a);
    const after = evalExpr(watch.expr, b);
    if (String(before) !== String(after)) {
      const fmt = value => (watch.format && FUNCS[watch.format] ? FUNCS[watch.format](value) : String(value));
      rows.push({ what: watch.label, from: fmt(before), to: fmt(after), why: resolveText(def, watch.why || '', b, input) });
    }
  }
  return rows;
}
