# Living Stage — 완전 구현 스펙 v2.3 (v2.1 ⊕ v2.2 종합판)

> **이 문서의 정체:** `Living_Stage_BUILD_v2.1`(BUILD, "보면서 코드 치는" 명세)과 `living_stage_spec_v2.2`(당일 현장 반영판)를 **하나로 병합**한 단일 진실. 두 문서는 사실상 같은 빌드였고 전략적으로 충돌하지 않았다 — v2.2는 v2.1 + 현장 갱신이다. 따라서 **버리지 않고 종합**한다.
> **병합 원칙:** v2.2의 *구조·안전 코드*를 베이스로 채택하되, v2.2가 *퇴행한 2가지*(정점 차트를 recharts로 바꿈 / 티어3.5 managed agent 경로를 통째로 삭제)는 **v2.1로 되돌린다.**
> **한 줄 정체:** 발표자가 말하면 말하는 속도에 맞춰 인터랙티브 비주얼이 무대에 자란다. 그중 hero(Sim)는 그 자리에서 만질 수 있는 모델이 되어, 슬라이더를 당기면 내부 차트가 실시간 반응한다.
> **헤드라인:** "화면이 말하는 속도를 따라잡는다." **임팩트:** "준비된 슬라이드의 소멸." **정점:** 살아있는 Sim.
> 채점 `04` · 발표 `02`§7 · 기술 `03` · 사실 `01`. ⚠️ 모델 수치는 컷오프 이후 — **당일 자기 request 로그가 유일한 진실**(§19).

---

## 0. 병합 결정 로그 (v2.1 vs v2.2 → v2.3)

| # | 항목 | v2.1 | v2.2 | v2.3 채택 | 이유 |
|---|---|---|---|---|---|
| 1 | **정점 차트** | hand-rolled `<canvas>/<svg>` | recharts | **hand-rolled (v2.1)** | 슬라이더 ~10Hz 재계산 → recharts 재렌더 jank 위험. 정점은 데모력 45%의 핵심. ~0.4ms/frame 직접 그리기가 60fps 안전. recharts는 *정적* 보조 Plot에만. |
| 2 | **mathjs 샌드박스** | `n.name in math`(관대) | 화이트리스트 + node-type 차단 + surface 정규식 | **v2.2** | 더 안전. `AccessorNode/Object/Assignment` 차단으로 `.constructor` 탈출 봉쇄 + 함수 화이트리스트. |
| 3 | **orchestrator 검증** | responseJsonSchema + try/catch | + **AJV** defense-in-depth | **v2.2** | 4중 방어(AJV + 단일 보정 + 503 retry + 폴백). |
| 4 | **503 retry** | `callWithRetry`(tries/base) | `withRetry`(abort 체크 + transient set + 메시지 정규식 + 남용 상한) | **v2.2** | AbortController 통합 + 더 많은 상태코드 + 남용조항 가드. |
| 5 | **Worker 프록시** | `?key=...` (쿼리 유실) | `?key=...&{원본 쿼리 보존}` | **v2.2** | SDK가 쿼리 파라미터 붙일 때 생존. |
| 6 | **티어3.5 managed agent** | 경계 분명한 비동기 1단계로 *유지*(§13) | "비현실" → 통째 삭제 | **v1 유지 + v2 정직 프레이밍**(§16.4) | $5k 후광. 코어 아님 맞지만 *하드 게이트* 옵션으로 보존(14:30 접근 + 코어 안정 + 안전장치 전제). |
| 7 | **Sim 초기값 키** | `v0` (Sim.tsx 완성 코드 존재) | `v` (토큰 절약) | **`v0` (v2.1)** | v2.1의 완전한 `Sim.tsx`가 그대로 드롭인. 일관성 > 미미한 토큰 차이. |
| 8 | **캐시 프리픽스** | ~4,500tok (3 floor 다 초과) | ~2,500tok (Dev API floor만) | **2,500 1차 + 4,500 즉시 레버**(§10) | 우린 Worker로 Developer API 고정 → 2,500 충분. silent-miss 실측 시 4,500으로 즉시 bump. |
| 9 | **문서 구조** | 압축형(코드 우선) | 가드레일/북극성/아키도/채점/부록 | **v2.2 구조** | 의사결정·당일 네비게이션에 유리. |
| 10 | **SDK 표면 결정** | 상세 근거 §1 + 당일 검증 §16 | 1줄 §7.3 | **v1 상세 + v2 위치**(§3.6·§19) | GenerateContent 유지 결정과 *그 이유*, 당일 검증법까지 보존. |
| 11 | **폴백 고지** | 입으로 `say()` | 배너 `announce()` | **둘 다(v2.3)**(§11) | 마이크 데모(입) + 텍스트/링크 데모(배너) 양쪽 커버. |
| 12 | **HUD/토큰 로깅** | 전용 `hud.tsx` 컴포넌트 | `logUsage` 콘솔 | **둘 다(v2.3)** | 화면 구석 HUD + 콘솔 usage 로깅 동시. |

> **유지(두 문서 공통, 변경 없음):** 시간축 성장 헤드라인 / 정점=살아있는 Sim / 임팩트=슬라이드 소멸 / 단일 실패점(orchestrator 1개) / Web Speech 재시작+interim store 누적 / 트랜스크립트 상시 / 라이브-우선 폴백+선고지+순서 인덱스 / cerebralvalley 제출(Devpost 아님) / 텍스트 모드 노출 / 16:00 하드 프리즈 / 유령 카드 0 / 키 누출 즉사 방어.

---

## 0.5 한 장 요약 (북극성)

| 축 | 결정 |
|---|---|
| **헤드라인** | "말하는 속도에 화면이 따라온다" (시간축 성장) |
| **정점** | hero = **Sim 위젯**. 슬라이더 당기면 위젯 내부에서 변수→관계식 재평가→**hand-rolled 미니차트** 갱신 (결정론, 60fps) |
| **임팩트** | "준비된 슬라이드의 소멸 — 말하면 나타나고, 만질 수 있다" |
| **모델** | `gemini-3.5-flash` (퀵스타트의 `gemini-3-flash-preview` 아님), `@google/genai` v2.6+, 구조화 출력 스트리밍, thinking minimal/low only, **503 retry 내장** |
| **병렬** | fan-out = "동시 등장 시각효과" (바인딩 아님). 정점은 단일 위젯 자기완결 |
| **단일 실패점** | orchestrator 1개 (fill은 try/catch + 스켈레톤 격리) |
| **폴백** | 라이브 우선 → 끊기면 **입+배너로 선고지** → 순서 인덱스로 리허설 캡처 재생 |
| **제출** | `cerebralvalley.ai/.../submit` · 공개 링크 텍스트 모드 기본 · **managed agents 폼 필드 필수 답변** |
| **프리즈** | 16:00 하드. 마지막 1h 패키징 + **push 전 git grep 키 스캔** |

---

## 1. 절대 / 반드시 (가드레일)

**🚫 절대 안 됨**
- `thinking_level` `high`·`medium` (high = TTFT ~20초 = 즉사)
- `temperature`/`top_p`/`top_k` 전송 (3.x 기본값 권장 — 낮추면 루프/성능 저하)
- Antigravity/Managed Agents API 런타임 전환 (구조화 출력 미지원 = 슬롯-필 즉사)
- 폴백을 라이브처럼 위장 / jitter 위장 (`01`§5 실격 회피)
- 단일 위젯 실패가 씬 붕괴 / React Context 공유상태 / Devpost 제출
- cross-call 바인딩에 정점 걸기 (v2.1이 없앤 위험)
- `math.evaluate(문자열)` 검증 없이 호출
- **정점 차트를 recharts로** (재렌더 jank — 정점은 hand-rolled)
- **키를 코드에 박아 public push** (전 API 키 자동 폐기 = 라이브 0점)
- 퀵스타트 코드 복붙 (`gemini-3-flash-preview`가 박혀 있음 → `gemini-3.5-flash`)
- **managed agent를 데모 단일 핵심 경로로 의존** (14:30 PT에야 전체 접근 — `02`§4)

