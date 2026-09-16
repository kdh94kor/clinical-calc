# 개발자 가이드 (아키텍처 · 신규 계산기 온보딩)

사용자용 API 설명은 [README.md](../README.md)를 보세요.

## 1. 아키텍처

```
src/
├─ main.ts                    # 부팅
├─ core/                      # 프레임워크 (계산기가 의존, 계산기를 모름)
│  ├─ calculator.ts           #   CalculatorDefinition 계약 + defineCalculator()
│  ├─ registry.ts             #   *.calculator.ts 자동 로더, run() = 검증→계산→출력검증
│  ├─ schemas.ts              #   공통 DTO 조각 (sex, ageYears, positive(), precision())
│  ├─ num.ts                  #   Decimal 래퍼: D(), div()(0나누기 방어), fix()(반올림/버림)
│  └─ errors.ts               #   CalcError(code, status, details)
├─ domain/                    # 여러 계산기가 공유하는 순수 임상 공식 (HTTP·zod 무관)
│  ├─ anthropometry.ts        #   Devine IBW, Mosteller BSA, BMI
│  ├─ renal.ts                #   Cockcroft-Gault, KDIGO G-stage
│  └─ vancomycin.ts           #   1-compartment PK 모델 전체
├─ calculators/               # ★ 플러그인 디렉터리. 파일 하나 = 계산기 하나
│  ├─ glob.calculator.ts
│  ├─ egfr.calculator.ts
│  ├─ vancomycin.calculator.ts
│  └─ __tests__/
└─ http/
   ├─ app.ts                  # Express 앱: 제네릭 컨트롤러 3개 + 에러→봉투 매핑
   ├─ openapi.ts              # 레지스트리 → OpenAPI 3.0.3 (zod → JSON Schema)
   └─ envelope.ts
```

### 설계 원칙

- **전략 패턴, 제네릭 컨트롤러.** 컨트롤러는 `POST /calculators/:code` 하나뿐이며 `registry.run(code, body)`만 호출합니다.
  계산기마다 컨트롤러·서비스·모듈을 만들지 않습니다. 새 계산기를 추가할 때 **기존 파일은 한 줄도 수정하지 않습니다** (OCP).
- **파일 시스템이 곧 등록 목록.** `registry.ts`가 부팅 시 `src/calculators/*.calculator.(ts|js)`를 전부 `require`해서
  `default export`를 등록합니다. 코드 중복·형식 오류는 부팅 시 즉시 실패합니다.
- **zod 스키마 = DTO = 검증 = OpenAPI.** 입력/출력 스키마를 한 번 선언하면 요청 검증, 응답 계약 검증, Swagger JSON Schema가 전부 파생됩니다.
  `.describe()`에 단위를, `.meta({'x-unit'})`에 기계 판독용 단위를, 계산기의 `formula`/`references`에 산출식·출처를 기재하면
  OpenAPI operation description에 자동 반영됩니다.
- **단순 산식은 Decimal, 초월함수 모델은 double.** 사칙연산 계산기는 `decimal.js`로 `7.2 − 4.3 = 2.9`를 보장합니다.
  반코마이신처럼 exp/ln/반복 최적화가 핵심인 모델은 IEEE double로 계산하고 표시 자릿수 정리만 Decimal(`fix`)로 합니다.
- **반올림 표준 = HALF_UP.** 레거시 VB `Math.Round(Double)`는 기본 ToEven(은행가)이고 일부만 AwayFromZero였습니다.
  서비스는 전체를 HALF_UP으로 통일했고, 버림이 규정인 항목(PCR/ACR)은 `roundingMode: 'floor'`가 기본값입니다.
- **0 나누기 2중 방어.** 분모가 되는 입력은 스키마에서 `positive()`, 파생 분모(TP−ALB 등)는 `refine` 또는 `div()`의 422로 막습니다.

### 레거시 대비 의도된 변경

