import type { Lang } from '../lib/types'
import { makeT } from '../lib/i18n'

export type Screen = 'calendar' | 'info' | 'admin'

interface Props {
  lang: Lang
  onLang: (l: Lang) => void
  screen: Screen
  onScreen: (s: Screen) => void
  /** 로그인한 사람의 이메일. null이면 비로그인 (읽기는 그대로 된다) */
  userEmail: string | null
  onSignIn: () => void
  onSignOut: () => void
}

/**
 * 상단 내비게이션.
 *
 * 와이어프레임 2b가 "상단 탭: 경로 분석 / 리스크 캘린더"를 명시하므로 그 둘은 탭으로 둔다.
 * 한때 한 페이지의 섹션 이동이었으나(2026-08-18), 페이지가 길어져 **다시 화면 전환**으로
 * 되돌렸다 (2026-08-26, → DEC-017).
 *
 * **Admin 탭은 로그인했을 때만 보인다** (2026-08-28 개정).
 *
 * DEC-019는 "Admin 진입 버튼을 두지 않는다"였고 이유는 **화면 정리**였다. 그때는 로그인이
 * 없어서 버튼을 둬도 아무나 눌렀고, 승인 버튼이 DB에 붙어 있지도 않아 들어갈 이유도 없었다.
 * 지금은 둘 다 달라졌다 — 로그인한 사람에게만 보여줄 수 있고, 승인이 실제로 동작한다.
 * 조회자 화면은 그대로 깔끔하므로 **DEC-019의 취지는 유지된다** (→ 사용자 결정 2026-08-28).
 *
 * URL(`#/admin`)로 들어가는 길은 그대로 열려 있다. 진짜 경계는 버튼이 아니라
 * RLS다 — 로그인하지 않으면 후보 목록이 빈 배열로 오고 승인도 안 된다 (→ DEC-025).
 */
export function Header({ lang, onLang, screen, onScreen, userEmail, onSignIn, onSignOut }: Props) {
  const t = makeT(lang)

  return (
    <header className="app-header">
      {/* 로고 마크. 옆의 header-title이 이름을 읽어주므로 마크는 접근성 트리에서 뺀다 */}
      <div className="logo-slot" aria-hidden="true">
        SELS
      </div>
      <span className="header-title">{t('appTitle')}</span>

      <nav className="main-nav" aria-label={t('viewMode')}>
        <button
          className={screen === 'calendar' ? 'on' : ''}
          aria-current={screen === 'calendar' ? 'page' : undefined}
          onClick={() => onScreen('calendar')}
        >
          {t('navCalendar')}
        </button>
        <button
          className={screen === 'info' ? 'on' : ''}
          aria-current={screen === 'info' ? 'page' : undefined}
          onClick={() => onScreen('info')}
        >
          {t('navInfo')}
        </button>
        {userEmail && (
          <button
            className={screen === 'admin' ? 'on' : ''}
            aria-current={screen === 'admin' ? 'page' : undefined}
            onClick={() => onScreen('admin')}
          >
            {t('navAdmin')}
          </button>
        )}
      </nav>

      <div className="header-right">
        {userEmail ? (
          <button className="btn tiny" onClick={onSignOut} title={userEmail}>
            {t('signOut')}
          </button>
        ) : (
          <button className="btn tiny" onClick={onSignIn}>
            {t('signIn')}
          </button>
        )}

        <div className="lang-toggle" role="group" aria-label="Language">
          <button aria-pressed={lang === 'ko'} onClick={() => onLang('ko')}>
            KR
          </button>
          <button aria-pressed={lang === 'en'} onClick={() => onLang('en')}>
            EN
          </button>
        </div>
      </div>
    </header>
  )
}
