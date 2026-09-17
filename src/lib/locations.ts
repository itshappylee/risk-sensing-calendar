import { COUNTRY_POINTS } from './geo'

/**
 * 국가·도시 선택의 단일 출처.
 *
 * 2026-09-02 이전에는 세 화면이 제각각이었다 — 캘린더 필터는 "그 달에 이벤트가 있는 나라"만
 * 뽑아 19개국만 보였고, 위험 보고는 도시 목록이 아예 비어 있었으며, 경로 분석만 23개국치
 * 도시를 자체 배열로 들고 있었다. 세 곳을 이 파일 하나로 모은다.
 *
 * 국가는 `geo.ts`의 42개국을 그대로 쓴다(분포도 타일과 어긋나지 않게).
 * 도시는 전수가 아니라 **물류 거점 기준 대표 도시**다 — 수도, 주요 항만, 화물 허브.
 * 목록에 없는 곳은 'Other'로 직접 입력한다.
 */

/** 목록에 없는 도시를 직접 입력하겠다는 선택지 */
export const OTHER_CITY = 'Other'

/** 42개국. 분포도(geo.ts)와 같은 표기를 쓴다 */
export const COUNTRIES: string[] = [...new Set(COUNTRY_POINTS.map((p) => p.name))].sort()

const CITIES: Record<string, string[]> = {
  Iceland: ['Reykjavík', 'Keflavík', 'Akureyri'],
  Ireland: ['Dublin', 'Cork', 'Shannon', 'Limerick'],
  'United Kingdom': ['London', 'Manchester', 'Birmingham', 'Liverpool', 'Felixstowe', 'Dover'],
  Portugal: ['Lisbon', 'Porto', 'Leixões', 'Sines'],
  Spain: ['Madrid', 'Barcelona', 'Valencia', 'Algeciras', 'Bilbao', 'Seville'],
  France: ['Paris', 'Lyon', 'Marseille', 'Le Havre', 'Strasbourg', 'Lille'],
  Belgium: ['Brussels', 'Antwerp', 'Ghent', 'Liège', 'Zeebrugge'],
  Netherlands: ['Amsterdam', 'Rotterdam', 'Utrecht', 'Eindhoven', 'Venlo'],
  Luxembourg: ['Luxembourg City', 'Bettembourg', 'Esch-sur-Alzette'],
  Switzerland: ['Zurich', 'Basel', 'Geneva', 'Bern', 'Chiasso'],
  Liechtenstein: ['Vaduz', 'Schaan'],
  Italy: ['Milan', 'Rome', 'Naples', 'Turin', 'Genoa', 'Verona', 'Trieste'],
  Malta: ['Valletta', 'Marsaxlokk', 'Birkirkara'],
  Germany: ['Berlin', 'Hamburg', 'Frankfurt', 'Munich', 'Duisburg', 'Düsseldorf', 'Cologne', 'Bremen'],
  Denmark: ['Copenhagen', 'Aarhus', 'Padborg', 'Esbjerg'],
  Norway: ['Oslo', 'Bergen', 'Stavanger', 'Trondheim'],
  Sweden: ['Stockholm', 'Gothenburg', 'Malmö', 'Helsingborg'],
  Finland: ['Helsinki', 'Turku', 'Tampere', 'Kotka'],
  Estonia: ['Tallinn', 'Muuga', 'Tartu'],
  Latvia: ['Riga', 'Ventspils', 'Liepāja', 'Daugavpils'],
  Lithuania: ['Vilnius', 'Kaunas', 'Klaipėda'],
  Poland: ['Warsaw', 'Gdańsk', 'Gdynia', 'Poznań', 'Wrocław', 'Katowice', 'Łódź'],
  Czechia: ['Prague', 'Brno', 'Ostrava', 'Plzeň'],
  Austria: ['Vienna', 'Graz', 'Linz', 'Salzburg', 'Innsbruck'],
  Slovakia: ['Bratislava', 'Košice', 'Žilina'],
  Hungary: ['Budapest', 'Debrecen', 'Győr', 'Szeged'],
  Slovenia: ['Ljubljana', 'Koper', 'Maribor', 'Celje'],
  Croatia: ['Zagreb', 'Rijeka', 'Split', 'Osijek'],
  'Bosnia and Herzegovina': ['Sarajevo', 'Mostar', 'Banja Luka', 'Tuzla'],
  Serbia: ['Belgrade', 'Novi Sad', 'Niš', 'Šid'],
  Montenegro: ['Podgorica', 'Bar', 'Nikšić'],
  Kosovo: ['Pristina', 'Prizren', 'Peja'],
  'North Macedonia': ['Skopje', 'Bitola', 'Kumanovo'],
  Albania: ['Tirana', 'Durrës', 'Vlorë'],
  Greece: ['Athens', 'Thessaloniki', 'Piraeus', 'Patras', 'Igoumenitsa'],
  Bulgaria: ['Sofia', 'Plovdiv', 'Varna', 'Burgas', 'Ruse'],
  Romania: ['Bucharest', 'Constanța', 'Cluj-Napoca', 'Timișoara', 'Arad'],
  Moldova: ['Chișinău', 'Bălți', 'Giurgiulești'],
  Ukraine: ['Kyiv', 'Lviv', 'Odesa', 'Kharkiv', 'Dnipro'],
  Cyprus: ['Nicosia', 'Limassol', 'Larnaca'],
  Turkey: ['Istanbul', 'Ankara', 'İzmir', 'Mersin', 'Bursa', 'Gaziantep'],
  Georgia: ['Tbilisi', 'Batumi', 'Poti', 'Kutaisi'],
}

/** 그 나라의 대표 도시. 없으면 빈 배열 */
export function citiesFor(country: string): string[] {
  return CITIES[country] ?? []
}

/**
 * 도시 select에 넣을 목록 = 대표 도시 + Other.
 * 나라를 아직 안 골랐으면 빈 배열(= select 비활성).
 */
export function cityOptions(country: string): string[] {
  if (!country) return []
  return [...citiesFor(country), OTHER_CITY]
}

/** 화면에서 고른 값 → 저장·표시에 쓸 도시 문자열. Other면 직접 입력한 값을 쓴다 */
export function resolveCity(city: string, customCity: string): string {
  return city === OTHER_CITY ? customCity.trim() : city
}
