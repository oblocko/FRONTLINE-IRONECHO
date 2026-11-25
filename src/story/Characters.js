// Cast data. Shared by dialogue (subtitle colours, voice timbre), briefing
// screens and the codex. Full bios live in docs/STORY_BIBLE.md.
export const CHARACTERS = {
  minjae: { name: '한민재', en: 'Han Min-jae', rank: '이병', rankEn: 'PVT', unit: '제7보병사단 3대대 GOP 분대', color: '#9fd3ff', pitch: 1.05, role: 'Player (Korea front)' },
  yoon: { name: '윤태호', en: 'Yoon Tae-ho', rank: '중사', rankEn: 'SSG', unit: '분대장', color: '#ffd27a', pitch: 0.82, role: 'Squad leader' },
  doyun: { name: '박도윤', en: 'Park Do-yun', rank: '상병', rankEn: 'CPL', unit: '분대원', color: '#a8f0a0', pitch: 1.0, role: 'Squadmate' },
  seoyeon: { name: '이서연', en: 'Lee Seo-yeon', rank: '중위', rankEn: '1LT', unit: '대대 지휘통제실 통신정보장교', color: '#ff9ec7', pitch: 1.45, role: 'Comms & intelligence' },
  jung: { name: '정경수', en: 'Jung Kyung-su', rank: '병장', rankEn: 'SGT', unit: '분대 기관총 사수', color: '#c8b6ff', pitch: 0.9, role: 'Squad gunner' },
  daniel: { name: '다니엘 보스', en: 'Daniel Voss', rank: '', rankEn: '', unit: '前 다국적 특수작전 TU-LANTERN', color: '#9fd3ff', pitch: 0.85, role: 'Player (abroad)', lang: 'en' },
  maya: { name: '마야 첸', en: 'Maya Chen', rank: '', rankEn: '', unit: '前 정보분석관', color: '#7ef0e0', pitch: 1.4, role: 'Analyst', lang: 'en' },
  nadia: { name: '나디아 라만', en: 'Nadia Rahman', rank: '', rankEn: '', unit: '前 민간보안책임자', color: '#ffb38a', pitch: 1.3, role: 'Uneasy ally', lang: 'en' },
  morrow: { name: '빅터 모로', en: 'Victor Morrow', rank: '', rankEn: '', unit: 'Halvard Meridian 대표', color: '#e0e0e0', pitch: 0.8, role: 'Defense-tech broker', lang: 'en' },
  cole: { name: '콜 브레넌', en: 'Cole Brennan', rank: '', rankEn: '', unit: 'Halvard Meridian 보안 책임자 · 前 TU-LANTERN', color: '#ff9a7a', pitch: 0.78, role: 'Former teammate', lang: 'en' },
  graves: { name: '그레이브스', en: 'Graves', rank: '', rankEn: '', unit: 'Halvard Meridian 현장 팀장', color: '#ff9a7a', pitch: 0.84, role: 'Kidnap team lead', lang: 'en' },
  contractor: { name: '계약 요원', en: 'Contractor', rank: '', rankEn: '', unit: 'Kestrel Risk Advisory', color: '#ff7a6a', pitch: 0.95, role: '', lang: 'en' },
  tail: { name: '미행자', en: 'Tail', rank: '', rankEn: '', unit: '추적팀', color: '#ff7a6a', pitch: 0.95, role: '', lang: 'en' },
  tracker: { name: '추적팀', en: 'Tracker team', rank: '', rankEn: '', unit: '', color: '#ff7a6a', pitch: 0.9, role: 'Radio', lang: 'en' },
  guard: { name: '경비', en: 'Guard', rank: '', rankEn: '', unit: '', color: '#ff7a6a', pitch: 1.0, role: '', lang: 'en' },
  auctioneer: { name: '경매인', en: 'Auctioneer', rank: '', rankEn: '', unit: '', color: '#e0c890', pitch: 1.0, role: '', lang: 'en' },
  courier: { name: '운반책', en: 'Courier', rank: '', rankEn: '', unit: '', color: '#ff9a7a', pitch: 1.05, role: '', lang: 'hi' },
  thug: { name: '경비', en: 'Guard', rank: '', rankEn: '', unit: '', color: '#ff7a6a', pitch: 0.95, role: '', lang: 'hi' },
  tac: { name: '대대 지휘통제실', en: 'Battalion TOC', rank: '', rankEn: '', unit: '', color: '#ff9ec7', pitch: 1.1, role: 'Radio' },
  op: { name: 'OP 백두-3', en: 'OP Baekdu-3', rank: '', rankEn: '', unit: '', color: '#bbbbbb', pitch: 1.0, role: 'Radio' },
  driver: { name: '운전병', en: 'Driver', rank: '일병', rankEn: 'PFC', unit: '', color: '#cccccc', pitch: 1.0, role: '' },
  apc: { name: '장갑차 차장', en: 'IFV Commander', rank: '상사', rankEn: 'SFC', unit: '기계화보병', color: '#ffe0a0', pitch: 0.85, role: '' },
  police: { name: '김정훈', en: 'Kim Jung-hoon', rank: '경위', rankEn: 'Insp.', unit: '연서경찰서', color: '#9fc4ff', pitch: 0.92, role: 'Police inspector' },
  civilian: { name: '대피 주민', en: 'Evacuee', rank: '', rankEn: '', unit: '', color: '#e8d8b0', pitch: 1.25, role: '' },
  pa: { name: '안내방송', en: 'PA system', rank: '', rankEn: '', unit: '', color: '#cfcfcf', pitch: 1.1, role: '' },
  convoy: { name: '수송대장', en: 'Convoy lead', rank: '상사', rankEn: 'SFC', unit: '', color: '#ffe0a0', pitch: 0.88, role: '' },
  engineer: { name: '공병 2소대장', en: 'Engineer PL', rank: '중위', rankEn: '1LT', unit: '공병대대', color: '#ffe0a0', pitch: 0.95, role: '' },
  medevac: { name: '후송 1호', en: 'Casevac 1', rank: '', rankEn: '', unit: '', color: '#cccccc', pitch: 1.0, role: 'Radio' },
  reyes: { name: '레예스', en: 'Capt. Reyes', rank: '대위', rankEn: 'CPT', unit: '미 해병대 연합 상륙 중대장', color: '#ffc48a', pitch: 1.2, role: 'US Marine company commander', lang: 'en' },
  harris: { name: '해리스', en: 'Lt. Harris', rank: '중위', rankEn: '1LT', unit: '미 해병대 통신정보장교', color: '#b8d8ff', pitch: 0.95, role: 'US comms officer', lang: 'en' },
  pilot: { name: '조종사', en: 'Pilot', rank: '', rankEn: '', unit: '육군 항공', color: '#cccccc', pitch: 0.9, role: 'Radio' },
  marine: { name: '미 해병', en: 'Marine', rank: '', rankEn: '', unit: '', color: '#ffc48a', pitch: 1.0, role: '', lang: 'en' },
  enemy: { name: '적군', en: 'Hostile', rank: '', rankEn: '', unit: '', color: '#ff7a6a', pitch: 0.9, role: '' },
  narrator: { name: '', en: '', rank: '', rankEn: '', unit: '', color: '#ffffff', pitch: 1, role: '' },
};

// spoken language of a speaker (subtitles are always Korean; non-Korean speech is tagged)
export const LANG_LABEL = { en: '영어', fr: '프랑스어', hi: '힌디어' };
export function speakerLabel(id) {
  const c = CHARACTERS[id]; if (!c) return id;
  return c.rank ? `${c.rank} ${c.name}` : c.name;
}
