# Living Stage — Claude Code Project Context

> **단일 진실(spec):** `living_stage_spec_v2_3_merged.md`. 모든 결정은 이 스펙과 합치되어야 한다. 충돌하면 스펙이 이긴다.

## 한 줄 정체
발표자가 말하면 말하는 속도에 맞춰 인터랙티브 비주얼이 무대에 자란다. hero = **Sim 위젯**(슬라이더로 만질 수 있는 살아있는 모델, 60fps).

- **헤드라인:** "말하는 속도에 화면이 따라온다"
- **정점:** 살아있는 Sim — 슬라이더 드래그 → 내부 hand-rolled 차트 실시간 반응
- **임팩트:** 준비된 슬라이드의 소멸 — 말하면 나타나고, 만질 수 있다
- **제출:** `cerebralvalley.ai/e/google-io-hackathon/hackathon/submit` (Devpost 아님)
- **컷오프:** 16:00 하드 프리즈

---

## ★ 절대 안 됨 (실격/즉사 리스크)

- **키를 코드/커밋에 박기** → 전 API 키 자동 폐기 = 라이브 데모 45% 0점. push 전 항상 `git grep -nE 'AIza[0-9A-Za-z_-]{20,}'`.
- **퀵스타트 코드 복붙** → 모델 ID는 `gemini-3.5-flash` (NOT `gemini-3-flash-preview`).
- **thinking `high`/`medium`** → TTFT ~20s = 즉사. 오직 `minimal`(orch) / `low`(fill) / `minimal`(patch).
- **정점(Sim) 차트를 recharts로** → 10Hz 슬라이더 재렌더 jank → 정점 붕괴. **hand-rolled `<canvas>/<svg>`** 만.
- **`temperature`/`top_p`/`top_k` 전송** → 3.x 기본값 권장. 낮추면 루프/성능 저하.
- **React Context 공유상태** → Zustand 셀렉터 구독으로 대체.
- **`math.evaluate(문자열)` 검증 없이** → expr 화이트리스트 + node-type 차단 필수 (`src/lib/safe-math.ts`).
- **managed agent를 데모 라이브 경로에** → 14:30 PT 접근 + 구조화출력 미지원. 라이브엔 절대 안 넣음.
- **폴백을 라이브처럼 위장** → `01`§5 실격 회피. 입(TTS)+배너로 선고지.
- **Devpost 제출** → 실격.

## ★ 반드시

- `.env`+`.gitignore` **처음부터**. 키는 Cloud Run 서비스 환경변수로만 (또는 Secret Manager).
- 모든 Gemini 호출에 **503 지수 백오프 retry** (AbortController 통합 + 상한 4회).
- Web Speech `onend` 재시작 루프 + **interim을 store에 누적**(인스턴스 밖, 재시작 생존).
- 폴백 = **순서 인덱스** + 입(TTS)+배너 선고지. rehearsed.json에 Sim vars/rels/chart 포함.
- 트랜스크립트 상시 표시 (ASR 오인식 자가교정 앵커).
- `cachedContentTokenCount` 1분차 HUD 계측. 0이면 prefix 2,500→4,500토큰 즉시 bump.
- 16:00 하드 프리즈 → public push → cerebralvalley 제출(managed agents 필수 필드 §13.2 답).
- 임시계정 코드/에셋 **당일 export** (익일 사망).

---

## 키 통일 (실수 방지 — 두 문서 병합 흔적)

| 항목 | 정답 | 절대 안 됨 |
|---|---|---|
| 초기값 키 | **`v0`** | `v` |
| 모델 ID | **`gemini-3.5-flash`** | `gemini-3-flash-preview` |
| SDK | **`@google/genai` v2.6+** | 레거시 SDK |
| SDK 표면 | **`models.generateContentStream`** | Interactions API (전환은 §19 검증 후만) |
| 정점 차트 | **hand-rolled `<canvas>/<svg>`** | recharts |
| 보조 Plot 차트 | recharts OK | — |
| 폴백 인덱싱 | **순서 인덱스** | 해시 매칭 |

---

## 개발 팀 에이전트 (`.claude/agents/`)

특정 영역 작업은 `Agent` 툴로 위임. 일반 통합 작업은 메인 컨텍스트에서.

