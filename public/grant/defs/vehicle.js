// 공모 정의: 2026 한국수출입은행 다문화 차량지원사업 (사랑의열매 중앙회 온라인배분신청, 접수 2026-09-14 마감).
// 이 파일은 데이터다. 엔진(engine.js)은 이 공모의 이름도 규정도 모른다.
//  · 원문 항목(sourceItems)과 조건 후보(candidates)는 tools/grant-extract.mjs가 문서에서 뽑은 것을 그대로 쓴다.
//  · requirements의 quote는 공고문 원문 문장이다(테스트가 원문에 있는지 확인한다).
//  · 정의가 연결하지 않은 원문 항목은 엔진이 「보존 칸」으로 남긴다 — 이 정의는 「향후 운영 계획」을 일부러 연결하지 않았다.
import extracted from './vehicle.extracted.js';

const yn = [['', '모름'], ['yes', '예'], ['no', '아니오']];

export default {
  id: 'vehicle',
  name: '2026 한국수출입은행 다문화 차량지원사업',
  funder: '사회복지공동모금회(사랑의열매)',
  status: '이 공모는 2026-09-14 18:00에 접수가 마감되었다. 범용화 검증용이며 실제 제출은 할 수 없다.',
  title: '2026년도 한국수출입은행 다문화 차량지원사업 배분신청서 — {{agency}} ({{=car.label}})',
  source: extracted.source,
  sourceItems: extracted.sourceItems,
  candidates: extracted.candidates,
  fileName: "2026 다문화차량_{{agency}}({{=car.key == 'stariah' ? '스타리아' : '레이'}})",

  inputs: {
    users: { label: '이용자 수(명)', default: 20 },
    under13: { label: '이용자 중 만 13세 미만 어린이(명)', default: 8 },
    usesPerUserWeek: { label: '이용자 1인당 주당 이용 횟수', default: 2 },
    weeks: { label: '연간 운행 주 수', default: 48 },
    maxRunsPerWeek: { label: '주당 운행 가능 횟수(하루 2회×5일, 가정)', default: 10 },
    years: { label: '사업 연수', default: 5 },
    staffCount: { label: '사업수행 인력(명)', default: 2 },
    maintYear: { label: '연 정기점검·정비비(원, 가정)', default: 600000 },
    fuelPerRun: { label: '1회 운행 연료비(원, 가정)', default: 8000 }
  },
  choices: {
    car: {
      label: '차종(1개 차종만 선택)',
      default: 'stariah',
      options: {
        stariah: { label: '스타리아(어린이보호차량 11인승)', unitCost: 42000000, seats: 11, selfReg: 3000000, selfIns: 1500000 },
        ray: { label: '레이(승용차)', unitCost: 19000000, seats: 4, selfReg: 1000000, selfIns: 800000 }
      },
      // 공고문: 만 13세 미만 어린이가 한 명이라도 통학 등을 위해 이용하면 어린이 보호차량 이용 필수(스타리아만 해당)
      feasible: "weeklyRuns <= maxRunsPerWeek && (under13 == 0 || car.key == 'stariah')",
      rank: 'car.unitCost',
      okReason: "{{=car.label}}: 주 {{=weeklyRuns}}회 운행이면 되어 가능(탑승 {{=passengers}}명, 신청금액 {{=money(apply)}})",
      noReason: "{{=car.label}}: {{=(under13 > 0 && car.key != 'stariah') ? '만 13세 미만 이용자 ' + under13 + '명이 있어 어린이 보호차량(스타리아)만 가능' : '이용자 ' + users + '명을 태우려면 주 ' + weeklyRuns + '회 운행이 필요해 주 ' + maxRunsPerWeek + '회 한도를 넘음'}}"
    }
  },
  derive: [
    { id: 'passengers', expr: 'car.seats - 2' },
    { id: 'weeklyUserTrips', expr: 'users * usesPerUserWeek' },
    { id: 'weeklyRuns', expr: 'ceil(weeklyUserTrips / passengers)' },
    { id: 'yearRuns', expr: 'weeklyRuns * weeks' },
    { id: 'apply', expr: 'car.unitCost' },
    { id: 'insurance5', expr: 'car.selfIns * years' },
    { id: 'maint5', expr: 'maintYear * years' },
    { id: 'fuel5', expr: 'yearRuns * fuelPerRun * years' },
    { id: 'selfBurden', expr: 'car.selfReg + insurance5 + maint5 + fuel5' },
    { id: 'total', expr: 'apply + selfBurden' }
  ],
  checks: [
    { id: 'apply', label: '신청금액이 차종 단가 × 1대와 같다', expr: 'apply == car.unitCost', message: '신청금액이 차종 단가(승합 42,000,000원·승용 19,000,000원)와 다르다' },
    { id: 'total', label: '총 사업비가 신청금액과 자부담의 합이다', expr: 'total == apply + selfBurden', message: '총 사업비가 합과 맞지 않는다' },
    { id: 'capacity', label: '필요한 운행 횟수가 운행 가능 횟수 이내다', expr: 'weeklyRuns <= maxRunsPerWeek', message: '이용자 수에 비해 차량이 작거나 운행 가능 횟수가 모자란다 — 차종이나 이용자 수를 다시 정한다' },
    { id: 'users', label: '이용자 수가 1명 이상이다', expr: 'users >= 1', message: '이용자가 없다' },
    { id: 'child', label: '만 13세 미만 이용자가 있으면 어린이 보호차량이다', expr: "under13 == 0 || car.key == 'stariah'", message: '만 13세 미만 어린이가 한 명이라도 타면 어린이 보호차량(스타리아)만 쓸 수 있고 관할 경찰서에 신고해야 한다' },
    { id: 'under13<=users', label: '어린이 수가 이용자 수를 넘지 않는다', expr: 'under13 <= users', message: '만 13세 미만 인원이 전체 이용자보다 많다' }
  ],
  requiredAreas: [
    { id: 'photo', label: '기관 내부·외부 전경 사진', marker: '[사진 붙임]' },
    { id: 'seal', label: '기관 대표자 직인', marker: '(인)' },
    { id: 'consent', label: '개인정보 수집·이용 동의(담당자 날인)', marker: '동의함' }
  ],
  watch: [
    { label: '차종', expr: 'car.label', why: '이용자 수와 승차정원으로 필요한 운행 횟수를 따져 가능한 차종 중 신청금액이 낮은 것을 골랐다' },
    { label: '이용자 수', expr: 'users', why: '선택한 기관의 이용자 수에 맞춤' },
    { label: '주당 운행 횟수', expr: 'weeklyRuns', why: '이용자 수 × 주당 이용 횟수 ÷ 탑승 가능 인원(승차정원−2) 올림' },
    { label: '연 운행 횟수', expr: 'yearRuns', why: '주당 운행 횟수 × 연 운행 주 수' },
    { label: '신청금액', expr: 'apply', format: 'money', why: '차종 단가 × 1대' },
    { label: '자부담(5년)', expr: 'selfBurden', format: 'money', why: '등록·보험·정비·연료비가 차종과 운행 횟수에 따라 다시 계산됨' },
    { label: '총 사업비', expr: 'total', format: 'money', why: '신청금액 + 자부담' }
  ],

  // 정의가 규칙(requirements)이 아니라 선택지·계산식·점검식·계획서 문장으로 구현한 원문 문장. 후보와 연결된 것으로 센다.
  implements: [
    { quote: '어린이 보호차량 이용 필수', by: '선택지 feasible + 점검식 child' },
    { quote: '어린이 보호차량은 반드시 관할 경찰서에 신고 필요', by: '세부 사업내용의 어린이 보호차량 칸' },
    { quote: '차량등록비용, 세금, 보험료(의무가입) 지원기관 자부담', by: '예산 편성의 자부담 행(selfReg·selfIns)' },
    { quote: '차량유지 및 운영·관리, 서비스 제공을 위한 부대비용 자부담', by: '예산 편성의 정비·연료비 행' },
    { quote: '지원 후 5년간 매년 연간보고서를 제출', by: '사업 진행 일정의 연간보고서 행' },
    { quote: '1개 차종만 선택', by: '선택지 car(하나만 선택)' },
    { quote: '42,000,000원/대', by: '선택지 unitCost, 점검식 apply' },
    { quote: '2027. 1. ~ 2031. 12.', by: '사업기간 칸(years)' },
    { quote: '신청내용은 사실에 근거하여야', by: '신뢰성 점검표 동의 문구' },
    { quote: '사업자등록증 또는 고유번호증 사본', by: '첨부서류 표' }
  ],

  // 공고문 신청자격·제외 대상. fact는 신청기관에게 묻는 항목이다.
  requirements: [
    { id: 'nonprofit', label: '비영리 기관·시설·단체', fact: 'nonprofit', op: 'is', value: 'yes', required: true, file: '공고문 신청자격', quote: '비영리 기관·시설·단체' },
    { id: 'multicultural', label: '다문화가족지원사업을 진행하고 있다', fact: 'multicultural', op: 'is', value: 'yes', required: true, file: '공고문 신청자격', quote: '다문화가족지원사업을 진행하고 있는' },
    { id: 'founded', label: '2025. 8. 17. 이전에 설립(허가)를 마쳤다', fact: 'founded', op: 'date<=', value: '2025-08-17', required: true, file: '공고문 신청자격 ①', quote: '2025. 8. 17. 이전에 설립(허가) 완료된' },
    { id: 'noCar5y', label: '최근 5년간 차량 지원을 받지 못했다', fact: 'carSupport5y', op: 'is', value: 'no', required: true, file: '공고문 신청자격 ②', quote: '최근 5년간 사회복지공동모금회 및 기타 지원단체로부터 차량 지원을 받지 못한 기관' },
    { id: 'notGov', label: '정부·지자체가 직접 운영하거나 단체장을 임명하는 기관이 아니다', fact: 'govOperated', op: 'is', value: 'no', required: true, file: '공고문 지원 제외 대상', quote: '정부 또는 지방자치단체가 직접 운영하거나 단체장을 임명하는 기관·단체' },
    { id: 'noDup', label: '같은 사업으로 다른 곳의 지원을 받았거나 확정되지 않았다', fact: 'dupSupport', op: 'is', value: 'no', required: true, file: '공고문 지원 제외 대상', quote: '동일한 사업으로 국가·지방자치단체 또는 다른 지원기관으로부터 지원을 받았거나 받기로 확정된 기관' },
    { id: 'notForProfit', label: '영리를 주된 목적으로 하지 않는다', fact: 'forProfit', op: 'is', value: 'no', required: true, file: '공고문 지원 제외 대상', quote: '영리를 주된 목적으로 하는 사업' },
    { id: 'noPolReligion', label: '정치·종교적 목적에 이용될 수 있는 경우가 아니다', fact: 'polReligion', op: 'is', value: 'no', required: true, file: '공고문 지원 제외 대상', quote: '정치·종교적 목적에 이용될 수 있는 경우' },
    { id: 'noWarning', label: '모금회 평가결과로 배분대상에서 제외되지 않았다', fact: 'evalWarning', op: 'is', value: 'no', required: true, file: '공고문 지원 제외 대상', quote: '모금회 평가결과' },
    { id: 'noOpenSanction', label: '회계부정·학대·성폭력 처분이 종결되지 않은 것이 없다', fact: 'openSanction', op: 'is', value: 'no', required: true, file: '공고문 지원 제외 대상', quote: '회계부정 또는 학대·성폭력 등의 인권침해로 형사 또는 행정 처분을 받고' },
    { id: 'users', label: '차량으로 서비스할 이용자가 1명 이상이다', fact: 'users', op: 'num>=', value: 1, required: false, file: '배분신청서 안내', quote: '' , assumed: true },
    { id: 'driver', label: '차량을 운전할 인력이 있다(가정)', fact: 'drivers', op: 'num>=', value: 1, required: false, file: '정의에서 가정', quote: '', assumed: true },
    { id: 'parking', label: '차량을 보관할 장소가 있다(가정)', fact: 'parking', op: 'is', value: 'yes', required: false, file: '정의에서 가정', quote: '', assumed: true }
  ],
  // 가상 시험 데이터 — 이름 앞에 〔가상〕이 붙고 실제 기관이 아니다
  scenarios: {
    sufficient: ['적격 기관 충분', [
      { name: '〔가상〕A센터', users: 24, facts: { nonprofit: 'yes', multicultural: 'yes', founded: '2018-03-01', carSupport5y: 'no', govOperated: 'no', dupSupport: 'no', forProfit: 'no', polReligion: 'no', evalWarning: 'no', openSanction: 'no', users: '24', under13: '10', drivers: '1', parking: 'yes' } },
      { name: '〔가상〕B센터', users: 4, facts: { nonprofit: 'yes', multicultural: 'yes', founded: '2020-06-10', carSupport5y: 'no', govOperated: 'no', dupSupport: 'no', forProfit: 'no', polReligion: 'no', evalWarning: 'no', openSanction: 'no', users: '4', under13: '0', drivers: '1', parking: 'yes' } },
      { name: '〔가상〕C센터', users: 30, facts: { nonprofit: 'yes', multicultural: 'yes', founded: '2025-12-01', carSupport5y: 'no', govOperated: 'no', dupSupport: 'no', forProfit: 'no', polReligion: 'no', evalWarning: 'no', openSanction: 'no', users: '30', under13: '12', drivers: '1', parking: 'yes' } }
    ]],
    children: ['어린이 이용자 포함(같은 4명이라도 차종이 달라짐)', [
      { name: '〔가상〕G센터', users: 4, facts: { nonprofit: 'yes', multicultural: 'yes', founded: '2019-05-01', carSupport5y: 'no', govOperated: 'no', dupSupport: 'no', forProfit: 'no', polReligion: 'no', evalWarning: 'no', openSanction: 'no', users: '4', under13: '3', drivers: '1', parking: 'yes' } }
    ]],
    none: ['적격 기관 없음', [
      { name: '〔가상〕D기관', users: 12, facts: { nonprofit: 'yes', multicultural: 'yes', founded: '2015-01-01', carSupport5y: 'yes', govOperated: 'no', dupSupport: 'no', forProfit: 'no', polReligion: 'no', evalWarning: 'no', openSanction: 'no', users: '12', drivers: '1', parking: 'yes' } },
      { name: '〔가상〕E기관', users: 9, facts: { nonprofit: 'yes', multicultural: 'yes', founded: '2016-01-01', carSupport5y: 'no', govOperated: 'yes', dupSupport: 'no', forProfit: 'no', polReligion: 'no', evalWarning: 'no', openSanction: 'no', users: '9', drivers: '1', parking: 'yes' } }
    ]],
    unknown: ['자격 미확인', [
      { name: '〔가상〕F센터', users: 15, facts: { nonprofit: 'yes', multicultural: '', founded: '', carSupport5y: 'no', govOperated: '', dupSupport: 'no', forProfit: 'no', polReligion: 'no', evalWarning: '', openSanction: 'no', users: '15', drivers: '', parking: '' } }
    ]]
    },
  applicantFields: [
    ['nonprofit', '비영리 기관·시설·단체인가', yn], ['multicultural', '다문화가족지원사업을 하고 있는가', yn], ['founded', '설립(허가)일 (예: 2019-03-01)', 'text'],
    ['carSupport5y', '최근 5년간 차량 지원을 받았는가', yn], ['govOperated', '정부·지자체가 직접 운영하는가', yn], ['dupSupport', '같은 사업으로 다른 지원을 받았는가', yn],
    ['forProfit', '영리가 주된 목적인가', yn], ['polReligion', '정치·종교 목적에 이용될 수 있는가', yn], ['evalWarning', '모금회 평가 「경고」 이상 조치로 제외 대상인가', yn],
    ['openSanction', '회계부정·학대·성폭력 처분이 종결되지 않았는가', yn], ['users', '차량 이용자 수(명)', 'number'], ['under13', '그중 만 13세 미만 어린이(명)', 'number'], ['drivers', '운전 가능 인력(명)', 'number'], ['parking', '차량 보관 장소가 있는가', yn]
  ],

  facts: {
    agency: ['기관명', '신청기관 이름은?', '다문화가족지원센터(가칭)'],
    bizNo: ['고유번호(사업자등록번호)', '고유번호 또는 사업자등록번호는?', '000-00-00000'],
    rep: ['대표자', '대표자 성명은?', '○○○(가명)'],
    phone: ['전화번호', '대표 전화번호는?', '062-000-0000'],
    email: ['E-mail', '이메일은?', 'sample@example.org'],
    address: ['주소', '기관 주소는?', '광주광역시 ○○구 ○○로 00 (가칭)'],
    foundedDate: ['설립연월일', '설립연월일은?', '2018년 3월 1일'],
    staffing: ['직원 현황', '총 직원 수와 상근·비상근 인원은?', '총 6명(상근 4 · 비상근 2)'],
    mainBiz: ['기관 주요 사업', '주요 사업 구분은?', '⑩ 다문화지원, ⑧ 가족복지'],
    operatorType: ['운영주체 성격', '운영주체 성격은?', '② 사단법인'],
    finance: ['결산·예산(세입·세출)', '최근 결산과 올해 예산의 세입·세출 금액은?', '결산 세입 총계 120,000,000원 / 세출 총계 118,000,000원 (가상)'],
    trust: ['신뢰성 점검표 응답', '현재 회계부정·학대·성폭력 등 인권침해 사안이 있습니까?', '가. 해당없음'],
    acc1: ['회계관리 1번(기준 마련)', '회계 기준을 마련해 따르고 있습니까?', '예'],
    acc2: ['회계관리 2번(확인·승인 절차)', '단일 담당자 결정을 막는 확인·승인 절차가 있습니까?', '예'],
    acc3: ['회계관리 3번(증빙 보관)', '견적서·영수증 등 증빙을 갖추어 보관합니까?', '예'],
    problem: ['현재 어려움', '현재 어떤 어려움에 직면해 있습니까? 어떤 문제 때문에 차량을 신청합니까?', '다문화가족이 읍면 지역에 흩어져 살아 센터까지 오갈 교통수단이 없어 서비스를 받지 못하는 가정이 많다.'],
    noSupport: ['지원받지 못하면', '지원받지 못하면 어떤 상황이 벌어집니까?', '이용 가정의 방문을 직원 개인 차량에 의존하게 되어 안전·보험 문제가 생기고, 이용자 수를 늘릴 수 없다.'],
    effect: ['차량 지원의 기대효과', '본 사업으로 문제점이 어떻게 개선됩니까?', '이동이 어려운 가정이 정기적으로 한국어 교육과 상담에 참여하고, 아동이 안전하게 통학·체험을 할 수 있다.'],
    existingCars: ['보유 차량', '현재 보유한 차량의 차종, 연식, 배기량, 승차정원, 용도, 지원주체, 차량번호는? (없으면 「없음」)', '없음'],
    usersWho: ['이용 대상', '이용자는 누구입니까?', '다문화가족의 아동·청소년과 보호자(한국어 교육, 상담, 통학 지원 대상)'],
    safety: ['안전관리 계획', '탑승 안전과 운행 관리는 어떻게 합니까?', '운행 일지 작성, 탑승 인원 확인, 운행 전후 점검, 안전교육 연 2회'],
    parking: ['차량 보관·정비', '차량 보관 장소와 정비 방법은?', '기관 전용 주차장 보관, 반기별 정기점검'],
    driver: ['운전원', '운전을 맡을 인력의 성명(또는 채용 계획)은?', '○○○(가명) 전담 운전원 1명'],
    managerName: ['담당자 성명', '신청 담당자 성명은?', '○○○(가명)'],
    managerTitle: ['담당자 직위', '담당자 직위는?', '팀장'],
    managerPhone: ['담당자 직통전화', '담당자 직통전화는?', '062-000-0001'],
    region: ['대상 지역', '차량으로 서비스할 대상 지역은?', '광주광역시 ○○구 일대(가칭)'],
    agenda: ['어젠다(사업구분·C-SDGs)', '사업구분과 모금회 지속가능발전목표(C-SDGs)는?', '위기대응 — 지속가능한 지역사회 인프라 구축'],
    goals: ['성과목표', '성과목표가 있으면 적어 주세요. (없으면 공란)', '이용 가정의 정기 서비스 참여율 80% 이상'],
    bizName: ['세부 사업명', '지원차량으로 시행하는 세부 사업명은?', '다문화가족 찾아가는 이동복지'],
    bizDesc: ['세부 사업 주요 내용', '그 사업의 주요 내용은?', '한국어 교육·상담 이동 지원, 아동 통학·체험 지원'],
    fax: ['FAX', '팩스 번호는?', '062-000-0002'],
    homepage: ['홈페이지', '기관 홈페이지 주소는?', 'https://example.org'],
    corpName: ['운영법인(단체)명·대표명', '운영법인 또는 단체명과 대표자명은? (없으면 「운영법인없음」)', '운영법인없음'],
    orgChart: ['조직도', '조직도를 어떻게 첨부합니까? (파일명 또는 요약)', '대표 – 센터장 – 팀장 – 운전원·상담원 (별도 파일 첨부)']
  },
  preservedVirtual: '구입한 차량으로 향후 어떤 사업을 하고 어떻게 사후관리·유지보수하겠다는 계획을 사용자가 직접 쓴다(가상 예시).',

  parts: [
    { id: 'head', title: '배분신청서', noHeader: true, rows: [
      ['기부자명', '한국수출입은행'], ['기관명', '{{agency}} (고유번호 {{bizNo}})'], ['사업명', '2026년도 한국수출입은행 다문화 차량지원사업'],
      ['대상 지역', '{{region}}'],
      ['차종 선택(1개 차종만)', "스타리아(어린이보호차량) {{=car.key == 'stariah' ? '[○]' : '[  ]'}} / 레이 {{=car.key == 'ray' ? '[○]' : '[  ]'}}"],
      ['사업수행 인력', '{{=staffCount}}명'], ['사업기간', '2027년 1월 1일 ~ 2031년 12월 31일 (총 {{=years}}년)'],
      ['참여자 구분', '④ 여성/다문화'], ['핵심 참여자 인원수', '{{=users}}명'],
      ['어젠다(사업구분 · C-SDGs)', '{{agenda}}'], ['성과목표(해당사항이 없으면 공란)', '{{goals}}'],
      ['주요 사업내용(지원차량으로 시행하는 프로그램)', '세부 사업명: {{bizName}} / 주요 내용: {{bizDesc}}'],
      ['사업비', '총 사업비 {{=money(total)}} / 신청금액 {{=money(apply)}}'],
      ['신청금액 세부내역', '사업비 {{=money(apply)}} (100%) / 인건비 0원 (0%) / 관리운영비 0원 (0%)'],
      ['담당자', '성명 {{managerName}} · 직위 {{managerTitle}} · 직통전화(사무실) {{managerPhone}} · FAX {{fax}}'],
      ['신청', '위와 같이 2026년도 사업을 신청합니다. 2026년   월   일   기관대표자: {{rep}} (인)   사회복지공동모금회장 귀하']
    ] },
    { id: 'org', title: '신청기관 현황', noHeader: true, rows: [
      ['기관명 / 대표자', '{{agency}} / {{rep}}'], ['고유번호 / 전화번호', '{{bizNo}} / {{phone}}'], ['E-mail / FAX / 홈페이지', '{{email}} / {{fax}} / {{homepage}}'], ['주소', '{{address}}'],
      ['설립연월일', '{{foundedDate}}'], ['직원 현황', '{{staffing}}'], ['기관 주요 사업', '{{mainBiz}}'], ['운영법인 또는 단체(법인(단체)명 · 대표명)', '{{corpName}}'], ['운영주체 성격', '{{operatorType}}'], ['결산·예산', '{{finance}}']
    ], lines: ['신청기관 조직도, 운영위원회 및 운영법인 이사회 명단은 별도 첨부'] },
    { id: 'trust', title: '신청기관 신뢰성 점검표', rows: [
      ['문항', '응답'],
      ['1. 현재(신청일 기준) 회계부정, 학대·성폭력 등 인권침해 사안으로 조사/수사/재판 진행, 처분 미확정, 처분 후 조치 미완료 사실', '{{trust}}'],
      ['동의사항', '신청 이후 변경·신규 사안은 즉시 통보하며, 사실과 다르면 배분취소·환수·지원중단이 있을 수 있음에 동의합니다. □']
    ], lines: ['기관명 및 기관대표자: {{agency}} {{rep}} (인)'] },
    { id: 'acct', title: '신청기관 회계관리 점검표', rows: [
      ['연번', '문항', '응답'],
      ['1', '회계업무(수입·지출) 기준을 마련해 그에 따라 처리하고 있습니까?', '{{acc1}}'],
      ['2', '단일 담당자 결정이 되지 않도록 확인 또는 승인 절차를 운영하고 있습니까?', '{{acc2}}'],
      ['3', '견적서·영수증 등 증빙자료를 갖추어 보관하고 있습니까?', '{{acc3}}']
    ], lines: ['기관명 및 기관대표자: {{agency}} {{rep}} (인)'] },
    { id: 'plan-head', title: '<기능보강> 사업계획서', noHeader: true, rows: [
      ['기관명', '{{agency}}'], ['사업명', '2026년도 한국수출입은행 다문화 차량지원사업'], ['사업기간', '2027년 1월 1일 ~ 2031년 12월 31일 (총 {{=years}}년)'],
      ['사업비', '총 사업비 {{=money(total)}} / 신청금액 {{=money(apply)}} (사업비 {{=money(apply)}}, 관리운영비 0원)']
    ] },
    { id: 'need', item: '지원 필요성', title: '1. 지원 필요성', lines: ['{{agency}}는 다문화가족지원사업을 하는 비영리 기관으로, 찾아가는 복지를 위해 {{=car.label}} 1대를 신청한다.'] },
    { id: 'problem', item: '주요 문제점', title: '가. 주요 문제점', lines: ['현재 어려움: {{problem}}', '지원받지 못하면: {{noSupport}}'] },
    { id: 'effect', item: '차량 지원의 기대효과', title: '나. 차량 지원의 기대효과', lines: ['{{effect}}', '차량이 생기면 이용자 {{=users}}명이 주 {{=weeklyRuns}}회, 연 {{=num(yearRuns)}}회 운행으로 서비스를 받는다.'] },
    { id: 'cars', title: '다. 관련 현황(해당 사항만 기재) — 자동차(기 보유차량 관련 정보)', rows: [
      ['차종', '연식', '배기량', '승차정원', '현재 사용용도', '지원주체', '비고(차량번호)'], ['{{existingCars}}', '', '', '', '', '', '']
    ], lines: ['기존 차량이 있으면 차량 전·후·좌·우, 실내, 계기판(주행거리 식별 가능) 사진을 첨부한다.'] },
    { id: 'biz', item: '사업내용', title: '2. 사업내용', lines: ['사업명: 다문화가족을 찾아가는 {{=car.label}} 이동복지', '사업목적: 이동이 어려운 다문화가족이 한국어 교육·상담·통학 지원을 받도록 차량을 운행한다.'] },
    { id: 'users', item: '이용 대상 및 인원', title: '가. 이용 대상 및 인원', lines: ['이용자: {{usersWho}}', '인원: {{=users}}명 (참여자 구분 ④ 여성/다문화)'] },
    { id: 'ops', item: '세부 사업내용 (해당 사항만 기재)', title: '나. 세부 사업내용 (해당 사항만 기재)', rows: [
      ['구분', '내용'],
      ['차종·탑승', '{{=car.label}}, 승차정원 {{=car.seats}}인승 — 운전자·동승자를 빼고 한 번에 {{=passengers}}명 탑승(가정)'],
      ['이용 횟수', '이용자 {{=users}}명 × 주 {{=usesPerUserWeek}}회 = 주 {{=weeklyUserTrips}}명회'],
      ['운행 횟수', '주 {{=weeklyRuns}}회 운행 → 연 {{=num(yearRuns)}}회 (연 {{=weeks}}주)'],
      ['운행 가능 범위', "주 최대 {{=maxRunsPerWeek}}회 대비 {{=weeklyRuns <= maxRunsPerWeek ? '여유 있음' : '초과 — 차종·이용자 수 재검토'}}"],
      ['어린이 보호차량', "만 13세 미만 이용자 {{=under13}}명 — {{=under13 > 0 ? '어린이 보호차량 이용 필수, 관할 경찰서 신고 필요(도로교통법 시행령·시행규칙)' : '해당 없음'}}"],
      ['안전관리', '{{safety}}'], ['차량 보관·정비', '{{parking}}']
    ] },
    { id: 'staff', item: '사업수행인력', title: '다. 사업수행인력', rows: [
      ['직위', '성명', '담당 업무'], ['운전원', '{{driver}}', '차량 운행·안전'], ['담당자', '{{managerName}} ({{managerTitle}})', '신청·정산·연간보고']
    ], lines: ['사업수행 인력 {{=staffCount}}명'] },
    { id: 'schedule', item: '사업 진행 일정', title: '라. 사업 진행 일정 (추진 내용별 일정)', rows: [
      ['시기', '추진 내용'],
      ['2027. 1. ~ 3.', '차량 인수·등록·의무보험 가입, 운행 규칙과 안전교육 정비'],
      ['2027. 4. ~', '운행 개시 — 주 {{=weeklyRuns}}회'],
      ['매년 상·하반기', '정기 점검·정비'],
      ['매년', '연간보고서 제출 ({{=years}}년간)'],
      ['2031. 12.', '사업 종료 및 최종 보고']
    ] },
    { id: 'budget', item: '예산 편성', title: '마. 예산 편성', rows: [
      ['구분', '항목', '산출 근거', '금액(원)', '부담'],
      ['신청금액', '차량구입비', '{{=car.label}} 1대 × {{=money(car.unitCost)}}', '{{=num(apply)}}', '모금회'],
      ['자부담', '취·등록세, 세금', '견적 기준(가정)', '{{=num(car.selfReg)}}', '기관'],
      ['자부담', '보험료(의무가입)', '{{=money(car.selfIns)}} × {{=years}}년', '{{=num(insurance5)}}', '기관'],
      ['자부담', '정기점검·정비', '{{=money(maintYear)}} × {{=years}}년', '{{=num(maint5)}}', '기관'],
      ['자부담', '연료비', '{{=money(fuelPerRun)}} × 연 {{=num(yearRuns)}}회 × {{=years}}년', '{{=num(fuel5)}}', '기관'],
      ['합계', '총 사업비 = 신청금액 + 자부담', '', '{{=num(total)}}', '']
    ], lines: ['신청금액 세부내역: 사업비 {{=money(apply)}} (100%), 관리운영비 0원 (0%) — 관리운영비(세금·보험료)는 자부담에 기입한다.', '스타리아와 레이는 중복 접수할 수 없어 {{=car.label}} 하나만 신청한다.'] },
    { id: 'org-chart', item: '조직도', title: '1. 조직도 (첨부서류 3)', lines: ['신청기관 조직도: {{orgChart}}', '이사회 및 운영위원회 명단은 별도 첨부한다. 운영법인이 없으면 「운영법인없음」으로 적는다.'] },
    { id: 'photo', title: '기관 전경 사진', area: { title: '기관 내부(주사업장·사무실)·외부 전경 사진 각 1장', rows: [['내부 전경', '외부 전경'], ['[사진 붙임]', '[사진 붙임]']] } },
    { id: 'attach', title: '배분신청시 첨부서류', rows: [
      ['번호', '서류', '비고'], ['1', '고유번호증 또는 사업자등록증 사본', ''], ['2', '시설신고증, 법인등기부등본(운영법인이 있는 경우, 발급 3개월 이내)', ''],
      ['3', '신청기관 조직도, 운영위원회 및 운영법인 이사회 명단', ''], ['4', '개인정보 수집·이용 및 제공 동의서(담당자용)', '']
    ], lines: ['제출 파일 이름 규칙은 점검 결과에 표시한다. 압축파일은 10MB를 넘으면 첨부되지 않는다.'] },
    { id: 'consent', title: '개인정보 수집·이용 및 제공 동의서(신청기관 담당자용)', rows: [
      ['성명', '동의 여부', '날인'], ['{{managerName}}', '동의함 □   동의하지 않음 □', '(인) — 직인이 아니라 사업담당자 날인, 필수']
    ], lines: ['사회복지공동모금회장 귀하'] }
  ]
};
