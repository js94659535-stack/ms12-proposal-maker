import { analyzeWithAI, draftWithAI, rewriteWithAI } from './api.js';
import { extractFile, extractFiles } from './files.js';
import { localAnalyze } from './fallback.js';
import { exportDocx, exportPdf, printDocument } from './export.js';
import { fetchNoticeDetail, fetchNoticeList, importNoticeUrl, noticeBodyText } from './notices.js';

const TYPES = [
  ['chest', '사랑의열매', '복지·지원사업'], ['family', '가족센터', '가족지원사업'],
  ['edu', '학교·교육청', '교육기관'], ['g2b', '나라장터·학교장터', '공공조달'],
  ['general', '일반 창업·아이디어', '일반 사업']
];
const STEPS = ['사업 설정', '기관 원문', '요구사항 분석', '적합성 비교', '확인 질문', '계획서 작성'];
const SOURCE_TYPES = ['공고 공문', '세부 공고문', '공모신청서', '사업계획서 서식', '예산 편성 기준', '심사·평가기준', '기타 안내자료'];
const NAVIGATION_KEY = 'ms12_workflow_navigation_v1';
const NAVIGATION_LIMIT = 10;
const initial = {
  step: 1, project: { type: 'g2b', title: '', issuer: '', deadline: '' }, sourceText: '', files: [],
  analysis: null, sponsorIntent: null, projectDesign: null, missingInformation: [], evidenceMap: [], qualityCheck: null, designAnswers: {}, designUnavailable: false, manualSources: [], manualSourceType: SOURCE_TYPES[0], manualSourceName: '', manualSourceText: '', matches: [], answers: [], sections: [], companyFacts: [], companyFactDraft: '', noticeResults: [], selectedNoticeIndexes: [], pendingNoticeChoice: null, noticeUrlDraft: '', selectedNotice: null, busy: '', notice: '', error: '', aiMode: ''
};
let state = loadState();
let navigationHistory = loadNavigationHistory();
const app = document.querySelector('#app');

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem('ms12_project_v3') || '{}');
    // 이전 버전의 자유입력 회사 정보는 사용자 확인 기록이 없으므로 확정 정보로 승격하지 않는다.
    delete saved.manualCompanyFacts;
    return { ...structuredClone(initial), ...saved, companyFactDraft: '', noticeResults: [], selectedNoticeIndexes: [], pendingNoticeChoice: null, noticeUrlDraft: '', busy: '', error: '' };
  }
  catch { return structuredClone(initial); }
}
function saveState() {
  const safe = { ...state, companyFactDraft: '', noticeResults: [], noticeUrlDraft: '', busy: '', error: '', files: state.files.map(({ text, ...meta }) => meta) };
  localStorage.setItem('ms12_project_v3', JSON.stringify(safe));
}
function loadNavigationHistory() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(NAVIGATION_KEY) || '{}');
    return { backStack: validLocations(saved.backStack), forwardStack: validLocations(saved.forwardStack) };
  } catch { return { backStack: [], forwardStack: [] }; }
}
function validLocations(values) {
  return Array.isArray(values) ? values.filter(value => Number.isInteger(value?.step) && value.step >= 0 && value.step < STEPS.length).slice(-NAVIGATION_LIMIT) : [];
}
function currentLocation(step = state.step) {
  return { step, view: state.pendingNoticeChoice ? 'subprogram-selection' : 'workflow-step', selectedNoticeId: state.selectedNotice?.references?.[0]?.listSn || '', selectedSubprogramId: state.selectedNotice?.selectedSubproject || '' };
}
function sameLocation(left, right) {
  return left?.step === right?.step && left?.view === right?.view && left?.selectedNoticeId === right?.selectedNoticeId && left?.selectedSubprogramId === right?.selectedSubprogramId;
}
function limitedPush(stack, location) {
  if (!sameLocation(stack.at(-1), location)) stack.push(location);
  return stack.slice(-NAVIGATION_LIMIT);
}
function saveNavigationHistory() {
  try { sessionStorage.setItem(NAVIGATION_KEY, JSON.stringify(navigationHistory)); } catch { /* 현재 탭에서 저장할 수 없으면 메모리 기록만 유지한다. */ }
}
function applyWorkflowLocation(location, patch = {}) {
  state = { ...state, ...patch, step: location.step };
  saveState(); render();
}
function navigateToStep(step, patch = {}) {
  const target = currentLocation(Math.max(0, Math.min(STEPS.length - 1, Number(step))));
  const current = currentLocation();
  if (sameLocation(current, target)) return setState(patch);
  navigationHistory.backStack = limitedPush(navigationHistory.backStack, current);
  navigationHistory.forwardStack = [];
  saveNavigationHistory(); applyWorkflowLocation(target, patch);
}
function navigateBack() {
  const target = navigationHistory.backStack.pop();
  if (!target) return;
  navigationHistory.forwardStack = limitedPush(navigationHistory.forwardStack, currentLocation());
  saveNavigationHistory(); applyWorkflowLocation(target);
}
function navigateForward() {
  const target = navigationHistory.forwardStack.pop();
  if (!target) return;
  navigationHistory.backStack = limitedPush(navigationHistory.backStack, currentLocation());
  saveNavigationHistory(); applyWorkflowLocation(target);
}
function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
function nl(value = '') { return escapeHtml(value).replace(/\n/g, '<br>'); }
function setState(patch) { state = { ...state, ...patch }; saveState(); render(); }
function typeName() { return TYPES.find(([id]) => id === state.project.type)?.[1] || '사업'; }
function organizationForGeneration() {
  return {
    organization: '마인드스토리',
    confirmedFacts: state.companyFacts.filter(item => item.confirmedByUser === true),
    rule: 'confirmedByUser가 true인 정보만 회사 사실로 사용하고, 그 밖의 회사 정보는 반드시 [확인 필요]로 표시한다.'
  };
}

