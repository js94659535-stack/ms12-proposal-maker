// 통계 근거 출처. 배경·필요성에 쓸 지역·집단 수치를 공식 통계에서 가져온다.
//
// 여기서 나오는 것은 「우리 동네 65세 이상 인구」 같은 배경 수치뿐이다.
// 우리 기관 이용자 수·실적·만족도는 통계표에 없다. 그것은 계속 [확인 필요]로 남고 「내 정보」에서 온다.
//
// 인증키가 없으면 켜지 않는다. 값을 만들어 내지도, 키 없이 우회 수집하지도 않는다.
// 공고 수집(notice-sources.js)과 같은 방식이다.

export const STAT_SOURCES = Object.freeze([
  Object.freeze({
    id: 'kosis-table', label: '국가통계포털(KOSIS) 통계표', organization: '통계청',
    origin: 'https://kosis.kr', path: '/openapi/Param/statisticsParameterData.do',
    gives: '주민등록 인구, 고령인구 비율, 1인가구, 장애인 등록 현황 등 통계표 수치',
    needsSecret: 'KOSIS_API_KEY',
    // 2026-08-14 확인: HTTP 200. 키 없이 부르면 {"err":"11","errMsg":"유효하지 않은 인증KEY입니다."}가 온다.
    verified: true,
    note: 'kosis.kr 「오픈API 이용신청」 뒤 인증키를 Cloudflare Secret KOSIS_API_KEY에 넣으면 켜집니다.'
  }),
  Object.freeze({
    id: 'stdg-region-code', label: '행정표준코드 지역코드', organization: '행정안전부',
    origin: 'https://apis.data.go.kr', path: '/1741000/StanReginCd/getStanReginCdList',
    gives: '기관 주소 → 법정동 코드. 통계표를 우리 지역으로 좁히려면 이 코드가 있어야 한다.',
    needsSecret: 'DATA_GO_KR_SERVICE_KEY',
    // 2026-08-14 확인: HTTP 403 + SERVICE_KEY_IS_NOT_REGISTERED_ERROR(등록되지 않은 서비스키). 경로는 살아 있다.
    verified: true,
    note: '공공데이터포털(data.go.kr) 「행정안전부_행정표준코드 조회서비스」 활용신청 뒤 인증키를 Cloudflare Secret DATA_GO_KR_SERVICE_KEY에 넣으면 켜집니다.'
  }),
  Object.freeze({
    id: 'sgis-population', label: '통계지리정보(SGIS) 행정동 인구', organization: '통계청',
    origin: 'https://sgisapi.kostat.go.kr', path: '',
    gives: '읍면동 단위 인구·고령화 지표',
    needsSecret: 'SGIS_CONSUMER_KEY',
    // 2026-08-14 확인: 기존 인증 경로가 sgisapi.mods.go.kr로 옮겨간 뒤 404. 새 경로를 확인하지 못했다.
    verified: false,
    note: '서비스 주소가 바뀌어 응답을 확인하지 못했습니다. 추측한 주소로 부르지 않고, 새 경로를 확인한 뒤 켭니다.'
  })
]);

// 여기 없는 곳으로는 통계 요청을 보내지 않는다.
export const STAT_ORIGINS = Object.freeze([...new Set(STAT_SOURCES.map(source => source.origin))]);
export const statOriginAllowed = url => {
  try { return STAT_ORIGINS.includes(new URL(url).origin); } catch { return false; }
};

export const STAT_SKIP_LABELS = Object.freeze({
  'not-connected': '경로 확인 필요',
  'missing-secret': '인증키 미등록',
  unknown: '알 수 없는 출처'
});

// 실제로 부를 수 있는 출처인지. 확인되지 않았거나 키가 없으면 부르지 않는다.
export function statRunnable(source, { secrets = {} } = {}) {
  if (!source || !STAT_SOURCES.some(item => item.id === source.id)) return { ok: false, reason: 'unknown' };
  if (!source.verified) return { ok: false, reason: 'not-connected' };
  if (source.needsSecret && !secrets[source.needsSecret]) return { ok: false, reason: 'missing-secret' };
  return { ok: true, reason: '' };
}

// 화면에 그대로 내보내는 상태. 인증키의 값도 이름의 등록 여부도 여기서 다루지 않는다.
export function statSourceState() {
  return STAT_SOURCES.map(source => ({
    id: source.id, label: source.label, organization: source.organization, origin: source.origin,
    gives: source.gives, note: source.note, verified: source.verified,
    blocked: source.verified ? 'missing-secret' : 'not-connected'
  }));
}

// 계획서에 붙일 출처 표기. 기준연도가 없는 수치는 근거가 아니다.
export function statCitation({ table = '', organization = '', period = '' } = {}) {
  const parts = [String(table || '').trim(), String(organization || '').trim()].filter(Boolean);
  if (!parts.length) return '';
  const when = String(period || '').trim();
  return `${parts.join(', ')}${when ? `, ${when} 기준` : ''}`;
}
