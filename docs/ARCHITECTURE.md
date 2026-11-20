# 시스템 아키텍처

```
index.html ─ src/main.js ─ Game (src/core/Game.js)
                              │
   ┌──────────────┬───────────┼─────────────┬──────────────┬─────────────┐
 Renderer        Input       UI            AudioEngine    SaveSystem    Settings
 (render/)      (core/)     (ui/UI.js)     (audio/)       (core/)       (core/)
   │                                                        ▲ localStorage ▲
   ├ TextureFactory (절차적 PBR)                              │
   ├ Effects / Weather (파티클·예광탄·폭발·눈비)
   └ Sky (시간대 하늘, 지평선 포격광)

 미션 1회 실행 시 생성 (startMission):
   World (world/World.js)  ── 높이맵 지형, 박스 콜라이더, 레이캐스트, 내비 그리드 A*
   Props (world/Props.js)  ── 건물(내부 진입 가능)·요새·식생·차량 모델·상호작용 장비
   Level (world/levels/*)  ── 레벨 지오메트리 + 조명 + 동적 상태(정전, 여명, 포격)
   Player (player/Player.js) ── 이동/자세/넘기/사다리/좌석/카메라/체력/상호작용
   WeaponSystem (player/Weapons.js) ── 뷰모델, 사격, 재장전, 조준, 수류탄
   Combat (player/Combat.js) ── 히트스캔 판정, 폭발 피해, 엄폐 차폐, 제압
   AIDirector + AIAgent (ai/AI.js) ── 인지, 엄폐 선택, 사격 토큰, 분대 경보, 수류탄
   Actor (ai/Actor.js) ── 절차적 인간형 모델 + 애니메이션 + 히트박스
   Dialogue (story/Dialogue.js) ── 우선순위 대사/무전/바크, 자막, 덕킹
   Objectives (story/Objectives.js) ── 목표, 카운터, 월드 마커
   MissionRunner + Cinematics (story/MissionRunner.js) ── async 스크립트, 체크포인트, 카메라 레일, 레터박스
   Mission module (missions/m01_*.js) ── build() + SEGMENTS[] + EPILOGUE
```

## 주요 설계

### 게임 상태
`boot → menu → (briefing: 레벨 모듈/텍스처 사전 로드) → loading → playing ⇄ paused → dead → (restart checkpoint) → complete`

### 미션 스크립트 & 체크포인트
미션은 `SEGMENTS` 배열입니다. 각 세그먼트는 `{ id, setup(game), run(game, m) }`.
- 세그먼트 진입 시 자동으로 체크포인트 저장 (무기/탄약/통계 포함).
- 사망 또는 "체크포인트 재시작" 시 레벨을 새로 빌드하고 해당 세그먼트의 `setup()`이 상태(플레이어 위치, 분대 위치, 레벨 상태: 정전·여명 등)를 복원한 뒤 `run()`을 이어서 실행합니다.
- 스크립트는 게임 시간 기반 `await m.wait()`, `m.until()`, `m.reach()`, `m.say()` 를 사용하며, 일시정지 시 함께 멈춥니다. 중단(abort) 시 모든 대기 중 Promise가 예외로 풀립니다.

### AI
- **인지**: 0.25초 간격. 시야각(평시 ±57°, 전투 ±92°), 거리(레벨 설정 × 자세/발사 여부 보정), 레이캐스트 시선 확인. 총성(반경 85 m)·폭발(120 m)·질주 발소리(12 m) 청각.
- **엄폐**: 레벨 로드 시 콜라이더 주변에 엄폐 지점 자동 생성(낮은/높은 엄폐). 위협 방향 차폐 여부 + 사격 가능 여부 + 거리 + 분산 + 측면 우회 각도로 점수화.
- **전투 사이클**: 이동 → 숨기 → (사격 토큰 획득 시) 노출 사격 → 숨기 … 일정 사이클 후 재배치/전진. 제압되면 숨는 시간 증가·명중률 감소.
- **공정성**: 난이도별 동시 사격 인원 제한(토큰), 인지 직후 명중률 램프업, 거리·자세·이동 보정.
- **아군**: 플레이어 기준 대형 유지, 적 발견 시 근처 엄폐 후 교전, 스크립트 이동/대기/좌석/부상 자세. 스토리상 아군은 무작위 사망하지 않음(스크립트 이벤트로만 부상).
- **LOD**: 플레이어로부터 90 m 이상, 비전투 AI는 5 Hz로 갱신.

### 오디오
버스: music / sfx / ambience / dialogue → master → limiter. 대사 재생 중 음악·환경음 덕킹. 우선순위 3(스토리) 대사는 낮은 우선순위를 중단, 우선순위 1(전투 바크)은 다른 대사가 있으면 버려짐. 위치 소리는 HRTF 패너. 실내 진입 시 컨볼루션 리버브, 실외는 슬랩백 에코.

### 렌더링
ACES 톤매핑, PCF 소프트 그림자(플레이어 추적 섀도우 카메라), 지수 안개, 블룸 + 그레이드 셰이더(필름 그레인, 비네트, 피격 시 채도 감소·색수차, 폭발 섬광·블러). 뷰모델은 별도 씬/카메라로 렌더링해 벽 관통을 방지.

### 저장
`localStorage` 키: `fie.settings.v1`(설정), `fie.save.v1`(해금 미션, 완료 기록, 체크포인트, 스토리 플래그).
