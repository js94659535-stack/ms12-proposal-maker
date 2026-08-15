// KOSIS(국가통계포털) 조회. 계획서에 쓸 「공식 통계 근거 후보」를 찾아 온다.
//
// 후보다. 계획서에 자동으로 넣지 않는다. 사람이 보고 쓸지 정한다.
// 지역·기준연도·단위 가운데 하나라도 분명하지 않으면 후보로 삼지 않는다. 반쯤 아는 숫자는 근거가 아니다.
// 결과가 없으면 비슷한 값을 찾아 대신 넣지 않는다. 못 찾았다고 말한다.
//
// 인증키는 이 파일 밖으로 나가지 않는다. 주소를 남길 때는 반드시 maskKey를 지난다.

export const KOSIS_ORIGIN = 'https://kosis.kr';
export const KOSIS_ORG_NAMES = Object.freeze({ 101: '통계청', 110: '행정안전부' });

// 조회 주소. 인증키는 값으로만 들어가고 어디에도 남기지 않는다.
const url = (path, params) => {
  const search = new URLSearchParams(params);
  return `${KOSIS_ORIGIN}${path}?${search.toString()}`;
};

export const searchUrl = (apiKey, { searchNm, startCount = 1, resultCount = 10 }) => url('/openapi/statisticsSearch.do', {
  method: 'getList', apiKey, searchNm, startCount: String(startCount), resultCount: String(resultCount),
  sort: 'RANK', format: 'json', jsonVD: 'Y'
});

// 통계표의 분류 코드표. 「광산구」가 어떤 코드인지 알아야 그 지역만 조회할 수 있다.
export const metaUrl = (apiKey, { orgId, tblId, type = 'OBJ' }) => url('/openapi/Param/statisticsParameterData.do', {
  method: 'getMeta', apiKey, orgId, tblId, type, format: 'json', jsonVD: 'Y'
});

export const dataUrl = (apiKey, { orgId, tblId, objL1, itmId = 'ALL', prdSe = 'Y', newEstPrdCnt = 1 }) => url('/openapi/Param/statisticsParameterData.do', {
  method: 'getList', apiKey, orgId, tblId, itmId, objL1,
  format: 'json', jsonVD: 'Y', prdSe, newEstPrdCnt: String(newEstPrdCnt)
});

// 화면·기록·오류 어디에도 키가 나가지 않게 한다. 지우지 않고 가린다(무엇을 불렀는지는 남아야 한다).
export function maskKey(text) {
  return String(text ?? '').replace(/(apiKey=)[^&\s]*/gi, '$1***');
}

// KOSIS는 오류도 200으로 준다. 배열이 아니면 오류로 본다.
export function kosisError(payload) {
  if (Array.isArray(payload)) return null;
  const err = payload?.err ?? payload?.errMsg ?? null;
  if (err === null || err === undefined) return null;
  // 오류 문구에 키가 실려 오더라도 그대로 내보내지 않는다.
  return { code: String(payload.err ?? ''), message: maskKey(String(payload.errMsg || '조회하지 못했습니다.')) };
}

const text = value => String(value ?? '').trim();
// 「2025」, 「202506」 모두 연도를 앞 네 자리로 읽는다. 네 자리 연도를 못 읽으면 쓰지 않는다.
const yearOf = value => (/^\d{4}/.test(text(value)) ? text(value).slice(0, 4) : '');
const numberOf = value => {
  const raw = text(value).replace(/,/g, '');
  if (!raw || !/^-?\d+(\.\d+)?$/.test(raw)) return null;
  return Number(raw);
};

// 검색 결과에서 지역이 나뉜 통계표만 남긴다. 전국 값 하나뿐인 표로는 광산구를 말할 수 없다.
export function pickTables(rows, { keywords = [], limit = 5 } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const wanted = keywords.map(word => text(word)).filter(Boolean);
  return list
    .map(row => ({
      orgId: text(row.ORG_ID), tblId: text(row.TBL_ID), tableName: text(row.TBL_NM),
      survey: text(row.STAT_NM || row.SURVEY_NM), org: text(row.ORG_NM)
    }))
    .filter(row => row.orgId && row.tblId && row.tableName)
    .filter(row => !wanted.length || wanted.some(word => row.tableName.includes(word)))
    .slice(0, limit);
}

