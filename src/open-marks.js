// 본문에 남은 [확인 필요] 표시를 한자리에 모은다.
//
// 확인 절차 자체를 없애지 않는다. AI가 기관 실적·인력·예산을 지어내지 못하게 막는 안전장치다.
// 다만 항목을 오가며 같은 값을 여러 번 넣게 두지 않는다. 한 화면에서 한 번 넣으면
// 같은 값을 쓰는 자리에 모두 들어간다.

const MARK = /\[확인 필요(?::\s*([^\]]*))?\]/g;

// 표시 옆 글에서 무엇을 묻는지 짐작한다. 짐작이 서지 않으면 항목 이름을 그대로 쓴다.
function labelFor(before, after, hint, sectionTitle) {
  const near = `${String(before).slice(-40)} ${String(after).slice(0, 40)}`;
  if (hint) return hint.trim();
  const found = [
    [/(인원|명|참여자|대상자)/, '대상 인원'],
    [/(예산|금액|원|비용)/, '예산 금액'],
    [/(기간|일정|월|주|회기)/, '기간·횟수'],
    [/(인력|담당|직원|자격)/, '수행 인력'],
    [/(실적|경험|사업 수행)/, '기관 실적'],
    [/(면적|시설|공간|장소)/, '시설·장소'],
    [/(협력|연계|기관명)/, '협력기관']
  ].find(([pattern]) => pattern.test(near));
  return found ? found[1] : `${sectionTitle} 확인값`;
}

// 같은 것을 묻는 표시는 하나로 묶는다. 한 번 넣으면 묶인 자리에 모두 들어간다.
export function collectOpenMarks(sections = []) {
  const groups = new Map();
  for (const section of sections) {
    const content = String(section?.content || '');
    for (const match of content.matchAll(MARK)) {
      const at = match.index ?? 0;
      const label = labelFor(content.slice(0, at), content.slice(at + match[0].length), match[1], section.title || section.id || '항목');
      const key = `${label}::${match[0]}`;
      const entry = groups.get(key) || {
        key, label, mark: match[0], count: 0, sections: [],
        // 앞뒤 글을 함께 보여 준다. 무엇을 묻는지 문맥 없이 답하게 하지 않는다.
        context: `…${content.slice(Math.max(0, at - 45), at)}【${match[0]}】${content.slice(at + match[0].length, at + match[0].length + 45)}…`
      };
      entry.count += 1;
      if (!entry.sections.includes(section.title || section.id)) entry.sections.push(section.title || section.id);
      groups.set(key, entry);
    }
  }
  return [...groups.values()];
}

// 넣은 값을 본문에 반영한다. 값을 넣지 않은 표시는 그대로 둔다.
// 빈 값으로 지우지 않는다. 지우면 확인하지 않은 채 제출본이 열린다.
export function applyOpenMarks(sections = [], answers = {}) {
  let filled = 0;
  const next = sections.map(section => {
    const content = String(section?.content || '');
    const updated = content.replace(MARK, (whole, hint, offset) => {
      const label = labelFor(content.slice(0, offset), content.slice(offset + whole.length), hint, section.title || section.id || '항목');
      const value = String(answers[`${label}::${whole}`] ?? '').trim();
      if (!value) return whole;
      filled += 1;
      return value;
    });
    return updated === content ? section : { ...section, content: updated };
  });
  return { sections: next, filled, left: collectOpenMarks(next).reduce((sum, item) => sum + item.count, 0) };
}

export function openMarkTotal(sections = []) {
  return collectOpenMarks(sections).reduce((sum, item) => sum + item.count, 0);
}