| 항목 | 레거시 | 서비스 | 이유 |
|---|---|---|---|
| eGFR 기본식 | `CALC_TYPE` 미설정 시 MDRD | CKD-EPI 2021 (`method`로 2009·MDRD 선택) | NKF/ASN 2021 권고. 인종 계수는 레거시와 동일하게 미적용 |
| eGFR 대상 | 레거시 소아 예외(<13세 등) | 18세 미만 검증 거부 | CKD-EPI/MDRD는 성인 전용 |
| LDL 계산 불가 | 병원별 라벨 문자열(".", "Not calculated") | `{ ldl: null, calculable: false, reason }` | 표시 문구는 클라이언트 책임 |
| ACR 계수 | 코드 ×100 (주석 ×1000) | ×100, 단위(mg/L ÷ mg/dL) 명시 | 코드가 옳고 주석이 오기 |
| 24시간 소변 | 항목별 Case 13개 + `DIVIDE_VALUE` | `URINE_24H` 하나, 농도 단위로 계수 결정 | 계수는 단위의 함수 |
| ASAP 자릿수 | 기본 0자리(0 또는 1로 표시) | 확률 3자리 + % | 원본은 사실상 버그 |
| 반코 AUC 발산 | Trough 반올림 0 → ln(∞) | 비반올림 trough 대체 | VB 원본 미해결 결함 |
| A/G 0나누기 | 가드 없음 | `albumin < totalProtein` refine | |

---

## 2. 계산기 목록

| code | 이름 | 분류 | 핵심 공식 |
|---|---|---|---|
| `GLOB` | Globulin | chemistry | TP − ALB |
| `IDB` | Indirect Bilirubin | chemistry | T.Bil − D.Bil |
| `AGRATIO` | A/G ratio | chemistry | ALB / (TP − ALB) |
| `BCRATIO` | BUN/Cr | renal | BUN / Cr |
| `NHDL` | Non-HDL-C | lipid | TC − HDL |
| `LDL` | LDL-C (Friedewald) | lipid | TC − HDL − TG/5, TG<400 |
| `CARF` | TC/HDL (Castelli I) | risk-score | TC / HDL |
| `TSAT` | Transferrin saturation | hematology | Fe / TIBC × 100 |
| `ANC` | Absolute neutrophil count | hematology | WBC × Neut% / 100 |
| `PCR` | Urine protein/creatinine | urine | UP / UCr × 1000 (floor) |
| `ACR` | Urine albumin/creatinine | urine | UAlb[mg/L] / UCr[mg/dL] × 100 (floor) + KDIGO A1–A3 |
| `URINE_24H` | 24h urine excretion | urine | Conc × Vol / (1000 or 100) |
| `CRCL_URINE_24H` | Measured CrCl | renal | UCr/SCr × Vol / min |
| `CCR` | Cockcroft-Gault | renal | (140−Age)×Wt/(72×SCr)×0.85F |
| `EGFR` | eGFR | renal | CKD-EPI 2021 / 2009 / MDRD-175 + G-stage |
| `FIB4` | FIB-4 | hepatology | Age×AST/(PLT×√ALT) + 1.30/2.67 판정 |
| `ASAP` | ASAP HCC score | risk-score | 로지스틱 회귀 (Yang 2019) |
| `VANCOMYCIN` | Vancomycin AUC dosing | pharmacokinetics | 모집단 4모델 / Bayesian / Sawchuk-Zaske → AUC 430–600 권장 |

각 계산기의 정확한 공식·단위·출처는 `GET /api/v1/calculators/{code}` 또는 Swagger에서 확인합니다.

---

## 3. 신규 계산기 온보딩 가이드

예: 혈청 삼투압(Osmolality) 추가.

**Step 1 — 파일 하나 생성** `src/calculators/osmolality.calculator.ts`

