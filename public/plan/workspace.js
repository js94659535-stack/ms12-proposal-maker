// 계획서 작업대(10-12)의 판정. 화면은 결과만 그린다 — 「다음 할 일」·배점 채움·질문을 화면이 스스로 정하면
// 같은 상태를 두 곳이 다르게 말하게 된다(대원칙 ③). 판정에 쓰는 표는 readPlan 하나다(10-08).
import { writingUnits } from '../rfp/rfp-plan.js';

// 엔진이 비워 둔 자리의 머리말. 생성 엔진(src/proposal-draft.js)도 이것을 쓴다.
export const PENDING = '[확인 필요';

// 생성 도구가 장마다 남기는 파일 이름의 장 부분. 도구(tools/proposal-draft.mjs)도 이것으로 이름을 짓는다.
export const draftFileLabel = title => String(title).replace(/[\\/:*?"<>|\s]+/g, '_');
const DRAFT_FILE = /^(draft|submit|choices|checks)_(.+)\.(md|json)$/;

// 사용자가 하는 일 넷. 홈과 작업대가 같은 순서·같은 이름을 쓴다.
export const STEPS = [
  { key: 'notice', name: '공고 고르기' },
  { key: 'facts', name: '기관 자료 올리기' },
  { key: 'questions', name: '질문에 답하기' },
  { key: 'draft', name: '초안 받기' }
];

export const chaptersOf = plan => writingUnits(plan);

// 올린 파일을 장에 붙인다. 이름이 어느 장과도 안 맞으면 버리지 않고 unmatched로 돌려 화면이 밝힌다.
export function sortDraftFiles(chapters, files) {
  const byChapter = Object.fromEntries(chapters.map(chapter => [chapter.key, {}]));
  const unmatched = [];
  for (const file of files) {
    const match = DRAFT_FILE.exec(file.name);
    const chapter = match && chapters.find(item => draftFileLabel(item.title) === match[2]);
    if (!chapter) { unmatched.push(file.name); continue; }
    byChapter[chapter.key][match[1]] = file.text;
  }
  return { byChapter, unmatched };
}

// 배점 채움: 제출본이 있는 장의 배점 합. 분모는 평가표 합계(없으면 장 배점 합).
export function coverage(plan, chapters, drafts) {
  const total = plan?.scoreCheck?.total ?? Number(chapters.reduce((acc, chapter) => acc + chapter.score, 0).toFixed(2));
  const filled = Number(chapters.filter(chapter => drafts[chapter.key]?.submit).reduce((acc, chapter) => acc + chapter.score, 0).toFixed(2));
  return { filled, total, done: chapters.filter(chapter => drafts[chapter.key]?.submit).length, of: chapters.length };
}

// 초안이 비워 둔 곳: 「[확인 필요: 무엇]」을 자리마다 하나씩 모은다.
// 같은 이름표라도 합치지 않는다(11-12) — Ⅰ의 「목표 %」 둘은 정서 개선 비율과 지역주민 참여 비율, 다른 값이다.
// id = 「장:몇째」(장 안에서 나온 차례). 채운 값을 이 id로 남긴다. line = 그 자리가 든 줄(무엇의 값인지 사람이 본다).
export function pendingsOf(chapters, drafts) {
  const out = [];
  for (const chapter of chapters) {
    const text = drafts[chapter.key]?.submit || '';
    let n = 0;
    for (const line of text.split('\n')) {
      for (const match of line.matchAll(/\[확인 필요:?\s*([^\]]*)\]/g)) {
        n += 1;
        out.push({ chapter: chapter.key, id: `${chapter.key}:${n}`, what: match[1].trim() || '내용', line: line.trim() });
      }
    }
  }
  return out;
}

// 초안을 쓰기 전에 물을 것 — 기관이 정할 값 중 project.json에 아직 없는 것. 낱말 목록이 아니라 칸이 비었는지로 본다.
export function questionsOf(project) {
  if (!project) return [{ key: 'project', ask: '기관이 정한 것(project.json)을 올려 주세요 — 주관기관·구성사·마감이 거기 있습니다' }];
  const out = [];
  if (!project.lead) out.push({ key: 'lead', ask: '주관기관 이름은?' });
  for (const [index, partner] of (project.partners || []).entries()) if (!partner.name) out.push({ key: `partner-${index}`, ask: `공동수급 구성사 ${index + 1}의 이름은?` });
  if ((project.partners || []).length && !project.roles) out.push({ key: 'roles', ask: '공동수급 구성사의 역할분장은?' });
  if (!project.deadline) out.push({ key: 'deadline', ask: '제안서 제출 마감 일시는?' });
  // fill: 기관이 한 번 정하면 여러 장에 같이 들어가는 값(11-12 — 「협력 하나센터 이름」이 Ⅱ·Ⅲ·Ⅴ에서 따로 비었다).
  for (const [name, value] of Object.entries(project.fill || {})) if (value == null || value === '') out.push({ key: `fill:${name}`, ask: `${name}은(는)?` });
  return out;
}

// 마감까지 남은 날. 마감을 모르면 null — 지어내지 않는다.
export function daysLeft(deadline, now = new Date()) {
  if (!deadline) return null;
  const end = new Date(deadline);
  if (Number.isNaN(end.getTime())) return null;
  return Math.ceil((end - now) / 86_400_000);
}

// 「다음 할 일」은 하나다. 막지는 않는다 — 질문에 답하지 않아도 초안은 만들 수 있고 빈 값은 [확인 필요]로 남는다.
export function nextStep({ noticeText, plan, facts = [], questions = [], chapters = [], drafts = {}, pendings = [] }) {
  if (!noticeText) return { step: 'notice', text: '공고 파일을 올리세요' };
  if (!plan) return { step: 'notice', text: '이 공고에서는 목차표·평가표를 찾지 못했습니다 — 신청서 양식을 따라 씁니다' };
  if (!facts.length) return { step: 'facts', text: '기관 자료(연혁·실적 등)를 올리세요 — 계획서의 사실은 여기서만 나옵니다' };
  const waiting = chapters.find(chapter => !drafts[chapter.key]?.submit);
  if (waiting) {
    const note = questions.length ? ` — 먼저 질문 ${questions.length}개에 답하면 빈 곳이 줄어듭니다` : '';
    return { step: questions.length ? 'questions' : 'draft', chapter: waiting.key, text: `${waiting.title} 초안을 만드세요${note}` };
  }
  if (pendings.length) return { step: 'draft', text: `초안이 비워 둔 곳 ${pendings.length}곳을 채우세요` };
  return { step: 'draft', text: '모든 장의 초안이 있습니다 — 읽고 내려받으세요' };
}
