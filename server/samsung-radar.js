// 삼성 계열 재단 공고를 모아 마인드스토리 영역에 맞는 순서로 돌려준다(10-02).
// AI도 D1도 쓰지 않는다. 공개된 공고 목록을 읽어 점수만 매긴다.
// 삼성꿈장학재단은 목록이 POST JSON이고, 삼성복지재단·삼성생명공익재단은 EUC-KR 공지 목록이다.
const UA = { 'User-Agent': 'Mozilla/5.0', 'X-Requested-With': 'XMLHttpRequest' };

// 우리 영역. 낱말이 걸린 만큼 점수를 더한다.
const FIT = [
  [3, /문해|독서|토론|인문|책|글쓰기|리터러시/], [3, /지역아동센터|공부방|아동|청소년/],
  [2, /진로|학습|기초학습|메타인지|상담|정서|심리|마음/], [2, /교육복지|교육지원|배움터|장학|멘토/],
  [1, /디지털|AI|SW|프로젝트|이주배경|저소득|농어촌/]
];
const NOT_GRANT = /채용|입찰|감사|후기|결과|발표|수상|시상|추천|소식|홍보|보도/;
export const fitScore = text => FIT.reduce((sum, [weight, pattern]) => sum + (pattern.test(text) ? weight : 0), 0);

const plain = html => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const dateOnly = text => (String(text).match(/\d{4}[-.]\d{2}[-.]\d{2}/) || [''])[0].replace(/\./g, '-');

async function get(fetcher, url, init = {}) {
  const response = await fetcher(url, { ...init, headers: { ...UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response;
}

// 신청기간 끝 날짜까지 며칠 남았는지. 모르면 null.
export function daysLeft(period, today = new Date()) {
  const ends = [...String(period || '').matchAll(/\d{4}-\d{2}-\d{2}/g)].map(m => m[0]);
  const end = ends[ends.length - 1];
  if (!end) return null;
  const zero = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((Date.parse(`${end}T00:00:00Z`) - zero) / 86_400_000);
}

async function sdream(fetcher, pages) {
  const found = [];
  for (let page = 1; page <= pages; page += 1) {
    const data = await (await get(fetcher, 'https://www.sdream.or.kr/portal/information/news', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `bbsDivCd=BBSDC01&pageNo=${page}`
    })).json();
    for (const row of data.list || []) {
      if (!/공모|공고/.test(`${row.BBS_ITEM_CD_NM} ${row.BBS_TITLE}`) || NOT_GRANT.test(row.BBS_TITLE)) continue;
      found.push({
        source: '삼성꿈장학재단', title: String(row.BBS_TITLE).trim(), posted: row.REG_DT_TM,
        url: `https://www.sdream.or.kr/portal/information/boardView?boardId=${row.BBS_SID}&bbsDivCd=BBSDC01&pageNo=1`
      });
    }
  }
  // 상세는 최근 것부터 열 건만 읽는다. 오래된 공모의 신청기간은 이미 지났다.
  await Promise.all(found.slice(0, 10).map(async item => {
    try {
      const html = await (await get(fetcher, item.url)).text();
      const body = plain(html);
      item.period = (body.match(/신청기간\s*(\d{4}-\d{2}-\d{2}[^~]*~\s*\d{4}-\d{2}-\d{2}[^가-힣]*)/) || [])[1]?.trim() || '';
      item.eligibility = (body.match(/신청자격\s*(.{0,140}?)(?:▶|첨부파일|신청 바로가기)/) || [])[1]?.trim() || '';
      item.files = [...new Set([...body.matchAll(/(삼성[^\s]*\.(?:pdf|hwp|hwpx|docx|zip|jpg))/gi)].map(m => m[1]))];
    } catch (error) { item.error = String(error.message || error); }
  }));
  return found;
}

async function legacy(fetcher, label, origin) {
  try {
    const bytes = new Uint8Array(await (await get(fetcher, `${origin}/html/news/notice.asp`)).arrayBuffer());
    let html;
    try { html = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { html = new TextDecoder('euc-kr').decode(bytes); }
    const found = [];
    for (const match of html.matchAll(/<a [^>]*href="([^"]*notice_view[^"]*)"[^>]*>([\s\S]*?)<\/a>/g)) {
      const title = plain(match[2]);
      if (!title || NOT_GRANT.test(title) || !/공모|신청|모집|접수|지원/.test(title)) continue;
      found.push({ source: label, title, posted: dateOnly(plain(html.slice(match.index, match.index + 600))), url: new URL(match[1], `${origin}/html/news/`).href });
    }
    return found;
  } catch { return []; }
}

export async function collectSamsung(fetcher = fetch, { pages = 3, today = new Date() } = {}) {
  const results = await Promise.allSettled([
    sdream(fetcher, pages),
    legacy(fetcher, '삼성복지재단', 'https://www.samsungwelfare.org'),
    legacy(fetcher, '삼성생명공익재단', 'https://www.samsungpublic.org')
  ]);
  const items = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  const failed = results.filter(result => result.status === 'rejected').length;
  const rows = items.map(item => ({
    ...item, fit: fitScore(`${item.title} ${item.eligibility || ''}`),
    daysLeft: daysLeft(item.period, today)
  }));
  // 열려 있는 것(마감 전)을 위로, 그 안에서 적합도 순. 마감된 것은 아래로 보낸다.
  const open = row => row.daysLeft !== null && row.daysLeft >= 0;
  rows.sort((a, b) => Number(open(b)) - Number(open(a)) || b.fit - a.fit || String(b.posted).localeCompare(String(a.posted)));
  return { collectedAt: today.toISOString(), failed, items: rows };
}
