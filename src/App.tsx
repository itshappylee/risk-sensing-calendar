import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Lang } from './lib/types'
import { Header, type Screen } from './components/Header'
import { CalendarScreen } from './components/CalendarScreen'
import { RouteScreen } from './components/RouteScreen'
import { InfoScreen } from './components/InfoScreen'
import { AdminScreenContainer } from './components/AdminScreenContainer'
import { LoginPanel } from './components/LoginPanel'
import { readUrl, writeUrl } from './lib/urlState'
import { currentUser, onAuth, signOut } from './lib/auth'
import type { Session } from '@supabase/supabase-js'

/**
 * 화면 구성 — 2c 리스크 캘린더(기본) / 2b 경로 분석 / 2e Admin.
 *
 * 2026-08-18에 캘린더와 경로 분석을 한 페이지로 합쳤다가, **페이지가 너무 길어져
 * 2026-08-26에 다시 분리했다** (→ DEC-017). 캘린더만으로도 6주 격자가 화면을 채우는데
 * 그 아래에 경로 분석을 붙이니 스크롤 비용이 이득을 넘었다.
 *
 * 2a 역할 선택은 DEC-010으로 폐기, 2d 위험 보고는 캘린더 위 플로팅 패널이다.
 *
 * **로그인 상태는 여기 한 곳에서만 들고 있는다.** 읽기는 로그인 없이 되고(DEC-020),
 * 쓰기(2d 보고·2e 승인)만 로그인을 요구한다 (→ Q-022, 사용자 결정 2026-08-27).
 */
export default function App() {
  const url0 = useMemo(() => readUrl(), [])

  /** 화면 언어는 영어로 고정한다 (2026-10-22 사용자 지시). 상태로 두지 않는다 */
  const lang: Lang = 'en'
  const [screen, setScreen] = useState<Screen>(url0.screen ?? 'calendar')
  /** 링크로 들어온 경로 분석 입력. 바뀌면 경로 분석 화면을 새로 열어 그 입력으로 조회한다 */
  const [routeQ, setRouteQ] = useState(url0.route)
  const [toast, setToast] = useState<string | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loginOpen, setLoginOpen] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => onAuth(setSession), [])
  const user = currentUser(session)

  // 주소창에서 해시를 바꾸거나 링크를 따라오면 화면이 따라가야 한다.
  // 처음 한 번만 읽고 말면 이미 앱을 열어둔 사람에게는 공유 링크가 안 먹는다.
  // writeUrl은 replaceState라 hashchange를 일으키지 않으므로 되먹임 걱정은 없다.
  // ⚠️ 화면 전환만 반응한다 — 날짜·국가(d·c·v)는 CalendarScreen이 최초 1회만 읽는다 [미해결]
  useEffect(() => {
    const onHash = () => {
      const u = readUrl()
      if (u.route) setRouteQ(u.route)
      if (u.screen) setScreen(u.screen)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // 다른 화면으로 가면 링크로 받은 입력은 비운다 — 나중에 메뉴로 다시 들어왔을 때 옛 조회가 되살아나지 않게
  useEffect(() => {
    if (screen !== 'route') setRouteQ(undefined)
  }, [screen])

  // 로그아웃했는데 관리자 화면에 남아 있으면 아무것도 못 하는 빈 화면이 된다
  useEffect(() => {
    if (!user && screen === 'admin') setScreen('calendar')
  }, [user, screen])

  // 연속 호출 시 앞 타이머가 뒤 토스트를 지우지 않게 한다
  const showToast = useCallback((msg: string) => {
    clearTimeout(timer.current)
    setToast(msg)
    timer.current = window.setTimeout(() => setToast(null), 3200)
  }, [])

  useEffect(() => () => clearTimeout(timer.current), [])

  // 캘린더는 자기 상태(날짜·국가·뷰)를 스스로 URL에 쓴다. 나머지 화면만 여기서 맞춘다
  useEffect(() => {
    if (screen !== 'calendar') writeUrl({ screen })
  }, [screen])

  return (
    <div className="app-shell">
      <Header
        lang={lang}
        screen={screen}
        onScreen={setScreen}
        userEmail={user?.email ?? null}
        onSignIn={() => setLoginOpen(true)}
        onSignOut={() => void signOut()}
      />

      {screen === 'calendar' && (
        <CalendarScreen
          lang={lang}
          onToast={showToast}
          initial={{ date: url0.date, country: url0.country, view: url0.view }}
          reporter={user?.email ?? null}
        />
      )}
      {screen === 'route' && (
        <RouteScreen key={routeQ ? JSON.stringify(routeQ) : 'route'} lang={lang} onToast={showToast} initial={routeQ} />
      )}
      {screen === 'info' && <InfoScreen lang={lang} />}
      {screen === 'admin' && (
        <AdminScreenContainer
          lang={lang}
          onToast={showToast}
          signedIn={Boolean(user)}
          onSignIn={() => setLoginOpen(true)}
        />
      )}

      {loginOpen && (
        <LoginPanel lang={lang} onClose={() => setLoginOpen(false)} onDone={() => setLoginOpen(false)} />
      )}

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  )
}