| 에이전트 | 책임 | 스펙 섹션 |
|---|---|---|
| `sim-engine-architect` | 정점 Sim 위젯 + MiniChart canvas + mathjs 샌드박스 | §4.2·§5·§6·§9 |
| `gemini-ai-integrator` | Gemini SDK + 503 retry + AJV + 스트리밍 + 캐시 | §3.6·§4·§7·§10·§12 |
| `voice-stage-coordinator` | Web Speech + interim store + AbortController + fan-out | §2·§7.3·§8 |
| `cloud-run-security-guard` | server.js 프록시 + Cloud Run 배포 + 키 차단 + git grep | §3.2·§3.4·§15 |
| `fallback-resilience-curator` | 순서 인덱스 폴백 + rehearsed.json + announce | §11·§12 |
| `stage-ui-designer` | Motion FLIP + 60fps + "슬라이드 소멸" 미감 | §9·§16 |
| `submission-packager` | README + 1분 영상 + 제출폼(managed agents) + tag | §13·§14·§15·§17·§18 |

---

## 타임라인 (스펙 §14)

| 시간 | 블록 | 핵심 산출물 |
|---|---|---|
| 09:00–10:30 | 셋업 | 임시계정·Cloud Run 서비스·Discord $5k 질문 |
| **10:30–11:30 H1** | **정점+503 먼저** | safe-math → retry → Sim E2E (MiniChart canvas) |
| 11:30–12:30 H2 | 음성+성장 | Web Speech 재시작 + interim store + 3위젯 |
| 12:30–13:00 | 점심 | — |
| 13:00–14:00 H3 | 보조+병렬 | Plot/Compare + fan-out 시각효과 |
| 14:00–15:00 H4 | 캐싱+폴백 | cachedContentTokenCount 검증 + rehearsed.json |
| 15:00–15:45 H5 | 확장/폴리시 | read-only 미러, 보이스편집 (조건부) |
| 15:45–16:00 | 점검 | git grep 키 스캔 + 풀 드라이런 |
| **16:00** | **하드 프리즈** | git tag submission → public push |
| 16:00–17:00 | 패키징 | 1분 영상 + cerebralvalley 제출 + 코드 export |

## 컷 우선순위 (희생 순서)

read-only 미러 → 보이스편집 → 4·5번째 위젯 → 성장 애니메 → 캐싱 → **(절대 안 컷) Sim 내부 반응 · 503 retry · 폴백 · 재시작루프+interim · 트랜스크립트**

---

## Commit Convention (모든 향후 커밋이 따른다)

### 포맷 (Conventional Commits)
```
<type>(<scope>): <subject>

[optional body — explain WHY, not how. blank line above. wrap ~72 chars.]
```

### 하드 룰
- **English only.** Subject·body·scope 전부 영어. 한국어 금지.
- **Imperative mood.** "add" not "added", "fix" not "fixed".
- **Subject ≤ 72자, 소문자 시작, 끝에 마침표 없음.**
- **★ Claude/AI 서명 금지.** `🤖 Generated with Claude Code`, `Co-Authored-By: Claude`, 어떤 형태의 자동 서명도 추가하지 않음. 커밋 본문만.
- **One commit = one logical unit.** 작업 단위 끝나면 *즉시* 커밋. 모아서 커밋 금지.
- **푸시된 커밋에 `--amend` 금지.** 항상 새 커밋.
- **`--no-verify` 로 훅 우회 금지.**

### Types
| type | 용도 |
|---|---|
| `feat` | 새 기능 |
| `fix` | 버그 수정 |
| `refactor` | 내부 구조 변경, 동작 동일 |
| `perf` | 성능 (60fps, 캐시 히트 등) |
| `docs` | README, CLAUDE.md, 에이전트 프롬프트, 스펙 |
| `chore` | deps, .env 템플릿, .gitignore, 기타 |
| `build` | Vite·Dockerfile·번들러 설정 |
| `ci` | pre-push 훅, scan 스크립트, GH Actions |
| `style` | 포맷 only (시각 디자인은 `feat(ui)`) |
| `test` | 테스트 파일 |
| `revert` | 이전 커밋 되돌리기 |

### Scopes (에이전트 팀 매핑)
| scope | 영역 |
|---|---|
| `sim` | Sim 위젯, MiniChart, safe-math |
| `gemini` | Gemini SDK, retry, schemas, PREFIX |
| `voice` | useASR, AbortController, handleUtterance |
| `security` | server.js, Cloud Run 배포, .env, .gitignore, 키 처리 |
| `fallback` | rehearsed.json, useFallback, announce |
| `ui` | Motion, 스타일링, 트랜스크립트, 디자인 토큰 |
| `stage` | App/Stage 셸, Zustand store, 글루 코드 |
| `submission` | README, 영상 에셋, 제출 폼 문서 |
| `agents` | `.claude/agents/*.md` |
| `spec` | `living_stage_spec_v2_3_merged.md` |
| (생략) | 여러 scope 걸침 / 프로젝트 전체 |