**✅ 반드시**
- Sim 내부 반응형 + **hand-rolled 미니차트**(정점 결정론, 60fps) — §4·§6·§9
- mathjs 샌드박싱(화이트리스트+node 차단) + expr 검증 — §5 (H1 최우선)
- **모든 Gemini 호출에 503 지수 백오프 retry** (abort 통합 + 남용 상한) — §7
- Web Speech `onend` 재시작 + interim을 store에 누적 — §8
- 트랜스크립트 상시 표시
- 폴백 = 순서 인덱스 + **입+배너 선고지** — §11
- **.env+.gitignore 처음부터 + push 전 `git grep` 키 스캔** — §3·§15
- **제출폼 managed agents 필드 정직 답변**("parallel specialist agents") — §13
- 공개 링크 텍스트 모드 — §15
- `cachedContentTokenCount` 1분차 계측 (silent-miss 감시) — §10
- 리허설 대본으로 유령 카드 0 — §8
- 16:00 하드 프리즈

---

## 2. 아키텍처 전체 그림

```
[마이크] ── Web Speech (continuous, interim) ──┐  interim은 store에 누적(인스턴스 밖)
[텍스트 입력] ─────────────────────────────────┤  ← 공개 링크 기본 모드
                                               ▼
                               [utterance final + ULID]
   ┌───────────────────────────────────────────┼───────────────────────────────┐
   │ (a) 키워드 정규식 → 스켈레톤 프리스폰        │ (b) Orchestrator 1콜            │
   │     (≤150ms) ※대본으로 프리스폰=최종씬 일치  │     thinking:minimal maxOut:800  │
   └───────────────────────────────────────────┘     +503 retry 래퍼              │
                                                      responseJsonSchema=layout    │
                                                      +AJV 검증 (defense-in-depth)  │
                                                      propertyOrdering: hero 먼저   │
                                                      hero를 'sim'으로 유도          │
                                                              │ hero 닫힘→셸 페인트  │
                                                              ▼                     │
                            Promise.all([ fill_hero(sim), fill_b, fill_c ])         │
                                thinking:low maxOut:1200 +503 retry, 각 독립        │
                                try/catch+Abort, cross-call 키 합의 불필요           │
                                                              ▼                     │
       [Sim 위젯] vars+rels → mathjs compile(검증 통과분) → 슬라이더(로컬)→재평가     │
                  → hand-rolled <canvas>/<svg> 미니차트 갱신 (전부 위젯 내부)        │
                                                              ▼                     │
                            Framer Motion 성장 + hero(Sim) pulse                    │
   라이브 실패(타임아웃/503 소진/검증실패) ──→ 입+배너 선고지 → 폴백(순서 인덱스) ───┘
```

---

## 3. 기술 스택 + 셋업 (H1 시작, ~30분)

### 3.1 임시계정 셋업 (확정 절차 — `01`§6·`02`§2)
1. **새 Chrome 프로필 생성** → 받은 임시계정으로 **AI Studio 로그인**.
2. `aistudio.google.com/api-keys` → **"Import project"** → 생성된 프로젝트 Import → **Tier 3 키** 확인(없으면 Create).
3. 임시계정 = **Tier 3 유료 프로젝트 + 고쿼터**. 열리는 것: 3.1 Pro·Veo·Nano-Banana·**Cloud Run**·AI Studio Build max mode. (공식: `goo.gle/hackathon-account`)
4. **⚠️ 계정은 익일 삭제** → 코드·에셋 당일 export(§15).
5. 임시계정이 늦으면 **무료 티어 키로 공백 메움**(카드 불필요, ~일 1,500요청). 데모 링크에 Cloud Run/고쿼터가 필요하면 임시계정 import 우선.

### 3.2 키 누출 방어 (즉사 콤보 회피 — `01`§6·`02`§8)
- **처음부터 `.env` + `.gitignore`로 키 분리.** 코드엔 `process.env`만.
- 키를 코드에 박아 public push → **프로젝트 전 API 키 자동 폐기 → 라이브 데모 45% 0점.**
- **push 전 `git grep` 키 스캔** (16:00 패키징 때 재확인): `git grep -nE 'AIza[0-9A-Za-z_-]{20,}'`
- 브라우저에 키 노출 금지 → **Cloudflare Worker 프록시**(§3.4)로 키를 서버사이드에.
- ⚠️ 비정상 사용(수천 건 요청) = 실격 + 밴. 발화당 3~5콜 × 12발화라 안전하지만, **개발 중 무한 루프로 호출 폭주 주의**(특히 503 retry가 무한 재시도 안 하도록 상한 — §7).

### 3.3 의존성
```bash
npm create vite@latest living-stage -- --template react-ts
cd living-stage
npm i @google/genai zustand mathjs motion ulid recharts ajv
```
| 패키지 | 버전 | 용도 |
|---|---|---|
| `@google/genai` | **v2.6+** | Gemini (레거시 EOL). ⚠️ **모델 ID는 `gemini-3.5-flash`** — 퀵스타트의 `gemini-3-flash-preview` 복붙 금지 |
| `zustand` | v5 (`useShallow`) | 셀렉터 구독 (Context 대체) |
| `mathjs` | latest | 관계식 평가 (샌드박싱 필수 §5) |
| `motion` | v12 (`motion/react`) | FLIP 성장/이동 |
| `ulid` | latest | utterance ID (monotonicFactory 권장) |
| `recharts` | v2 | **보조 Plot 위젯만** (정점 Sim 차트는 hand-rolled — §6) |
| `ajv` | latest | orchestrator 출력 검증 §12 |

> **★ 정점 차트는 의존성 없음:** Sim 미니차트는 `<canvas>` 또는 `<svg>`를 직접 그린다(§6·§9). recharts는 정적 보조 Plot 전용. 슬라이더 ~10Hz 재계산을 recharts에 태우면 재렌더 jank로 정점이 무너진다.

### 3.4 Cloudflare Worker 프록시 (쿼리 보존판 — v2.2)
```js
// worker.js — secret: GEMINI_API_KEY (임시계정 Tier 3 키. ⚠️ 익일 사망)
export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors() });
    if (req.method !== "POST")    return new Response("OK", { headers: cors() });
    const url = new URL(req.url);
    const upstream =
      `https://generativelanguage.googleapis.com${url.pathname}` +
      `?key=${env.GEMINI_API_KEY}${url.search ? "&" + url.search.slice(1) : ""}`;
    const r = await fetch(upstream, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: req.body,
    });
    return new Response(r.body, {                       // SSE는 r.body 그대로 파이프(스트리밍 유지)
      headers: { ...cors(), "Content-Type": r.headers.get("Content-Type") ?? "application/json" },
    });
  },
};
const cors = () => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
});
```
- 키는 `wrangler secret put GEMINI_API_KEY`.
> **뒤처지면:** 프록시 안 서면 `.env.local`에 키 두고 localhost 단일 데모. README에 키 리스크 명시.
> **데모 링크 대안:** Cloud Run(임시계정에 포함, 심사창엔 생존·익일 내려감)도 가능. 단순함은 Cloudflare Pages+Worker.

### 3.5 파일 구조
```
src/
  lib/safe-math.ts       ← §5  mathjs 샌드박스(화이트리스트+node 차단)+검증+컴파일
  lib/retry.ts           ← §7  503 지수 백오프 (abort 통합 + 남용 상한)
  lib/gemini.ts          ← §7  orchestrator/fill + 스트리밍 (증분 JSON 파서)
  lib/schemas.ts         ← §4  JSON 스키마 + AJV
  store.ts               ← §6  Zustand (scene/widgets/transcript/fallback/shared/hud)
  hooks/useASR.ts        ← §8  음성
  hooks/useFallback.ts   ← §11 폴백 (순서 인덱스)
  widgets/Sim.tsx        ← §6·§9  ★정점 (로컬 state + hand-rolled MiniChart)
  widgets/MiniChart.tsx  ← §6  ★ canvas/svg 직접 (recharts 아님)
  widgets/Plot.tsx Compare.tsx Flow.tsx Annotate.tsx  ← Plot만 recharts 허용
  widgets/Skeleton.tsx
  Stage.tsx App.tsx
  hud.tsx                ← §10 cachedContentTokenCount 등 디버그 HUD
  rehearsed.json         ← §11 (H4 캡처, 순서 인덱스 배열, Sim 데이터 포함)
  PREFIX.ts              ← §10 캐시 프리픽스 (byte-stable, SHA 검증)