```ts
import { z } from 'zod';
import { defineCalculator } from '../core/calculator';
import { D, fix } from '../core/num';
import { positive, precision } from '../core/schemas';

export default defineCalculator({
  code: 'OSMOLALITY',                       // UPPER_SNAKE, 전역 유일 → URL 세그먼트
  name: 'Calculated Serum Osmolality',
  category: 'chemistry',
  summary: '나트륨·포도당·BUN으로 추정한 혈청 삼투압',
  formula: 'Osm [mOsm/kg] = 2 × Na [mmol/L] + Glucose [mg/dL] / 18 + BUN [mg/dL] / 2.8',
  references: [{ title: 'Rasouli M. Basic concepts and practical equations on osmolality. Clin Biochem 2016;49(12):936-41', url: 'https://doi.org/10.1016/j.clinbiochem.2016.06.001' }],
  legacySource: '(신규)',                    // 마이그레이션이면 레거시 파일/함수/Case 명시
  input: z.object({
    sodium: positive('나트륨', 'mmol/L', 140),
    glucose: positive('포도당', 'mg/dL', 100),
    bun: positive('BUN', 'mg/dL', 14),
    precision: precision(0),
  }),
  output: z.object({ osmolality: z.number().describe('계산 삼투압 [mOsm/kg]') }),
  example: { sodium: 140, glucose: 100, bun: 14 },
  compute: ({ sodium, glucose, bun, precision }) => ({
    osmolality: fix(D(sodium).times(2).plus(D(glucose).div(18)).plus(D(bun).div(2.8)), precision),
  }),
});
```

규칙:
- 입력 스키마는 **단위와 유효 범위를 강제**합니다. 분모가 될 값은 `positive()`, 파생 분모는 `.refine()`. 음수가 무의미하면 `nonNegative()`.
- `formula`에는 단위를 포함한 사람이 읽는 식, `references`에는 최소 1개의 논문/가이드라인(DOI 권장). 둘 다 비어 있으면 부팅 실패.
- 다른 계산기와 공유할 순수 공식(예: Cockcroft-Gault)은 `src/domain/`에 두고 두 계산기가 import 합니다. 복붙 금지.
- 시간·날짜 입력은 `z.iso.datetime()` 문자열로 받고 `compute` 안에서 변환합니다 (OpenAPI 표현 가능성).
- 계산 불가 상태(LDL의 TG≥400 등)는 예외가 아니라 **출력 스키마의 정상 분기**(`calculable:false`)로 표현합니다. 예외는 입력이 틀렸을 때만.

**Step 2 — 테스트 추가** `src/calculators/__tests__/*.spec.ts`

기대값은 구현을 호출해서 얻지 말고 논문 공식을 손/독립 스크립트로 계산해 하드코딩합니다. 최소 3종:
1. 정상 임상값 1건 이상
2. 경계값 (판정 컷오프 ±1 단위, 반올림 경계, 0 허용 여부)
3. 결측·범위 밖·0 나누기 → `VALIDATION_ERROR` 또는 `DIVISION_BY_ZERO`

```ts
it('Na 140, Glu 100, BUN 14 → 290.6 → 291', () =>
  expect(registry.run('OSMOLALITY', { sodium: 140, glucose: 100, bun: 14 })).toEqual({ osmolality: 291 }));
```

**Step 3 — 실행** `npm test`

`registry.spec.ts`가 자동으로 새 계산기를 집어서 (a) 코드 형식, (b) 출처 존재, (c) `example`이 스키마를 통과하고 실제 계산되는지,
(d) 입출력 스키마가 OpenAPI 3.0 JSON Schema로 변환되는지 검사합니다. `registry.spec.ts`의 `EXPECTED` 배열과
`app.spec.ts`의 계산기 개수(현재 18)만 갱신하면 됩니다.

**Step 4 — 확인** `npm run dev` → `http://localhost:3000/docs` 에 새 operation이 공식·출처와 함께 노출됩니다. 끝.

수정하지 않는 것: `app.ts`, `registry.ts`, `openapi.ts`, 다른 계산기 파일. 이 중 하나를 고치고 있다면 설계 위반입니다.

---

## 4. 알려진 한계 / 후속 과제

- 반코마이신 Compare 표의 그룹 창·하한 규칙은 ClinCalc 실측 역산 근사치입니다(`ponytail:` 주석, ±1행 편차 가능).
- Bayesian 1레벨 적합은 좌표하강(결정적)이며 ClinCalc 15케이스 재현 검증본을 그대로 이식했습니다. 실환경 농도로 재검증 필요.
- 인증/레이트리밋/감사로그는 범위 밖입니다. 병원 내부망 배포 시 리버스 프록시에서 처리하십시오.
- 결과 스냅샷 저장(의무기록 보존)은 호출 측(EMR) 책임입니다. 이 API는 무상태입니다.