function shell(content) {
  return `
    <div class="layout">
      <aside class="sidebar">
        <div class="brand"><span class="brand-mark">M</span><div><strong>Proposal Workbench</strong><small>마인드스토리 내부용</small></div></div>
        <div class="sidebar-section"><p class="eyebrow">사업 유형</p>
          ${TYPES.map(([id, name, group]) => `<button class="type-button ${state.project.type === id ? 'active' : ''}" data-type="${id}"><span>${name}</span><small>${group}</small></button>`).join('')}
        </div>
        <nav class="steps" aria-label="작성 단계">
          ${STEPS.map((name, i) => `<button data-step="${i}" class="step ${state.step === i ? 'active' : ''} ${i < state.step ? 'done' : ''}"><span>${i < state.step ? '✓' : i + 1}</span>${name}</button>`).join('')}
        </nav>
        <div class="sidebar-note"><strong>사실 기반 작성 원칙</strong><p>원문과 기관 정보에 근거가 없으면 <em>확인 필요</em>로 표시합니다.</p></div>
      </aside>
      <main class="main">
        <header class="topbar"><button id="menu-toggle" class="icon-button" aria-label="메뉴 열기">☰</button><div><p class="eyebrow">${escapeHtml(typeName())}</p><h1>${escapeHtml(STEPS[state.step])}</h1></div><span class="save-state">● 브라우저 자동 저장</span></header>
        <nav aria-label="앱 작업 화면 이동" style="display:flex;flex-wrap:wrap;gap:8px;padding:12px 34px;background:#fff;border-bottom:1px solid var(--line)"><button class="button secondary" id="workflow-back" aria-label="직전 작업 화면으로 뒤로 가기" ${navigationHistory.backStack.length ? '' : 'disabled'}>← 뒤로 가기</button><button class="button secondary" id="workflow-home" aria-label="사업 설정 홈으로 가기" ${state.step === 0 ? 'disabled' : ''}>⌂ 홈으로 가기</button><button class="button secondary" id="workflow-forward" aria-label="다음 작업 화면으로 앞으로 가기" ${navigationHistory.forwardStack.length ? '' : 'disabled'}>앞으로 가기 →</button></nav>
        ${state.notice ? `<div class="alert success">${escapeHtml(state.notice)}</div>` : ''}
        ${state.error ? `<div class="alert danger">${escapeHtml(state.error)}</div>` : ''}
        <section class="workspace">${content}</section>
        ${state.busy ? `<div class="busy"><div class="loader"></div><strong>${escapeHtml(state.busy)}</strong><small>창을 닫지 마세요.</small></div>` : ''}
      </main>
    </div>`;
}

function footer({ next = true, back = true, nextLabel = '다음 단계', nextId = 'next' } = {}) {
  return `<div class="actions">${back && state.step > 0 ? '<button class="button secondary" id="back">이전</button>' : '<span></span>'}${next ? `<button class="button primary" id="${nextId}">${nextLabel} →</button>` : ''}</div>`;
}

function setupView() {
  return `<div class="intro"><span class="pill">새 제안 프로젝트</span><h2>기관 요구를 먼저 읽고,<br>근거 있는 계획서를 만듭니다.</h2><p>공고문·과업지시서·신청 양식을 분석하고 마인드스토리의 확인된 역량과 비교합니다.</p></div>
    <div class="card form-card"><div class="field"><label>사업 유형</label><div class="type-grid">${TYPES.map(([id, name]) => `<button class="choice ${state.project.type === id ? 'active' : ''}" data-type="${id}">${name}</button>`).join('')}</div></div>
    <div class="two-col"><div class="field"><label for="project-title">공고명 또는 사업명</label><input id="project-title" value="${escapeHtml(state.project.title)}" placeholder="예: 2026년 학생 마음건강 프로그램 위탁 운영"></div><div class="field"><label for="issuer">발주·지원 기관</label><input id="issuer" value="${escapeHtml(state.project.issuer)}" placeholder="원문 분석 후 자동 보완 가능"></div></div>
    <div class="field narrow"><label for="deadline">제출 마감일</label><input id="deadline" type="date" value="${escapeHtml(state.project.deadline)}"></div></div>${footer()}`;
}

function sourceView() {
  return `<div class="page-heading"><div><h2>기관 원문을 제공해 주세요</h2><p>공고문, 과업지시서, 제안요청서, 평가표와 신청 양식을 함께 넣을 수 있습니다.</p></div><span class="privacy">🔒 파일은 분석을 요청할 때만 서버로 전송됩니다</span></div>
    <div class="card"><div class="card-title"><div><h3>사랑의열매 공모사업 안내</h3><span>중앙회 · 광주지회</span></div><button class="button secondary" id="fetch-notices">공고 가져오기</button></div>${state.noticeResults.length ? `<div class="actions"><button class="button secondary" id="remove-selected-notices" ${state.selectedNoticeIndexes.length ? '' : 'disabled'}>선택 삭제 (${state.selectedNoticeIndexes.length})</button></div><div class="requirement-list">${state.noticeResults.map((item, index) => `<article class="requirement"><label><input type="checkbox" data-notice-check="${index}" ${state.selectedNoticeIndexes.includes(index) ? 'checked' : ''}> 삭제 선택</label><div><span class="tag">${escapeHtml(item.sourceLabel)}</span><div><strong>${escapeHtml(item.title)}</strong><small>주관 기관 ${escapeHtml(item.sourceLabel)} · 마감일 ${escapeHtml(item.deadline)} · dstbBsnsCode ${escapeHtml(item.dstbBsnsCode)}</small><p class="muted">${escapeHtml(item.summary || '상세 공고문 확인 필요')}</p><small><b>신청 기간</b> ${escapeHtml(item.applicationPeriod || '공식 상세 확인 필요')} · <b>신청 대상</b> ${escapeHtml(item.eligibility || '공식 상세 확인 필요')}</small><small><b>지원 내용</b> ${escapeHtml(item.supportDetails || '공식 상세 확인 필요')} · <b>지원 규모·한도</b> ${escapeHtml(item.supportLimit || '공식 상세 확인 필요')}</small></div></div><span><button class="button secondary" data-select-notice="${index}">자세히 보기</button><button class="button secondary" data-remove-notice="${index}">삭제</button></span></article>`).join('')}</div>` : '<p class="muted">버튼을 누를 때만 접수 마감일이 남은 공모사업을 조회합니다.</p>'}</div>
    ${state.pendingNoticeChoice ? `<div class="card"><div class="card-title"><div><h3>작성할 세부사업을 선택하세요</h3><span>선택한 사업 내용만 계획서에 반영됩니다.</span></div></div><div class="requirement-list">${state.pendingNoticeChoice.subprojects.map((item, index) => `<article class="requirement"><div><span class="tag">${escapeHtml(item.id)}</span><strong>${escapeHtml(item.title)}</strong></div><button class="button primary" data-select-subproject="${index}">이 사업 선택</button></article>`).join('')}</div></div>` : ''}
    ${attachmentView()}
    ${manualSourcesView()}
    <details class="card org-details"><summary>추가 공고 확인</summary><div class="actions"><a class="button secondary" href="https://chest.or.kr/bbs/1000/initPostList.do" target="_blank" rel="noopener noreferrer">중앙회 공식 사이트</a><a class="button secondary" href="https://gwangju.chest.or.kr/bbs/1000/initPostList.do" target="_blank" rel="noopener noreferrer">광주지회 공식 사이트</a></div><div class="field"><label for="missing-notice-url">누락 공고 가져오기</label><input id="missing-notice-url" type="url" value="${escapeHtml(state.noticeUrlDraft)}" placeholder="공식 상세 URL을 붙여넣으세요"><button class="button secondary" id="import-notice-url">목록에 추가</button></div></details>
    <div class="source-grid"><div class="card"><div class="card-title"><h3>파일 업로드</h3><span>PDF · DOCX · TXT / 파일당 20MB</span></div><label class="dropzone" for="source-files"><strong>파일을 선택하거나 여기에 놓으세요</strong><small>스캔 PDF는 OCR이 필요할 수 있습니다.</small><input id="source-files" type="file" accept=".pdf,.docx,.txt" multiple></label><div class="file-list">${state.files.length ? state.files.map((f, i) => `<div class="file-item"><span class="file-badge">${escapeHtml(f.type)}</span><div><strong>${escapeHtml(f.name)}</strong><small>${f.pages ? `${f.pages}쪽 · ` : ''}${Number(f.characters || 0).toLocaleString()}자</small></div><button data-remove-file="${i}" aria-label="파일 제거">×</button></div>`).join('') : '<p class="empty-inline">업로드한 파일이 없습니다.</p>'}</div></div>
    <div class="card"><div class="card-title"><h3>원문 붙여넣기</h3><span id="char-count">${state.sourceText.length.toLocaleString()}자</span></div><textarea id="source-text" class="source-text" placeholder="기관 공고문 또는 과업지시서 원문을 붙여넣으세요.">${escapeHtml(state.sourceText)}</textarea></div></div>
    <details class="card org-details"><summary>다음 제안서에도 재사용할 확정 회사 정보</summary><p class="muted">담당자가 사실로 확인한 내용만 입력한 뒤 확정 저장하세요. 입력만 한 내용은 누적되지 않습니다.</p><textarea id="company-fact-draft" class="source-text" placeholder="예: 광주·전남 지역 운영 가능 (담당자 확인 완료)">${escapeHtml(state.companyFactDraft)}</textarea><div class="actions"><span>${state.companyFacts.length ? `확정 저장된 정보 ${state.companyFacts.length}건` : '확정 저장된 정보 없음'}</span><button class="button secondary" id="confirm-company-fact">확정 정보로 저장</button></div></details>
    <div class="tip"><strong>정확도 높이는 방법</strong><span>평가표와 제출 양식까지 함께 제공하면 필수 조건·배점·목차 누락을 줄일 수 있습니다.</span></div>${footer({ next: !state.pendingNoticeChoice, nextLabel: '원문 분석 시작', nextId: 'analyze' })}`;
}

