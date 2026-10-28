import type { Lang } from './types'

/**
 * KR/EN 토글. 와이어프레임 공통 UI 규칙 — 전 화면 우상단에 KR·EN 토글.
 * 근거: wiki/spec/screen-spec.md "공통 UI 규칙"
 */
const dict = {
  appTitle: { ko: 'EuroLogix Risk Sensing Calendar', en: 'EuroLogix Risk Sensing Calendar' },

  // 형태 비교 토글 (→ Q-025). 하나로 정해지면 나머지는 지운다.
  viewMode: { ko: '보기 형태', en: 'View mode' },
  viewMonth: { ko: '월 캘린더', en: 'Month' },
  viewMap: { ko: '분포도', en: 'Map' },
  viewList: { ko: '임박순', en: 'By urgency' },
  mapHint: {
    ko: '타일 = 국가(감시 대상 42개국) · 색 = 최고 위험도 · 숫자 = 건수 · 클릭하면 그 국가만 봅니다.',
    en: 'One tile per monitored country (42) · colour = max severity · number = count · click to filter.',
  },
  mapGuideTitle: { ko: '분포도 읽는 법', en: 'How to read this map' },
  mapGuideColor: { ko: '색 — 그 나라에서 이번 달 가장 높은 위험도', en: 'Colour — highest severity in that country this month' },
  mapGuideLow: { ko: '초록(1~2) 낮음 · 운송 영향 적음', en: 'Green (1–2) Low · little impact on transport' },
  mapGuideMid: { ko: '노랑(3) 보통 · 일정 조정 검토', en: 'Amber (3) Medium · consider adjusting the plan' },
  mapGuideHigh: { ko: '빨강(4~5) 높음 · 우회나 일정 변경 필요', en: 'Red (4–5) High · reroute or reschedule' },
  mapGuideNone: { ko: '회색 — 이번 달 등록된 이벤트 없음', en: 'Grey — no events registered this month' },
  mapGuideNumber: { ko: '숫자 — 이벤트 건수', en: 'Number — event count' },
  mapGuideNumberDesc: { ko: '그 나라에 걸린 이벤트 수입니다. 유형 필터를 걸면 그 기준으로 다시 셉니다.', en: 'Events in that country. Recounted whenever a type filter is applied.' },
  byCountryTitle: { ko: '국가별 상세', en: 'Details by country' },
  mapUnmapped: { ko: '위치 미등록 국가', en: 'Countries without a position' },
  urgentBadge: { ko: '오늘~3일 내 심각', en: 'severe within 3 days' },

  // 운송수단 (events.transport_mode) — four-risk-types의 운송수단별 매핑 참조
  modeRoad: { ko: '도로', en: 'Road' },
  modeRail: { ko: '철도', en: 'Rail' },
  modeAir: { ko: '항공', en: 'Air' },
  modeSea: { ko: '해상', en: 'Sea' },
  colMode: { ko: '운송수단', en: 'Mode' },
  colPeriod: { ko: '기간', en: 'Period' },
  colEvent: { ko: '이벤트', en: 'Event' },
  colUpdated: { ko: '갱신', en: 'Updated' },
  colTime: { ko: '시간', en: 'Time' },
  pickSearch: { ko: '검색', en: 'Search' },
  // 상단 내비게이션
  navCalendar: { ko: '리스크 캘린더', en: 'Risk Calendar' },
  navRoute: { ko: '경로 분석', en: 'Route Analysis' },
  navAdmin: { ko: '관리자', en: 'Admin' },
  navInfo: { ko: '안내', en: 'Info' },

  // 2b 경로 분석 — 2026-09-05 실데이터 전환. 목업 문구는 남은 "준비중" 자리에만 쓴다
  // routeScopeNote(좌표 없음 안내)는 2026-10-14에 사용자 요청으로 뺐다.
  routeInput: { ko: '경로 정보', en: 'Route' },
  transportType: { ko: '운송 타입', en: 'Transport' },
  origin: { ko: '출발지', en: 'Origin' },
  waypoint: { ko: '경유지', en: 'Waypoint' },
  addWaypoint: { ko: '경유지 추가', en: 'Add waypoint' },
  removeWaypoint: { ko: '경유지 삭제', en: 'Remove waypoint' },
  destination: { ko: '도착지', en: 'Destination' },
  departDate: { ko: '출발일', en: 'Departure' },
  // 2026-10-14: '기간'→'리드타임'. 출발일부터 도착까지 걸리는 날수라는 뜻을 분명히 한다
  duration: { ko: '리드타임', en: 'Lead time' },
  days: { ko: '일', en: 'days' },
  runAnalysis: { ko: '분석 실행', en: 'Run analysis' },
  analysisResult: { ko: '분석 결과', en: 'Analysis result' },
  basedOn: { ko: '기준', en: 'basis' },
  routeMap: { ko: '경로 구간', en: 'Route segments' },
  notApplicable: { ko: '해당 없음', en: 'None' },
  routeIdle: {
    ko: '출발지·도착지를 고르고 분석 실행을 누르세요',
    en: 'Pick an origin and destination, then run the analysis',
  },
  routeLoading: { ko: '불러오는 중…', en: 'Loading…' },
  routeError: { ko: '데이터를 불러오지 못했습니다', en: 'Could not load data' },
  routeNeedInput: {
    ko: '출발지와 도착지 나라를 먼저 고르세요',
    en: 'Pick the origin and destination country first',
  },
  routeSampleNote: {
    ko: '샘플 데이터입니다 — Supabase에 연결되지 않았습니다',
    en: 'Sample data — not connected to Supabase',
  },
  routeGradeNone: { ko: '해당 이벤트 없음', en: 'No matching events' },
  routeCountsHigh: { ko: '위험', en: 'High' },
  routeCountsMid: { ko: '주의', en: 'Medium' },
  routeCountsLow: { ko: '정보', en: 'Low' },
  routeItems: { ko: '건', en: '' },
  routeRelevant: { ko: '경로에 걸리는 이벤트', en: 'Events on this route' },
  routeNoEvents: {
    ko: '이 기간에 이 경로 국가들에 등록된 이벤트가 없습니다',
    en: 'No events registered for these countries in this period',
  },
  routeExcluded: { ko: '이 운송수단과 무관', en: 'Not relevant to this transport mode' },
  routeExcludedNote: {
    ko: '선택한 운송 타입과 맞지 않아 등급 계산에서는 뺐습니다. 운송수단을 바꿀 때 판단 근거가 되므로 지우지 않고 남겨 둡니다.',
    en: 'Excluded from the grade because it does not match the selected transport mode. Kept visible because it is the reason a mode switch would or would not help.',
  },
  // 대체 경로 — 2026-10-14 신설. 국경표(routeGraph)로 계산한다
  altRoutes: { ko: '경로 비교', en: 'Route comparison' },
  altNote: {
    ko: '국경 통과 수로만 비교합니다. 거리·소요시간 데이터가 없어 "어느 쪽이 빠른지"는 계산하지 않습니다.',
    en: 'Compared by number of border crossings only. We have no distance or transit-time data, so this does not say which route is faster.',
  },
  altBase: { ko: '기본', en: 'Main' },
  altAlt: { ko: '대체', en: 'Alt' },
  altSafest: { ko: '위험 최저', en: 'Lowest risk' },
  altBorders: { ko: '국경', en: 'borders' },
  altFerry: { ko: '페리·터널', en: 'ferry/tunnel' },
  altPick: { ko: '이 경로로 보기', en: 'View this route' },
  altOne: {
    ko: '이 구간은 다른 길이 없습니다 — 국경표로 찾은 경로가 하나뿐입니다.',
    en: 'No alternative for this leg — the border map finds only one route.',
  },
  routeTransit: { ko: '통과', en: 'Transit' },
  routeTransitNote: {
    ko: '출발·도착 사이에 실제로 지나는 나라를 국경표로 채워 넣습니다. 직접 고르지 않은 나라는 "통과"로 표시됩니다.',
    en: 'Countries actually crossed between origin and destination are filled in from the border map. Ones you did not pick are marked "Transit".',
  },
  routeDirectNote: {
    ko: '항공·해상은 출발·도착 국가만 봅니다. 중간 통과 국가는 계산하지 않습니다.',
    en: 'For air and sea we look at the origin and destination countries only — transit countries are not computed.',
  },
  routeBlocked: {
    ko: '육로로 이을 수 없는 구간이 있습니다. 운송 타입을 항공 또는 해상으로 바꿔 보세요. 아래는 고르신 나라만 본 결과입니다.',
    en: 'This route cannot be completed overland. Try air or sea. Below shows only the countries you picked.',
  },

  // 엑셀 일괄 조회 — 2026-10-14 신설
  tabSingle: { ko: '한 건 조회', en: 'Single route' },
  tabBatch: { ko: '여러 건 (엑셀)', en: 'Multi route' },
  routeKind: { ko: '조회 방식', en: 'Lookup type' },
  multiTitle: { ko: '여러 건 조회 결과', en: 'Multi-route results' },
  multiIdle: {
    ko: '양식을 받아 노선을 채우고, 파일을 올린 뒤 분석을 실행하세요.',
    en: 'Download the template, fill in your routes, upload it, then run the analysis.',
  },
  multiReady: { ko: '파일을 읽었습니다. 분석을 실행하세요.', en: 'File read. Run the analysis.' },
  multiNeedFile: { ko: '먼저 채운 양식을 올려 주세요.', en: 'Upload a filled template first.' },
  multiNote: {
    ko: '한 줄은 기본(가장 짧은) 경로 기준입니다. 대체 경로까지 보려면 "전 경로 CSV"를 받으세요.',
    en: 'Each row shows the default (shortest) route. Download "All routes CSV" to compare every alternative route.',
  },
  batchExSkipped: { ko: '개 견본 줄은 건너뜀', en: 'example rows skipped' },
  tabAll: { ko: '전 구간', en: 'All pairs' },
  allHow: {
    ko: '출발·도착을 입력하지 않고 허브와 모든 국가 사이의 위험을 한 번에 봅니다. 기간은 오늘부터',
    en: 'See the risk between a hub and every country at once, without entering a route. Period: from today for',
  },
  allDays: { ko: '일이고, 위험이 있는 쌍만 보여줍니다.', en: 'days. Only pairs with a risk are listed.' },
  allHub: { ko: '허브', en: 'Hub' },
  allDirection: { ko: '방향', en: 'Direction' },
  allDirBoth: { ko: '출고 + 입고 (허브 ↔ 모든 국가)', en: 'Outbound + inbound (hub ↔ every country)' },
  allDirOut: { ko: '출고만 (허브 → 모든 국가)', en: 'Outbound only (hub → every country)' },
  allDirIn: { ko: '입고만 (모든 국가 → 허브)', en: 'Inbound only (every country → hub)' },
  allRun: { ko: '전 구간 위험 보기', en: 'Show risk for all pairs' },
  allTitle: { ko: '전 구간 위험', en: 'Risk across all pairs' },
  allIdle: {
    ko: '허브와 운송수단을 고르고 실행하세요. 위험이 있는 구간만 나옵니다.',
    en: 'Pick a hub and transport type, then run. Only pairs with a risk are listed.',
  },
  allNone: { ko: '이 기간에 위험이 있는 쌍이 없습니다.', en: 'No pair has a risk in this period.' },
  allScanned: { ko: '쌍을 검토해 위험이 있는 것만 남겼습니다', en: 'pairs checked; only those with a risk are listed' },
  allShowing: { ko: '위 표는 위험이 높은 순으로 일부만 보여줍니다. 전체는 CSV로 받으세요.', en: 'The table shows the highest-risk rows only. Download the CSV for everything.' },
  multiRoutes: { ko: '개 노선', en: 'routes' },
  multiSorted: { ko: '위험이 높은 순 · 줄을 누르면 상세', en: 'Highest risk first · click a row for details' },
  multiOptions: { ko: '경로별 위험', en: 'Risk by route option' },
  multiMain: { ko: '기본', en: 'Main' },
  multiAlt: { ko: '대체', en: 'Alt' },
  multiBorders: { ko: '국경 통과', en: 'borders' },
  multiLower: { ko: '더 낮은 위험', en: 'Lower risk' },
  multiEvents: { ko: '기본 경로에 걸린 이벤트', en: 'Events on the main route' },
  multiMore: { ko: '건 더 있음 — CSV에서 확인', en: 'more — see the CSV' },
  multiOpenSingle: { ko: '한 건 조회에서 전체 분석 보기', en: 'Open in single route view' },
  csvSummary: { ko: '요약 CSV', en: 'Summary CSV' },
  csvSummaryHint: {
    ko: '노선당 1줄 — 기본 경로의 위험 등급과 주요 원인',
    en: 'One row per route — default route risk level and main driver',
  },
  csvAllRoutes: { ko: '전 경로 CSV', en: 'All routes CSV' },
  coverageNote: {
    ko: '"해당 없음"은 수집·검증된 데이터에서 이 국가·기간의 이벤트를 찾지 못했다는 뜻입니다. 위험이 없다는 보장은 아닙니다 (판정은 국가 단위).',
    en: '"None" means no verified event was found in our data for these countries and dates. It does not guarantee the route is risk-free (matching is by country).',
  },
  batchOnlyExamples: {
    ko: '견본 줄만 있습니다. 견본 줄을 지우고 실제 노선을 채워 주세요.',
    en: 'Only the example rows were found. Replace them with your own routes.',
  },
  csvAllHint: {
    ko: '노선마다 계산된 모든 대체 경로의 위험도를 한 줄씩 담습니다',
    en: 'One row per calculated route option, with its risk level',
  },
  batchTemplate: { ko: '양식 받기', en: 'Download template' },
  batchPick: { ko: '파일 선택', en: 'Choose file' },
  batchHowTo: {
    ko: '양식을 받아 노선을 적고 다시 올리면 한 번에 조회합니다. 파일은 서버로 올라가지 않고 이 브라우저 안에서만 읽습니다.',
    en: 'Download the template, fill in your routes and upload it back. The file is read in your browser only — nothing is uploaded.',
  },
  batchPrivacy: {
    ko: '⚠️ 정해진 열만 읽습니다. 화주·오더번호 같은 사내 정보는 적지 마세요 — 읽지도, 결과 파일에 넣지도 않습니다.',
    en: 'Only the template columns are read. Do not put internal data such as customer or order numbers in the file — they are neither read nor written to the result.',
  },
  batchRead: { ko: '읽음', en: 'read' },
  batchProblems: { ko: '확인이 필요한 줄', en: 'Rows that need attention' },
  batchRow: { ko: '행', en: 'Row' },
  batchNoRows: { ko: '읽을 수 있는 노선이 없습니다.', en: 'No usable routes in the file.' },
  batchRun: { ko: '일괄 조회', en: 'Analyse all' },
  batchExport: { ko: '결과 엑셀 받기', en: 'Download results' },
  batchColRoute: { ko: '노선', en: 'Route' },
  batchColPath: { ko: '경로', en: 'Path' },
  batchColWindow: { ko: '기간', en: 'Window' },
  batchColRisk: { ko: '위험', en: 'Risk' },
  batchColDriver: { ko: '주요 원인', en: 'Main driver' },
  batchNone: { ko: '없음', en: 'none' },
  batchBlocked: { ko: '육로 없음', en: 'No overland route' },
  batchBusy: { ko: '조회 중…', en: 'Analysing…' },
  batchFileErr: {
    ko: '엑셀 파일을 읽지 못했습니다. .xlsx 파일인지 확인해 주세요.',
    en: 'Could not read the file. Please check it is an .xlsx workbook.',
  },

  // 2d 위험 보고
  reportTitle: { ko: '위험 보고', en: 'Report a risk' },
  reportSubtitle: {
    ko: '오타를 막기 위해 상세 내용을 뺀 나머지는 선택식입니다',
    en: 'All fields except details are pick-lists, to prevent typos',
  },
  fieldRiskType: { ko: '위험 유형', en: 'Risk type' },
  fieldTransport: { ko: '운송수단', en: 'Transport mode' },
  modeAll: { ko: '전체', en: 'All' },
  fieldCountry: { ko: '나라', en: 'Country' },
  fieldCity: { ko: '도시', en: 'City' },
  otherCity: { ko: '직접 입력', en: 'Other city' },
  otherCityPlaceholder: { ko: '도시명을 입력하세요', en: 'Enter city' },
  fieldDate: { ko: '발생 일자', en: 'Date' },
  fieldTimeRange: { ko: '시간 범위', en: 'Time range' },
  fieldDetail: { ko: '상세 내용', en: 'Details' },
  detailPlaceholder: { ko: '무슨 일이 있었는지 적어주세요', en: 'Describe what happened' },
  submit: { ko: '보고 제출', en: 'Submit' },
  cancel: { ko: '취소', en: 'Cancel' },
  selectPlaceholder: { ko: '선택하세요', en: 'Select…' },
  submitBlocked: {
    ko: '지금은 제출할 수 없습니다 — 저장할 자리가 없습니다',
    en: 'Cannot submit yet — there is nowhere to store this',
  },
  submitBlockedWhy: {
    ko: '아직 저장할 수 없습니다 — risk_candidates의 category 제약이 strike / incident 두 값만 허용하고, 시간 컬럼이 없으며, 브라우저에 쓰기 권한이 열려 있지 않습니다. (Q-021 · Q-022)',
    en: 'Not storable yet — risk_candidates.category allows only strike / incident, it has no time columns, and the browser has no write access. (Q-021, Q-022)',
  },

  // 2e Admin
  kpiPending: { ko: '승인 대기 사용자 보고', en: 'Reports awaiting approval' },
  kpiOngoing: { ko: '진행 중(종료일 미정)', en: 'Ongoing (no end date)' },
  ongoingTitle: { ko: '진행 중 — 종료일 미정', en: 'Ongoing — no end date' },
  ongoingChip: { ko: '진행 중', en: 'Ongoing' },
  ongoingPending: { ko: '승인 대기', en: 'Pending' },
  ongoingEndToday: { ko: '오늘 종료', en: 'End today' },
  ongoingEndPick: { ko: '종료일 지정', en: 'Pick end date' },
  ongoingEndConfirm: { ko: '종료', en: 'End' },
  ongoingEnded: { ko: '종료일을 확정했습니다 — 캘린더에도 반영됩니다', en: 'End date set — the calendar is updated too' },
  ongoingNote: {
    ko: '종료일이 없는 건은 매시간 오늘 날짜까지 자동으로 늘어납니다. 끝났다는 걸 알게 되면 바로 종료를 누르세요 — 이미 캘린더에 오른 건도 함께 고쳐집니다.',
    en: 'Items without an end date are extended to today every hour. End them as soon as you learn they are over — calendar entries are corrected too.',
  },
  kpiApprovedToday: { ko: '오늘 승인 처리', en: 'Approved today' },
  kpiNeedsReview: { ko: '검토 필요 정보', en: 'Items needing review' },
  tblUnverified: { ko: '미검증 사용자 보고', en: 'Unverified user reports' },
  tblAiManaged: { ko: '수집 리스크 정보 관리', en: 'Managed risk data' },
  colType: { ko: '유형', en: 'Type' },
  colWhere: { ko: '나라 · 도시 · 내용', en: 'Location · detail' },
  colWhen: { ko: '발생 일자', en: 'Date' },
  colReporter: { ko: '보고자', en: 'Reporter' },
  colAction: { ko: '처리', en: 'Action' },
  approve: { ko: '승인', en: 'Approve' },
  reject: { ko: '반려', en: 'Reject' },
  edit: { ko: '수정', en: 'Edit' },
  exclude: { ko: '제외', en: 'Exclude' },
  adminEmpty: {
    ko: '승인 대기 항목이 없습니다. 사용자 보고 경로(2d)가 아직 저장되지 않기 때문입니다.',
    en: 'Nothing awaiting approval — the user report path (2d) cannot store data yet.',
  },
  adminNote: {
    ko: '승인은 표시만 합니다. 캘린더에 오르는 것은 다음 파이프라인 실행 때예요 — 매일 07:20 승격, 07:30 판정. 급하면 n8n에서 WF-2c → WF-2를 수동 실행하면 즉시 반영됩니다.',
    en: 'Approving only marks the item. It reaches the calendar on the next pipeline run — 07:20 promote, 07:30 judge, daily. To apply it now, run WF-2c then WF-2 by hand in n8n.',
  },
  adminActionPending: { ko: '수정은 아직 만들지 않았습니다 — 제외 후 다시 등록해 주세요', en: 'Editing is not built yet — exclude it and report again' },

  // 로그인 — 읽기는 공개, 쓰기는 로그인한 사람만 (Q-022 · 사용자 결정 2026-08-27)
  signIn: { ko: '로그인', en: 'Sign in' },
  signOut: { ko: '로그아웃', en: 'Sign out' },
  emailLabel: { ko: '이메일', en: 'Email' },
  passwordLabel: { ko: '비밀번호', en: 'Password' },
  loginTitle: { ko: '관리자 로그인', en: 'Admin sign-in' },
  loginHint: {
    ko: '캘린더는 로그인 없이 볼 수 있습니다. 위험 보고와 승인만 로그인이 필요합니다. 계정은 Supabase 대시보드에서 발급합니다.',
    en: 'The calendar is readable without signing in. Only reporting and approving require an account, issued from the Supabase dashboard.',
  },
  loginRequired: { ko: '보고하려면 로그인이 필요합니다', en: 'Sign in to submit a report' },
  signingIn: { ko: '확인 중…', en: 'Signing in…' },

  // 2d 제출 결과
  reportSubmitted: { ko: '보고했습니다. 승인 전까지 캘린더에 뜨지 않습니다', en: 'Submitted. It will not appear on the calendar until approved.' },
  submitting: { ko: '보내는 중…', en: 'Submitting…' },
  needCountryDateType: { ko: '유형 · 나라 · 날짜는 필수입니다', en: 'Type, country and date are required' },

  // 2e 승인·반려
  rejectReason: { ko: '반려 사유 (선택)', en: 'Reason for rejection (optional)' },
  confirmReject: { ko: '반려 확정', en: 'Confirm' },

  // 처리 이력·제외 (→ 사용자 지적 2026-08-28 "승인 한번 하면 그냥 사라져서 수정이 안 돼")
  recentDecisions: { ko: '오늘 처리한 것', en: 'Handled today' },
  recentDecisionsNote: {
    ko: '되돌리면 다시 승인 대기로 갑니다. 이미 캘린더에 오른 건은 아래 표에서 따로 제외해야 합니다 — 되돌리기만으로는 안 내려갑니다.',
    en: 'Undo returns it to the pending list. If it already reached the calendar, exclude it separately in the table below — undo alone does not remove it.',
  },
  undo: { ko: '되돌리기', en: 'Undo' },
  undone: { ko: '승인 대기로 되돌렸습니다', en: 'Returned to pending' },
  undoneButPromoted: {
    ko: '대기로 되돌렸지만 캘린더에는 아직 남아 있습니다 — 아래 표에서 제외하세요',
    en: 'Returned to pending, but it is still on the calendar — exclude it in the table below',
  },
  promoted: { ko: '캘린더 반영됨', en: 'On calendar' },
  restore: { ko: '복구', en: 'Restore' },
  excludeHint: {
    ko: '캘린더에서 내립니다. 지우지 않으므로 관리자 화면에서 되돌릴 수 있습니다.',
    en: 'Removes it from the calendar. Nothing is deleted — you can restore it from the admin screen.',
  },
  excludedBadge: { ko: '제외됨', en: 'excluded' },
  excludedDone: { ko: '캘린더에서 내렸습니다', en: 'Removed from the calendar' },
  restoredDone: { ko: '다시 표시합니다', en: 'Shown again' },

  // 캘린더 하단 유형 안내 (→ 사용자 제안 2026-08-28)
  riskTypeGuide: { ko: '위험 유형 안내', en: 'Risk types' },
  riskTypeFoot: {
    ko: '검수를 통과한 것만 표시됩니다. 정부·관보·기관 API에서 온 정보는 자동 인정되고, 매체에서 모은 정보는 관리자 승인을 거칩니다.',
    en: 'Only reviewed items are shown. Government, gazette and institutional sources are trusted automatically; anything gathered from media needs an administrator’s approval.',
  },
  decided: { ko: '처리했습니다', en: 'Done' },

  // 날짜 없는 후보 승인 (→ 2026-09-22 사용자 요청)
  noDateChip: { ko: '날짜 없음', en: 'No date' },
  needDatesTitle: { ko: '기간을 입력해야 승인됩니다', en: 'Enter the period to approve' },
  needDatesHint: {
    ko: '기사에 날짜가 없는 건입니다. 원문을 보고 시작일과 종료일을 넣어주세요. 하루짜리면 종료일은 비워두면 됩니다.',
    en: 'This report has no dates. Check the source and enter start and end. Leave end blank for a single day.',
  },
  fieldDateStart: { ko: '시작일', en: 'Start' },
  fieldDateEnd: { ko: '종료일 (선택)', en: 'End (optional)' },
  approveWithDates: { ko: '날짜 넣고 승인', en: 'Approve with dates' },
  addDates: { ko: '날짜 입력', en: 'Add dates' },
  datesSaved: { ko: '날짜를 저장했습니다', en: 'Dates saved' },
  dateStartRequired: { ko: '시작일을 입력하세요', en: 'Enter a start date' },
  dateOrderWrong: { ko: '종료일이 시작일보다 빠릅니다', en: 'End is before start' },
  missingDateWarn: {
    ko: '날짜가 없어 캘린더에 올라가지 못합니다 — 날짜를 넣어주세요',
    en: 'Missing dates — it cannot reach the calendar until you add them',
  },
  candidatesLoadFailed: { ko: '후보를 불러오지 못했습니다', en: 'Could not load candidates' },
  adminLoginNeeded: { ko: '승인 대기 목록은 로그인해야 보입니다', en: 'Sign in to see pending reports' },
  colDetail: { ko: '내용', en: 'Detail' },
  manualBadge: { ko: '직접 입력', en: 'Manual' },
  aiBadge: { ko: 'AI 수집', en: 'AI' },

  // 데이터 기준 시각 · 내보내기 · 국가 선택
  dataAsOf: { ko: '데이터 기준', en: 'Data as of' },
  noData: { ko: '이 범위에 데이터가 없습니다', en: 'No data in this range' },
  cancelledSection: { ko: '취소된 이벤트', en: 'Cancelled' },
  statusUpdated: { ko: '변경됨', en: 'Changed' },
  runOf: { ko: '일 연속 중', en: 'of' },
  dayOrdinal: { ko: '일째', en: 'day' },
  exportCsv: { ko: 'CSV 내보내기', en: 'Export CSV' },
  exported: { ko: 'CSV 파일을 저장했습니다 (엑셀에서 바로 열립니다)', en: 'CSV saved — opens in Excel' },
  myCountry: { ko: '담당 국가', en: 'My country' },
  allLetters: { ko: '전체', en: 'All' },
  searchCountry: { ko: '국가 검색', en: 'Search country' },
  noMatch: { ko: '일치하는 국가가 없습니다', en: 'No matching country' },

  today: { ko: '오늘', en: 'Today' },
  prevMonth: { ko: '이전 달', en: 'Previous month' },
  nextMonth: { ko: '다음 달', en: 'Next month' },

  filterByType: { ko: '유형 필터', en: 'Filter by type' },
  resetFilters: { ko: '필터 초기화', en: 'Reset filters' },
  resetFiltersHint: { ko: '국가·유형·위험도 필터를 모두 해제해 전체를 봅니다', en: 'Clear country, type and severity filters to show everything' },
  filterBySeverity: { ko: '위험도 필터', en: 'Filter by severity' },
  severityFilterLabel: { ko: '위험도', en: 'Severity' },
  mapTodayTitle: { ko: '오늘의 위험', en: "Today's risks" },
  mapTodayEmpty: { ko: '오늘 등록된 위험이 없습니다', en: 'No risks registered today' },
  mapDetailsHint: { ko: '지도에서 국가를 고르면 그 나라만 보입니다', en: 'Pick a country on the map to show only that country' },
  mapClearCountry: { ko: '전체 국가 보기', en: 'Show all countries' },
  mapZoomIn: { ko: '확대', en: 'Zoom in' },
  mapZoomOut: { ko: '축소', en: 'Zoom out' },
  mapZoomReset: { ko: '처음 위치로', en: 'Reset view' },
  mapLoading: { ko: '지도를 불러오는 중…', en: 'Loading map…' },
  mapLoadFailed: { ko: '지도를 불러오지 못했습니다', en: 'Could not load the map' },
  unverified: { ko: '미검증', en: 'Unverified' },

  reportRisk: { ko: '위험 보고', en: 'Report risk' },

  selectDate: { ko: '날짜를 선택하세요', en: 'Select a date' },
  noEvents: { ko: '이 날짜에 등록된 이벤트가 없습니다', en: 'No events on this date' },
  eventsOn: { ko: '건의 이벤트', en: 'events' },
  source: { ko: '출처', en: 'Source' },
  severityLabel: { ko: '위험도', en: 'Severity' },
  nationwide: { ko: '전국', en: 'Nationwide' },
  allDay: { ko: '종일', en: 'All day' },

  allCountries: { ko: '전체 국가', en: 'All countries' },

  loading: { ko: '불러오는 중…', en: 'Loading…' },

  sampleBanner: {
    ko: 'Supabase 미연결 — 샘플 데이터로 표시 중입니다.',
    en: 'Supabase not connected — showing sample data.',
  },
  rlsBanner: {
    ko: '연결은 됐으나 0건이 조회됐습니다. anon 키에 대한 RLS SELECT 정책이 필요할 수 있습니다.',
    en: 'Connected but returned 0 rows. An RLS SELECT policy for the anon role may be required.',
  },
  errorBanner: { ko: '데이터를 불러오지 못했습니다', en: 'Failed to load data' },

  // 시간 경과
  justNow: { ko: '방금', en: 'just now' },
  minutesAgo: { ko: '분 전', en: 'min ago' },
  hoursAgo: { ko: '시간 전', en: 'h ago' },
  daysAgo: { ko: '일 전', en: 'd ago' },
} as const

