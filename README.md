# FRONTLINE — IRON ECHO

1인칭 싱글플레이 현대전 FPS 캠페인. 2029년 한반도 전쟁과 해외 비밀 작전이 교차하는 16개 미션의 이야기 (현재 **Mission 01 플레이 가능**).

- 엔진: three.js r187 (WebGL 2) + Vite — 엔진 선택 사유는 [docs/ENGINE_DECISION.md](docs/ENGINE_DECISION.md)
- 모든 텍스처, 3D 모델, 애니메이션, 효과음, 음악은 코드로 절차적 생성 (외부 에셋 없음)
- 진행 상황: [PROJECT_STATUS.md](PROJECT_STATUS.md)

## 실행

필요: Node.js 18+ (개발), GPU 가속이 켜진 최신 Chrome / Edge / Firefox (플레이).

```bash
npm install
```

```bash
npm run dev
```

브라우저에서 표시된 주소(기본 http://localhost:5173)를 엽니다. 배포용 빌드:

```bash
npm run build
```

```bash
npm run preview
```

## 조작 (기본값, 설정에서 변경 가능)

| 동작 | 키보드/마우스 | 게임패드 |
|---|---|---|
| 이동 / 시점 | WASD / 마우스 | 왼쪽 / 오른쪽 스틱 |
| 달리기 · 앉기 · 점프(장애물 넘기) | Shift · C · Space | L3 · B · A |
| 조준 · 사격 | 우클릭 · 좌클릭 | LT · RT |
| 재장전 / 상호작용 (길게 누르기 지원) | R / F | X |
| 수류탄 · 무기 교체 | G · 1, 2, 휠 | RB · Y |
| 일시정지 | Esc (또는 P) | Start |

## 테스트

```bash
npm test
```

헤드리스 Chromium(SwiftShader)으로 부팅 → 메인 메뉴 → 설정 → 임무 선택 → 브리핑 → Mission 01 출격까지 확인합니다.

```bash
npm run test:mission
```

Mission 01 전체를 자동으로 진행(트럭 → 센서 → OP 교전 → 무전 → 방어 → 마을 → 장갑차 → 완료 화면 → 저장 확인)합니다. 소프트웨어 렌더링이라 약 30분 걸립니다. 스크린샷은 `tests/output/`.

디버그 URL 옵션: `?nolock` (포인터 락 없이 실행), `?autostart` (클릭 대기 생략).

## 문서

- [docs/STORY_BIBLE.md](docs/STORY_BIBLE.md) — 세계관, 인물, 주제
- [docs/CAMPAIGN.md](docs/CAMPAIGN.md) — 16개 미션 상세 시나리오
- [docs/LEVELS.md](docs/LEVELS.md) — 레벨/캐릭터 배치 계획
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 시스템 구조

모든 인물·부대·사건은 허구입니다. 게임 내 장비와 전투는 게임용으로 추상화되어 있으며 비고어 방식으로 표현됩니다.