function sourceTypeOptions(selected) { return SOURCE_TYPES.map(value => `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(value)}</option>`).join(''); }

function manualSourcesView() {
  return `<div class="card"><div class="card-title"><div><h3>직접 자료 추가</h3><span>PDF · DOCX · TXT / HWP·HWPX는 PDF 변환 안내</span></div></div>
    <div class="two-col"><div class="field"><label for="manual-source-type">기본 자료 유형</label><select id="manual-source-type">${sourceTypeOptions(state.manualSourceType)}</select><label class="dropzone" for="manual-source-files"><strong>여러 파일을 선택하세요</strong><small>자료별 유형은 추가 후 변경할 수 있습니다.</small><input id="manual-source-files" type="file" accept=".pdf,.docx,.txt,.hwp,.hwpx" multiple></label></div>
    <div><div class="field"><label for="manual-source-name">붙여넣기 자료명</label><input id="manual-source-name" value="${escapeHtml(state.manualSourceName)}" placeholder="예: 2027년 신청서 작성항목"><label for="manual-source-text">원문 직접 붙여넣기</label><textarea id="manual-source-text" class="source-text" placeholder="공문·신청서·예산기준·심사기준 원문을 붙여넣으세요.">${escapeHtml(state.manualSourceText)}</textarea></div><button class="button secondary" id="add-manual-text">붙여넣기 자료 추가</button></div></div>
    ${state.manualSources.length ? `<div class="requirement-list">${state.manualSources.map((item, index) => `<article class="requirement"><div><span class="tag ${item.extractionStatus === 'success' ? '' : 'mandatory'}">${item.extractionStatus === 'success' ? '추출 성공' : '추출 불가'}</span><div><strong>${escapeHtml(item.fileName)}</strong><select data-manual-source-type="${index}">${sourceTypeOptions(item.sourceType)}</select><small>${Number(item.extractedText?.length || 0).toLocaleString()}자${item.extractionError ? ` · ${escapeHtml(item.extractionError)}` : ''}</small><p class="muted">${escapeHtml((item.extractedText || '').slice(0, 180) || '텍스트 미리보기 없음')}</p></div></div><button class="button secondary" data-remove-manual-source="${index}">삭제</button></article>`).join('')}</div>` : '<p class="muted">직접 추가한 자료가 없습니다.</p>'}</div>`;
}

function attachmentView() {
  const attachments = state.selectedNotice?.attachments || [];
  if (!attachments.length) return '';
  return `<div class="card"><div class="card-title"><div><h3>공식 첨부파일</h3><span>${state.selectedNotice.officialTextExtracted ? '공고문 텍스트 반영 완료' : '안내 페이지 내용만 반영됨'}</span></div></div><div class="requirement-list">${attachments.map((file, index) => {
    const type = attachmentType(file.name, file.fileType);
    const supported = ['PDF', 'DOCX', 'TXT'].includes(type);
    const hwp = ['HWP', 'HWPX'].includes(type);
    return `<article class="requirement"><div><span class="tag">${escapeHtml(type)}</span><strong>${escapeHtml(file.name)}</strong>${hwp ? '<small>공식 한글 양식 파일 · 한글 프로그램에서 PDF로 저장한 뒤 다시 업로드하면 공고문 내용을 분석할 수 있습니다.</small>' : type === 'ZIP' ? '<small>ZIP 내부 자동 해제는 지원하지 않습니다.</small>' : type === 'UNSUPPORTED' ? '<small>지원하지 않는 파일 형식입니다.</small>' : ''}</div><span><button class="button secondary" data-download-attachment="${index}">원본 다운로드</button>${supported ? `<button class="button primary" data-extract-attachment="${index}">내용 추출</button>` : ''}</span></article>`;
  }).join('')}</div></div>`;
}

export function attachmentType(name, provided = '') {
  if (['PDF', 'DOCX', 'TXT', 'HWP', 'HWPX', 'ZIP', 'UNSUPPORTED'].includes(provided)) return provided;
  const extension = String(name || '').split('.').pop()?.toLowerCase();
  return ({ pdf: 'PDF', docx: 'DOCX', txt: 'TXT', hwp: 'HWP', hwpx: 'HWPX', zip: 'ZIP' })[extension] || 'UNSUPPORTED';
}

