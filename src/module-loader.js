// 새로 배포하면 자산 파일 이름의 해시가 바뀐다. 이전 화면을 열어 둔 사람이 그때
// 파일을 첨부하면, 그 화면이 기억하는 옛 파일을 부르다가 실패한다.
//
// 예전에는 없는 자산이 200 text/html(index.html)로 내려와서
// 「Failed to load module script … MIME type of text/html」로 깨졌다.
// 지금은 404.html 덕에 정직하게 404가 오고, 그것을 여기서 받아 처리한다.
//
// 처리 방식: 한 번만 자동으로 새로고침한다. 그래도 안 되면 캐시를 지우라고
// 떠넘기지 않고 무엇이 일어났는지 사람 말로 알려 준다.

const RELOAD_MARK = 'ms12_asset_reload';
// 한 번 새로고침한 뒤 이 시간 안에 또 실패하면 진짜 문제로 본다.
const RELOAD_WINDOW_MS = 60_000;

export const STALE_MESSAGE = '새 판이 배포되어 화면을 다시 불러와야 합니다. 자동으로 새로고침합니다.';
export const FAILED_MESSAGE = '파일을 읽는 기능을 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 화면을 새로고침해 주세요. 계속 안 되면 다른 브라우저에서 열어 보세요.';

// 자산을 못 받아서 난 오류인지. 그물을 넓게 치되 확실한 신호만 본다.
export function looksLikeAssetFailure(error) {
  const message = String(error?.message || error || '');
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|MIME type|Loading chunk|dynamically imported module/i.test(message);
}

function recentlyReloaded(now = Date.now()) {
  const at = Number(globalThis.sessionStorage?.getItem(RELOAD_MARK) || 0);
  return at > 0 && now - at < RELOAD_WINDOW_MS;
}

// 자동 새로고침은 한 번만. 두 번째부터는 무한 새로고침이 되므로 하지 않는다.
export function shouldReload(error, now = Date.now()) {
  if (!looksLikeAssetFailure(error)) return false;
  return !recentlyReloaded(now);
}

export function markReloaded(now = Date.now()) {
  try { globalThis.sessionStorage?.setItem(RELOAD_MARK, String(now)); } catch { /* 저장 못 해도 진행한다 */ }
}

// 동적 import를 감싼다. 실패하면 한 번 새로고침하고, 그다음에는 사람 말로 알린다.
export async function loadModule(importer, label = '기능') {
  try {
    return await importer();
  } catch (error) {
    if (!looksLikeAssetFailure(error)) throw error;
    if (shouldReload(error)) {
      markReloaded();
      // 지금 하던 첨부는 새로고침 뒤 다시 하면 된다. 자료는 저장소에 남아 있다.
      globalThis.location?.reload?.();
      throw new Error(STALE_MESSAGE);
    }
    throw new Error(`${label}: ${FAILED_MESSAGE}`);
  }
}

// Vite가 미리 불러오다 실패할 때도 같은 규칙으로 처리한다.
export function watchPreloadErrors() {
  globalThis.addEventListener?.('vite:preloadError', event => {
    if (!shouldReload(event?.payload)) return;
    event.preventDefault?.();
    markReloaded();
    globalThis.location?.reload?.();
  });
}
