// 공고 자동수집 Worker. 사람이 누르지 않아도 정해진 시각에 스스로 돈다.
//
// Pages Functions에는 예약 실행이 없어서 같은 D1을 보는 Worker를 따로 둔다.
// 수집·중복 판정 규칙은 화면이 쓰는 것과 같은 모듈을 그대로 가져다 쓴다(재구현하지 않는다).
// AI는 부르지 않는다. 회원·계획서·기관정보·사용량 표는 읽지도 쓰지도 않는다.
import { collectNotices } from '../functions/api/notices.js';
import { syncNotices } from '../functions/api/archive.js';
import { runCollection } from '../server/notice-collector.js';

async function collect(env) {
  if (!env.ARCHIVE_DB) return { skipped: true, reason: 'no-db' };
  return runCollection(env.ARCHIVE_DB, {
    collect: () => collectNotices(fetch),
    // 보관함에는 넣고 고치기만 한다. 지우는 경로는 여기에 없다.
    sync: notices => syncNotices(env.ARCHIVE_DB, notices),
    trigger: 'cron'
  });
}

export default {
  // 한국시간 08:00·18:00 = UTC 23:00·09:00. wrangler.toml의 crons와 짝이다.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(collect(env));
  },
  // 예약 실행을 그대로 확인할 때만 쓴다(wrangler dev --test-scheduled).
  // 공개 경로는 열어 두지 않는다. 수동 실행은 로그인한 관리자만 /api/admin으로 한다.
  async fetch() {
    return new Response('공고 자동수집 Worker. 예약 실행 전용입니다.', { status: 404 });
  }
};
