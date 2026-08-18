// Anthropic Structured Outputs가 받지 않는 JSON Schema 제약을 다룬다.
//
// 문제: minItems·maxItems·minimum·maximum은 문법 제약으로 컴파일되지 않아 400을 받는다.
// 그렇다고 스키마에서 지워 버리면 「항목 10개」 같은 약속이 통째로 사라진다.
//
// 그래서 둘로 나눈다.
//   보낼 때  — stripUnsupported()로 제약을 떼고, 대신 description에 말로 적어 준다.
//   받은 뒤  — validateSchema()로 원본 스키마와 대조해 어긋난 곳을 찾는다.
//
// 스키마 리터럴은 손대지 않는다. 39곳을 사람이 고치면 그만큼 틀린다.

// 떼어 낼 것. 값이 있으면 description으로 옮긴다.
const MOVED = {
  minItems: value => `${value}개 이상`,
  maxItems: value => `${value}개까지`,
  minLength: value => `${value}자 이상`,
  maxLength: value => `${value}자까지`,
  minimum: value => `${value} 이상`,
  maximum: value => `${value} 이하`
};
// 떼어 내되 말로 옮기지 않을 것. 옮겨 봐야 도움이 되지 않는다.
const DROPPED = ['multipleOf', 'uniqueItems', 'exclusiveMinimum', 'exclusiveMaximum', 'pattern'];

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// 보내기 전. 제약을 떼고 description에 적는다. 원본은 바꾸지 않는다.
export function stripUnsupported(node) {
  if (Array.isArray(node)) return node.map(stripUnsupported);
  if (!isObject(node)) return node;

  const out = {};
  const notes = [];
  for (const [key, value] of Object.entries(node)) {
    if (key in MOVED && (typeof value === 'number' || typeof value === 'string')) {
      notes.push(MOVED[key](value));
      continue;
    }
    if (DROPPED.includes(key)) continue;
    out[key] = stripUnsupported(value);
  }
  if (notes.length) {
    const before = typeof out.description === 'string' ? out.description.trim() : '';
    out.description = before ? `${before} (${notes.join(', ')})` : notes.join(', ');
  }
  // 구조화 출력은 모든 object에 additionalProperties: false를 요구한다.
  if (out.type === 'object' && out.properties && !('additionalProperties' in out)) {
    out.additionalProperties = false;
  }
  return out;
}

// 받은 뒤. 원본 스키마와 대조한다. 막기 위해서가 아니라 알기 위해서다.
// 어긋난 곳을 [{ path, rule, expected, actual }] 로 돌려준다. 어긋난 곳이 없으면 빈 배열.
export function validateSchema(schema, value, path = '') {
  const issues = [];
  walk(schema, value, path || '$', issues);
  return issues;
}

function walk(schema, value, path, issues) {
  if (!isObject(schema)) return;
  const add = (rule, expected, actual) => issues.push({ path, rule, expected, actual });

  if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      if (value !== undefined) add('type', 'array', typeof value);
      return;
    }
    if (Number.isFinite(schema.minItems) && value.length < schema.minItems) add('minItems', schema.minItems, value.length);
    if (Number.isFinite(schema.maxItems) && value.length > schema.maxItems) add('maxItems', schema.maxItems, value.length);
    if (schema.items) value.forEach((item, i) => walk(schema.items, item, `${path}[${i}]`, issues));
    return;
  }

  if (schema.type === 'object') {
    if (!isObject(value)) {
      if (value !== undefined) add('type', 'object', Array.isArray(value) ? 'array' : typeof value);
      return;
    }
    for (const name of schema.required || []) {
      if (value[name] === undefined) add('required', name, 'missing');
    }
    for (const [name, child] of Object.entries(schema.properties || {})) {
      if (value[name] !== undefined) walk(child, value[name], `${path}.${name}`, issues);
    }
    return;
  }

  if (schema.type === 'string') {
    if (typeof value !== 'string') { if (value !== undefined) add('type', 'string', typeof value); return; }
    if (Number.isFinite(schema.minLength) && value.length < schema.minLength) add('minLength', schema.minLength, value.length);
    if (Number.isFinite(schema.maxLength) && value.length > schema.maxLength) add('maxLength', schema.maxLength, value.length);
    // enum은 대소문자가 흔들릴 수 있다. 대소문자를 무시하고 본다.
    if (Array.isArray(schema.enum)) {
      const lower = schema.enum.map(item => String(item).toLowerCase());
      if (!lower.includes(value.toLowerCase())) add('enum', schema.enum.length + '개 중 하나', value.slice(0, 40));
    }
    return;
  }

  if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof value !== 'number') { if (value !== undefined) add('type', schema.type, typeof value); return; }
    if (Number.isFinite(schema.minimum) && value < schema.minimum) add('minimum', schema.minimum, value);
    if (Number.isFinite(schema.maximum) && value > schema.maximum) add('maximum', schema.maximum, value);
  }
}

// 화면·기록에 남길 짧은 요약. 원문은 담지 않는다.
export function summarizeIssues(issues, limit = 5) {
  return issues.slice(0, limit).map(issue => `${issue.path} ${issue.rule}(기대 ${issue.expected}, 실제 ${issue.actual})`);
}
