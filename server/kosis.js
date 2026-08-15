// KOSIS(국가통계포털) 조회. 계획서에 쓸 「공식 통계 근거 후보」를 찾아 온다.
//
// 후보다. 계획서에 자동으로 넣지 않는다. 사람이 보고 쓸지 정한다.
//
// 통계는 틀린 숫자보다 「맞는 숫자를 틀리게 부르는 것」이 더 위험하다. 그래서:
// - 0~19세를 「아동·청소년」이라 부르지 않는다. 화면에도 「0~19세 주민등록인구」라고 그대로 적는다.
// - 나이 범위는 계획서가 정한다. 대상 연령을 모르면 더하지 않고 물어본다.
// - 지역은 「광주광역시 광산구」까지 적고, 코드와 이름이 모두 맞아야 쓴다. 「동구」만으로는 받지 않는다.
// - 기준시점은 연·월로 적는다. 월을 알 수 없는 표는 모른다고 적는다.
// - 더한 값에는 시작·종료 나이, 더한 줄 수, 합산식을 함께 남긴다.
//
// 운영 조회는 확인된 표 하나(DT_1B04006)만 쓴다. 표를 추측하며 연달아 부르지 않는다.
// 인증키는 이 파일 밖으로 나가지 않는다. 주소를 남길 때는 반드시 maskKey를 지난다.

export const KOSIS_ORIGIN = 'https://kosis.kr';

// 확인된 표 하나. 2026-08-15 실제 조회로 값·단위·분류 겹수를 확인했다.
// 분류가 두 겹(행정구역 × 1세별 연령)이라 objL1=지역코드, objL2=ALL로 부른다.
// 조사명·작성기관은 같은 날 KOSIS 통합검색이 돌려준 값이다(STAT_NM·ORG_NM).
// 주민등록인구 연간 자료는 그해 12월 31일 등록 기준이다. 그래서 기준시점을 「12월 말」로 적는다.
export const TABLE = Object.freeze({
  orgId: '101', tblId: 'DT_1B04006',
  tableName: '행정구역(시군구)별/1세별 주민등록인구',
  survey: '주민등록인구현황', organization: '행정안전부',
  levels: 2, itemName: '총인구수', periodBasis: '12월 말'
});

// 지금 조회할 수 있는 지역. 여기 없는 곳은 「지원하지 않는다」고 분명히 답한다.
// 이름만으로 어느 시의 동구인지 알 수 없는 곳은 ambiguous로 두고 「광주」를 함께 적어야 받는다.
export const REGIONS = Object.freeze([
  Object.freeze({ code: '29', short: '광주광역시', full: '광주광역시', ambiguous: false }),
  Object.freeze({ code: '29110', short: '동구', full: '광주광역시 동구', ambiguous: true }),
  Object.freeze({ code: '29140', short: '서구', full: '광주광역시 서구', ambiguous: true }),
  Object.freeze({ code: '29155', short: '남구', full: '광주광역시 남구', ambiguous: true }),
  Object.freeze({ code: '29170', short: '북구', full: '광주광역시 북구', ambiguous: true }),
  Object.freeze({ code: '29200', short: '광산구', full: '광주광역시 광산구', ambiguous: false })
]);
export const SUPPORTED_REGION_TEXT = `지금은 ${REGIONS[0].full}와 5개 자치구(${REGIONS.slice(1).map(item => item.short).join('·')})만 조회할 수 있습니다. 다른 지역은 아직 지원하지 않습니다.`;

const text = value => String(value ?? '').trim();
const compact = value => text(value).replace(/\s+/g, '');

// 적어 준 지역이 어디인지 정한다. 「동구」처럼 여러 시에 있는 이름은 「광주」가 함께 있어야 받는다.
export function resolveRegion(input) {
  const raw = text(input);
  if (!raw) return { ok: false, reason: 'empty' };
  const packed = compact(raw);
  const byCode = REGIONS.find(item => item.code === packed);
  if (byCode) return { ok: true, region: byCode };
  const byFull = REGIONS.find(item => compact(item.full) === packed);
  if (byFull) return { ok: true, region: byFull };
  const byShort = REGIONS.find(item => compact(item.short) === packed);
  if (!byShort) return { ok: false, reason: 'unsupported' };
  // 「동구」는 광주에도 부산에도 대구에도 있다. 어느 동구인지 적지 않았으면 고르지 않는다.
  if (byShort.ambiguous) return { ok: false, reason: 'ambiguous', region: byShort };
  return { ok: true, region: byShort };
}

// 조회 주소. 인증키는 값으로만 들어가고 어디에도 남기지 않는다.
const url = (path, params) => `${KOSIS_ORIGIN}${path}?${new URLSearchParams(params).toString()}`;

