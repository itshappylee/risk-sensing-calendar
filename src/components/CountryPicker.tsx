import { useEffect, useMemo, useRef, useState } from 'react'
import type { Lang } from '../lib/types'
import { makeT } from '../lib/i18n'

interface Props {
  lang: Lang
  countries: string[]
  /** 국가별 이번 달 이벤트 건수. 0건인 나라도 고를 수 있게 두되, 데이터 유무는 보이게 한다 */
  counts?: Map<string, number>
  value: string | null
  onChange: (c: string | null) => void
}

/**
 * 국가 선택기 — **알파벳 그룹**으로 범위를 먼저 좁힌다 (사용자 요청 2026-08-13).
 *
 * 유럽 대상 국가가 44~50개라 평평한 드롭다운은 스크롤이 길어 실용성이 떨어진다.
 * A~Z 인덱스로 한 번 묶고, 그 안에서 고른다. 텍스트 검색도 함께 둔다.
 *
 * 선택한 국가는 "담당 국가"로 저장돼 다음 방문에 그대로 복원된다.
 *
 * 2026-09-02부터 목록은 **42개국 전체**다. 그전에는 '그 달에 이벤트가 있는 나라'만 담아
 * 19개국만 보였고, 담당 국가가 조용히 사라지는 문제가 있었다. 건수 배지로 데이터 유무를 알린다.
 */
export function CountryPicker({ lang, countries, counts, value, onChange }: Props) {
  const t = makeT(lang)
  const [open, setOpen] = useState(false)
  const [letter, setLetter] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  /** 실제로 이벤트가 있는 국가들의 첫 글자만 인덱스로 만든다 — 빈 글자를 누르게 하지 않는다 */
  const letters = useMemo(
    () => [...new Set(countries.map((c) => c[0]?.toUpperCase()).filter(Boolean))].sort(),
    [countries],
  )

  const shown = useMemo(() => {
    let list = countries
    if (letter) list = list.filter((c) => c[0]?.toUpperCase() === letter)
    if (q.trim()) {
      const k = q.trim().toLowerCase()
      list = list.filter((c) => c.toLowerCase().includes(k))
    }
    return list
  }, [countries, letter, q])

  return (
    <div className="cp" ref={box}>
      <button
        className={`cp-trigger${value ? ' has' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="cp-cap">{t('myCountry')}</span>
        <span className="cp-val">{value ?? `${t('allCountries')} (${countries.length})`}</span>
        <span className="cp-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className="cp-pop" role="dialog" aria-label={t('searchCountry')}>
          <input
            className="fld cp-search"
            placeholder={t('searchCountry')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />

          <div className="cp-letters" role="group" aria-label="A-Z">
            <button className={letter === null ? 'on' : ''} onClick={() => setLetter(null)}>
              {t('allLetters')}
            </button>
            {letters.map((l) => (
              <button key={l} className={letter === l ? 'on' : ''} onClick={() => setLetter(l)}>
                {l}
              </button>
            ))}
          </div>

          <div className="cp-list">
            <button
              className={`cp-item${value === null ? ' on' : ''}`}
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
            >
              {t('allCountries')}
              <span className="cp-n">{countries.length}</span>
            </button>

            {shown.map((c) => {
              const n = counts?.get(c) ?? 0
              return (
                <button
                  key={c}
                  className={`cp-item${value === c ? ' on' : ''}${n === 0 ? ' quiet' : ''}`}
                  onClick={() => {
                    onChange(c)
                    setOpen(false)
                  }}
                >
                  {c}
                  {counts && <span className="cp-n">{n}</span>}
                </button>
              )
            })}

            {shown.length === 0 && <p className="cp-empty">{t('noMatch')}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