```

### 3.6 ★ SDK 표면 결정 (GenerateContent 유지 — v2.1 근거 보존)
`03`§0이 **Interactions API(Beta)**(`client.interactions.create`, `POST /v1beta/interactions`, 헤더 `Api-Revision: 2026-05-20`)를 새 주력·문서 디폴트로 안내한다. 그러나 우리 슬롯필의 생명은 **구조화출력 스트리밍**(`responseJsonSchema` + 부분 JSON 스트림)이고, 그게 가장 확실한 표면은 `models.generateContentStream`이다. `03`도 "GenerateContent도 지원"이라 명시. → **v2.3는 GenerateContent로 박는다.** Interactions 전환은 *구조화출력 스트리밍이 그 표면에서 확실히 되는지*를 당일 자기 로그로 확인한 뒤에만(→§19). ⚠️ 일반 퀵스타트 페이지 코드는 stale(2026-03-27, `gemini-3-flash-preview` 사용) — 복붙 금지, `gemini-3.5-flash`로 교체(`03`§6).

---

## 4. 데이터 스키마 (최저 수준)

### 4.1 Orchestrator 출력 (레이아웃만, 얕게 — `bk` 없음)
```jsonc
{
  "type": "object",
  "propertyOrdering": ["hero", "slots", "uid"],
  "required": ["hero", "slots", "uid"],
  "properties": {
    "hero": { "type": "integer", "minimum": 0, "maximum": 2,
              "description": "Index of the hero slot. PREFER a 'sim' for interactivity." },
    "slots": {
      "type": "array", "minItems": 1, "maxItems": 3,
      "items": {
        "type": "object",
        "propertyOrdering": ["t", "pos", "sz", "emp"],
        "required": ["t", "pos", "sz"],
        "properties": {
          "t":   { "enum": ["sim", "plot", "flow", "compare", "annotate"] },
          "pos": { "enum": ["TL", "TR", "BL", "BR", "CENTER", "FULL"] },
          "sz":  { "enum": ["S", "M", "L", "XL"] },
          "emp": { "type": "integer", "minimum": 0, "maximum": 3 }
        }
      }
    },
    "uid": { "type": "string" }
  }
}
```

### 4.2 ★ Sim fill (정점 — 자기완결 반응형). 초기값 키 = `v0`
```jsonc
// 주입: { uid, slot, t:"sim", layout, transcript_seg }
{
  "type": "object",
  "propertyOrdering": ["t", "title", "data"],
  "required": ["t", "data"],
  "properties": {
    "t": { "const": "sim" },
    "title": { "type": "string", "maxLength": 48 },
    "data": {
      "type": "object", "required": ["vars", "rels"],
      "properties": {
        "vars": {
          "type": "array", "minItems": 1, "maxItems": 4,
          "items": {
            "type": "object", "required": ["n", "v0"],
            "properties": {
              "n":      { "type": "string", "description": "변수명. 위젯 내부에서만 유효." },
              "v0":     { "type": "number", "description": "초기값." },
              "min":    { "type": "number" }, "max": { "type": "number" },
              "step":   { "type": "number" }, "unit": { "type": "string" },
              "slider": { "type": "boolean", "description": "true면 슬라이더 노출" }
            }
          }
        },
        "rels": {
          "type": "array",
          "items": {
            "type": "object", "required": ["lhs", "expr"],
            "properties": {
              "lhs":  { "type": "string" },
              "expr": { "type": "string",
                        "description": "vars 이름에 대한 순수 수식. 연산자 + - * / ^ ( )와 화이트리스트 함수(sqrt exp log abs min max sin cos)만. 임의 함수호출/속성접근 금지. I/O 없음." }
            }
          }
        },
        "chart": {
          "type": "object",
          "properties": {
            "x":     { "type": "string", "description": "슬라이더 변수명" },
            "y":     { "type": "string", "description": "rels의 lhs 중 하나" },
            "scale": { "enum": ["lin", "log"] }
          }
        }
      }
    }
  }
}
```
> **반응형이 위젯 내부에서 닫히는 원리:** Sim은 받은 `vars`로 로컬 상태를 만들고, `slider:true` 변수를 당기면 그 변수만 갱신 → `rels`의 모든 `expr`를 mathjs로 재평가 → `chart.y` 재계산 → **hand-rolled 미니차트 재그림**. 이름이 위젯 안에서만 유효 → 다른 호출과 글자 맞출 필요 없음 → 슬라이더가 조용히 죽는 일 **구조적으로 불가능.**
> **★ 키 통일 메모:** 초기값 키는 `v0`로 고정(v2.1 `Sim.tsx`가 그대로 드롭인). v2.2의 `v`와 헷갈리지 말 것 — 스키마·few-shot·컴포넌트 코드 전부 `v0`.

### 4.3 비-hero fill (정적/read-only, `bk` 없음). Plot만 recharts
- **Plot**: `{ k:"line|bar|area|scatter", x, y, scale, series:[{n, pts:[[x,y]]}] }` — recharts (정적, 재렌더 무관)
- **Compare**: `{ a, b, rows:[{k, av, bv, lean:"a|b|tie"}] }`
- **Flow**: `{ nodes:[{id, l, kind}], edges:[{s, t, l}] }`
- **Annotate**: `{ txt(≤280), math?, hl?:[] }`

### 4.4 보이스 편집 패치 (단일 위젯)
```json
{ "uid":"u23", "patch":[{"op":"replace","path":"/slots/0/data/chart/scale","value":"log"}] }
```
RFC6902 부분집합 `replace|add|remove`. 트리거: `/(change|switch|set|make).*(scale|axis|range|step|로그|스케일)/i`.

---

## 5. mathjs 평가 엔진 (정점 안전 — H1 최우선, v2.2 강화판 채택)

```ts
// src/lib/safe-math.ts
import { create, all, type EvalFunction } from "mathjs";

const math = create(all);
math.import(
  { import: () => { throw new Error("disabled"); },
    createUnit: () => { throw new Error("disabled"); } },
  { override: true }
);

const ALLOWED_FNS = new Set(["sqrt","exp","log","log10","log2","abs","min","max","pow",
  "sin","cos","tan","floor","ceil","round","sign","sinh","cosh","tanh"]);
const ALLOWED_CONSTS = new Set(["pi","PI","e","E","tau"]);
const SURFACE = /^[0-9a-zA-Z_+\-*/^().,\s]+$/;

export function validateExpr(expr: string, varNames: Set<string>): string[] {
  const errs: string[] = [];
  if (!SURFACE.test(expr)) errs.push("illegal characters");
  let node: any;
  try { node = math.parse(expr); } catch { return ["parse error"]; }
  node.traverse((n: any) => {
    switch (n.type) {
      case "AccessorNode": case "IndexNode": case "ObjectNode":
      case "AssignmentNode": case "FunctionAssignmentNode":
        errs.push(`forbidden node: ${n.type}`); break;       // .constructor 등 탈출 차단
      case "FunctionNode":
        if (!ALLOWED_FNS.has(n.fn?.name)) errs.push(`fn not allowed: ${n.fn?.name}`); break;
      case "SymbolNode":
        if (!varNames.has(n.name) && !ALLOWED_CONSTS.has(n.name) && !ALLOWED_FNS.has(n.name))
          errs.push(`unknown symbol: ${n.name}`); break;
    }
  });
  return errs;
}