### 커밋 케이던스 (작업 단위 = 즉시 커밋)
**스펙의 각 검증 게이트(validation gate)를 통과할 때마다 즉시 커밋.** H-block 끝까지 모았다가 한 번에 커밋 금지. 예:
- `safe-math` 가 `.constructor` 차단 통과 → `feat(sim): add safe-math sandbox with node-type blocklist`
- 503 retry mock 테스트 통과 → `feat(gemini): add withRetry with abort signal and 4-attempt cap`
- MiniChart 60fps 확인 → `perf(sim): redraw canvas only when series changes`
- 에이전트 프롬프트 수정 → `docs(agents): clarify rehearsed.json shape`
- 의존성 추가 → `chore: add ajv and mathjs deps`

커밋 후엔 가급적 push 도 즉시 (`git push`).

### Good 예시
```
feat(sim): add hand-rolled MiniChart with 60-point canvas redraw
feat(gemini): wire 503 retry with abort signal and 4-attempt cap
fix(security): exclude VITE_ vars from prod build to prevent key leak
chore: tighten gitignore env and secret patterns
docs(agents): align rehearsed.json shape between sim and fallback
perf(ui): drop will-change after animation completes
refactor(stage): extract handleUtterance into hooks/useStage
```

### Bad 예시
```
❌ Update files                              # vague
❌ feat: Add Sim widget.                     # capitalized, period
❌ feat(sim): Sim 위젯 추가                  # Korean
❌ WIP                                       # no follow-up
❌ feat(sim): add Sim
   🤖 Generated with Claude Code
   Co-Authored-By: Claude <noreply@...>      # banned signatures
```

---

## 빠른 명령

```bash
# 키 누출 스캔 (push 전 항상)
git grep -nE 'AIza[0-9A-Za-z_-]{20,}'

# Cloud Run 환경변수에 키 설정 (이미 했음. 변경 시:)
gcloud run services update SERVICE \
  --update-env-vars GEMINI_API_KEY=AIza... --region REGION

# 배포 (Dockerfile 자동 감지, --source . 로 Cloud Build 사용)
npm run deploy
# 또는: gcloud run deploy living-stage --source . --region us-central1 --allow-unauthenticated
# 서비스/리전 커스터마이즈: CR_SERVICE=name CR_REGION=region npm run deploy

# 로컬 dev (두 터미널)
npm run dev          # Vite :5173 (proxy /v1beta → :8080)
node server.js       # proxy :8080 (GEMINI_API_KEY 환경변수 필요)
# OR Cloud Run URL 에 직접 붙기:
# VITE_DEV_PROXY=https://your-service.run.app npm run dev

# 프리즈
git tag submission && git push origin --tags
```

---

## 파일 구조 (목표 — 스펙 §3.5)

```
src/
  lib/
    safe-math.ts       ← §5  mathjs 샌드박스 + 검증 + 컴파일
    retry.ts           ← §7  503 지수 백오프 (abort + 상한)
    gemini.ts          ← §7  orchestrator/fill + 스트리밍
    schemas.ts         ← §4  JSON 스키마 + AJV
  hooks/
    useASR.ts          ← §8  음성
    useFallback.ts     ← §11 폴백 (순서 인덱스)
  widgets/
    Sim.tsx            ← §6·§9  ★정점 (로컬 state + hand-rolled MiniChart)
    MiniChart.tsx      ← §6  ★ canvas/svg 직접
    Plot.tsx           ← recharts 허용
    Compare.tsx Flow.tsx Annotate.tsx Skeleton.tsx
  store.ts             ← §6  Zustand
  Stage.tsx App.tsx
  hud.tsx              ← §10 cachedContentTokenCount HUD
  PREFIX.ts            ← §10 캐시 프리픽스 (byte-stable, SHA 검증)
  rehearsed.json       ← §11 (H4 캡처, 순서 인덱스, Sim 데이터 포함)
server.js              ← Cloud Run 단일 컨테이너: dist/ 정적 + /v1beta/* Gemini 프록시
Dockerfile             ← multi-stage build (node:20-alpine)
.dockerignore          ← node_modules·dist·tests·env 제외
.gcloudignore          ← gcloud 업로드 컨텍스트 슬림화
```

> **★ 배포 모델 변경 (2026-05-23):** 스펙 §3.4 의 Cloudflare Worker 안은 *대회측 요구사항으로* Cloud Run 단일 컨테이너로 대체됨. 같은 origin → CORS 불필요. server.js 가 `dist/` 와 `/v1beta/*` 프록시를 동시에 서빙. `GEMINI_API_KEY` 는 Cloud Run 서비스 env vars 에만 존재(이 레포에 없음).