function analysisView() {
  const a = state.analysis;
  if (!a) return `<div class="empty-state"><div>⌕</div><h2>분석 결과가 없습니다</h2><p>기관 원문 단계에서 분석을 시작해 주세요.</p><button class="button primary" data-step="1">원문 입력으로 이동</button></div>`;
  return `<div class="page-heading"><div><h2>요구사항 분석 결과</h2><p>AI 분석은 보조 도구입니다. 원문 근거를 열어보고 확정하세요.</p></div><span class="mode ${a.mode === 'ai' ? 'ai' : ''}">${a.mode === 'ai' ? 'AI 구조 분석' : '로컬 규칙 분석'}</span></div>
    <div class="summary-grid"><div><span>발주기관</span><strong>${escapeHtml(a.project.issuer)}</strong></div><div><span>제출 마감</span><strong>${escapeHtml(a.project.deadline)}</strong></div><div><span>예산</span><strong>${escapeHtml(a.project.budget)}</strong></div><div><span>요구사항</span><strong>${a.requirements.length}개</strong></div></div>
    ${a.warnings?.length ? `<div class="alert warning"><strong>검토 경고</strong>${a.warnings.map(v => `<p>${escapeHtml(v)}</p>`).join('')}</div>` : ''}
    <div class="card table-card"><div class="card-title"><h3>필수 조건과 요구사항</h3><span>근거 추적 포함</span></div><div class="requirement-list">${a.requirements.map(r => `<article class="requirement"><div><span class="tag ${r.mandatory ? 'mandatory' : ''}">${r.mandatory ? '필수' : r.category}</span><strong>${escapeHtml(r.requirement)}</strong></div><details><summary>원문 근거 보기 · ${escapeHtml(r.location || '위치 확인 필요')}</summary><blockquote>${escapeHtml(r.evidence || '근거 문장 확인 필요')}</blockquote></details></article>`).join('')}</div></div>
    <div class="three-col"><div class="card mini"><h3>평가 기준</h3>${listOrEmpty(a.evaluationCriteria)}</div><div class="card mini"><h3>제출 항목</h3>${listOrEmpty(a.submissionItems)}</div><div class="card mini"><h3>확인 질문</h3><p class="metric">${a.questions?.length || 0}<small>건</small></p></div></div>${footer()}`;
}

function listOrEmpty(items = []) { return items.length ? `<ul>${items.map(v => `<li>${escapeHtml(typeof v === 'string' ? v : v.name || v.criterion)}</li>`).join('')}</ul>` : '<p class="muted">원문에서 확인되지 않음</p>'; }
function buildMatches() {
  const caps = state.companyFacts.filter(item => item.confirmedByUser === true);
  return state.analysis.requirements.map(r => {
    const tokens = r.requirement.replace(/[^가-힣A-Za-z0-9]/g, ' ').split(/\s+/).filter(v => v.length > 1);
    const found = caps.filter(c => tokens.some(t => `${c.title} ${c.content} ${c.category}`.includes(t))).slice(0, 3);
    return { requirementId: r.id, requirement: r.requirement, evidence: r.location, capability: found.map(v => v.title).join(', ') || '사용자 확정 대응 정보 없음', status: found.length ? '부분 충족' : '확인 필요', action: found.length ? '증빙과 적용 범위 확인' : '담당자 확정 또는 증빙 필요' };
  });
}

function matchView() {
  const matches = state.matches.length ? state.matches : buildMatches();
  const counts = ['충족', '부분 충족', '확인 필요', '부족'].map(s => [s, matches.filter(v => v.status === s).length]);
  return `<div class="page-heading"><div><h2>기관 요구와 우리 역량 비교</h2><p>사용자가 확정 저장한 회사 정보만 연결했습니다. 실적·인력·예산은 확정 전까지 사용하지 않습니다.</p></div></div>
    <div class="match-summary">${counts.map(([name, count]) => `<div><span class="status ${name.replace(' ', '-')}">${name}</span><strong>${count}</strong></div>`).join('')}</div>
    <div class="card table-card"><div class="responsive-table"><table><thead><tr><th>기관 요구사항</th><th>마인드스토리 정보</th><th>판정</th><th>후속 조치</th></tr></thead><tbody>${matches.map(m => `<tr><td><strong>${escapeHtml(m.requirement)}</strong><small>${escapeHtml(m.evidence)}</small></td><td>${escapeHtml(m.capability)}</td><td><span class="status ${m.status.replace(' ', '-')}">${m.status}</span></td><td>${escapeHtml(m.action)}</td></tr>`).join('')}</tbody></table></div></div>
    <details class="card org-details"><summary>사용자 확정 회사 정보 ${state.companyFacts.length}건 보기</summary><div class="cap-grid">${state.companyFacts.length ? state.companyFacts.map(c => `<div><span>${escapeHtml(c.category)}</span><strong>${escapeHtml(c.title)}</strong><small>${escapeHtml(c.content)}</small></div>`).join('') : '<p class="muted">확정 저장된 회사 정보가 없습니다.</p>'}</div></details>${footer()}`;
}

function questionsView() {
  const questions = state.answers.length ? state.answers : (state.analysis?.questions || []);
  return `<div class="page-heading"><div><h2>확인이 필요한 정보</h2><p>답을 모르면 비워 두세요. 문서에는 사실을 만들지 않고 ‘확인 필요’로 표시합니다.</p></div><span class="progress-text">${questions.filter(q => q.answer).length} / ${questions.length} 답변</span></div>
    <div class="questions">${questions.length ? questions.map((q, i) => `<div class="card question"><div><span>${q.required ? '필수 확인' : '권장 확인'}</span><strong>${escapeHtml(q.question)}</strong></div><textarea data-answer="${i}" placeholder="확인된 사실과 증빙만 입력하세요. 모르면 비워 두세요.">${escapeHtml(q.answer || '')}</textarea></div>`).join('') : '<div class="empty-state"><div>✓</div><h2>추가 질문이 없습니다</h2><p>그래도 인력·실적·예산 증빙은 최종 제출 전에 확인하세요.</p></div>'}</div>${footer({ nextLabel: '사업계획서 초안 생성', nextId: 'draft' })}`;
}

function documentView() {
  const strategy = strategyView();
  const questions = designQuestionsView();
  if (!state.sections.length) return `${strategy}${questions}<div class="empty-state"><div>▤</div><h2>${state.designUnavailable ? 'AI 정밀 사업설계를 실행할 수 없음' : '작성된 초안이 없습니다'}</h2><p>${state.designUnavailable ? '공고 자료 분석은 완료되었지만 AI 정밀 사업설계를 실행하지 못했습니다. 아래에는 공식 원문에서 직접 추출한 사실만 표시합니다.' : '기관 원문 단계에서 사업설계를 실행해 주세요.'}</p>${state.designUnavailable ? directFactsView() : '<button class="button primary" data-step="1">원문 입력으로 이동</button>'}</div>`;
  return `${strategy}${questions}<div class="document-toolbar"><div><h2>${escapeHtml(state.project.title || '사업계획서 검토본')}</h2><p><span class="mode">${state.selectedNotice?.officialTextExtracted ? '공고문 반영 초안' : '안내 페이지 기반 임시 초안'}</span> <span class="mode ${state.aiMode === 'ai' ? 'ai' : ''}">${state.aiMode === 'ai' ? 'AI 정밀 사업설계' : '로컬 사실 추출'}</span> 항목별 근거와 확인 상태를 검토하세요. DOCX는 공식 신청서 양식이 아닌 검토본입니다.</p></div><div><button class="button secondary" id="print">인쇄</button><button class="button secondary" id="pdf">PDF 인쇄·저장</button><button class="button primary" id="docx">검토용 DOCX</button></div></div>
    <div class="editor-layout"><aside class="outline">${state.sections.map((s, i) => `<a href="#section-${i}"><span>${i + 1}</span>${escapeHtml(s.title.replace(/^\d+[.)]?\s*/, ''))}</a>`).join('')}</aside><div class="paper">${state.sections.map((s, i) => `<section id="section-${i}" class="doc-section"><div class="section-head"><input data-section-title="${i}" value="${escapeHtml(s.title)}"><span class="status ${s.status?.replace(' ', '-')}">${escapeHtml(s.status || '검토 필요')}</span></div><textarea data-section-content="${i}">${escapeHtml(s.content)}</textarea><div class="section-meta"><span>근거 ${s.citations?.length || 0}개</span><span><button data-confirm-fact="${i}">회사 정보로 확정 저장</button><button data-rewrite="${i}">이 항목 재작성</button></span></div>${s.citations?.length ? `<details><summary>반영한 원문 근거</summary>${s.citations.map(id => { const r = state.analysis.requirements.find(v => v.id === id); return r ? `<blockquote>${escapeHtml(r.evidence)} <small>${escapeHtml(r.location)}</small></blockquote>` : ''; }).join('')}</details>` : ''}</section>`).join('')}</div></div>`;
}

