import { organizationProfile, profileForPrompt } from './organization.js';
import { analyzeWithAI, draftWithAI, rewriteWithAI } from './api.js';
import { extractFiles } from './files.js';
import { localAnalyze, localDraft } from './fallback.js';
import { exportDocx, exportPdf, printDocument } from './export.js';

const TYPES = [
  ['chest', '사랑의열매', '복지·지원사업'], ['family', '가족센터', '가족지원사업'],
  ['edu', '학교·교육청', '교육기관'], ['g2b', '나라장터·학교장터', '공공조달'],
  ['general', '일반 창업·아이디어', '일반 사업']
];
const STEPS = ['사업 설정', '기관 원문', '요구사항 분석', '적합성 비교', '확인 질문', '계획서 작성'];
const initial = {
  step: 0, project: { type: 'g2b', title: '', issuer: '', deadline: '' }, sourceText: '', files: [],
  analysis: null, matches: [], answers: [], sections: [], companyFacts: [], manualCompanyFacts: '', busy: '', notice: '', error: '', aiMode: ''
};
let state = loadState();
const app = document.querySelector('#app');

function loadState() {
  try { return { ...structuredClone(initial), ...JSON.parse(localStorage.getItem('ms12_project_v3') || '{}'), busy: '', error: '' }; }
  catch { return structuredClone(initial); }
}
function saveState() {
  const safe = { ...state, busy: '', error: '', files: state.files.map(({ text, ...meta }) => meta) };
  localStorage.setItem('ms12_project_v3', JSON.stringify(safe));
}
function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
function nl(value = '') { return escapeHtml(value).replace(/\n/g, '<br>'); }
function setState(patch) { state = { ...state, ...patch }; saveState(); render(); }
function typeName() { return TYPES.find(([id]) => id === state.project.type)?.[1] || '사업'; }
function organizationForGeneration() { return { ...profileForPrompt(), confirmedFacts: state.companyFacts, userConfirmedNotes: state.manualCompanyFacts.trim() || '없음' }; }

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
    <div class="source-grid"><div class="card"><div class="card-title"><h3>파일 업로드</h3><span>PDF · DOCX · TXT / 파일당 20MB</span></div><label class="dropzone" for="source-files"><strong>파일을 선택하거나 여기에 놓으세요</strong><small>스캔 PDF는 OCR이 필요할 수 있습니다.</small><input id="source-files" type="file" accept=".pdf,.docx,.txt" multiple></label><div class="file-list">${state.files.length ? state.files.map((f, i) => `<div class="file-item"><span class="file-badge">${escapeHtml(f.type)}</span><div><strong>${escapeHtml(f.name)}</strong><small>${f.pages ? `${f.pages}쪽 · ` : ''}${Number(f.characters || 0).toLocaleString()}자</small></div><button data-remove-file="${i}" aria-label="파일 제거">×</button></div>`).join('') : '<p class="empty-inline">업로드한 파일이 없습니다.</p>'}</div></div>
    <div class="card"><div class="card-title"><h3>원문 붙여넣기</h3><span id="char-count">${state.sourceText.length.toLocaleString()}자</span></div><textarea id="source-text" class="source-text" placeholder="기관 공고문 또는 과업지시서 원문을 붙여넣으세요.">${escapeHtml(state.sourceText)}</textarea></div></div>
    <details class="card org-details"><summary>다음 제안서에도 재사용할 확정 회사 정보</summary><p class="muted">담당자가 사실로 확인한 프로그램, 인력, 실적, 운영조건, 지역, 예산만 입력하세요.</p><textarea id="manual-company-facts" class="source-text" placeholder="예: 광주·전남 지역 운영 가능 (담당자 확인 완료)">${escapeHtml(state.manualCompanyFacts)}</textarea>${state.companyFacts.length ? `<p class="muted">문서에서 확정 저장한 정보 ${state.companyFacts.length}건도 자동 적용됩니다.</p>` : ''}</details>
    <div class="tip"><strong>정확도 높이는 방법</strong><span>평가표와 제출 양식까지 함께 제공하면 필수 조건·배점·목차 누락을 줄일 수 있습니다.</span></div>${footer({ nextLabel: '원문 분석 시작', nextId: 'analyze' })}`;
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
  const caps = organizationProfile.capabilities;
  return state.analysis.requirements.map(r => {
    const tokens = r.requirement.replace(/[^가-힣A-Za-z0-9]/g, ' ').split(/\s+/).filter(v => v.length > 1);
    const found = caps.filter(c => tokens.some(t => c.name.includes(t) || c.category.includes(t))).slice(0, 3);
    return { requirementId: r.id, requirement: r.requirement, evidence: r.location, capability: found.map(v => v.name).join(', ') || '확인된 직접 대응 정보 없음', status: found.length ? '부분 충족' : '확인 필요', action: found.length ? '증빙과 적용 범위 확인' : '담당자 답변 또는 증빙 필요' };
  });
}

function matchView() {
  const matches = state.matches.length ? state.matches : buildMatches();
  const counts = ['충족', '부분 충족', '확인 필요', '부족'].map(s => [s, matches.filter(v => v.status === s).length]);
  return `<div class="page-heading"><div><h2>기관 요구와 우리 역량 비교</h2><p>공개 확인된 역량만 자동 연결했습니다. 실적·인력·예산은 증빙 전까지 확정하지 않습니다.</p></div></div>
    <div class="match-summary">${counts.map(([name, count]) => `<div><span class="status ${name.replace(' ', '-')}">${name}</span><strong>${count}</strong></div>`).join('')}</div>
    <div class="card table-card"><div class="responsive-table"><table><thead><tr><th>기관 요구사항</th><th>마인드스토리 정보</th><th>판정</th><th>후속 조치</th></tr></thead><tbody>${matches.map(m => `<tr><td><strong>${escapeHtml(m.requirement)}</strong><small>${escapeHtml(m.evidence)}</small></td><td>${escapeHtml(m.capability)}</td><td><span class="status ${m.status.replace(' ', '-')}">${m.status}</span></td><td>${escapeHtml(m.action)}</td></tr>`).join('')}</tbody></table></div></div>
    <details class="card org-details"><summary>사용 중인 마인드스토리 기관 정보 ${organizationProfile.capabilities.length}건 보기</summary><div class="cap-grid">${organizationProfile.capabilities.map(c => `<div><span>${escapeHtml(c.category)}</span><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(c.status)}</small></div>`).join('')}</div><h4>아직 확인 필요한 기관 정보</h4><p>${organizationProfile.unverified.map(v => `<span class="chip">${escapeHtml(v)}</span>`).join('')}</p></details>${footer()}`;
}

function questionsView() {
  const questions = state.answers.length ? state.answers : (state.analysis?.questions || []);
  return `<div class="page-heading"><div><h2>확인이 필요한 정보</h2><p>답을 모르면 비워 두세요. 문서에는 사실을 만들지 않고 ‘확인 필요’로 표시합니다.</p></div><span class="progress-text">${questions.filter(q => q.answer).length} / ${questions.length} 답변</span></div>
    <div class="questions">${questions.length ? questions.map((q, i) => `<div class="card question"><div><span>${q.required ? '필수 확인' : '권장 확인'}</span><strong>${escapeHtml(q.question)}</strong></div><textarea data-answer="${i}" placeholder="확인된 사실과 증빙만 입력하세요. 모르면 비워 두세요.">${escapeHtml(q.answer || '')}</textarea></div>`).join('') : '<div class="empty-state"><div>✓</div><h2>추가 질문이 없습니다</h2><p>그래도 인력·실적·예산 증빙은 최종 제출 전에 확인하세요.</p></div>'}</div>${footer({ nextLabel: '사업계획서 초안 생성', nextId: 'draft' })}`;
}

function documentView() {
  if (!state.sections.length) return `<div class="empty-state"><div>▤</div><h2>작성된 초안이 없습니다</h2><p>확인 질문 단계에서 초안을 생성해 주세요.</p><button class="button primary" data-step="4">확인 질문으로 이동</button></div>`;
  return `<div class="document-toolbar"><div><h2>${escapeHtml(state.project.title || '기관 제출용 사업계획서')}</h2><p><span class="mode ${state.aiMode === 'ai' ? 'ai' : ''}">${state.aiMode === 'ai' ? 'AI 초안' : '로컬 초안'}</span> 항목별 근거와 확인 상태를 검토하세요.</p></div><div><button class="button secondary" id="print">인쇄</button><button class="button secondary" id="pdf">PDF</button><button class="button primary" id="docx">DOCX</button></div></div>
    <div class="editor-layout"><aside class="outline">${state.sections.map((s, i) => `<a href="#section-${i}"><span>${i + 1}</span>${escapeHtml(s.title.replace(/^\d+[.)]?\s*/, ''))}</a>`).join('')}</aside><div class="paper">${state.sections.map((s, i) => `<section id="section-${i}" class="doc-section"><div class="section-head"><input data-section-title="${i}" value="${escapeHtml(s.title)}"><span class="status ${s.status?.replace(' ', '-')}">${escapeHtml(s.status || '검토 필요')}</span></div><textarea data-section-content="${i}">${escapeHtml(s.content)}</textarea><div class="section-meta"><span>근거 ${s.citations?.length || 0}개</span><span><button data-confirm-fact="${i}">회사 정보로 확정 저장</button><button data-rewrite="${i}">이 항목 재작성</button></span></div>${s.citations?.length ? `<details><summary>반영한 원문 근거</summary>${s.citations.map(id => { const r = state.analysis.requirements.find(v => v.id === id); return r ? `<blockquote>${escapeHtml(r.evidence)} <small>${escapeHtml(r.location)}</small></blockquote>` : ''; }).join('')}</details>` : ''}</section>`).join('')}</div></div>`;
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
  document.querySelector('#manual-company-facts')?.addEventListener('input', e => { state.manualCompanyFacts = e.target.value; saveState(); });
}

function bind() {
  updateInputs();
  document.querySelectorAll('[data-type]').forEach(el => el.onclick = () => { state.project.type = el.dataset.type; saveState(); render(); });
  document.querySelectorAll('[data-step]').forEach(el => el.onclick = () => setState({ step: Number(el.dataset.step), notice: '', error: '' }));
  document.querySelector('#back')?.addEventListener('click', () => setState({ step: Math.max(0, state.step - 1), notice: '', error: '' }));
  document.querySelector('#next')?.addEventListener('click', () => { if (state.step === 2 && !state.matches.length) state.matches = buildMatches(); setState({ step: Math.min(5, state.step + 1), notice: '', error: '' }); });
  document.querySelector('#menu-toggle')?.addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));
  const fileInput = document.querySelector('#source-files');
  if (fileInput) fileInput.onchange = async e => {
    try { setState({ busy: '파일에서 텍스트를 추출하는 중...', error: '' }); const parsed = await extractFiles([...e.target.files]); state.files.push(...parsed.map(v => ({ ...v, characters: v.text.length }))); state.sourceText += parsed.map(v => `\n\n[파일: ${v.name}]\n${v.text}`).join(''); setState({ busy: '', notice: `${parsed.length}개 파일을 읽었습니다.` }); }
    catch (error) { setState({ busy: '', error: error.message }); }
  };
  document.querySelectorAll('[data-remove-file]').forEach(el => el.onclick = () => { state.files.splice(Number(el.dataset.removeFile), 1); setState({ files: state.files }); });
  const analyzeButton = document.querySelector('#analyze');
  if (analyzeButton) { analyzeButton.textContent = '사업계획서 작성 →'; analyzeButton.addEventListener('click', generateCompleteProposal); }
  document.querySelectorAll('[data-answer]').forEach(el => el.oninput = () => { const questions = state.answers.length ? state.answers : structuredClone(state.analysis.questions || []); questions[Number(el.dataset.answer)].answer = el.value; state.answers = questions; saveState(); });
  document.querySelector('#draft')?.addEventListener('click', createDraft);
  document.querySelectorAll('[data-section-title]').forEach(el => el.oninput = () => { state.sections[Number(el.dataset.sectionTitle)].title = el.value; saveState(); });
  document.querySelectorAll('[data-section-content]').forEach(el => el.oninput = () => { state.sections[Number(el.dataset.sectionContent)].content = el.value; saveState(); });
  document.querySelectorAll('[data-rewrite]').forEach(el => el.onclick = () => rewriteSection(Number(el.dataset.rewrite)));
  document.querySelectorAll('[data-confirm-fact]').forEach(el => el.onclick = () => confirmCompanyFact(Number(el.dataset.confirmFact)));
  document.querySelector('#docx')?.addEventListener('click', () => exportDocx(state.project, state.sections).catch(showError));
  document.querySelector('#pdf')?.addEventListener('click', () => exportPdf(state.project, state.sections).catch(showError));
  document.querySelector('#print')?.addEventListener('click', printDocument);
}

async function analyze() {
  if (state.sourceText.trim().length < 30) return setState({ error: '분석할 원문을 30자 이상 입력해 주세요.' });
  setState({ busy: '기관 요구사항과 평가 기준을 분석하는 중...', error: '', notice: '' });
  if (state.sourceText.length > 180000) return setState({ error: 'AI 분석 원문은 180,000자 이하여야 합니다. 파일을 나누거나 불필요한 내용을 줄여 주세요.' });
  const payload = { sourceText: state.sourceText, projectType: typeName(), project: state.project, organization: organizationForGeneration() };
  try { const result = await analyzeWithAI(payload); state.analysis = result.analysis; state.aiMode = 'ai'; }
  catch (error) { state.analysis = localAnalyze({ sourceText: state.sourceText, projectType: typeName(), title: state.project.title }); state.aiMode = 'local'; state.notice = `서버 AI를 사용할 수 없어 로컬 분석으로 계속합니다: ${error.message}`; }
  state.analysis.project = { ...state.project, ...state.analysis.project }; state.project = { ...state.project, ...state.analysis.project }; state.answers = state.analysis.questions || []; state.matches = buildMatches(); setState({ busy: '', step: 2 });
}

async function createDraft() {
  setState({ busy: '근거를 연결해 사업계획서 초안을 작성하는 중...', error: '', notice: '' });
  const payload = { project: state.project, analysis: state.analysis, matches: state.matches, answers: state.answers, organization: organizationForGeneration() };
  try { const result = await draftWithAI(payload); state.sections = result.sections; state.aiMode = 'ai'; }
  catch (error) { const result = localDraft({ analysis: state.analysis, answers: state.answers, organization: organizationProfile }); state.sections = result.sections; state.aiMode = 'local'; state.notice = `서버 AI를 사용할 수 없어 검토용 로컬 초안을 만들었습니다: ${error.message}`; }
  setState({ busy: '', step: 5 });
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
  if (state.sourceText.trim().length < 30) return setState({ error: '사업계획서를 작성할 공고문을 30자 이상 입력해 주세요.' });
  if (state.sourceText.length > 180000) return setState({ error: 'AI 분석 원문은 180,000자 이하여야 합니다. 파일을 나누거나 불필요한 내용을 줄여 주세요.' });
  setState({ busy: '공고문을 분석하고 완성형 사업계획서를 작성하는 중...', error: '', notice: '' });
  const completePayload = { sourceText: state.sourceText, projectType: typeName(), project: state.project, organization: organizationForGeneration() };
  try {
    const result = await draftWithAI(completePayload);
    state.analysis = result.analysis;
    state.sections = result.sections;
    state.aiMode = 'ai';
  } catch (error) {
    state.analysis = localAnalyze({ sourceText: state.sourceText, projectType: typeName(), title: state.project.title });
    state.sections = localDraft({ analysis: state.analysis, answers: state.analysis.questions || [], organization: { ...organizationProfile, confirmedFacts: state.companyFacts, userConfirmedNotes: state.manualCompanyFacts } }).sections;
    state.aiMode = 'local';
    state.notice = `서버 AI를 사용할 수 없어 로컬 분석과 검토용 완성 초안으로 계속했습니다: ${error.message}`;
  }
  state.analysis.project = { ...state.project, ...state.analysis.project };
  state.project = { ...state.project, ...state.analysis.project };
  state.answers = state.analysis.questions || [];
  state.matches = buildMatches();
  setState({ busy: '', step: 5 });
}

function confirmCompanyFact(index) {
  const section = state.sections[index];
  if (!window.confirm('이 내용이 실제 회사 정보임을 확인했습니까? 확인되지 않은 AI 문구는 저장하지 마세요.')) return;
  const fact = { id: section.id, category: companyFactCategory(section.title), title: section.title, content: section.content, confirmedByUser: true, confirmedAt: new Date().toISOString() };
  state.companyFacts = [...state.companyFacts.filter(item => item.id !== fact.id), fact];
  setState({ companyFacts: state.companyFacts, notice: '확정한 회사 정보를 다음 사업계획서에 재사용합니다.' });
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
