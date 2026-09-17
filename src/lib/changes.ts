import type { RiskEvent } from './types'
import { parseISODate } from './calendar'

/**
 * 이벤트의 변화·연속성 판정.
 *
 * "마지막 확인 이후 신규/변경/취소" 요약(`diffSince`)은 2026-08-26에 제거했다 —
 * 그 자리에 **데이터 기준 시각**을 넣기로 했기 때문 (→ DEC-019).
 * 다만 변화 자체는 여전히 화면에 남아 있다: 상세 패널의 `변경됨` 배지와 취소 섹션,
 * 그리고 CSV의 `status` 컬럼 (→ wiki/questions/Q-024-spec-code-divergence.md #1).
 */

/**
 * 이 이벤트가 며칠짜리이고, 주어진 날짜가 그중 몇째 날인가.
 *
 * 근거: wiki/spec/business-rules.md 운행금지 Step 3 —
 *   "실무에서 진짜 문제는 하루 금지가 아니라 **연속 금지로 인한 적체·리드타임 붕괴**다."
 * 연속 2일 이상이면 +1, 3일 이상이면 +1 추가로 severity가 올라간다.
 * 화면이 그 연속성을 안 보여주면 규칙의 근거를 사람이 확인할 수 없다.
 */
export function runLength(e: RiskEvent, day: Date): { total: number; index: number } {
  const s = parseISODate(e.date_start)
  const en = parseISODate(e.date_end)
  const total = Math.round((en.getTime() - s.getTime()) / 86400000) + 1
  const index = Math.round((day.getTime() - s.getTime()) / 86400000) + 1
  return { total: Math.max(total, 1), index: Math.min(Math.max(index, 1), Math.max(total, 1)) }
}

/** 취소된 것은 더 이상 위험이 아니다 — 집계·판정에서 뺀다 (WF-3의 "본문에서 뺀다"와 같은 처리) */
export function isActiveRisk(e: RiskEvent): boolean {
  // cancelled = 실제로 취소된 일정 · excluded = 관리자가 화면에서 내린 것 (2026-08-28)
  return e.severity > 0 && e.status !== 'cancelled' && e.status !== 'excluded'
}