function strategyView() {
  const intent = state.sponsorIntent;
  const design = state.projectDesign;
  if (!intent && !design) return '';
  return `<div class="card"><div class="card-title"><div><h3>공모기관 의도와 선정전략</h3><span>공식 원문 근거 기반</span></div></div><div class="summary-grid"><div><span>해결하려는 핵심 문제</span><strong>${escapeHtml(intent?.coreProblem || '공식 원문에서 직접 확인되지 않음')}</strong></div><div><span>기대하는 변화</span><strong>${escapeHtml(intent?.expectedChange || '공식 원문에서 직접 확인되지 않음')}</strong></div><div><span>평가자가 중요하게 볼 요소</span><strong>${escapeHtml((intent?.selectionLogic || []).join(' · ') || '공식 원문에서 직접 확인되지 않음')}</strong></div><div><span>제안 사업 핵심전략</span><strong>${escapeHtml(design?.oneSentenceStrategy || 'AI 정밀 설계 미실행')}</strong></div></div>${intent?.evidence?.length ? `<details><summary>공식 원문 근거 ${intent.evidence.length}건</summary>${intent.evidence.map(value => `<blockquote>${escapeHtml(value)}</blockquote>`).join('')}</details>` : ''}</div>`;
}

function designQuestionsView() {
  if (!state.missingInformation.length) return '';
  return `<div class="card"><div class="card-title"><div><h3>사업설계에 필요한 추가 답변</h3><span>최대 5개 · 답변 후 다시 생성</span></div></div>${state.missingInformation.slice(0, 5).map((question, index) => `<div class="field"><label>${escapeHtml(question)}</label><textarea data-design-answer="${index}">${escapeHtml(state.designAnswers[question] || '')}</textarea></div>`).join('')}<div class="actions"><span>공식 자료에 없는 핵심 정보만 질문합니다.</span><button class="button primary" id="regenerate-design">답변 반영해 다시 생성</button></div></div>`;
}

function directFactsView() {
  const requirements = state.analysis?.requirements || [];
  return requirements.length ? `<div class="requirement-list">${requirements.map(item => `<article class="requirement"><div><span class="tag">${escapeHtml(item.category)}</span><strong>${escapeHtml(item.requirement)}</strong></div><blockquote>${escapeHtml(item.evidence)}</blockquote></article>`).join('')}</div>` : '<p>공식 원문에서 구조화할 사실을 찾지 못했습니다.</p>';
}

function render() {
  const views = [setupView, sourceView, analysisView, matchView, questionsView, documentView];
  app.innerHTML = shell(views[state.step]()); bind();
}

function updateInputs() {
  document.querySelector('#project-title')?.addEventListener('input', e => { state.project.title = e.target.value; saveState(); });
  document.querySelector('#issuer')?.addEventListener('input', e => { state.project.issuer = e.target.value; saveState(); });
  document.querySelector('#deadline')?.addEventListener('input', e => { state.project.deadline = e.target.value; saveState(); });
  document.querySelector('#source-text')?.addEventListener('input', e => { state.sourceText = e.target.value; document.querySelector('#char-count').textContent = `${e.target.value.length.toLocaleString()}자`; saveState(); });
  document.querySelector('#company-fact-draft')?.addEventListener('input', e => { state.companyFactDraft = e.target.value; });
  document.querySelector('#missing-notice-url')?.addEventListener('input', e => { state.noticeUrlDraft = e.target.value; });
  document.querySelector('#manual-source-type')?.addEventListener('change', e => { state.manualSourceType = e.target.value; saveState(); });
  document.querySelector('#manual-source-name')?.addEventListener('input', e => { state.manualSourceName = e.target.value; saveState(); });
  document.querySelector('#manual-source-text')?.addEventListener('input', e => { state.manualSourceText = e.target.value; saveState(); });
}