export type DictKey = keyof typeof dict

export function makeT(lang: Lang) {
  return (key: DictKey): string => dict[key][lang]
}

/**
 * `transport_mode`는 `road,rail` 처럼 쉼표로 여러 값이 올 수 있다 (→ data-model #11).
 * DB에 CHECK 제약이 없어 예상 밖 값이 들어올 수 있으므로 모르는 값은 원문 그대로 둔다.
 */
export function transportLabel(mode: string, lang: Lang): string {
  const t = makeT(lang)
  const map: Record<string, string> = {
    road: t('modeRoad'),
    rail: t('modeRail'),
    air: t('modeAir'),
    sea: t('modeSea'),
  }
  return mode
    .split(',')
    .map((m) => map[m.trim()] ?? m.trim())
    .filter(Boolean)
    .join(' · ')
}

export const WEEKDAYS: Record<Lang, string[]> = {
  ko: ['월', '화', '수', '목', '금', '토', '일'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
}

export function formatMonth(d: Date, lang: Lang): string {
  return lang === 'ko'
    ? `${d.getFullYear()}년 ${d.getMonth() + 1}월`
    : d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

/** upd_dtm 기준 경과 시간. 와이어프레임 2c "출처와 경과 시간 (예: 프랑스 노동부 · 2시간 전)" */
export function timeAgo(iso: string, lang: Lang): string {
  const t = makeT(lang)
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return t('justNow')
  const sp = lang === 'ko' ? '' : ' '
  if (min < 60) return `${min}${sp}${t('minutesAgo')}`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}${sp}${t('hoursAgo')}`
  const day = Math.floor(hr / 24)
  return `${day}${sp}${t('daysAgo')}`
}

/**
 * events의 한/영 병렬 컬럼(_en) 중 언어에 맞는 쪽을 고른다.
 * EN 모드인데 _en이 비어 있으면(아직 n8n이 생성 못한 값) 한국어로 폴백한다.
 * → 2026-09-02 이중언어 작업. 근거: [[/topics/... ]] 없음 — 세션 내 결정.
 */
export function pickText(lang: Lang, en: string | null | undefined, ko: string): string {
  return lang === 'en' && en && en.trim() ? en : ko
}

/**
 * 시간대 열 — `00:00 ~ 22:00 (22시간)`.
 *
 * 운행금지(Driving Ban)는 **몇 시부터 몇 시까지인지가 판단 자체**다.
 * business-rules §4가 금지 시간대의 길이로 점수를 매기는데, 임박순 목록에는
 * 날짜만 있고 시간이 없어서 "오전에 통과하면 되는지"를 화면에서 알 수 없었다.
 * (→ 2026-09-09 사용자 요청)
 *
 * - `time_start`/`time_end`가 없으면 종일로 본다 — DayDetail·CountryDetailList·2b와 같은 규칙이다.
 * - Postgres `time`은 `24:00:00`을 허용한다. 실제로 헝가리·오스트리아 등 27건이 이 값이다.
 * - 끝이 시작보다 이르면 자정을 넘긴 것으로 보고 하루를 더한다.
 * - 여러 날짜에 걸치면 날짜 차이만큼 더해 총 시간을 낸다.
 */
function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim())
  if (!m) return null
  const h = Number(m[1])
  const mi = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return null
  return h * 60 + mi
}

export interface TimeRange {
  /** `08:00 ~ 22:00`, 또는 종일이면 '종일' */
  span: string
  /** `14시간` / `1시간 30분` — 계산할 수 없으면 null */
  duration: string | null
  /** 종일(시간 없음) 또는 00:00~24:00 */
  allDay: boolean
}

export function timeRange(
  event: {
    event_type?: string
    date_start: string
    date_end: string
    time_start: string | null
    time_end: string | null
  },
  lang: Lang,
): TimeRange {
  const t = makeT(lang)
  if (!event.time_start || !event.time_end)
    return { span: t('allDay'), duration: null, allDay: true }

  const from = toMinutes(event.time_start)
  const to = toMinutes(event.time_end)
  if (from === null || to === null) return { span: t('allDay'), duration: null, allDay: true }

  const dayDiff = Math.max(
    0,
    Math.round(
      (Date.parse(`${event.date_end}T00:00:00Z`) - Date.parse(`${event.date_start}T00:00:00Z`)) /
        86400000,
    ) || 0,
  )
  let total = to + dayDiff * 1440 - from
  // 같은 날인데 끝이 시작보다 이르면 자정을 넘긴 것이다
  if (total <= 0) total += 1440

  const span = `${event.time_start.slice(0, 5)} ~ ${event.time_end.slice(0, 5)}`
  const allDay = dayDiff === 0 && from === 0 && (to === 1440 || to === 0)

  /**
   * 여러 날에 걸친 **운행금지**는 총 시간을 내지 않는다.
   * 기상경보는 한 번 시작해 끝까지 이어지므로 이틀치 합산이 맞지만(예: 스위스 뇌우
   * 09-08 18:50 → 09-09 20:45 = 25시간 55분), 운행금지는 같은 시간대가 **날마다 반복**된다.
   * 07:00~20:00이 사흘이면 실제 금지는 39시간인데 합산하면 61시간이 나온다 —
   * 어느 쪽인지 데이터로 구분할 수 없으니 아예 말하지 않는다. 날짜 범위는 기간 열에 이미 있다.
   */
  const perDay = event.event_type === 'Driving Ban' && dayDiff > 0

  const h = Math.floor(total / 60)
  const mi = total % 60
  const duration =
    lang === 'ko'
      ? mi === 0
        ? `${h}시간`
        : h === 0
          ? `${mi}분`
          : `${h}시간 ${mi}분`
      : mi === 0
        ? `${h}h`
        : h === 0
          ? `${mi}m`
          : `${h}h ${mi}m`

  return { span: allDay ? t('allDay') : span, duration: allDay || perDay ? null : duration, allDay }
}
