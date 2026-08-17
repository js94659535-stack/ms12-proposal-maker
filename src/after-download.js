// 파일을 내려받은 다음에 어디로 가야 하는지. 여기서 안내가 끊기면 받은 사람은 길을 잃는다.
// 받은 것이 검토본인지 제출본인지 밝히고, 지금 상태에서 남은 한 걸음만 권한다. 갈래를 늘어놓지 않는다.
// 판정만 하는 순수 함수다. 없는 사실(마감일·접수처)은 만들지 않는다.

// 단계 번호는 앱의 STEPS와 같다: 4 계획서 작성 · 5 검토·제출.
const WRITE_STEP = 4;
const SUBMIT_STEP = 5;

export const DOWNLOAD_COPIES = ['검토본', '제출본'];

function headlineOf(copy, format) {
  return `${format} ${copy}을 내려받았습니다.`;
}

// 제출본을 받은 뒤. 남은 것은 함께 낼 서류를 갖추는 일뿐이다.
function afterSubmissionCopy({ attachmentsMissing, zipDone, zipStale, deadline }) {
  if (attachmentsMissing > 0) {
    return {
      label: '첨부서류 연결', go: SUBMIT_STEP, anchor: '#submission-package', done: false,
      why: `필수 첨부 ${attachmentsMissing}건에 아직 실제 파일이 붙어 있지 않습니다. 계획서만으로는 제출서류 한 벌이 되지 않습니다.`
    };
  }
  if (zipStale) {
    return {
      label: '제출서류 다시 묶기', go: SUBMIT_STEP, anchor: '#submission-package', done: false,
      why: '앞서 묶은 제출서류는 지난 버전입니다. 방금 받은 판으로 다시 묶어야 같은 내용이 나갑니다.'
    };
  }
  if (!zipDone) {
    return {
      label: '제출서류 한 벌로 묶기', go: SUBMIT_STEP, anchor: '#submission-package', done: false,
      why: '계획서와 첨부서류를 한 벌(ZIP)로 묶어 두면 접수할 때 빠진 서류가 생기지 않습니다.'
    };
  }
  return {
    label: '공고 접수처에 제출', go: SUBMIT_STEP, anchor: '#submission-package', done: true,
    why: `이 앱에서 할 일은 끝났습니다. 받은 파일을 공고에 적힌 접수처로 내면 됩니다.${deadline ? ` 접수 마감은 ${deadline}입니다.` : ''}`
  };
}

// 검토본을 받은 뒤. 제출본이 되기까지 남은 것 중 가장 앞의 하나만 짚는다.
function afterReviewCopy({ openMarks, blockers, saved, reviewed, approved }) {
  if (openMarks > 0) {
    return {
      label: `확인 필요 ${openMarks}곳 채우기`, go: WRITE_STEP, anchor: '#open-marks', done: false,
      why: '본문에 [확인 필요] 표시가 남아 있습니다. 이 값을 채우기 전에는 제출본으로 내보내지 않습니다.'
    };
  }
  if (!reviewed) {
    return {
      label: '심사 검토 받기', go: SUBMIT_STEP, anchor: '#result-pipeline', done: false,
      why: '아직 검토를 거치지 않은 작성본입니다. 검토를 받으면 고칠 곳을 짚어 주고, 그 뒤에 제출본을 만듭니다.'
    };
  }
  if (blockers > 0) {
    return {
      label: '제출 조건 맞추기', go: SUBMIT_STEP, anchor: '#submission-package', done: false,
      why: `제출을 막는 사유 ${blockers}건이 남아 있습니다. 해결해야 최종 PDF·DOCX가 열립니다.`
    };
  }
  if (!saved) {
    return {
      label: '계획서보관함에 저장', go: SUBMIT_STEP, anchor: '#result-completion', done: false,
      why: '아직 보관함에 저장되지 않았습니다. 저장해 두어야 다른 기기에서 다시 열고 다음 공고에 재사용할 수 있습니다.'
    };
  }
  if (!approved) {
    return {
      label: '최종본으로 승인', go: SUBMIT_STEP, anchor: '#final-submission', done: false,
      why: '내용이 이대로면 최종본으로 승인하세요. 승인해도 이전 버전은 그대로 남습니다.'
    };
  }
  return {
    label: '최종 제출본 내려받기', go: SUBMIT_STEP, anchor: '#submission-package', done: false,
    why: '방금 받은 것은 검토본입니다. 제출서류 한 벌에서 최종 PDF·DOCX를 받아 그것을 제출하세요.'
  };
}

export function nextAfterDownload({
  copy = '검토본', format = 'PDF',
  openMarks = 0, blockers = 0, saved = false, reviewed = false, approved = false,
  attachmentsMissing = 0, zipDone = false, zipStale = false, deadline = ''
} = {}) {
  const kind = DOWNLOAD_COPIES.includes(copy) ? copy : '검토본';
  const step = kind === '제출본'
    ? afterSubmissionCopy({
      attachmentsMissing: Number(attachmentsMissing) || 0,
      zipDone: Boolean(zipDone), zipStale: Boolean(zipStale),
      deadline: String(deadline || '').trim()
    })
    : afterReviewCopy({
      openMarks: Number(openMarks) || 0, blockers: Number(blockers) || 0,
      saved: Boolean(saved), reviewed: Boolean(reviewed), approved: Boolean(approved)
    });
  return { copy: kind, format: String(format || 'PDF'), headline: headlineOf(kind, format), ...step };
}