export const dataUrl = (apiKey, { region, table = TABLE, prdSe = 'Y', newEstPrdCnt = 1 }) => {
  const objs = {};
  for (let level = 1; level <= table.levels; level += 1) objs[`objL${level}`] = level === 1 ? region.code : 'ALL';
  return url('/openapi/Param/statisticsParameterData.do', {
    method: 'getList', apiKey, orgId: table.orgId, tblId: table.tblId, itmId: 'ALL', ...objs,
    format: 'json', jsonVD: 'Y', prdSe, newEstPrdCnt: String(newEstPrdCnt)
  });
};

// 화면·기록·오류 어디에도 키가 나가지 않게 한다. 지우지 않고 가린다(무엇을 불렀는지는 남아야 한다).
export function maskKey(value) {
  return String(value ?? '').replace(/(apiKey=)[^&\s]*/gi, '$1***');
}

// KOSIS는 오류도 200으로 준다. 배열이 아니면 오류로 본다.
export function kosisError(payload) {
  if (Array.isArray(payload)) return null;
  const err = payload?.err ?? payload?.errMsg ?? null;
  if (err === null || err === undefined) return null;
  return { code: String(payload.err ?? ''), message: maskKey(String(payload.errMsg || '조회하지 못했습니다.')) };
}

const numberOf = value => {
  const raw = text(value).replace(/,/g, '');
  return /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : null;
};

// 기준시점. 연·월까지 적는다. 월을 알 수 없는 표는 지어내지 않고 모른다고 적는다.
export function periodLabel(prdDe, basis = '') {
  const raw = text(prdDe);
  if (/^\d{6}$/.test(raw)) return `${raw.slice(0, 4)}년 ${Number(raw.slice(4, 6))}월 기준`;
  if (/^\d{4}$/.test(raw)) return basis ? `${raw}년 ${basis} 기준` : `${raw}년 기준(월 미표기)`;
  return '';
}
export const periodYear = prdDe => (/^\d{4}/.test(text(prdDe)) ? text(prdDe).slice(0, 4) : '');

// 받은 줄이 우리가 물은 지역이 맞는지. 코드가 오면 코드로, 이름이 오면 이름으로 확인한다.
// 둘 다 확인할 수 있으면 둘 다 맞아야 한다.
export function rowMatchesRegion(row, region) {
  const code = text(row?.C1);
  const name = text(row?.C1_NM);
  if (!code && !name) return false;
  if (code && code !== region.code) return false;
  if (name && name !== region.short && name !== region.full) return false;
  return true;
}

// 나이 칸. 「10세」만 나이 하나로 읽는다. 「계」·「100세 이상」은 나이 하나가 아니므로 더하지 않는다.
export function ageOf(label) {
  const match = /^(\d+)세$/.exec(text(label));
  return match ? Number(match[1]) : null;
}

// 한 줄을 사람이 읽는 근거 후보로 바꾼다. 빠진 것이 있으면 후보로 삼지 않는다.
export function normalizeRow(row, { region, table = TABLE } = {}) {
  const value = numberOf(row?.DT);
  const year = periodYear(row?.PRD_DE);
  const unit = text(row?.UNIT_NM);
  const tableName = text(row?.TBL_NM) || table.tableName;
  const breakdown = [text(row?.C2_NM), text(row?.C3_NM)].filter(Boolean).join(' · ');
  const missing = [];
  if (value === null) missing.push('값');
  if (!year) missing.push('기준시점');
  if (!unit) missing.push('단위');
  if (!region) missing.push('지역');
  if (!tableName) missing.push('통계표명');
  if (missing.length) return { ok: false, missing };
  return {
    ok: true,
    candidate: {
      orgId: table.orgId, tblId: table.tblId, tableName,
      organization: table.organization, survey: table.survey,
      itemName: text(row?.ITM_NM), breakdown, age: ageOf(row?.C2_NM),
      region: region.full, regionCode: region.code,
      period: year, periodLabel: periodLabel(row?.PRD_DE, table.periodBasis),
      value, unit, link: statHtmlLink(table.orgId, table.tblId)
    }
  };
}

// KOSIS에서 같은 표를 사람이 직접 열어 보는 주소. 근거는 확인할 수 있어야 근거다.
export const statHtmlLink = (orgId, tblId) => `${KOSIS_ORIGIN}/statHtml/statHtml.do?orgId=${encodeURIComponent(orgId)}&tblId=${encodeURIComponent(tblId)}`;

// 이 지역 줄만 골라 후보로 바꾼다. 지역이 다르면 버린다.
export function candidatesFor(rows, region, { table = TABLE, limit = 8, startAge = null, endAge = null } = {}) {
  const made = [];
  for (const row of (Array.isArray(rows) ? rows : []).filter(item => rowMatchesRegion(item, region))) {
    const result = normalizeRow(row, { region, table });
    if (result.ok) made.push(result.candidate);
  }
  // 대상 연령을 알면 그 나이대를 앞에 보여 준다. 모르면 온 순서를 바꾸지 않는다.
  const inRange = item => item.age !== null && Number.isInteger(startAge) && Number.isInteger(endAge) && item.age >= startAge && item.age <= endAge;
  return made
    .map((item, index) => ({ item, index, hit: inRange(item) ? 0 : 1 }))
    .sort((a, b) => a.hit - b.hit || a.index - b.index)
    .slice(0, limit)
    .map(entry => entry.item);
}