export type CompiledRel = { lhs: string; fn: EvalFunction };
export function compileRels(rels: {lhs:string;expr:string}[], varNames: Set<string>): CompiledRel[] {
  return rels.map((r) => {
    const errs = validateExpr(r.expr, varNames);
    if (errs.length) throw new Error(`bad rel "${r.lhs}": ${errs.join("; ")}`);
    return { lhs: r.lhs, fn: math.compile(r.expr) };       // compile-once / eval-many
  });
}
export function evalRel(c: CompiledRel, scope: Record<string, number>): number {
  const v = c.fn.evaluate(scope);
  return typeof v === "number" && Number.isFinite(v) ? v : NaN;
}
```
> **검증 실패 시:** 그 슬롯만 스켈레톤 + "expression error" 표시. 씬 전체는 산다. (여유 있으면 동일 프롬프트 + 에러 첨부로 1회 보정 호출 — §12.)
> **H1 검증:** 손 입력 transcript로 Sim fill 받아 → `compileRels` 통과 → 슬라이더 당겼을 때 `evalRel` 유한값 + 차트 그려짐. **이게 되면 정점이 선 거.**

---

## 6. Sim 위젯 — 정점 (widgets/Sim.tsx + widgets/MiniChart.tsx). 차트는 hand-rolled

핵심 로직(의사코드, v2.1 — 초기값 키 `v0`):
```tsx
function Sim({ data }: { data: SimData }) {
  const varNames = useMemo(()=>new Set(data.vars.map(v=>v.n)), [data.vars]);
  const compiled = useMemo(()=>compileRels(data.rels, varNames), [data.rels, varNames]); // throw→ErrorBoundary
  const sliderVar = data.vars.find(v=>v.slider) ?? data.vars[0];
  const [val, setVal] = useState(sliderVar.v0);          // ★ 로컬 — store 아님

  // 슬라이더 값 → 모든 rel 재평가 (memoized)
  const scope = useMemo(()=>{
    const s: Record<string,number> = {};
    for (const v of data.vars) s[v.n] = v.n===sliderVar.n ? val : v.v0;
    for (const c of compiled) s[c.lhs] = evalRel(c, s);
    return s;
  }, [val, compiled, data.vars, sliderVar.n]);

  // chart.y 를 chart.x(=슬라이더 변수) 범위에 대해 샘플 → 미니차트
  const series = useMemo(()=>sampleCurve(data, compiled, sliderVar, 60), [data, compiled, sliderVar]);

  return (
    <Card emphasis>
      <MiniChart series={series} cursorX={val} scale={data.chart?.scale ?? "lin"} /> {/* ★ canvas/svg */}
      <Slider min={sliderVar.min} max={sliderVar.max} step={sliderVar.step}
              value={val} onChange={rafThrottle(setVal, 10)} unit={sliderVar.unit}/>
      <Readouts scope={scope} rels={data.rels} />
    </Card>
  );
}
```
- **`MiniChart`은 `<canvas>` 또는 `<svg>` 직접** — 60점 샘플 재계산 ≈ 0.4ms/frame. **recharts 아님**(10Hz 슬라이더 드래그에 recharts 재렌더 = jank → 정점 붕괴).
- `rafThrottle(setVal, 10)`: 드래그 120Hz가 재평가를 폭주시키지 않게 ~10Hz로 coalesce.
- **이름은 전부 이 위젯 안에서만 유효** → cross-call 글자 맞춤 불필요. 슬라이더가 죽을 수 없음.
- `<ErrorBoundary fallback={<Skeleton/>}>`로 감싸 `compileRels` throw(나쁜 expr) 시 그 위젯만 스켈레톤.

> **MiniChart 구현 메모(canvas):** `useRef<canvas>` + `useEffect`로 series 변할 때만 redraw. x축 = 슬라이더 변수 범위 lin/log 매핑, y축 = chart.y 값역. cursorX 세로선 1개. 라이브러리 0 → 의존성·번들·재렌더 위험 모두 0.

---

## 7. Gemini 호출 + 503 retry + 스트리밍 (v2.2 핵심 코드 채택)

### 7.1 지수 백오프 retry (503/overwhelmed 방어 — `02`§8·`03`§10)
```ts
// src/lib/retry.ts
const TRANSIENT = new Set([429, 500, 502, 503, 504]);

/** 갓 출시 3.5 Flash는 부하로 503 빈발. 지수 백오프 + 지터 + 상한.
 *  ⚠️ 상한 필수: 무한 재시도 = 남용 조항(실격+밴) 위반 위험. */