function bind() {
  updateInputs();
  document.querySelectorAll('[data-type]').forEach(el => el.onclick = () => { state.project.type = el.dataset.type; saveState(); render(); });
  document.querySelectorAll('[data-step]').forEach(el => el.onclick = () => navigateToStep(Number(el.dataset.step), { notice: '', error: '' }));
  document.querySelector('#back')?.addEventListener('click', () => navigateToStep(state.step - 1, { notice: '', error: '' }));
  document.querySelector('#next')?.addEventListener('click', () => { if (state.step === 2 && !state.matches.length) state.matches = buildMatches(); navigateToStep(state.step + 1, { notice: '', error: '' }); });
  document.querySelector('#workflow-back')?.addEventListener('click', navigateBack);
  document.querySelector('#workflow-home')?.addEventListener('click', () => navigateToStep(0));
  document.querySelector('#workflow-forward')?.addEventListener('click', navigateForward);
  document.querySelector('#menu-toggle')?.addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));
  const fileInput = document.querySelector('#source-files');
  if (fileInput) fileInput.onchange = async e => {
    try { setState({ busy: '파일에서 텍스트를 추출하는 중...', error: '' }); const parsed = await extractFiles([...e.target.files]); state.files.push(...parsed.map(v => ({ ...v, characters: v.text.length }))); state.sourceText += parsed.map(v => `\n\n[파일: ${v.name}]\n${v.text}`).join(''); setState({ busy: '', notice: `${parsed.length}개 파일을 읽었습니다.` }); }
    catch (error) { setState({ busy: '', error: error.message }); }
  };
  const manualFiles = document.querySelector('#manual-source-files');
  if (manualFiles) manualFiles.onchange = addManualFiles;
  document.querySelector('#add-manual-text')?.addEventListener('click', addManualText);
  document.querySelectorAll('[data-manual-source-type]').forEach(el => el.onchange = () => { const item = state.manualSources[Number(el.dataset.manualSourceType)]; if (item) { item.sourceType = el.value; setState({ manualSources: [...state.manualSources] }); } });
  document.querySelectorAll('[data-remove-manual-source]').forEach(el => el.onclick = () => { state.manualSources.splice(Number(el.dataset.removeManualSource), 1); setState({ manualSources: [...state.manualSources], notice: '직접 자료를 삭제했습니다.' }); });
  document.querySelectorAll('[data-remove-file]').forEach(el => el.onclick = () => { state.files.splice(Number(el.dataset.removeFile), 1); setState({ files: state.files }); });
  document.querySelector('#fetch-notices')?.addEventListener('click', loadOfficialNotices);
  document.querySelector('#import-notice-url')?.addEventListener('click', addMissingNotice);
  document.querySelectorAll('[data-select-notice]').forEach(el => el.onclick = () => selectOfficialNotice(el.dataset.selectNotice));
  document.querySelectorAll('[data-remove-notice]').forEach(el => el.onclick = () => removeOfficialNotice(el.dataset.removeNotice));
  document.querySelectorAll('[data-notice-check]').forEach(el => el.onchange = () => toggleNoticeSelection(el.dataset.noticeCheck, el.checked));
  document.querySelector('#remove-selected-notices')?.addEventListener('click', removeSelectedNotices);
  document.querySelectorAll('[data-select-subproject]').forEach(el => el.onclick = () => selectNoticeSubproject(el.dataset.selectSubproject));
  document.querySelectorAll('[data-download-attachment]').forEach(el => el.onclick = () => handleOfficialAttachment(el.dataset.downloadAttachment, false));
  document.querySelectorAll('[data-extract-attachment]').forEach(el => el.onclick = () => handleOfficialAttachment(el.dataset.extractAttachment, true));
  const analyzeButton = document.querySelector('#analyze');
  if (analyzeButton) { analyzeButton.textContent = '사업계획서 작성 →'; analyzeButton.addEventListener('click', generateCompleteProposal); }
  document.querySelectorAll('[data-answer]').forEach(el => el.oninput = () => { const questions = state.answers.length ? state.answers : structuredClone(state.analysis.questions || []); questions[Number(el.dataset.answer)].answer = el.value; state.answers = questions; saveState(); });
  document.querySelector('#draft')?.addEventListener('click', createDraft);
  document.querySelectorAll('[data-design-answer]').forEach(el => el.oninput = () => { const question = state.missingInformation[Number(el.dataset.designAnswer)]; if (question) { state.designAnswers[question] = el.value; saveState(); } });
  document.querySelector('#regenerate-design')?.addEventListener('click', generateCompleteProposal);
  document.querySelectorAll('[data-section-title]').forEach(el => el.oninput = () => { state.sections[Number(el.dataset.sectionTitle)].title = el.value; saveState(); });
  document.querySelectorAll('[data-section-content]').forEach(el => el.oninput = () => { state.sections[Number(el.dataset.sectionContent)].content = el.value; saveState(); });
  document.querySelectorAll('[data-rewrite]').forEach(el => el.onclick = () => rewriteSection(Number(el.dataset.rewrite)));
  document.querySelectorAll('[data-confirm-fact]').forEach(el => el.onclick = () => confirmCompanyFact(Number(el.dataset.confirmFact)));
  document.querySelector('#confirm-company-fact')?.addEventListener('click', confirmCompanyFactDraft);
  document.querySelector('#docx')?.addEventListener('click', () => exportDocx(state.project, state.sections).catch(showError));
  document.querySelector('#pdf')?.addEventListener('click', () => exportPdf(state.project, state.sections).catch(showError));
  document.querySelector('#print')?.addEventListener('click', printDocument);
}

async function addManualFiles(event) {
  const files = [...event.target.files];
  if (!files.length) return;
  setState({ busy: `직접 자료 ${files.length}개를 읽는 중...`, error: '', notice: '' });
  const additions = [];
  for (const file of files) {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension === 'hwp' || extension === 'hwpx') {
      additions.push(manualSourceRecord(file.name, state.manualSourceType, '', 'unsupported', '한글 프로그램에서 PDF로 저장한 뒤 다시 업로드해 주세요.'));
      continue;
    }
    try {
      const parsed = await extractFile(file);
      additions.push(manualSourceRecord(file.name, state.manualSourceType, parsed.text, 'success', ''));
    } catch (error) {
      additions.push(manualSourceRecord(file.name, state.manualSourceType, '', 'failed', error.message));
    }
  }
  setState({ busy: '', manualSources: [...state.manualSources, ...additions], notice: `직접 자료 ${additions.length}개를 추가했습니다.` });
}

function addManualText() {
  const text = state.manualSourceText.trim();
  if (text.length < 10) return setState({ error: '붙여넣을 자료 원문을 10자 이상 입력해 주세요.' });
  const name = state.manualSourceName.trim() || `붙여넣기 자료 ${state.manualSources.length + 1}`;
  const item = manualSourceRecord(name, state.manualSourceType, text, 'success', '');
  state.manualSourceName = ''; state.manualSourceText = '';
  setState({ manualSources: [...state.manualSources, item], manualSourceName: '', manualSourceText: '', notice: '붙여넣기 자료를 추가했습니다.' });
}

function manualSourceRecord(fileName, sourceType, extractedText, extractionStatus, extractionError) {
  return { id: globalThis.crypto?.randomUUID?.() || `source-${Date.now()}-${Math.random().toString(16).slice(2)}`, fileName, sourceType, extractedText, extractionStatus, extractionError };
}

async function loadOfficialNotices() {
  state.project.type = 'chest';
  setState({ busy: '중앙회와 광주지회 공고를 불러오는 중...', error: '', notice: '' });
  try {
    const result = await fetchNoticeList();
    setState({ busy: '', noticeResults: result.notices || [], selectedNoticeIndexes: [], pendingNoticeChoice: null, notice: `공고 ${result.notices?.length || 0}건을 불러왔습니다.` });
  } catch (error) { setState({ busy: '', error: error.message }); }
}

function removeOfficialNotice(value) {
  const index = Number(value);
  if (!Number.isInteger(index) || !state.noticeResults[index]) return;
  state.noticeResults.splice(index, 1);
  setState({ noticeResults: [...state.noticeResults], selectedNoticeIndexes: [], notice: '목록에서 공고를 삭제했습니다.' });
}

function toggleNoticeSelection(value, checked) {
  const index = Number(value);
  if (!Number.isInteger(index) || !state.noticeResults[index]) return;
  const selected = new Set(state.selectedNoticeIndexes);
  checked ? selected.add(index) : selected.delete(index);
  setState({ selectedNoticeIndexes: [...selected].sort((a, b) => a - b) });
}

function removeSelectedNotices() {
  const selected = new Set(state.selectedNoticeIndexes);
  if (!selected.size) return;
  const noticeResults = state.noticeResults.filter((_, index) => !selected.has(index));
  setState({ noticeResults, selectedNoticeIndexes: [], notice: `선택한 공고 ${selected.size}건을 삭제했습니다.` });
}

