export const organizationProfile = {
  name: '마인드스토리',
  verificationNotice: '공개 웹사이트에서 확인한 범위입니다. 계약 제출 전 담당자가 증빙과 최신성을 확인해야 합니다.',
  sources: [
    { title: '마인드스토리 공식 웹사이트', url: 'https://mindstory.kr/', checkedAt: '2026-08-06' },
    { title: '마인드스토리 네이버 블로그', url: 'https://blog.naver.com/sanj2100', checkedAt: null, note: '자동 접근 제한으로 개별 게시물 미확인' }
  ],
  capabilities: [
    { category: '교육', name: '진로캠프', status: '공개 확인', source: 'https://mindstory.kr/' },
    { category: '학습', name: '메타인지 학습클리닉 및 메타인지 학습상담', status: '공개 확인', source: 'https://mindstory.kr/' },
    { category: '가족', name: '부모자녀 소통 프로그램', status: '공개 확인', source: 'https://mindstory.kr/' },
    { category: '상담', name: '미술심리 프로그램', status: '공개 확인', source: 'https://mindstory.kr/' },
    { category: 'AI 융합', name: 'AI 동화·창작 프로그램', status: '공개 확인', source: 'https://mindstory.kr/' },
    { category: '검사', name: 'MSSI-2 다차원학습전략검사', status: '공개 확인', source: 'https://mindstory.kr/' },
    { category: '검사', name: 'MAAT-2 종합능력적성검사', status: '공개 확인', source: 'https://mindstory.kr/' },
    { category: '검사', name: 'STEAM 계열적성검사', status: '공개 확인', source: 'https://mindstory.kr/' },
    { category: '교육 운영', name: '원격평생교육 및 NCS 기반 직업훈련 과정', status: '공개 확인', source: 'https://mindstory.kr/' }
  ],
  unverified: [
    '법인·사업자 정보', '대표자와 담당자', '보유 인력 명단 및 참여 가능 여부', '자격증과 유효기간',
    '최근 수행 실적과 실적증명서', '시설·장비', '수행 가능 지역', '표준 원가와 예산 한도',
    '보험·인증·면허', '개인정보 처리 및 안전관리 체계'
  ]
};

export function profileForPrompt() {
  return {
    organization: organizationProfile.name,
    verifiedCapabilities: organizationProfile.capabilities,
    unverifiedFields: organizationProfile.unverified,
    rule: '공개 확인 상태인 정보만 사실로 사용하고, 나머지는 반드시 확인 필요로 표시한다.'
  };
}
