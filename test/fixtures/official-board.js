// 공식 게시판 API를 흉내 내는 응답. 통신 없이 수집 경로를 시험하려고 둔다.
export function boardListResponse(rows, totalCount = rows.length) {
  return new Response(JSON.stringify({
    pageInfo: { blockCount: '10', pageCount: '60', currPageNo: '1', totalPage: '1', totalCount: String(totalCount) },
    listInfo: rows.map((row, index) => ({
      no: String(index + 1), listSn: String(row.listSn), bbsSn: '1000', bbsNm: '공지사항',
      sj: row.sj, registerNm: '모금회', rgsde: row.rgsde, rdcnt: '1', flpth: '', serverFileNm: '', thumbFileNm: '', fileExtsn: ''
    }))
  }), { status: 200, headers: { 'Content-Type': 'application/json;charset=UTF-8' } });
}

export function boardPostResponse({ sj, rgsde, cn, files = [] }) {
  return new Response(JSON.stringify({
    dataInfo: {
      postInfo: { sj, rgsde, cn },
      fileListInfo: files.map(name => ({ orginlFileNm: name, serverFileNm: `${name}.srv`, flpth: '/data' }))
    }
  }), { status: 200, headers: { 'Content-Type': 'application/json;charset=UTF-8' } });
}

// 공식 사이트가 오류 화면을 HTTP 200으로 돌려주는 실제 상황.
export function officialErrorPage() {
  return new Response('<html><head><title>오류페이지</title></head><body><p class="error-title">찾으시는 <span>페이지가 없습니다</span></p></body></html>',
    { status: 200, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

// 배분신청 포털 목록. 실제 화면과 같은 fn_goDetail 구조를 쓴다.
export function portalListResponse(items) {
  const blocks = items.map(item => `<li><a href="javascript:fn_goDetail('${item.listSn}','${item.branchCode}','${item.appnDocNo || ''}');"><p class="gallery-tit">${item.title}</p><span>${item.deadline}</span></a></li>`);
  // 화면 뼈대(폼 이름·지회 코드)는 항목이 없어도 남아 있다.
  return new Response(`<form name="mobileMainBsnsList"><input name="bhfCode"></form><ul class="gallery-list">${blocks.join('')}</ul>`,
    { status: 200, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

export function portalDetailResponse(fields) {
  const rows = Object.entries(fields).map(([name, value]) => `<tr><th>${name}</th><td>${value}</td></tr>`).join('');
  return new Response(`<table>${rows}</table>`, { status: 200, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

// 두 통로를 한 번에 흉내 낸다. 지정하지 않은 통로는 오류 화면을 준다.
export function officialFetcher({ portalList, portalDetail, boardList, boardPost, onCall } = {}) {
  return async (url, init) => {
    const params = formParams(init);
    onCall?.(url, params);
    if (url.includes('mobileMainBsnsList.do')) return portalList ? portalList(new URL(url), init) : officialErrorPage();
    if (url.includes('mobileMainBsnsDetail.do')) return portalDetail ? portalDetail(new URL(url), init) : officialErrorPage();
    if (url.includes('selectPostList.do')) return boardList ? boardList(params, new URL(url), init) : officialErrorPage();
    if (url.includes('selectPostInfo.do')) return boardPost ? boardPost(params, new URL(url), init) : officialErrorPage();
    return officialErrorPage();
  };
}

export function noticeRequest(body) {
  return new Request('https://example.test/api/notices', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
}

// 요청 본문에서 게시판 파라미터를 꺼낸다.
export function formParams(init) {
  return Object.fromEntries(new URLSearchParams(String(init?.body || '')));
}
