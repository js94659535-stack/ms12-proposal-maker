// 자동수집 한 번을 어떻게 판정할지. 통신도 DB도 하지 않아 그대로 시험할 수 있다.
//
// 핵심 규칙은 하나다. 「받아오지 못한 것」을 「공고가 없는 것」으로 적지 않는다.
// 오류 화면을 HTTP 200으로 돌려주는 출처가 있어 6주 동안 조용히 0건이었던 적이 있다.
import { FAILURE } from './notice-collect.js';

export const RUN_STATUS = Object.freeze({
  ok: 'ok',            // 모든 통로가 목록을 돌려주었고 공고도 받았다
  partial: 'partial',  // 일부 통로가 실패했다. 성공으로 적지 않는다
  empty: 'empty',      // 통로는 살아 있는데 공고가 0건이다. 성공으로 적지 않는다
  failed: 'failed'     // 모든 통로가 실패했다
});

// 화면과 기록에 남기는 짧은 실패 코드. 긴 문장 대신 이 값으로 비교한다.
export const FAILURE_CODE = Object.freeze({
  http: 'http',        // 공식 사이트가 목록을 돌려주지 않음
  shape: 'shape',      // 오류 화면이거나 응답 모양이 바뀜
  network: 'network',  // 연결 실패
  mixed: 'mixed'       // 통로마다 다른 이유
});

const REASON_CODES = new Map([[FAILURE.http, FAILURE_CODE.http], [FAILURE.shape, FAILURE_CODE.shape], [FAILURE.network, FAILURE_CODE.network]]);

// 정상으로 보던 수집량이 이만큼 아래로 떨어지면 급감으로 본다.
export const DROP_RATIO = 0.5;
// 이 정도는 되어야 급감을 따진다. 2건이 1건이 된 것을 장애로 부르지 않는다.
export const DROP_MIN_BASELINE = 4;

export const WARNING = Object.freeze({ empty: 'empty', drop: 'drop' });

export function failureCodeOf(reason) {
  return REASON_CODES.get(String(reason || '')) || FAILURE_CODE.network;
}

// 실행기록에 남길 통로 정보. 공고 제목·본문·첨부는 넣지 않는다.
// archived_notices에 이미 있는 것을 실행기록에 또 쌓지 않기 위해서다.
export function trimSources(sources = []) {
  return sources.map(source => ({
    source: String(source?.source || ''),
    channel: String(source?.channel || ''),
    label: String(source?.label || ''),
    status: source?.status === 'ok' ? 'ok' : 'failed',
    code: source?.status === 'ok' ? '' : failureCodeOf(source?.reason),
    listed: Number(source?.listed || 0),
    candidates: Number(source?.candidates || 0),
    collected: Number(source?.collected || 0)
  }));
}

// 정상으로 끝난 마지막 실행보다 비정상적으로 줄었는지.
export function droppedSharply(collected, baseline) {
  const now = Number(collected || 0);
  const before = Number(baseline || 0);
  if (before < DROP_MIN_BASELINE) return false;
  return now <= before * DROP_RATIO;
}

// 통로 결과와 직전 성공 기록을 보고 이번 실행의 상태를 정한다.
export function decideRun({ sources = [], collected = 0, baseline = 0 } = {}) {
  const trimmed = trimSources(sources);
  const failed = trimmed.filter(source => source.status !== 'ok');
  const codes = [...new Set(failed.map(source => source.code))];
  const failureCode = !failed.length ? '' : codes.length === 1 ? codes[0] : FAILURE_CODE.mixed;

  const status = !trimmed.length || failed.length === trimmed.length ? RUN_STATUS.failed
    : failed.length ? RUN_STATUS.partial
      : collected > 0 ? RUN_STATUS.ok : RUN_STATUS.empty;

  // 경고는 상태와 별개다. 일부 실패이면서 급감일 수도 있다.
  const warning = status === RUN_STATUS.empty ? WARNING.empty
    : droppedSharply(collected, baseline) ? WARNING.drop : '';

  return {
    status, failureCode, warning, sources: trimmed,
    listed: trimmed.reduce((sum, source) => sum + source.listed, 0),
    candidates: trimmed.reduce((sum, source) => sum + source.candidates, 0),
    collected: Number(collected || 0),
    // 받아온 공고가 있고 전부 실패한 것이 아닐 때만 보관함에 반영한다.
    // 일부 실패라도 살아 있는 출처의 신규·변경은 반영한다. 넣기만 하고 지우지 않으므로 안전하다.
    syncable: status !== RUN_STATUS.failed && Number(collected || 0) > 0,
    // 「정상 성공」은 이 값이 참일 때만이다. 일부 실패·0건은 성공 시각을 갱신하지 않는다.
    healthy: status === RUN_STATUS.ok && !droppedSharply(collected, baseline)
  };
}

const STATUS_LABELS = Object.freeze({ ok: '정상', partial: '일부 출처 실패', empty: '0건', failed: '수집 실패' });
const CODE_LABELS = Object.freeze({
  http: '목록 응답 없음', shape: '오류 화면·형식 변경', network: '연결 실패', mixed: '출처별 원인 다름'
});
const WARNING_LABELS = Object.freeze({
  empty: '통로는 살아 있는데 공고가 0건입니다. 검색 자료는 그대로 두었습니다.',
  drop: '최근 정상 실행보다 수집량이 절반 이하로 줄었습니다. 출처 확인이 필요합니다.'
});

export const statusLabel = status => STATUS_LABELS[status] || '기록 없음';
export const codeLabel = code => CODE_LABELS[code] || '';
export const warningLabel = warning => WARNING_LABELS[warning] || '';