// 분류 코드표에서 이 지역 코드를 찾는다. 이름이 정확히 맞는 것만 쓴다.
export function findRegionCode(meta, regionName) {
  const list = Array.isArray(meta) ? meta : [];
  const name = text(regionName);
  if (!name) return null;
  const rows = list
    .map(row => ({ code: text(row.OBJ_ITM_ID || row.ITM_ID || row.C1), label: text(row.OBJ_ITM_NM || row.ITM_NM || row.C1_NM) }))
    .filter(row => row.code && row.label);
  // 「광산구」와 「광주광역시 광산구」 둘 다 받는다. 부분만 겹치는 이름(예: 「광산」)은 쓰지 않는다.
  return rows.find(row => row.label === name)
    || rows.find(row => row.label.split(/\s+/).at(-1) === name.split(/\s+/).at(-1) && row.label.includes(name.split(/\s+/)[0]))
    || null;
}

// 한 줄을 사람이 읽는 근거 후보로 바꾼다. 빠진 것이 있으면 후보로 삼지 않는다.
export function normalizeRow(row, { orgId = '', tblId = '', survey = '', org = '', regionName = '' } = {}) {
  const value = numberOf(row?.DT);
  const period = yearOf(row?.PRD_DE);
  const unit = text(row?.UNIT_NM);
  const region = text(row?.C1_NM) || text(regionName);
  const tableName = text(row?.TBL_NM);
  const organization = text(org) || KOSIS_ORG_NAMES[text(row?.ORG_ID) || text(orgId)] || '';
  const missing = [];
  if (value === null) missing.push('값');
  if (!period) missing.push('기준연도');
  if (!unit) missing.push('단위');
  if (!region) missing.push('지역');
  if (!tableName) missing.push('통계표명');
  if (missing.length) return { ok: false, missing };
  return {
    ok: true,
    candidate: {
      orgId: text(orgId) || text(row?.ORG_ID), tblId: text(tblId) || text(row?.TBL_ID),
      tableName, organization, survey: text(survey),
      itemName: text(row?.ITM_NM), region, period, value, unit,
      link: statHtmlLink(text(orgId) || text(row?.ORG_ID), text(tblId) || text(row?.TBL_ID))
    }
  };
}

// KOSIS에서 같은 표를 사람이 직접 열어 보는 주소. 근거는 확인할 수 있어야 근거다.
export const statHtmlLink = (orgId, tblId) => `${KOSIS_ORIGIN}/statHtml/statHtml.do?orgId=${encodeURIComponent(orgId)}&tblId=${encodeURIComponent(tblId)}`;

// 지역을 코드로 좁히지 못했을 때. 전체를 받아 이름으로 이 지역 줄만 고른다.
export function rowsForRegion(rows, regionName) {
  const list = Array.isArray(rows) ? rows : [];
  const name = text(regionName);
  const tail = name.split(/\s+/).at(-1);
  return list.filter(row => {
    const label = text(row?.C1_NM);
    return label === name || label.split(/\s+/).at(-1) === tail;
  });
}

// 여러 줄 가운데 무엇을 후보로 보일지. 항목 이름이 찾는 말과 맞는 것을 앞에 둔다.
export function chooseCandidates(rows, context = {}, { keywords = [], limit = 5 } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const wanted = keywords.map(word => text(word)).filter(Boolean);
  const scored = [];
  for (const row of list) {
    const result = normalizeRow(row, context);
    if (!result.ok) continue;
    const hay = `${result.candidate.itemName} ${result.candidate.tableName}`;
    scored.push({ candidate: result.candidate, hit: wanted.some(word => hay.includes(word)) ? 1 : 0 });
  }
  scored.sort((a, b) => b.hit - a.hit);
  return scored.slice(0, limit).map(item => item.candidate);
}

// 같은 조회는 다시 부르지 않는다. 키는 열쇠에 넣지 않는다.
export function cacheKey(kind, params = {}) {
  const stable = Object.keys(params).sort().map(key => `${key}=${text(params[key])}`).join('&');
  return `${kind}:${stable}`;
}

export const NOT_FOUND_MESSAGE = '적합한 공식 통계를 찾지 못했습니다.';
export const NO_KEY_MESSAGE = '통계 인증키가 등록되어 있지 않습니다. 등록 전에는 조회하지 않습니다.';
