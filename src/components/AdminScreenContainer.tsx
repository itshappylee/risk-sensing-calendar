import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Lang } from '../lib/types'
import { buildMonthWeeks, toISODate } from '../lib/calendar'
import { fetchEvents, type LoadState } from '../lib/supabase'
import { fetchCandidates, fetchDecidedToday, type Candidate } from '../lib/candidates'
import { AdminScreen } from './AdminScreen'
import { makeT } from '../lib/i18n'

/**
 * 2e는 이 달 범위의 events를 스스로 가져온다 (캘린더 화면과 상태를 공유하지 않는다).
 *
 * 후보·처리이력·events를 **한 번에 다시 읽는다.** 승인하거나 제외한 뒤 화면이 갱신되지 않으면
 * 방금 한 일이 반영됐는지 알 수 없다 — 그게 "승인했는데 사라져서 수정이 안 된다"는
 * 사용자 지적(2026-08-28)의 절반이었다.
 *
 * ⚠️ 로그인하지 않으면 후보·처리이력은 RLS가 막아 **에러가 아니라 빈 배열**로 온다.
 * 화면에서 "로그인 필요"와 "정말 0건"을 구분해 보여준다.
 */
export function AdminScreenContainer({
  lang,
  onToast,
  signedIn,
  onSignIn,
}: {
  lang: Lang
  onToast: (m: string) => void
  signedIn: boolean
  onSignIn: () => void
}) {
  const t = makeT(lang)
  const [state, setState] = useState<LoadState>({ kind: 'ok', events: [] })
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [decided, setDecided] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)

  const [from, to] = useMemo(() => {
    const n = new Date()
    const weeks = buildMonthWeeks(n.getFullYear(), n.getMonth())
    return [toISODate(weeks[0][0]), toISODate(weeks[weeks.length - 1][6])]
  }, [])

  const reload = useCallback(async () => {
    const [cand, done, ev] = await Promise.all([
      fetchCandidates(),
      fetchDecidedToday(),
      fetchEvents(from, to).catch(
        (err): LoadState => ({ kind: 'error', events: [], message: String(err) }),
      ),
    ])
    if (cand.error) onToast(t('candidatesLoadFailed') + ' — ' + cand.error)
    setCandidates(cand.rows)
    setDecided(done)
    setState(ev)
    setLoading(false)
  }, [onToast, t, from, to])

  useEffect(() => {
    void reload()
  }, [reload, signedIn])

  if (loading) return <div className="detail-empty">{t('loading')}</div>
  return (
    <AdminScreen
      lang={lang}
      events={state.events}
      candidates={candidates}
      decided={decided}
      signedIn={signedIn}
      onSignIn={onSignIn}
      onDecided={() => void reload()}
      onToast={onToast}
    />
  )
}
