import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Lang } from '../lib/types'
import { makeT } from '../lib/i18n'
import { signIn } from '../lib/auth'

interface Props {
  lang: Lang
  onClose: () => void
  onDone: () => void
}

/**
 * 관리자 로그인.
 *
 * **가입 화면은 없다.** 계정은 Supabase 대시보드(Authentication → Users)에서 발급한다 —
 * 앱에 가입을 열면 누구나 계정을 만들어 쓰기 권한을 얻는다 (→ Q-022, 사용자 결정 2026-08-27).
 *
 * 읽기는 로그인 없이 된다. 이 패널이 필요한 곳은 2d 보고와 2e 승인뿐이다.
 * 스타일은 2d 시트(`sheet-*`)를 그대로 쓴다 — 같은 성격의 오버레이라 새 CSS를 만들지 않았다.
 */
export function LoginPanel({ lang, onClose, onDone }: Props) {
  const t = makeT(lang)
  const first = useRef<HTMLInputElement>(null)
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    first.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    const msg = await signIn(email.trim(), pw)
    setBusy(false)
    if (msg) setErr(msg)
    else onDone()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lp-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <header className="sheet-head">
          <div>
            <h2 id="lp-title">{t('loginTitle')}</h2>
            <p className="sheet-sub">{t('loginHint')}</p>
          </div>
          <button type="button" className="sheet-x" onClick={onClose} aria-label={t('cancel')}>
            ✕
          </button>
        </header>

        <div className="sheet-body">
          <label className="fld-label" htmlFor="lp-email">
            {t('emailLabel')}
          </label>
          <input
            id="lp-email"
            className="fld"
            ref={first}
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label className="fld-label" htmlFor="lp-pw">
            {t('passwordLabel')}
          </label>
          <input
            id="lp-pw"
            className="fld"
            type="password"
            autoComplete="current-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            required
          />

          {err && (
            <div className="blocked-note" role="alert">
              <strong>⛔ {err}</strong>
            </div>
          )}
        </div>

        <footer className="sheet-foot">
          <div className="sheet-actions">
            <button type="button" className="btn" onClick={onClose}>
              {t('cancel')}
            </button>
            <button className="btn primary" type="submit" disabled={busy || !email || !pw}>
              {busy ? t('signingIn') : t('signIn')}
            </button>
          </div>
        </footer>
      </form>
    </div>
  )
}
