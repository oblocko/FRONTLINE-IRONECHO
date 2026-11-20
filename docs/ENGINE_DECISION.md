# 엔진 선택 보고서 (Phase 1)

## 확인한 개발 환경 (2026-11-19)

| 항목 | 결과 |
|---|---|
| OS | Linux x86_64 (클라우드 컨테이너), 4 vCPU, 15 GB RAM, 디스크 여유 약 60 GB |
| GPU | **없음** (`nvidia-smi` 없음). 렌더링은 소프트웨어 래스터라이저(SwiftShader / lavapipe)만 가능 |
| Unreal Engine 5 | **미설치.** `UnrealEditor` 바이너리 없음 |
| Unity / Godot / Blender | 미설치 |
| Node.js / npm | v22 / 10.9 — npm 레지스트리 접근 가능 |
| Python | 3.13 |
| 브라우저 | Chromium + Playwright (헤드리스 테스트 가능) |

## Unreal Engine 5를 사용하지 않은 이유

1. **설치 불가**: UE5 Linux 버전은 Epic Games 계정과 GitHub 조직 연결이 필요한 비공개 소스 저장소에서만 받을 수 있고, 소스 빌드에 100 GB 이상 디스크와 수 시간의 빌드가 필요합니다. 이 컨테이너에는 계정 자격 증명도, 디스크 여유도 없습니다.
2. **GPU 없음**: UE5 에디터와 Nanite/Lumen은 DX12/Vulkan SM5+ GPU를 요구합니다. 이 환경에서는 에디터를 띄우거나 결과를 확인(테스트)할 수 없습니다. 규칙 15("매 단계 실제 실행 및 테스트")를 지킬 수 없습니다.
3. **바이너리 에셋**: UE 프로젝트의 핵심(.uasset/.umap, Blueprint, Animation Blueprint, Behavior Tree)은 에디터 없이 생성·검증할 수 없습니다.

따라서 프롬프트가 요구한 Nanite · Lumen · Niagara · Chaos · Enhanced Input · Behavior Tree · AI Perception · World Partition · Control Rig는 **이 프로젝트에서 사용하지 않습니다.** 사용하지 않은 기능을 사용한 것처럼 주장하지 않습니다.

## 채택한 대안: three.js (WebGL 2) + Vite

- 실제로 실행하고 헤드리스 Chromium으로 자동 테스트할 수 있는 유일한 3D 엔진 경로입니다.
- 결과물은 일반 PC의 GPU 가속 브라우저(Chrome/Edge/Firefox)에서 바로 플레이 가능합니다.
- 모든 에셋(텍스처·모델·애니메이션·사운드·음악)을 **코드로 절차적 생성**하므로 라이선스 문제가 없습니다.

### UE5 기능 → 이 프로젝트의 대응 구현

| UE5 기능 | 이 프로젝트 | 비고 |
|---|---|---|
| Lumen (GI) | 반구광 + 방향광 + 동적 점광원 + 블룸 | 실시간 GI 없음 |
| Nanite | 인스턴싱(나무·풀·모래주머니), 청크 지형, 프러스텀 컬링 | 가상 지오메트리 없음 |
| Niagara | `Effects.js` GPU 포인트 파티클 풀 (연기·불꽃·먼지·파편·예광탄) | |
| Chaos | 박스 충돌 + 높이맵 지형 + 단순 파편 물리 | 강체 시뮬레이션/파괴 없음 |
| Enhanced Input | `Input.js` 액션 바인딩 + 리바인딩 + 게임패드 | |
| Animation Blueprint / Control Rig | `Actor.js` 절차적 골격 애니메이션 | 모션캡처 없음 |
| Behavior Tree + AI Perception | `AI.js` 상태 기계 + 시야/청각 인지 + 엄폐 점수화 + 분대 조율 | |
| World Partition | 미션별 레벨 로딩 + 청크 지형 | 오픈월드 스트리밍 없음 |
| MetaSounds | `AudioEngine.js` Web Audio 합성 | 녹음 음원·성우 없음 |

## UE5로 이전하려면

이 저장소의 설계(미션 스크립트 구조, AI 상태, 대사 데이터, 레벨 레이아웃 좌표, 캠페인 문서)는 엔진 독립적으로 작성되어 있습니다. GPU와 UE5가 설치된 Windows 워크스테이션에서는 다음 순서를 권장합니다: 레벨 레이아웃(`src/world/levels/*.js`의 좌표) → World Partition 레벨로 재구성, `AI.js` 상태 → Behavior Tree 태스크, `missions/*.js` 세그먼트 → Level Sequence + Blueprint 이벤트.
