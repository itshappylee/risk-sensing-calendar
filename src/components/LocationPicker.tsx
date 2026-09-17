import { useMemo } from 'react'
import type { Lang } from '../lib/types'
import { makeT } from '../lib/i18n'
import { COUNTRIES, OTHER_CITY, cityOptions } from '../lib/locations'
import { PickList } from './PickList'

/** 나라 + 도시(+ 직접 입력) 한 벌. 세 화면이 같은 모양을 쓰도록 값도 한 덩어리로 다닌다 */
export interface LocationValue {
  country: string
  city: string
  /** city가 'Other'일 때만 쓰인다 */
  customCity: string
}

export const emptyLocation = (country = '', city = ''): LocationValue => ({ country, city, customCity: '' })

interface Props {
  lang: Lang
  value: LocationValue
  onChange: (next: LocationValue) => void
  /** 같은 화면에 여러 벌이 놓이므로 id가 겹치지 않게 접두사를 받는다 */
  idPrefix: string
  /** 라벨을 감춘 압축형(경유지 줄 등)에서 쓴다 */
  compact?: boolean
}

/**
 * 위험 보고·경로 분석이 함께 쓰는 국가/도시 선택기.
 *
 * 나라를 바꾸면 도시는 그 나라의 첫 대표 도시로 옮겨간다 — 이전 나라의 도시가 남아
 * "Germany · Lyon" 같은 조합이 저장되는 것을 막는다.
 *
 * 2026-09-09부터 기본 `<select>` 대신 [[PickList]]를 쓴다. 국가가 42개라 기본 드롭다운이
 * 화면 위아래를 다 덮을 만큼 길어졌고, 그 높이는 CSS로 줄일 수 없다.
 */
export function LocationPicker({ lang, value, onChange, idPrefix, compact = false }: Props) {
  const t = makeT(lang)
  const cities = cityOptions(value.country)

  function pickCountry(country: string) {
    const next = cityOptions(country)
    onChange({ country, city: next[0] ?? '', customCity: '' })
  }

  function pickCity(city: string) {
    onChange({ ...value, city, customCity: city === OTHER_CITY ? value.customCity : '' })
  }

  const countryOptions = useMemo(() => COUNTRIES.map((c) => ({ value: c, label: c })), [])
  const cityPickOptions = useMemo(
    () => cities.map((c) => ({ value: c, label: c === OTHER_CITY ? t('otherCity') : c })),
    [cities, t],
  )

  return (
    <>
      <div className="fld-2col">
        <div>
          {!compact && (
            <label className="fld-label" htmlFor={`${idPrefix}-country`}>
              {t('fieldCountry')}
            </label>
          )}
          <PickList
            lang={lang}
            id={`${idPrefix}-country`}
            ariaLabel={t('fieldCountry')}
            value={value.country}
            options={countryOptions}
            placeholder={t('selectPlaceholder')}
            onChange={pickCountry}
          />
        </div>

        <div>
          {!compact && (
            <label className="fld-label" htmlFor={`${idPrefix}-city`}>
              {t('fieldCity')}
            </label>
          )}
          <PickList
            lang={lang}
            id={`${idPrefix}-city`}
            ariaLabel={t('fieldCity')}
            value={value.city}
            options={cityPickOptions}
            placeholder={value.country ? t('selectPlaceholder') : '\u2014'}
            disabled={!value.country}
            onChange={pickCity}
          />
        </div>
      </div>

      {value.city === OTHER_CITY && (
        <input
          id={`${idPrefix}-custom-city`}
          className="fld lp-custom"
          aria-label={t('otherCity')}
          placeholder={t('otherCityPlaceholder')}
          value={value.customCity}
          onChange={(e) => onChange({ ...value, customCity: e.target.value })}
        />
      )}
    </>
  )
}