async function selectOfficialNotice(value) {
  const selected = state.noticeResults[Number(value)];
  if (!selected) return setState({ error: '선택한 공고를 찾지 못했습니다.' });
  setState({ busy: '선택한 공고 본문을 불러오는 중...', pendingNoticeChoice: null, error: '', notice: '' });
  try {
    const { notice } = await fetchNoticeDetail(selected);
    if (notice.subprojects?.length > 1) return setState({ busy: '', pendingNoticeChoice: { notice, subprojects: notice.subprojects }, notice: '계획서에 반영할 세부사업을 선택해 주세요.' });
    applyNoticeSelection(notice);
  } catch (error) { setState({ busy: '', error: error.message }); }
}

function selectNoticeSubproject(value) {
  const pending = state.pendingNoticeChoice;
  const subproject = pending?.subprojects[Number(value)];
  if (!pending || !subproject) return setState({ error: '선택한 세부사업을 찾지 못했습니다.' });
  applyNoticeSelection(pending.notice, subproject);
}

function applyNoticeSelection(notice, subproject = null) {
  const primary = notice.parts[0];
  const title = subproject?.title || notice.title;
  const bodyText = subproject
    ? `[${primary.sourceLabel} 우선 조건 · dstbBsnsCode ${primary.listSn}]\n사업명: ${title}\n사업수행기간: ${primary.performancePeriod}\n공모기간: ${primary.applicationPeriod}\n지원한도: ${primary.supportLimit}\n개요:\n${subproject.content}`
    : notice.parts.map((part, index) => `[${index === 0 ? `${part.sourceLabel} 우선 조건` : `${part.sourceLabel} 보충 자료`} · dstbBsnsCode ${part.listSn}]\n${noticeBodyText(part.bodyHtml)}`).join('\n\n');
  state.project = { ...state.project, type: 'chest', title, issuer: notice.sourceLabels.includes('광주지회') ? '광주사회복지공동모금회' : '사회복지공동모금회' };
  state.sourceText = `${title}\n\n${bodyText}`;
  state.selectedNotice = { title, selectedSubproject: subproject?.title || '', registeredAt: notice.registeredAt, references: notice.references, attachments: notice.attachments, officialTextExtracted: false, extractedAttachmentKeys: [] };
  setState({ busy: '', pendingNoticeChoice: null, notice: '선택한 공고 본문을 사업계획서 입력으로 가져왔습니다.' });
}

async function handleOfficialAttachment(value, extract) {
  const attachment = state.selectedNotice?.attachments?.[Number(value)];
  if (!attachment) return setState({ error: '선택한 첨부파일을 찾지 못했습니다.' });
  const type = attachmentType(attachment.name, attachment.fileType);
  if (extract && !['PDF', 'DOCX', 'TXT'].includes(type)) return setState({ error: `${type} 파일은 내용을 추출할 수 없습니다. 원본을 내려받아 확인해 주세요.` });
  setState({ busy: extract ? '공식 공고문 내용을 추출하는 중...' : '공식 첨부파일을 내려받는 중...', error: '', notice: '' });
  try {
    const response = await fetch('/api/notices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'downloadAttachment', attachment }) });
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || '첨부파일 다운로드 실패'); }
    const blob = await response.blob();
    if (!extract) { downloadOriginal(blob, attachment.name); return setState({ busy: '', notice: `${attachment.name} 원본을 내려받았습니다.` }); }
    const key = `${attachment.dstbBsnsCode}:${attachment.fileSeCode}:${attachment.sn}:${attachment.fileSn}`;
    if (state.selectedNotice.extractedAttachmentKeys.includes(key)) return setState({ busy: '', notice: '이미 반영한 공식 첨부파일입니다.' });
    const parsed = await extractFile(new File([blob], attachment.name, { type: blob.type }));
    const relevantText = relevantAttachmentText(parsed.text, state.selectedNotice.selectedSubproject);
    state.sourceText = `${state.sourceText}\n\n[공식 첨부: ${attachment.name}]\n${relevantText}`;
    state.selectedNotice = { ...state.selectedNotice, officialTextExtracted: true, extractedAttachmentKeys: [...state.selectedNotice.extractedAttachmentKeys, key] };
    setState({ busy: '', sourceText: state.sourceText, selectedNotice: state.selectedNotice, notice: '공식 공고문 텍스트를 생성 입력에 반영했습니다.' });
  } catch (error) { setState({ busy: '', error: `${extract ? '공고문 추출 실패' : '첨부파일 다운로드 실패'}: ${error.message}` }); }
}

function relevantAttachmentText(text, selectedSubproject) {
  const cleaned = String(text || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!selectedSubproject) return cleaned;
  const start = cleaned.indexOf(selectedSubproject);
  if (start < 0) throw new Error('선택한 세부사업 구간을 첨부 공고문에서 찾지 못했습니다.');
  const tail = cleaned.slice(start);
  const next = tail.slice(selectedSubproject.length).search(/\n\s*\d{1,2}[.)]\s*[^\n]{2,100}사업(?:\s*공고)?\s*(?:\n|$)/);
  return next < 0 ? tail : tail.slice(0, selectedSubproject.length + next).trim();
}