export const AGE_REQUIRED_MESSAGE = '계획서의 대상 연령을 알려 주시면 그 범위만 더합니다. 임의로 「아동·청소년」이라고 부르지 않습니다.';

// 나이 범위 합계. 계획서가 정한 범위만 더한다. 범위를 모르면 더하지 않는다.
//
// 더한 값은 KOSIS가 발표한 숫자가 아니라 우리가 만든 숫자다. 그래서 시작·종료 나이,
// 더한 줄 수, 합산식을 값과 함께 들고 다닌다. 범위 안에 빠진 나이가 있으면 더하지 않는다.
export function sumRange(candidates, { startAge, endAge, itemName = TABLE.itemName } = {}) {
  if (!Number.isInteger(startAge) || !Number.isInteger(endAge)) return { ok: false, reason: 'age-required', message: AGE_REQUIRED_MESSAGE };
  if (startAge < 0 || endAge < startAge) return { ok: false, reason: 'age-invalid', message: '대상 연령 범위가 올바르지 않습니다.' };

  const rows = (Array.isArray(candidates) ? candidates : [])
    .filter(row => row.itemName === itemName && row.age !== null && row.age >= startAge && row.age <= endAge);
  if (!rows.length) return { ok: false, reason: 'no-rows', message: '그 나이 범위의 원자료를 찾지 못했습니다.' };

  // 같은 나이가 두 번 오면 한 번만 센다. 값이 서로 다르면 더하지 않는다.
  const byAge = new Map();
  for (const row of rows) {
    const seen = byAge.get(row.age);
    if (seen && seen.value !== row.value) return { ok: false, reason: 'conflict', message: `${row.age}세 값이 두 가지로 와서 더하지 않았습니다.` };
    if (!seen) byAge.set(row.age, row);
  }
  // 범위 안에 빠진 나이가 있으면 더하지 않는다. 일부만 더한 값은 그 범위의 인구가 아니다.
  if (byAge.size !== endAge - startAge + 1) {
    const missing = [];
    for (let age = startAge; age <= endAge; age += 1) if (!byAge.has(age)) missing.push(`${age}세`);
    return { ok: false, reason: 'incomplete', message: `${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ' 등' : ''} 자료가 없어 더하지 않았습니다.` };
  }
  const periods = new Set([...byAge.values()].map(row => row.periodLabel));
  const units = new Set([...byAge.values()].map(row => row.unit));
  if (periods.size !== 1 || units.size !== 1) return { ok: false, reason: 'mixed', message: '기준시점이나 단위가 섞여 있어 더하지 않았습니다.' };

  const ordered = [...byAge.values()].sort((a, b) => a.age - b.age);
  const first = ordered[0];
  return {
    ok: true,
    // 「아동·청소년」이라 부르지 않는다. 실제로 더한 범위를 그대로 적는다.
    label: `${startAge}~${endAge}세 ${first.tableName.includes('주민등록') ? '주민등록인구' : first.itemName}`,
    startAge, endAge, rowCount: ordered.length,
    ages: ordered.map(row => row.age),
    formula: `${ordered.slice(0, 3).map(row => `${row.age}세`).join(' + ')}${ordered.length > 3 ? ` + … + ${ordered.at(-1).age}세` : ''} = ${ordered.length}개 행 합계`,
    value: ordered.reduce((sum, row) => sum + row.value, 0),
    unit: first.unit, period: first.period, periodLabel: first.periodLabel,
    region: first.region, regionCode: first.regionCode,
    tableName: first.tableName, organization: first.organization, survey: first.survey,
    orgId: first.orgId, tblId: first.tblId, link: first.link,
    derived: true,
    note: `공식 원자료 ${ordered.length}줄(${first.tableName}, ${first.periodLabel})을 더한 값입니다. KOSIS가 그대로 발표한 숫자가 아닙니다.`
  };
}

// 같은 조회는 다시 부르지 않는다. 키는 열쇠에 넣지 않는다.
export function cacheKey(kind, params = {}) {
  const stable = Object.keys(params).sort().map(key => `${key}=${text(params[key])}`).join('&');
  return `${kind}:${stable}`;
}

export const NOT_FOUND_MESSAGE = '적합한 공식 통계를 찾지 못했습니다.';
export const NO_KEY_MESSAGE = '통계 인증키가 등록되어 있지 않습니다. 등록 전에는 조회하지 않습니다.';