export async function withRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
  { max = 4, base = 400 }: { max?: number; base?: number } = {}
): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= max; attempt++) {
    if (signal.aborted) throw new DOMException("aborted", "AbortError");   // ★ 발화 바뀌면 즉시 중단
    try {
      return await fn(signal);
    } catch (e: any) {
      lastErr = e;
      const status = e?.status ?? e?.response?.status;
      const transient = TRANSIENT.has(status) || /overwhelmed|UNAVAILABLE|503/i.test(String(e?.message));
      if (!transient || attempt === max) throw e;
      const delay = base * 2 ** attempt + Math.random() * 200;  // 지터
      console.warn(`[retry] ${status ?? "?"} attempt ${attempt+1}/${max}, ${Math.round(delay)}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
```
> 백오프 시퀀스 ≈ 400 / 800 / 1600 / 3200ms (+지터). 4회 소진해도 안 되면 → §11 폴백(입+배너 선고지 후 순서 인덱스 재생). **데모 표면 모델은 끝까지 `gemini-3.5-flash` 유지**(문제 정의가 강제). 데모 무관 보조작업이 있다면 3.1 Pro로 빼서 부하 분산 가능하나, 우리 구조는 orchestrator·fill이 곧 데모 표면이라 전부 3.5 Flash.
> **스트리밍 주의:** 스트리밍 호출은 *첫 청크 수신 전*까지만 retry 의미가 있다. 이미 페인트 시작 후 끊기면 retry 말고 §11 폴백.

### 7.2 호출 (retry 래핑 + 증분 JSON 파싱)
```ts
// src/lib/gemini.ts
import { GoogleGenAI } from "@google/genai";
import { withRetry } from "./retry";
import { PREFIX } from "../PREFIX";
import { ORCH_SCHEMA, SIM_SCHEMA, fillSchema } from "./schemas";

const ai = new GoogleGenAI({ httpOptions: { baseUrl: import.meta.env.VITE_WORKER_URL } });
const MODEL = "gemini-3.5-flash";   // ⚠️ 퀵스타트의 gemini-3-flash-preview 아님

export function callOrchestrator(t: string, signal: AbortSignal, onHero:(h:number)=>void) {
  return withRetry(async (sig) => {
    const stream = await ai.models.generateContentStream({
      model: MODEL,
      contents: [{ role:"user", parts:[{ text:`${PREFIX}\n\n<utterance>${t}</utterance>` }] }],
      config: { abortSignal: sig, thinkingConfig:{ thinkingLevel:"minimal" },
                responseMimeType:"application/json", responseJsonSchema: ORCH_SCHEMA, maxOutputTokens: 800 },
                // ⚠️ tools 배열 없음 (암시적 캐시 silent-miss 회피). 발화마다 history 리셋.
    });
    let buf = "", heroSent = false;
    for await (const chunk of stream) {
      buf += chunk.text ?? "";
      if (!heroSent) { const m = buf.match(/"hero"\s*:\s*(\d)/); if (m){ heroSent=true; onHero(+m[1]); } } // hero 먼저→셸 페인트
      logUsage(chunk);
    }
    return JSON.parse(buf);
  }, signal);
}

export function callFill(slot:any, layout:any, t:string, signal:AbortSignal) {
  return withRetry(async (sig) => {
    const stream = await ai.models.generateContentStream({
      model: MODEL,
      contents: [{ role:"user", parts:[{ text:
        `${PREFIX}\n\n<fill kind="${slot.t}">${JSON.stringify({slot,layout})}\n<utterance>${t}</utterance></fill>` }] }],
      config: { abortSignal: sig, thinkingConfig:{ thinkingLevel:"low" },
                responseMimeType:"application/json",
                responseJsonSchema: slot.t==="sim" ? SIM_SCHEMA : fillSchema(slot.t), maxOutputTokens: 1200 },
    });
    let buf = ""; for await (const chunk of stream){ buf += chunk.text ?? ""; logUsage(chunk); }
    return JSON.parse(buf);
  }, signal);
}

function logUsage(chunk:any){ const u=chunk.usageMetadata;
  if(u){ console.debug("[usage]",{cached:u.cachedContentTokenCount,in:u.promptTokenCount,out:u.candidatesTokenCount});
         useLS.getState().setHud({cached:u.cachedContentTokenCount, prompt:u.promptTokenCount, cand:u.candidatesTokenCount}); } }
```
> ⚠️ `503 retry`와 `AbortController`(§8 취소)가 충돌하지 않게: retry 루프는 매 시도 전 `signal.aborted` 체크 → 발화 바뀌면 즉시 중단(재시도 안 함).
> **증분 JSON 파싱(선택):** SSE 청크의 brace depth를 추적해 top-level 객체가 닫히면 `JSON.parse`. orchestrator는 `hero` 정규식 매치로 충분(위). 더 정교히 필요하면 brace-depth 파서로.

### 7.3 오케스트레이션 (의사코드)
```ts
async function handleUtterance(text:string){
  const uid = ulid();
  preSpawnByKeyword(text, uid);                    // §8 (a) ≤150ms 스켈레톤
  controllerRef.current?.abort("topic-changed");
  const c = new AbortController(); controllerRef.current = c;
  let layout;
  try { layout = await callOrchestrator(text, c.signal, h=>paintShells(uid,h)); }  // 503 retry 내장
  catch { announce(); replay(nextScriptIndex()); return; }                          // 소진→폴백
  const safe = validateScene(layout, text, c.signal);   // §12 AJV
  commitScene({uid,hero:safe.hero}, buildSkeletons(uid,safe));   // startTransition
  await Promise.all(safe.slots.map((slot,i)=>
    callFill(slot, safe, text, c.signal)
      .then(d=>{ if(slot.t==="sim"){ /* Sim은 compileRels가 위젯 내부에서 검증→ErrorBoundary */ }
                 setWidget(`${uid}:${i}`,{status:"ready",data:d}); })
      .catch(()=>setWidget(`${uid}:${i}`,{status:"error"}))   // 개별 격리(503 소진 포함)
  ));
}
```
> Interactions API(Beta)가 새 주력 표면이지만(`03`§0), **우리는 `generateContentStream`(GenerateContent) 유지** — 구조화 출력+스트리밍 조합이 검증돼 있고 v2.1 코드 그대로. (전환은 §3.6·§19 당일 검증 후에만.)

---

## 8. 음성 → 트리거 (v2.1·v2.2 공통, 변경 없음)

```ts
// src/hooks/useASR.ts (핵심)
const KW: [RegExp,string][] = [
  [/\b(simulate|slider|tweak|model|모델|시뮬)\b/i,"sim"],
  [/\b(chart|plot|graph|차트|그래프)\b/i,"plot"],
  [/\b(versus|vs|compare|비교)\b/i,"compare"],
  [/\b(flow|diagram|step|process|흐름|단계)\b/i,"flow"],
  [/\b(note|highlight|주석|강조)\b/i,"annotate"],
];
export function useASR(onFinal:(t:string)=>void, onPreSpawn:(k:string)=>void){
  const setInterim = useLS(s=>s.setInterim), appendFinal = useLS(s=>s.appendFinal);
  const silence = useRef<number|null>(null);
  useEffect(()=>{
    const SR=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    if(!SR) return;                                  // 미지원 → 텍스트 모드(§15)
    const rec=new SR(); rec.continuous=true; rec.interimResults=true; rec.lang="en-US"; rec.maxAlternatives=1;
    let stopped=false;
    rec.onresult=(e:any)=>{ let interim="",final="";
      for(let i=e.resultIndex;i<e.results.length;i++){const r=e.results[i];
        if(r.isFinal) final+=r[0].transcript; else interim+=r[0].transcript;}
      if(interim){ setInterim(interim);             // ★ store 누적(인스턴스 밖)→재시작 생존
        for(const[re,k]of KW) if(re.test(interim)){onPreSpawn(k);break;} }
      if(final) flush(final);
      else { if(silence.current)clearTimeout(silence.current);
        silence.current=window.setTimeout(()=>flush(interim),700); }   // 침묵 700ms
    };
    const flush=(t:string)=>{const x=t.trim(); if(!x)return;
      if(silence.current)clearTimeout(silence.current); appendFinal(x); onFinal(x);};
    rec.onend=()=>{ if(!stopped){try{rec.start();}catch{}} };          // ★ 재시작 루프
    rec.onerror=(e:any)=>{ if(["no-speech","aborted","network"].includes(e.error))return; console.warn("[asr]",e.error); };
    rec.start();
    return ()=>{stopped=true; rec.onend=null; rec.stop();};
  },[]);
}
```
- **트리거:** `[.!?]` 종료 OR 침묵 700ms.
- **취소:** 새 utterance면 직전 `AbortController.abort("topic-changed")`, late는 `uid`로 폐기.
- **★ 유령 카드 0:** 리허설 대본을 프리스폰 키워드 = 최종 씬 위젯이 항상 일치하도록 짠다(대본은 발표자가 통제). 즉흥 모드에선 페이드 가능함을 인지하되 심사 동선은 대본으로 유령 0.
- **트랜스크립트 상시 표시** — ASR 오인식 핵심 방어 + 신뢰성 앵커 + 자가교정.

---

## 9. 렌더링 (React 19, 60fps — v2.1·v2.2 공통)

```css
.card { contain: content; content-visibility: auto; contain-intrinsic-size: 0 320px; }
.card[data-anim] { will-change: transform; }   /* 애니메 순간만 */
```
- `key={w.id}`(=`${uid}:${slot}`, 안정·재사용 금지). 씬 커밋 `startTransition`. 트랜스크립트 `useDeferredValue`. **Context 금지**(Zustand 셀렉터 구독).
- `React.memo`(Plot·Sim). **Sim 미니차트는 `useMemo`(슬라이더 값에만 의존) + `<canvas>/<svg>` 직접 그리기**(recharts 아님).
- Sim 위젯: 로컬 `useReducer`/`useState`로 scope 관리 → 슬라이더 `onChange`(~10Hz rAF throttle) → `useMemo`로 곡선 60점 재샘플 → MiniChart redraw. `<ErrorBoundary fallback={<Skeleton/>}>`로 감싸 `compileRels` throw 시 그 위젯만 스켈레톤.
- `motion` `layout` prop = 성장/재배치 FLIP. hero `emp:3` → pulse.
- **미감 한 줄(frontend-design):** "슬라이드의 소멸" 컨셉에 맞는 *하나의* 또렷한 방향(어두운 무대 + 자라나는 선/그리드, 특징적 디스플레이 폰트 1 + 본문 폰트 1). 제너릭 AI 미감(Inter/보라 그라데이션) 회피. 정점(Sim)에 시선이 가도록 대비.

---

## 10. 캐싱 + 비용 (PREFIX.ts) — 2,500 1차 + 4,500 즉시 레버

- **Developer API**(generativelanguage.googleapis.com, Worker 경유) + `@google/genai` v2.6+. (Vertex 4,096 floor 회피)
- **캐시 프리픽스 `PREFIX` ~2,500토큰**(byte-stable): 시스템 스펙 + 위젯 카탈로그(5종 스키마 인라인) + 레이아웃 DSL + reactive 문법 + few-shot 2개/역할 + 스타일 토큰 + 패딩. → Dev API floor(1,024/2,048 표기) 둘 다 초과.
- **★ silent-miss 레버(v2.1 보존):** 만약 1분차 계측에서 `cachedContentTokenCount == 0`이면 floor가 예상보다 높은 것 → **few-shot 2개 더 + 패딩으로 ~4,500토큰까지 즉시 bump**(Dev API/표기/Vertex 셋 다 초과). 4,500은 어느 floor가 맞든 안전.
- **`tools` 배열 미사용**(구조화 출력만) → 암시적 캐시 silent-miss 회피.
- 앱 시작 시 프리픽스 SHA-256 로깅 → 리허설 known-good과 다르면 **fail loud**. 앱 오픈 시 명시적 캐시 eager 생성(첫 발화 레이턴시 숨김).
- **thinking:** orch `minimal` / fill `low` / patch `minimal`. **`high`·`medium` 절대 금지**(high TTFT ~20s).
- **maxOutputTokens:** orch 800 / fill 1,200 / patch 400. 발화마다 히스토리 리셋.
- **★ 1분차 계측:** `cachedContentTokenCount`를 화면 구석 HUD(`hud.tsx`)에 + `logUsage` 콘솔. 두 번째 발화에서 0이면 prefix가 byte 단위로 변하는 것.
- **비용(12발화 데모):** 캐시 히트 ~$0.030/발화 → ~$0.36. 미스 ~$0.045 → ~$0.55. 하루 전체(리허설+개발) < $5. (`03` 5.5배 폭증은 multi-turn high-thinking 현상 → 단일턴 minimal/low엔 해당 없음.)
- ⚠️ **퀵스타트 코드 stale**(2026-03-27, `gemini-3-flash-preview`) — 복붙 금지, `gemini-3.5-flash`로.

---

## 11. 폴백 (라이브 우선 · 정직 · 순서 인덱스 · 입+배너 선고지)

```ts
// src/hooks/useFallback.ts (핵심)
import rehearsed from "../rehearsed.json";   // [{i,scene,widgets}] H4 캡처(Sim 데이터 포함)
export async function runUtterance(text:string, live:(t:string)=>Promise<void>){
  const { fallbackMode, nextScriptIndex } = useLS.getState();
  if(fallbackMode) return replay(nextScriptIndex());
  try {
    await Promise.race([ live(text),                       // 내부에 503 retry 포함
      new Promise((_,rej)=>setTimeout(()=>rej(new Error("timeout")),2500)) ]);
  } catch { announce(); replay(nextScriptIndex()); }       // ★ 해시 아님 — 순서 인덱스
}
function replay(i:number){ const item=rehearsed[Math.min(i,rehearsed.length-1)]; if(!item)return;
  const {commitScene,setWidget}=useLS.getState(); commitScene(item.scene,{});
  Object.entries(item.widgets).forEach(([id,w])=>setWidget(id,w as any)); }  // Sim 데이터 포함→슬라이더 작동
function announce(){
  // ★ 둘 다: 입(마이크 데모) + 배너(텍스트/링크 데모)
  try { speechSynthesis.speak(new SpeechSynthesisUtterance(
    "방금 라이브가 끊겨서, 동일 아키텍처가 리허설 캡처를 재생합니다.")); } catch {}
  const b=document.getElementById("fallback-banner"); if(b) b.style.display="block";
}
```
- **순서 인덱스 우선:** 폴백 필요 상황(소음·503·네트워크)이 ASR도 망침 → 해시 미스. 발표는 순차 → "다음 발화 = 리허설 N+1". 해시는 보조.
- **Sim까지 캡처:** `rehearsed.json`은 reactive 데이터(vars/rels/chart) 포함 → 폴백 모드에서도 슬라이더 작동. 안 그러면 폴백에서 슬라이더가 안 움직임.
- **정직:** 라이브 끊기면 **입으로 먼저 + 배너로** 고지 → 재생. jitter 위장 없음. `01`§5 충돌 0.
- **영상 vs 라이브 분리:** 1분 영상은 베스트 단일 테이크(라이브 성공분). 라이브 끊기면 선고지가 Q&A 신뢰 영역.

---

## 12. 검증 + 단일 실패점 (AJV defense-in-depth)

```ts
function validateScene(layout:any, text:string, signal:AbortSignal){
  if(!ajvOrch(layout)) {                                  // AJV 스키마
    // 단일 보정 1회(에러 첨부, thinking:low, 503 retry 포함) → 그래도 실패면 폴백
    return repairOrFallback(text, signal);
  }
  return layout;   // Sim expr sanity는 fill 단계 compileRels가 담당(§5)
}
```
- 각 fill 개별 try/catch + 스켈레톤. Sim expr 실패는 ErrorBoundary(§6·§9). 표면화 실패점 = **orchestrator 1개** (AJV + 단일 보정 + 503 retry + 폴백 **4중 방어**).

---

## 13. $5K "managed agents" 라인 (제출폼 필수 필드 — 현장 강화)

### 13.1 핵심 신호: 제출폼 필수 필드 (`01`§7)
제출폼에 **"Does your project use managed agents? Explain how."가 필수(*)** 항목이다. 모든 팀이 답해야 함 → managed agents 가점 후광이 크다는 강한 신호. **빈칸·회피 불가.**

### 13.2 우리의 정직한 답 (폼에 그대로 — 티어3.5 안 했을 때 기본값)
> "Living Stage runs **parallel specialist agents** (a Stage Director that decides layout, and Plot/Sim/Annotate Specialists that fill each widget concurrently via fan-out) on `gemini-3.5-flash`. They are orchestrated client-side to keep visuals growing at the speed of speech (latency reduction through concurrency). We did **not** rely on the Antigravity Managed Agents API in the live path because its preview does not support structured output, which our deterministic widget-fill requires."

이건 **정직 + 규칙 안전**: 과장(없는 제품 사용 주장) 0, 그리고 "왜 Antigravity를 안 썼나"까지 밝혀 신뢰도↑.

### 13.3 왜 실제 Managed Agents가 *기본적으로* 비현실인가 (현장 타이밍)
- **전체 접근이 오늘 ~14:30 PT에야 열림**(`02`§4·`03`§8). 16:00 코드 프리즈 기준 실질 가용 **~1.5h.**
- 프리뷰가 **구조화 출력·function_calling·MCP 미지원** → 슬롯-필 설계 즉사. `max_output_tokens`도 400 반환.
- 즉 데모 라이브 경로엔 **타이밍·기능 양쪽으로 비현실** → "parallel specialist agents" 명명이 라이브 경로의 정직한 정답.

### 13.4 ★ 티어3.5 옵션 — 데모와 분리된 비동기 1단계 (v2.1 보존, 하드 게이트)
> v2.2는 이걸 통째 삭제했으나, **$5k 후광은 실재**하고 폼 답변을 한 단계 더 단단하게 만든다. **단 하드 게이트 전제**에서만, **데모 라이브 경로엔 절대 안 넣고**, 데모와 *분리된* 비동기 단계 하나로:
- **전제(모두 충족 시에만):** ① 14:30 PT 이후 접근 실측 확인(§19) ② 코어(정점·폴백·음성)가 완전 안정 ③ 안전장치 탑재.
- **예:** 발표 전 백그라운드로 `antigravity-preview-05-2026`가 "이 개념의 추가 예시 시나리오를 리서치/계산"해 Sim few-shot 후보를 *미리* 한 번 생성. 라이브 정점(Sim 내부 반응)과 완전 독립.
- ⚠️ **토큰 폭증 = 비용 아니라 실격 리스크**(`02`§4·§8): managed agent 1루프가 3~5M 토큰, 임시계정 남용 조항(수천 건=실격+밴)과 충돌 가능. → **반드시** 토큰 로깅 + 시스템 지시 `"limited action budget of N tool calls"` + 멈춘 듯하면 즉시 `cancel`(SSE 모니터링). 이 안전장치 없이는 손대지 말 것.
- 빠른 온램프: AI Studio Playground 템플릿(`ai.dev/managed-agents`). 커스터마이징은 파일 기반(`AGENTS.md` + `.agents/skills/SKILL.md`).
- **티어3.5를 했을 때 폼 답변:** 13.2 + *"추가로 `antigravity-preview-05-2026` managed agent를 백그라운드 1단계(예시 시나리오 리서치)로 사용합니다."* 정직하게 *경계* 명시.
- **이건 "있으면 $5k 후광"이지 코어가 아니다.** 14:30 전이거나 코어가 흔들리면 *건드리지 않는다* — 폼엔 13.2만으로 충분.

### 13.5 Discord 선확인 + 무응답 기본값
- **09:00 `#google-deepmind` 질문:** "$5K가 `Promise.all` 병렬 fan-out(명명된 서브에이전트)도 인정하나, Antigravity API를 특정하나?"
- **무응답 시 기본값:** 폼엔 13.2 답 그대로(정직, "managed" 미부착·보수). 광의 확인되면 그때만 "managed" 표현 추가.
- Q&A "병렬이 사용자 가치에 어떻게 기여?" → **"여러 위젯이 말하는 속도를 따라잡도록 동시 생성(지연 단축)."** "에이전트를 위한 에이전트" 인상 회피.

---

## 14. 5시간 타임라인 (정점=Sim+hand-rolled 차트 우선 + 503 방어 H1에)

| 시각 | 블록 | 산출물 | 뒤처지면 |
|---|---|---|---|
| 09:00–10:30 | 셋업(사전) | **새 Chrome 프로필→임시계정→Import→Tier3 키** · .env+.gitignore · Worker 배포 · **Discord $5k 질문** | 프록시 실패→localhost, README 키 리스크. 임시계정 늦으면 무료 티어 |
| **10:30–11:30 H1** | §5 + §4.2 + **§7.1 retry** + Sim E2E (**MiniChart canvas 포함**) | 텍스트입력→orch(retry)→Sim fill→compileRels→슬라이더→**hand-rolled 미니차트** 반응. ★정점+503방어 *먼저* | 스키마 400→키 줄임·`anyOf` 분리. expr 검증부터. canvas 막히면 임시로 svg path |
| 11:30–12:30 H2 | 음성+성장 | Web Speech(재시작+interim store)→문장경계→3위젯 성장. 트랜스크립트 | 음성 불안→텍스트 모드(아키 동일, 정점 무관) |
| 12:30–13:00 | 점심 | 손 떼기 | — |
| 13:00–14:00 H3 | 보조 위젯 + 동시 등장 | Plot(recharts)/Compare 동선 2종 + 병렬 fan-out 시각효과 | 길어지면 동선서 제외(코드엔 유지). 정점은 H1에 섰으니 안전 |
| 14:00–15:00 H4 | 캐싱+애니+폴백 캡처 | `cachedContentTokenCount` 검증(0이면 §10 4,500 bump). Framer `layout`+Sim pulse. **rehearsed.json 캡처(순서·Sim 포함)**+핫키 | 캐시 0히트면 디버그 말고 진행($0.045/발화) |
| 15:00–15:45 H5 | 확장(§16) 또는 폴리시 | 남는 시간 크기로 read-only 미러→보이스편집→리허설. **공개 링크 텍스트 모드 노출** | 확장 brittle→스킵, 코어 복귀 |
| 15:45–16:00 | 점검 | 콘솔 정리, prod URL, **유령0 + 정점 무결 풀 드라이런**, **`git grep` 키 스캔** | — |
| **16:00** | **하드 프리즈** | `git tag submission`, **public 레포 push (스캔 후)** | — |
| 16:00–17:00 | 패키징 | 1분 영상(OBS 단일테이크: 말→성장→**Sim 슬라이더**) · **cerebralvalley 제출폼(managed agents 필드 §13.2)** · README · **코드/에셋 export(계정 익일 삭제)** | 재촬영 길면 최선의 한 테이크 무편집 |

**컷 우선순위(희생 순서):** read-only 미러 → 보이스편집 패치 → 보조 4·5번째 위젯 → 성장 애니메이션 → 캐싱 → **(절대 안 컷) Sim 내부 반응(hand-rolled 차트) · 503 retry · 폴백(순서 인덱스) · 재시작루프+interim 보존 · 트랜스크립트.**

> **1분 영상 샷리스트(`02`§7):** 0:00–0:08 후크(말 아끼고 화면) / 0:08–0:45 핵심 라이브 1회(말→성장→**Sim 슬라이더**) / 0:45–0:55 "왜 3.5 Flash"(속도=말-속도 페이싱의 필연) / 0:55–1:00 임팩트(슬라이드 소멸). 첫 테이크에 안 나옴 → 30~45분 확보, 네트워크 죽으면 캐시/녹화 백업.

---

## 15. 제출 (`01`§7 — 현장 필드 반영)

- **URL:** `https://cerebralvalley.ai/e/google-io-hackathon/hackathon/submit` (Devpost 아님)
- **제출폼 실제 필드** — 필수(*): Team Name · Project Description · **Public GitHub Repo** · **Demo Video(1분)** · **"Does your project use managed agents? Explain how."(§13.2 답)**. 선택: 운영진/제품 피드백.
- 필수 제출물: 1분 영상 + public 레포 + 접근 가능한 데모 링크 + 본인 등록(솔로).
- **★ 공개 링크 = 텍스트 입력 모드 기본 노출** (심사위원 마이크 없음). 텍스트 모드에서도 Sim 정점 작동(슬라이더는 마이크 무관) → 링크만으로 정점 체험.
- **★ 데모 링크 수명:** Worker가 쓰는 키는 **임시계정 Tier 3 키 → 익일 사망.** 심사창(당일)엔 생존 → OK. README에 "심사 기간 유효" 명시. Cloud Run도 동일(익일 내려감).
- **★ 키 누출 방어:** push 전 `git grep -nE 'AIza[0-9A-Za-z_-]{20,}'`로 스캔. 코드·에셋 당일 export(계정 익일 삭제).
- **README "직접 만든 것" 명시:** 반응형 런타임 · 위젯 5종 · 음성→성장 파이프라인 · **Sim 내부 반응 엔진**(변수·관계식 평가·슬라이더 바인딩·**hand-rolled 미니차트**) · 503 retry. 모델은 위젯 선택 + 변수/관계식 데이터만.

**Q&A 한 문장:** "반응형 런타임, 위젯 5종, 음성→성장 파이프라인, Sim 위젯의 내부 반응 엔진(변수·관계식 평가·슬라이더 바인딩·직접 그린 미니차트), 503 retry가 제 코드입니다. 모델은 위젯 선택과 변수·관계식 데이터만 생성합니다."

---

## 16. 시간 남으면 (정점을 키우는 것만 — 우선순위순)

> **규율:** 코어가 *확실히* 굴러간 뒤에만. 모든 확장은 16:00 프리즈 전 완료. **15:45 드라이런 한 번 반드시 남겨** 확장이 정점을 안 깼는지 확인 — 깼으면 직전 커밋으로 롤백. "있으면 좋은 것"에 끌려 코어를 깨는 게 솔로의 가장 흔한 죽음(`02`§3).

1. **read-only 미러 (~30분, 0순위):** Sim이 현재값을 `store.shared`에 publish(쓰기는 Sim만, throttle) → Annotate가 셀렉터로 *읽기만*. "슬라이더 당기니 옆 위젯도 같이 바뀐다" — cross-widget 인상을 *단방향·읽기전용*이라 안 깨지는 형태로. 닭-달걀 0.
2. **보이스 편집 + 버튼 백업 (~30분):** "로그스케일로"→그 위젯만 patch(§4.4). 음성 실패 대비 버튼으로도 같은 patch. 단일 위젯이라 cross-call 위험 0. **조건:** 그 한 마디를 리허설 대본에 *고정*.
3. **슬라이더 범위 확장 + 청중질문 리허설 (~15분):** 극단값에서 차트 안 깨지는지 + "금리 2배로?" 즉석 실연(결선 직결).
4. **티어3.5 managed agent 비동기 1단계 (§13.4):** 14:30 접근 + 코어 안정 + 안전장치 전제. **데모 라이브 경로엔 절대 안 넣음.** $5k 후광 + 폼 답변 강화. 전제 미충족이면 건드리지 않음.

**⛔ 남아도 안 함:** cross-widget *양방향* 바인딩(V3, 분산만↑) · 두 번째 Sim/위젯을 정점으로 승격(정점은 Sim 하나, 둘이면 실패점 둘) · **managed agent를 데모 라이브 경로 투입** · thinking medium/high · 15:00 이후 새 기능 · **정점 차트를 recharts로 교체.** 남는 시간은 리허설·폴백검증·영상에.

---

## 17. 채점 (`04` 루브릭 — 게이트 2개 현장 반영)

```
[ 게이트 ]
- 솔로 5h:                ✅ 정점이 단일 위젯 내부로 닫혀 cross-call 제거
- Gemini 3.5 강점:        ✅ 속도 + 구조화출력(Sim 결정론) + 멀티모달
- 기술 실현성:            ✅ 구조화출력 · mathjs(샌드박싱) · Antigravity/Computer Use 비의존
- ★ managed agent 가용성:  ✅ 통과 — 핵심 경로가 base gemini-3.5-flash. managed agent 단독 의존 0 (14:30 접근창 무관). [04 신규 게이트]
- ★ 에이전트 프리뷰 기능:  ✅ 통과 — 구조화출력을 managed agent에 요구하지 않음(base 모델로). [04 신규 게이트]
- 금지 리스트:            통과 ✅ "교육 챗봇" 아님 → "프리미티브/슬라이드 소멸"
- 병렬 보너스:            parallel specialist agents (폼 §13.2 정직 답변)

[ 점수 ]  솔로 5h 가혹
- 데모력  4.1/5 → ×45 = 184.5   (정점 결정론 + hand-rolled 60fps 차트 + 503 retry로 *바닥* 추가 상승)
- 독창성  3.5/5 → ×35 = 122.5   (새로움 = speech-paced + 살아있는 Sim + 슬라이드 소멸)
- 임팩트  3.5/5 → ×20 = 70      (결선용 강화 ↓)
합계: 377 / 500
```
> 503 retry + hand-rolled 차트가 데모력 *바닥*을 한 번 더 올림(갓 출시 모델 과부하에도 라이브 생존 + 슬라이더 60fps). Live Demo 45%에서 가장 가치 있는 보강.

**★ 결선(33/33/33):** 임팩트 비중↑. "슬라이드의 소멸" + *"말하면 나타나는 만질 수 있는 모델. '금리를 2배로 하면?' 물으면 그 자리에서 당겨 보여준다."*

---

## 18. 발표 골격 (`02`§7)

1. **(0:00–0:20) 후크:** "비주얼은 *준비하는 것*이 아니라 *말하면 거기 있는 것*."
2. **(0:20–2:20) 라이브:** 말→성장→**Sim 슬라이더(정점)**. 말 줄이고 화면으로. (45%)
3. **(2:20–2:50) 왜 새로운가 + 왜 3.5 Flash:** 생성 *과정 자체*가 답 + 살아있는 모델 + 속도·구조화출력.
4. **(2:50–3:00) 큰 그림:** "준비된 슬라이드가 사라진다 — 말하면 나타나고, 만질 수 있다."

**Q&A ("직접 만든 게 뭐냐"):** §15 한 문장 그대로.

---

## 19. 미해결 — 당일 자기 로그로만 확정 (사전 검증 불가 — `03`§10)

> Gemini 3.5 Flash는 컷오프 이후 모델 → 아래는 *당일 request 로그*가 유일한 진실. 1분차 계측으로 닫는다.

- minimal/low **TTFT**가 speech-paced(<1.5s 첫 셸)를 실제로 만족? (>1.8s면 orch도 minimal로, 보정 호출률 감수)
- `cachedContentTokenCount`가 2,500 프리픽스에서 실제 >0? (silent-miss면 §10 4,500 bump)
- **Sim `rels.expr`를 모델이 mathjs-안전 순수식으로 일관 생성?** — H1 최대 리스크. 안 되면 expr description 화이트리스트 강화 + few-shot 추가.
- **★ 503 빈도 실측** — 백오프 4회/상한이 충분한가, 아니면 폴백 의존도↑? (retry 로그로 즉시 확인.)
- 프리스폰 키워드 false positive 율 → 대본 통제.
- 슬라이더 틱 >8ms면 hand-rolled 차트 샘플 60→40, Plot 샘플 100→50.
- **★ SDK 표면:** `generateContentStream`에서 `responseJsonSchema` 스트리밍이 부분 JSON으로 깨끗이 오는가(우리 표면). Interactions API(`/v1beta/interactions`, `Api-Revision: 2026-05-20`)는 *전환하지 않되*, GenerateContent 구조화출력이 불안하면 비교 후보로만(§3.6).
- **★ managed agent 가용성(티어3.5 고려 시만):** 14:30 PT에 실제로 접근 열렸나(`02`§4). 안 열렸으면 티어3.5 자체 포기 — 폼은 §13.2 정직 답변으로 충분.

---

### 부록 A — 빌드 순서 체크리스트
`[ ]` 임시계정 셋업+.env/.gitignore+프록시 → `[ ]` safe-math(화이트리스트) → `[ ]` **retry.ts** → `[ ]` Sim fill→슬라이더→**hand-rolled MiniChart**(정점, H1) → `[ ]` orch+AJV+병렬 fill(retry 래핑) → `[ ]` 음성(재시작+interim store) → `[ ]` 보조위젯(Plot=recharts)+성장연출 → `[ ]` 캐시 계측(0이면 4,500 bump) → `[ ]` 폴백 캡처(순서·Sim) → `[ ]` 텍스트모드 → `[ ]` 유령0+정점무결 드라이런 → `[ ]` **git grep 키 스캔** → `[ ]` 16:00 프리즈+레포 push → `[ ]` 영상+제출(managed agents 필드 §13.2)+**코드 export**.

### 부록 B — v2.1/v2.2에서 가져온 것 (추적용)
- **v2.1에서:** hand-rolled 정점 차트(§6) · 티어3.5 managed agent 옵션(§13.4) · SDK 표면 상세 근거(§3.6) · 4,500 캐시 레버(§10) · 입으로 선고지(§11) · 전용 HUD(§3.5·§10).
- **v2.2에서:** 강화 mathjs 샌드박스(§5) · AJV defense-in-depth(§12) · 통합 503 retry(§7.1) · 쿼리보존 Worker(§3.4) · 완전 Zustand store + `shared`(§6 store) · ulid 명시(§3.3) · 폼 답변 완성본(§13.2) · 가드레일/북극성/아키도/채점/부록 구조.
- **v2.3 신규(병합 산물):** 병합 결정 로그(§0) · `v0` 키 통일(§4.2) · 2,500+4,500 캐시 전략(§10) · 입+배너 동시 선고지(§11) · HUD+logUsage 동시(§7.2·§10).