function downloadOriginal(blob, name) {
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function addMissingNotice() {
  const url = state.noticeUrlDraft.trim();
  if (!url) return setState({ error: '공식 상세 URL을 입력해 주세요.' });
  setState({ busy: '누락 공고를 확인하는 중...', error: '', notice: '' });
  try {
    const result = await importNoticeUrl(url, state.noticeResults);
    if (result.duplicate) {
      const item = state.noticeResults[result.existingIndex];
      if (item && result.reference && !item.references.some(reference => reference.source === result.reference.source && reference.listSn === result.reference.listSn)) {
        item.references.push(result.reference);
        item.sourceLabels = [...new Set([...item.sourceLabels, result.sourceLabel])];
        item.sourceLabel = item.sourceLabels.join('·');
        item.listSn = item.references.map(reference => reference.listSn).join(' · ');
      }
      state.noticeUrlDraft = '';
      return setState({ busy: '', noticeResults: [...state.noticeResults], notice: '이미 목록에 있는 동일 공고입니다.' });
    }
    state.noticeUrlDraft = '';
    setState({ busy: '', noticeResults: [...state.noticeResults, result.notice], notice: '누락 공고를 목록에 추가했습니다.' });
  } catch (error) { setState({ busy: '', error: error.message }); }
}

async function analyze() {
  if (state.sourceText.trim().length < 30) return setState({ error: '분석할 원문을 30자 이상 입력해 주세요.' });
  setState({ busy: '기관 요구사항과 평가 기준을 분석하는 중...', error: '', notice: '' });
  if (state.sourceText.length > 180000) return setState({ error: 'AI 분석 원문은 180,000자 이하여야 합니다. 파일을 나누거나 불필요한 내용을 줄여 주세요.' });
  const payload = { sourceText: state.sourceText, projectType: typeName(), project: state.project, organization: organizationForGeneration() };
  try { const result = await analyzeWithAI(payload); state.analysis = result.analysis; state.aiMode = 'ai'; }
  catch (error) { state.analysis = localAnalyze({ sourceText: state.sourceText, projectType: typeName(), title: state.project.title }); state.aiMode = 'local'; state.notice = `서버 AI를 사용할 수 없어 로컬 분석으로 계속합니다: ${error.message}`; }
  state.analysis.project = { ...state.project, ...state.analysis.project }; state.project = { ...state.project, ...state.analysis.project }; state.answers = state.analysis.questions || []; state.matches = buildMatches(); navigateToStep(2, { busy: '' });
}

async function createDraft() {
  await generateCompleteProposal();
}

async function rewriteSection(index) {
  const instruction = window.prompt('어떻게 수정할까요? 사실이나 수치를 새로 만들도록 요청할 수 없습니다.', '더 명확하고 간결하게 작성');
  if (!instruction) return;
  setState({ busy: '선택한 항목을 근거 범위 안에서 재작성하는 중...', error: '' });
  try { const result = await rewriteWithAI({ section: state.sections[index], instruction, analysis: state.analysis, organization: organizationForGeneration() }); state.sections[index] = result.section; setState({ busy: '', notice: '항목을 재작성했습니다.' }); }
  catch (error) { setState({ busy: '', error: error.message }); }
}
function showError(error) { setState({ error: error.message }); }

async function generateCompleteProposal() {
  const manualLength = state.manualSources.filter(value => value.extractionStatus === 'success').reduce((sum, value) => sum + value.extractedText.length, 0);
  if (state.sourceText.trim().length + manualLength < 30) return setState({ error: '사업계획서를 작성할 공식 또는 직접 자료를 30자 이상 입력해 주세요.' });
  if (state.sourceText.length > 180000 || state.sourceText.length + manualLength > 220000) return setState({ error: '생성 입력 자료가 허용 길이를 초과했습니다. 자료를 나누거나 불필요한 내용을 줄여 주세요.' });
  setState({ busy: '공고문을 분석하고 완성형 사업계획서를 작성하는 중...', error: '', notice: '' });
  const completePayload = { sourceText: state.sourceText, manualSources: state.manualSources.map(({ id, fileName, sourceType, extractedText, extractionStatus, extractionError }) => ({ id, fileName, sourceType, extractedText, extractionStatus, extractionError })), projectType: typeName(), project: state.project, selectedSubprogram: state.selectedNotice?.selectedSubproject || state.selectedNotice?.title || state.project.title, organization: organizationForGeneration(), userAnswers: state.designAnswers };
  try {
    const result = await draftWithAI(completePayload);
    state.sponsorIntent = result.sponsorIntent;
    state.projectDesign = result.projectDesign;
    state.missingInformation = (result.missingInformation || []).slice(0, 5);
    state.evidenceMap = result.evidenceMap || [];
    state.qualityCheck = result.qualityCheck;
    state.analysis = engineAnalysis(result);
    state.sections = result.sections;
    state.aiMode = 'ai';
    state.designUnavailable = false;
    state.project = { ...state.project, title: result.projectDesign.projectName || state.project.title };
  } catch (error) {
    const localSource = [state.sourceText, ...state.manualSources.filter(value => value.extractionStatus === 'success').map(value => `[${value.sourceType}: ${value.fileName}]\n${value.extractedText}`)].filter(Boolean).join('\n\n');
    state.analysis = localAnalyze({ sourceText: localSource, projectType: typeName(), title: state.project.title });
    state.sponsorIntent = localSponsorIntent(state.analysis);
    state.projectDesign = null;
    state.missingInformation = (state.analysis.questions || []).slice(0, 5).map(value => value.question);
    state.evidenceMap = state.analysis.requirements.map(value => ({ id: value.id, claim: value.requirement, evidence: value.evidence, location: value.location }));
    state.qualityCheck = null;
    state.sections = [];
    state.aiMode = 'local';
    state.designUnavailable = true;
    state.notice = `공고 자료 분석은 완료되었지만 AI 정밀 사업설계를 실행하지 못했습니다. ${error.message}`;
  }
  state.answers = state.analysis.questions || [];
  state.matches = buildMatches();
  navigateToStep(5, { busy: '' });
}

function engineAnalysis(result) {
  const requirements = (result.evidenceMap || []).map((item, index) => ({ id: item.id || `evidence-${index + 1}`, category: '공모 근거', requirement: item.claim, mandatory: false, evidence: item.evidence, location: item.location, confidence: '높음' }));
  return { mode: 'ai', project: { ...state.project, title: result.projectDesign.projectName, budget: result.projectDesign.budgetStructure.join(' · ') }, requirements, evaluationCriteria: result.sponsorIntent.selectionLogic, submissionItems: [], warnings: [], questions: (result.missingInformation || []).slice(0, 5).map((question, index) => ({ id: `design-q-${index + 1}`, question, required: true, answer: state.designAnswers[question] || '' })) };
}

function localSponsorIntent(analysis) {
  const facts = analysis.requirements;
  const first = category => facts.find(value => value.category === category)?.evidence || '';
  return { coreProblem: first('대상') || facts[0]?.evidence || '', policyPurpose: first('운영'), requiredTarget: first('대상'), expectedChange: first('평가'), selectionLogic: analysis.evaluationCriteria || [], mandatoryConditions: facts.filter(value => value.mandatory).map(value => value.requirement), budgetRestrictions: facts.filter(value => value.category === '예산').map(value => value.requirement), evidence: facts.map(value => value.evidence).filter(Boolean) };
}

function confirmCompanyFact(index) {
  const section = state.sections[index];
  if (!window.confirm('이 내용이 실제 회사 정보임을 확인했습니까? 확인되지 않은 AI 문구는 저장하지 마세요.')) return;
  const fact = { id: section.id, category: companyFactCategory(section.title), title: section.title, content: section.content, confirmedByUser: true, confirmedAt: new Date().toISOString() };
  state.companyFacts = [...state.companyFacts.filter(item => item.id !== fact.id), fact];
  setState({ companyFacts: state.companyFacts, notice: '확정한 회사 정보를 다음 사업계획서에 재사용합니다.' });
}

function confirmCompanyFactDraft() {
  const content = state.companyFactDraft.trim();
  if (!content) return setState({ error: '확정할 회사 정보를 입력해 주세요.' });
  if (!window.confirm('입력한 내용이 실제 회사 정보임을 확인했습니까?')) return;
  const fact = { id: `manual-${Date.now()}`, category: '사용자 확정', title: '사용자 확정 회사 정보', content, confirmedByUser: true, confirmedAt: new Date().toISOString() };
  state.companyFacts = [...state.companyFacts, fact];
  state.companyFactDraft = '';
  setState({ companyFacts: state.companyFacts, notice: '확정한 회사 정보를 다음 사업계획서에 재사용합니다.', error: '' });
}

function companyFactCategory(title) {
  if (/인력|조직|담당/.test(title)) return '인력';
  if (/실적|경험/.test(title)) return '실적';
  if (/예산|사업비|수익/.test(title)) return '예산';
  if (/프로그램|내용/.test(title)) return '프로그램';
  if (/지역|장소/.test(title)) return '지역';
  return '운영조건';
}
render();
