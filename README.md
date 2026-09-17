# Clinical Calculator API 사용 가이드

검사 수치·생화학 지표·전해질 보정·용량 계산·반코마이신 약동학 등 29종 계산을 HTTP 요청 한 번으로 받는 서비스입니다.
프로그래밍 언어와 무관하게 JSON을 보내면 JSON으로 결과가 옵니다.
새로운 항목(검사, 지표 등)은 아 추가해야겠다! 생각이 들면 그때마다 추가할 예정입니다.

- 서버 주소: `http://<서버>:3000` (아래 예시는 `localhost:3000`)
- 대화형 문서(직접 실행 가능): `http://localhost:3000/docs`
- 개발자용 구조 설명·계산기 추가 방법: [docs/DEVELOPER.md](docs/DEVELOPER.md)

---

## 0. 사용 조건 및 면책 고지 (반드시 읽어 주세요)

> 본 서비스가 반환하는 모든 값은 **입력값에 대한 공식 계산치**이며, 진단·처방·치료 결정을 대체하지 않습니다.
> 결과의 최종 해석과 그에 따른 임상 결정은 **면허를 가진 의료인**이 환자 상태와 원시 검사값을 직접 확인한 뒤 내려야 합니다.
> This service provides formula-based calculations for clinical decision support only and does not constitute medical advice, diagnosis, or treatment.

**호출 시스템(EMR·검사시스템 등)이 지켜야 하는 사항**

1. **입력 책임.** 결과는 전달된 입력값에만 의존합니다. 검체 오류, 단위 오류, 환자 오매칭, 입력 오류로 인한 결과에 대해 본 서비스는 책임지지 않습니다. 각 계산기의 단위표를 반드시 따르십시오.
2. **적용 한계 확인.** 모든 공식은 발표 논문의 대상 집단(연령·인종·임상 상황)에서 검증된 것입니다. `GET /api/v1/calculators/{code}`의 `limitations`(또는 Swagger의 *Limitations* 항목)에 명시된 상황에서는 결과를 사용해서는 안 되며, 이를 화면에서 사용자에게 알리는 것은 호출 시스템의 책임입니다.
3. **고지문 표시.** 모든 성공 응답의 `meta.disclaimer`에 담긴 고지문을 결과와 함께 사용자에게 표시하거나, 최소한 결과와 함께 보존하십시오.
4. **기록 보존.** 본 서비스는 결과를 저장하지 않습니다. 의무기록에 남길 때는 호출 시점의 응답 전체(`meta.apiVersion`, `meta.timestamp` 포함)를 그대로 저장하고, 나중에 재계산해서 덮어쓰지 마십시오. 공식이 개정되면 과거 기록이 달라져 분쟁의 소지가 됩니다.
5. **버전 관리.** 공식·계수·컷오프는 가이드라인 개정에 따라 변경될 수 있으며 `meta.apiVersion`으로 식별합니다. 버전이 바뀌면 릴리스 노트를 확인하십시오.
6. **반코마이신 권장 용법.** `VANCOMYCIN`의 `recommendation`은 약동학 모델 기반 **참고치**입니다. 처방은 의사가 감염 부위·중증도·MIC·병용약물·신기능 추세를 종합해 결정해야 하고, 실제 투여 후에는 TDM(치료약물농도감시)으로 확인해야 합니다. 투석 환자, 소아, 임신, 신기능 급변 환자에는 적용하지 마십시오.
7. **검증 범위.** 각 계산기는 논문 공식에 대한 단위 테스트와, 반코마이신은 ClinCalc 계산기와의 표시값 대조로 검증되었습니다. 이는 소프트웨어가 공식을 올바르게 구현했음을 확인한 것이며, 특정 환자에 대한 임상적 타당성을 보증하는 것은 아닙니다.
8. **규제.** 임상 의사결정 지원 소프트웨어는 국가·용도에 따라 의료기기 소프트웨어(SaMD) 규제 대상이 될 수 있습니다. 병원 외부 제공, 자동 처방 연동, 환자 직접 노출 등 용도를 확장하기 전에 규제·법무 검토를 받으십시오.

이 고지는 법률 자문이 아니며, 운영 기관의 법무·의료질관리 부서 검토를 거쳐 확정해야 합니다.

---

## 1. 30초 시작

```bash
curl -X POST http://localhost:3000/api/v1/calculators/EGFR -H "Content-Type: application/json" -d "{\"serumCreatinine\":1.0,\"age\":50,\"sex\":\"M\"}"
```

```json
{
  "success": true,
  "data": { "egfr": 91.7, "unit": "mL/min/1.73m2", "method": "CKD_EPI_2021", "ckdStage": "G1" },
  "meta": { "timestamp": "2026-09-16T02:10:25.488Z", "calculator": "EGFR" }
}
```

규칙은 세 가지뿐입니다.

1. 주소는 `POST /api/v1/calculators/{계산기코드}` 입니다. 코드는 대소문자를 가리지 않습니다.
2. 헤더 `Content-Type: application/json`, 본문은 JSON 객체입니다.
3. 결과는 항상 `success`가 `true`면 `data`, `false`면 `error`를 봅니다.

---

## 2. 공통 사항

### 엔드포인트

| 메서드·경로 | 용도 |
|---|---|
| `GET /api/v1/calculators` | 사용 가능한 계산기 목록 |
| `GET /api/v1/calculators/{code}` | 해당 계산기의 공식·출처·입력 필드 정의(JSON Schema) |
| `POST /api/v1/calculators/{code}` | 계산 실행 |
| `GET /docs` | Swagger UI. 브라우저에서 직접 값을 넣고 실행할 수 있음 |
| `GET /openapi.json` | OpenAPI 3.0 문서 (클라이언트 코드 자동 생성용) |
| `GET /health` | 서버 상태 |

### 응답 형식

성공:
```json
{
  "success": true,
  "data": { ...계산 결과... },
  "meta": {
    "timestamp": "2026-09-16T02:10:25.488Z",
    "apiVersion": "1.0.0",
    "disclaimer": "본 결과는 입력값에 대한 공식 계산치이며 임상 판단·처방을 대체하지 않습니다. ...",
    "calculator": "GLOB"
  }
}
```
`meta.apiVersion`과 `meta.disclaimer`는 기록 보존 시 결과와 함께 저장하십시오(0장 참고).

실패:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": [ { "path": "serumCreatinine", "message": "Too small: expected number to be >0" } ]
  }
}
```

| HTTP | `error.code` | 뜻 | 대처 |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | 필드 누락, 범위 밖, 단위 오류, JSON 문법 오류 | `details[].path`의 필드를 고쳐 다시 보냄 |
| 404 | `CALCULATOR_NOT_FOUND` | 계산기 코드 오타 | `GET /api/v1/calculators`로 코드 확인 |
| 422 | `DIVISION_BY_ZERO`, `COMPUTATION_ERROR` | 입력은 형식상 맞지만 계산 불가 | 입력값 재확인 |
| 500 | `INTERNAL_ERROR` | 서버 오류 | 관리자에게 요청 본문과 함께 보고 |

### 공통 입력 규칙

- 숫자는 JSON 숫자로 보냅니다. `"1.0"`(문자열)은 거부됩니다.
- 단위는 각 계산기 표에 적힌 것을 반드시 따릅니다. 서버는 단위를 변환하지 않습니다.
- `sex`는 `"M"` 또는 `"F"`, `age`는 만 나이 정수입니다.
- `precision`(선택)은 결과 소수 자릿수(0~6)입니다. 생략하면 계산기별 기본값을 씁니다.
- 반올림은 사사오입(HALF_UP)입니다. 소변 단백/알부민 비(PCR, ACR)만 검사실 규정에 따라 기본 버림(floor)입니다.
- 필드명은 대소문자를 구분합니다(`serumCreatinine`).

---

## 3. 계산기별 사용법

### 3.1 화학 (Chemistry)

#### `GLOB` 글로불린
`Globulin = Total Protein − Albumin`

| 입력 | 단위 | 필수 | 기본 |
|---|---|---|---|
| `totalProtein` | g/dL | ● | |
| `albumin` | g/dL | ● | albumin ≤ totalProtein |
| `precision` | | | 1 |

```json
{ "totalProtein": 7.2, "albumin": 4.3 }   →   { "globulin": 2.9 }
```

#### `IDB` 간접 빌리루빈
`Indirect = Total Bilirubin − Direct Bilirubin`

| 입력 | 단위 | 필수 | 기본 |
|---|---|---|---|
| `totalBilirubin` | mg/dL | ● | |
| `directBilirubin` | mg/dL | ● | 0 허용, total 이하 |
| `precision` | | | 1 |

```json
{ "totalBilirubin": 1.2, "directBilirubin": 0.3 }   →   { "indirectBilirubin": 0.9 }
```

#### `AGRATIO` 알부민/글로불린 비
`A/G = Albumin / (Total Protein − Albumin)`

| 입력 | 단위 | 필수 | 기본 |
|---|---|---|---|
| `albumin` | g/dL | ● | albumin < totalProtein |
| `totalProtein` | g/dL | ● | |
| `precision` | | | 2 |

```json
{ "albumin": 4.3, "totalProtein": 7.2 }   →   { "agRatio": 1.48 }
```

### 3.2 지질 (Lipid)

#### `LDL` LDL 콜레스테롤 (Friedewald)
`LDL = TC − HDL − TG/5`, TG가 400 mg/dL 이상이면 계산하지 않습니다.

| 입력 | 단위 | 필수 | 기본 |
|---|---|---|---|
| `totalCholesterol` | mg/dL | ● | |
| `hdl` | mg/dL | ● | |
| `triglyceride` | mg/dL | ● | |
| `precision` | | | 0 |

```json
{ "totalCholesterol": 200, "hdl": 50, "triglyceride": 150 }
→ { "ldl": 120, "calculable": true }

{ "totalCholesterol": 250, "hdl": 40, "triglyceride": 450 }
→ { "ldl": null, "calculable": false, "reason": "Friedewald not valid for TG ≥ 400 mg/dL" }
```
화면에는 `calculable`이 `false`일 때 병원 규정 문구("계산불가" 등)를 표시하세요.

#### `NHDL` Non-HDL 콜레스테롤
`Non-HDL = TC − HDL`

| 입력 | 단위 | 필수 | 기본 |
|---|---|---|---|
| `totalCholesterol` | mg/dL | ● | |
| `hdl` | mg/dL | ● | hdl ≤ totalCholesterol |
| `precision` | | | 0 |

```json
{ "totalCholesterol": 200, "hdl": 50 }   →   { "nonHdlCholesterol": 150 }
```

#### `CARF` 심혈관 위험 비 (TC/HDL, Castelli Index I)

| 입력 | 단위 | 필수 | 기본 |
|---|---|---|---|
| `totalCholesterol` | mg/dL | ● | |
| `hdl` | mg/dL | ● | |
| `precision` | | | 2 |

```json
{ "totalCholesterol": 200, "hdl": 50 }   →   { "tcHdlRatio": 4 }
```

### 3.3 혈액 (Hematology)

#### `TSAT` 트랜스페린 포화도
`TSAT % = Iron / TIBC × 100`

| 입력 | 단위 | 필수 | 기본 |
|---|---|---|---|
| `iron` | µg/dL | ● | |
| `tibc` | µg/dL | ● | |
| `precision` | | | 1 |

```json
{ "iron": 80, "tibc": 300 }   →   { "transferrinSaturation": 26.7 }
```

#### `ANC` 절대 호중구 수
`ANC = WBC × Neutrophil% / 100`

| 입력 | 단위 | 필수 | 기본 |
|---|---|---|---|
| `wbc` | 10³/µL | ● | |
| `neutrophilPercent` | % (0~100) | ● | Seg + Band |
| `outputUnit` | `"10^3/uL"` 또는 `"/uL"` | | `"10^3/uL"` |
| `precision` | | | 2 |

```json
{ "wbc": 6.5, "neutrophilPercent": 60 }                                  →  { "anc": 3.9, "unit": "10^3/uL" }
{ "wbc": 6.5, "neutrophilPercent": 60, "outputUnit": "/uL", "precision": 0 } →  { "anc": 3900, "unit": "/uL" }
```

### 3.4 신장 (Renal)

#### `EGFR` 추정 사구체여과율
기본은 CKD-EPI 2021(인종 계수 없음)입니다. 성인(18세 이상) 전용입니다.

| 입력 | 단위 | 필수 | 기본 |
|---|---|---|---|
| `serumCreatinine` | mg/dL (IDMS 표준화) | ● | |
| `age` | 세 (18~130) | ● | |
| `sex` | `"M"`/`"F"` | ● | |
| `method` | `"CKD_EPI_2021"`, `"CKD_EPI_2009"`, `"MDRD_175"` | | `"CKD_EPI_2021"` |
| `precision` | | | 1 |

출력: `egfr`(mL/min/1.73m²), `method`, `ckdStage`(KDIGO G1~G5)

```json
{ "serumCreatinine": 1.0, "age": 50, "sex": "M" }
→ { "egfr": 91.7, "unit": "mL/min/1.73m2", "method": "CKD_EPI_2021", "ckdStage": "G1" }

{ "serumCreatinine": 2.5, "age": 70, "sex": "M", "method": "MDRD_175", "precision": 0 }
→ { "egfr": 26, "unit": "mL/min/1.73m2", "method": "MDRD_175", "ckdStage": "G4" }
```
기존 화면이 MDRD 값을 보여주고 있었다면 `"method": "MDRD_175"`를 넘기면 동일합니다.

#### `CCR` 크레아티닌 청소율 (Cockcroft-Gault)
`CrCl = (140 − Age) × Weight / (72 × SCr)`, 여성은 × 0.85

| 입력 | 단위 | 필수 | 기본 |
|---|---|---|---|
| `age` | 세 | ● | |
| `sex` | `"M"`/`"F"` | ● | |
| `weightKg` | kg | ● | 실제 체중 |
| `serumCreatinine` | mg/dL | ● | |
| `precision` | | | 1 |

```json
{ "age": 65, "sex": "M", "weightKg": 70, "serumCreatinine": 1.0 }   →   { "creatinineClearance": 72.9 }
```

#### `BCRATIO` BUN/크레아티닌 비

| 입력 | 단위 | 필수 | 기본 |
|---|---|---|---|
| `bun` | mg/dL | ● | |
| `creatinine` | mg/dL | ● | |
| `precision` | | | 1 |

```json
{ "bun": 14, "creatinine": 0.9 }   →   { "bunCreatinineRatio": 15.6 }
```

#### `CRCL_URINE_24H` 실측 크레아티닌 청소율 (24시간 소변)
`CrCl = (Urine Cr / Serum Cr) × Volume / 채집시간(분)`

| 입력 | 단위 | 필수 | 기본 |
|---|---|---|---|
| `urineCreatinine` | mg/dL | ● | |
| `serumCreatinine` | mg/dL | ● | |
| `totalVolumeMl` | mL | ● | |
| `collectionMinutes` | 분 | | 1440 (24시간) |
| `precision` | | | 0 |

```json
{ "urineCreatinine": 90, "serumCreatinine": 1.0, "totalVolumeMl": 1500 }   →   { "creatinineClearance": 94 }
```

### 3.5 소변 (Urine)

#### `PCR` 소변 단백/크레아티닌 비
`UPCR mg/g = Protein / Creatinine × 1000`, 기본 버림

| 입력 | 단위 | 필수 | 기본 |
|---|---|---|---|
| `urineProtein` | mg/dL | ● | |
| `urineCreatinine` | mg/dL | ● | |
| `roundingMode` | `"floor"`/`"round"` | | `"floor"` |
| `precision` | | | 0 |

```json
{ "urineProtein": 30, "urineCreatinine": 120 }   →   { "proteinCreatinineRatio": 250 }
```

#### `ACR` 소변 알부민/크레아티닌 비
`UACR mg/g = Albumin[mg/L] / Creatinine[mg/dL] × 100`, 기본 버림. 알부민은 **mg/L**, 크레아티닌은 **mg/dL** 임을 주의하세요.

| 입력 | 단위 | 필수 | 기본 |
|---|---|---|---|
| `urineMicroalbumin` | mg/L | ● | |
| `urineCreatinine` | mg/dL | ● | |
| `roundingMode` | `"floor"`/`"round"` | | `"floor"` |
| `precision` | | | 0 |

출력: `albuminCreatinineRatio`, `kdigoCategory`(A1 <30, A2 30~300, A3 >300)

```json
{ "urineMicroalbumin": 25, "urineCreatinine": 120 }   →   { "albuminCreatinineRatio": 20, "kdigoCategory": "A1" }
```

#### `URINE_24H` 24시간 소변 정량
`1일 배설량 = 농도 × 총 소변량 / 계수`. 계수는 농도 단위로 자동 결정되므로 Na, K, Cl, 아밀라제, 포도당, 요소질소, 크레아티닌, Ca, P, Mg, 요산, 총단백, 미세알부민 모두 이 계산기 하나로 처리합니다.

| 입력 | 단위 | 필수 | 기본 |
|---|---|---|---|
| `concentration` | 아래 단위 기준 | ● | |
| `concentrationUnit` | `"mmol/L"`, `"mg/dL"`, `"mg/L"`, `"g/L"`, `"U/L"` | ● | |
| `totalVolumeMl` | mL | ● | |
| `precision` | | | 1 |

| 농도 단위 | 결과 단위 | 계수 |
|---|---|---|
| mmol/L (Na, K, Cl) | mmol/day | 1000 |
| mg/dL (Glu, UUN, UCr, Ca, P, Mg, UA, TPro) | mg/day | 100 |
| mg/L (미세알부민) | mg/day | 1000 |
| g/L | g/day | 1000 |
| U/L (아밀라제) | U/day | 1000 |

```json
{ "concentration": 120, "concentrationUnit": "mmol/L", "totalVolumeMl": 1500 }  →  { "amountPerDay": 180, "unit": "mmol/day" }
{ "concentration": 90,  "concentrationUnit": "mg/dL",  "totalVolumeMl": 1500 }  →  { "amountPerDay": 1350, "unit": "mg/day" }
```

### 3.6 간 (Hepatology)

#### `FIB4` FIB-4 간 섬유화 지표
`FIB-4 = Age × AST / (Platelets × √ALT)`

| 입력 | 단위 | 필수 | 기본 |
|---|---|---|---|
| `age` | 세 (18~130) | ● | |
| `ast` | U/L | ● | |
| `alt` | U/L | ● | |
| `platelets` | 10⁹/L (= 10³/µL) | ● | 예: 150 |
| `precision` | | | 2 |

출력: `fib4`, `interpretation`(`low` <1.30, `indeterminate`, `high` >2.67; NAFLD 기준)

```json
{ "age": 60, "ast": 40, "alt": 40, "platelets": 150 }   →   { "fib4": 2.53, "interpretation": "indeterminate" }
```

#### `ASAP` ASAP 간세포암 위험 점수
나이·성별·AFP·PIVKA-II 로지스틱 회귀 (Yang 2019)

| 입력 | 단위 | 필수 | 기본 |
|---|---|---|---|
| `age` | 세 (18~130) | ● | |
| `sex` | `"M"`/`"F"` | ● | |
| `afp` | ng/mL | ● | |
| `pivkaII` | mAU/mL | ● | |
| `precision` | | | 3 |

```json
{ "age": 55, "sex": "M", "afp": 20, "pivkaII": 40 }   →   { "probability": 0.582, "percent": 58.2, "logit": 0.3318 }
```

### 3.7 전해질·보정치 (M.OCS.MedCal 이식)

#### `ANION_GAP` 음이온차
`AG = Na − (Cl + HCO₃)`, 옵션으로 K 포함

| 입력 | 단위 | 필수 | 기본 |
|---|---|---|---|
| `sodium`, `chloride`, `bicarbonate` | mEq/L | ● | |
| `potassium` | mEq/L | includePotassium=true면 ● | |
| `includePotassium` | true/false | | false |
| `precision` | | | 1 |

```json
{ "sodium": 140, "chloride": 104, "bicarbonate": 24 }   →   { "anionGap": 12, "includesPotassium": false }
```

#### `CORRECTED_CALCIUM` 알부민 보정 칼슘 (Payne)
`Ca_corr = Ca + 0.8 × (4.0 − Albumin)`

| 입력 | 단위 | 필수 | 기본 |
|---|---|---|---|
| `totalCalcium` | mg/dL | ● | |
| `albumin` | g/dL | ● | |
| `precision` | | | 1 |

```json
{ "totalCalcium": 8.0, "albumin": 2.5 }   →   { "correctedCalcium": 9.2 }
```

#### `CORRECTED_SODIUM` 혈당 보정 나트륨
`Na_corr = Na + factor × (Glucose − 100) / 100`. **기본 계수는 Katz 1.6**입니다. 예전 의학계산기는 계수 1.0을 썼으므로 예전 값이 필요하면 `"method": "LEGACY_1_0"`을 지정하세요.

| 입력 | 단위 | 필수 | 기본 |
|---|---|---|---|
| `sodium` | mEq/L | ● | |
| `glucose` | mg/dL | ● | 100 미만이면 보정 0 |
| `method` | `"KATZ"`(1.6) / `"HILLIER"`(2.4) / `"LEGACY_1_0"`(1.0) | | `"KATZ"` |
| `precision` | | | 1 |

```json
{ "sodium": 130, "glucose": 600 }   →   { "correctedSodium": 138, "correctionApplied": 8, "method": "KATZ" }
```

#### `FENA` 나트륨 분획 배설률
`FeNa % = 100 × (SCr × UNa) / (SNa × UCr)`

| 입력 | 단위 | 필수 | 기본 |
|---|---|---|---|
| `serumCreatinine`, `urineCreatinine` | mg/dL | ● | |
| `serumSodium`, `urineSodium` | mEq/L | ● | |
| `precision` | | | 2 |

출력: `feNa`, `interpretation`(`prerenal` <1%, `indeterminate`, `intrinsic` >2%). 이뇨제 사용 중이면 해석 불가.

```json
{ "serumCreatinine": 1.2, "urineSodium": 20, "serumSodium": 140, "urineCreatinine": 80 }   →   { "feNa": 0.21, "interpretation": "prerenal" }
```

#### `HOMA_IR` 인슐린 저항성
`HOMA-IR = 공복혈당[mg/dL] × 공복인슐린[µU/mL] / 405`

```json
{ "fastingGlucose": 100, "fastingInsulin": 10 }   →   { "homaIr": 2.47 }
```

### 3.8 신체 계측

#### `BMI` 체질량지수
출력에 대한비만학회(아시아-태평양) 분류 포함: `underweight` <18.5, `normal` <23, `overweight` <25, `obese_1` <30, `obese_2` <35, `obese_3` ≥35

```json
{ "weightKg": 70, "heightCm": 175 }   →   { "bmi": 22.9, "category": "normal" }
```

#### `BSA` 체표면적
기본 Du Bois(예전 의학계산기와 동일), `"method": "MOSTELLER"` 선택 가능

```json
{ "weightKg": 70, "heightCm": 175 }                        →   { "bsa": 1.85, "method": "DU_BOIS" }
{ "weightKg": 70, "heightCm": 175, "method": "MOSTELLER" } →   { "bsa": 1.84, "method": "MOSTELLER" }
```

#### `BMD_LUMBAR_AVERAGE` 요추 골밀도 평균
L1~L4 중 입력한 분절만 평균합니다(제외 분절은 필드를 생략).

```json
{ "l1": 0.95, "l3": 1.05, "l4": 1.1 }   →   { "averageBmd": 1.033, "vertebraeUsed": 3 }
```

### 3.9 용량 계산

#### `WEIGHT_BASED_DOSE` 체중 기반 용량
`총 용량 = 체중 × 단위체중당 용량`. `doseUnit`: `"mg/kg"`(기본), `"mcg/kg"`, `"unit/kg"`, `"mL/kg"`

```json
{ "weightKg": 70, "dosePerKg": 15, "doseUnit": "mg/kg" }   →   { "totalDose": 1050, "unit": "mg" }
```

#### `PEDIATRIC_DOSE_FRACTION` 소아 용량 분율 (Young / Clark)
`rule`이 `"YOUNG"`이면 `ageYears`(분율 = 나이/(나이+12)), `"CLARK"`이면 `weightKg`(분율 = 체중/70)이 필수. `adultDose`를 주면 소아 용량까지 계산합니다. 약물별 mg/kg 용량이 있으면 그것을 우선하세요.

```json
{ "rule": "YOUNG", "ageYears": 6, "adultDose": 500 }   →   { "fraction": 0.333, "pediatricDose": 166.667, "rule": "YOUNG" }
```

#### `INSULIN_PEN_COUNT` 인슐린 펜 처방 개수
`pens = ceil(1일 단위 × 처방일수 / 펜 1개 단위)`. `penType`: `"U100_3ML"`(300 IU), `"U300_3ML"`(450 IU), `"U200_3ML"`(600 IU), `"U100_1_5ML"`(150 IU)

```json
{ "dailyUnits": 40, "days": 30, "penType": "U300_3ML" }   →   { "pens": 3, "pensExact": 2.67, "totalUnits": 1200, "unitsPerPen": 450 }
```

### 3.10 약동학 (Pharmacokinetics)

#### `VANCOMYCIN` 반코마이신 AUC 기반 용량 설계
환자 정보만 주면 모집단 모델로, 실측 농도가 있으면 환자 고유 약동학으로 CL/Vd를 추정하고 AUC₀₋₂₄ 430~600 목표의 용량·간격을 권장합니다. ClinCalc 계산기와 표시값이 일치하도록 검증되었습니다.

**환자 정보 (항상 필수)**

| 입력 | 단위 | 필수 | 기본 |
|---|---|---|---|
| `weightKg` | kg (실제 체중) | ● | |
| `heightCm` | cm | ● | |
| `sex` | `"M"`/`"F"` | ● | |
| `age` | 세 (18~130) | ● | |
| `serumCreatinine` | mg/dL (IDMS 표준화) | ● | |
| `criticallyIll` | true/false | | false |
| `clearanceMethod` | `"POPULATION"`, `"BAUER"`, `"MATZKE"` | | `"POPULATION"` |
| `vdMethod` | `"POPULATION"`, `"BAUER"`, `"MATZKE"`, `"RUSHING_AMBROSE"`, `"MORBIDLY_OBESE"` | | `"POPULATION"` |
| `recommendLoadingDose` | true/false | | false |
| `mic` | mg/L | | 1 |

**실측 농도 (`levels`, 선택)**

| 입력 | 단위 | 필수 | 설명 |
|---|---|---|---|
| `levels.steadyState` | true/false | | true=3회 이상 투여 후(항정상태), false=1회 투여 후. 기본 true |
| `levels.doseMg` | mg | ● | 최근 1회 투여량 |
| `levels.intervalHr` | 시간 | steadyState=true면 ● | 투여 간격 |
| `levels.infusionHr` | 시간 | | 주입 시간, 기본 1 |
| `levels.doseStartTime` | ISO 8601 | ● | 최근 투여 주입 **시작** 시각 |
| `levels.samples[]` | | ● | 1건 → Bayesian, 2건 → Sawchuk-Zaske |
| `samples[].time` | ISO 8601 | ● | 채혈 시각. 투여 시작 이후여야 함 |
| `samples[].concentration` | mg/L (= µg/mL) | ● | |

시각은 `"2026-09-16T08:00:00+09:00"` 처럼 시간대 오프셋을 붙여 보내는 것을 권장합니다.

**예시 1. 경험적 용법 + 부하용량**
```json
{ "weightKg": 70, "heightCm": 175, "sex": "M", "age": 40, "serumCreatinine": 1.0, "recommendLoadingDose": true }
```
```json
{
  "anthropometrics": { "tbwKg": 70, "ibwKg": 70.5, "adjustedBwKg": null, "bmi": 22.9, "bsaM2": 1.84, "dosingWeightKg": 70 },
  "renal": { "crclMlMin": 86, "crclIdmsMlMin": 97, "apparentCrclMlMin": 92 },
  "pk": { "clearanceModel": "Population estimates from PK modeling (Buelga 2005)", "vdModel": "...", "clearanceLPerHr": 5.57, "vdL": 69, "vdLPerKg": 0.99, "kelPerHr": 0.0807, "halfLifeHr": 8.6 },
  "levelFit": null,
  "recommendation": { "doseMg": 1000, "intervalHr": 8, "infusionHr": 1, "predictedPeak": 29.3, "predictedTrough": 16.7, "auc24": 540, "aucMic": 540, "loadingDoseMg": 1750 },
  "compare": [ { "frequency": "Q8hr", "intervalHr": 8, "doseMg": 750, "mgPerKg": 11, "aucMic": 405, "peak": 22, "trough": 12.5, "inRange": true, "selected": false }, "..." ],
  "warnings": []
}
```

**예시 2. 실측 농도 2건 (Sawchuk-Zaske)**
```json
{
  "weightKg": 70, "heightCm": 175, "sex": "M", "age": 40, "serumCreatinine": 1.0,
  "levels": {
    "steadyState": true, "doseMg": 1000, "intervalHr": 12, "infusionHr": 1,
    "doseStartTime": "2026-09-16T08:00:00+09:00",
    "samples": [
      { "time": "2026-09-16T10:00:00+09:00", "concentration": 30 },
      { "time": "2026-09-16T18:00:00+09:00", "concentration": 15 }
    ]
  }
}
```

**예시 3. 실측 농도 1건 (Bayesian), 위중 환자**
```json
{
  "weightKg": 84, "heightCm": 160, "sex": "F", "age": 84, "serumCreatinine": 1.4, "criticallyIll": true,
  "levels": {
    "steadyState": true, "doseMg": 750, "intervalHr": 24, "infusionHr": 1,
    "doseStartTime": "2026-09-16T08:00:00+09:00",
    "samples": [ { "time": "2026-09-16T20:00:00+09:00", "concentration": 18.5 } ]
  }
}
```

**결과 읽는 법**

| 필드 | 뜻 |
|---|---|
| `recommendation.doseMg` / `intervalHr` / `infusionHr` | 권장 1회 용량(mg), 간격(h), 주입 시간(h) |
| `recommendation.auc24` | 권장 용법의 예측 AUC₀₋₂₄ (목표 430~600) |
| `recommendation.predictedPeak` / `predictedTrough` | 권장 용법의 예측 최고/최저 농도 (mg/L) |
| `recommendation.loadingDoseMg` | 부하용량. 요청하지 않으면 null |
| `pk.clearanceModel` | 어떤 모델/방법으로 CL을 구했는지 (Buelga, Roberts, Masich, Adane, Bayesian, Sawchuk-Zaske …) |
| `levelFit.extrapolatedPeak` / `extrapolatedTrough` | **현재** 용법에서 추정한 Peak/Trough (실측 농도가 있을 때만) |
| `compare[]` | 다른 용량·간격 조합의 예측값. `inRange`가 true면 AUC/MIC 400~600, `selected`가 true면 권장 용법 |
| `warnings[]` | Bayesian 적합도 저하 등 주의 문구. 비어 있으면 정상 |

**적용 한계 (반드시 확인)**

- 권장 용법은 참고치입니다. 처방·모니터링 책임은 의료인에게 있으며 실제 투여 후 TDM으로 확인해야 합니다.
- 성인 전용입니다. 소아·신생아, 임신, 화상, 낭성섬유증, ECMO, 투석(혈액투석·CRRT·복막투석) 환자에는 적용하지 마십시오.
- 신기능이 급변하는 환자(AKI, 회복기)에서는 모집단 추정이 크게 틀릴 수 있습니다.
- 혈청 크레아티닌은 IDMS 표준화 값이어야 합니다. conventional 값을 넣으면 청소율이 왜곡됩니다.
- 실측 농도는 주입 종료 1시간 이후 채혈이어야 하며, 채혈·투여 시각 오기록은 결과를 직접 왜곡합니다.
- `warnings`에 Bayesian 적합도 저하가 표시되면 결과를 쓰지 말고 재채혈을 고려하십시오.
- 전체 목록은 `GET /api/v1/calculators/VANCOMYCIN`의 `limitations`에 있습니다.

주의: 이 API는 결과를 저장하지 않습니다. 의무기록에 남기려면 호출한 시점의 응답 전체(`meta.apiVersion` 포함)를 그대로 저장하세요. 계산식이 갱신되어도 과거 기록이 바뀌지 않아야 합니다.

---

## 4. 언어별 호출 예시

**JavaScript (fetch)**
```js
const res = await fetch('http://localhost:3000/api/v1/calculators/FIB4', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ age: 60, ast: 40, alt: 40, platelets: 150 }),
});
const body = await res.json();
if (body.success) console.log(body.data.fib4);
else console.error(body.error.code, body.error.details);
```

**C# (HttpClient)**
```csharp
using var http = new HttpClient();
var json = "{\"age\":60,\"ast\":40,\"alt\":40,\"platelets\":150}";
var res = await http.PostAsync("http://localhost:3000/api/v1/calculators/FIB4",
    new StringContent(json, Encoding.UTF8, "application/json"));
var body = await res.Content.ReadAsStringAsync();   // JSON 파싱 후 success 확인
```

**VB.NET (WebClient)**
```vb
Using wc As New Net.WebClient()
    wc.Headers(Net.HttpRequestHeader.ContentType) = "application/json"
    Dim body As String = wc.UploadString("http://localhost:3000/api/v1/calculators/GLOB",
                                         "{""totalProtein"":7.2,""albumin"":4.3}")
    ' body = {"success":true,"data":{"globulin":2.9},...}
End Using
```

**Python (requests)**
```python
import requests
r = requests.post("http://localhost:3000/api/v1/calculators/EGFR",
                  json={"serumCreatinine": 1.0, "age": 50, "sex": "M"})
body = r.json()
print(body["data"]["egfr"] if body["success"] else body["error"])
```

**Postman**: Method `POST`, URL `http://localhost:3000/api/v1/calculators/{코드}`, Body 탭 → `raw` → `JSON` 선택 후 예시 본문 붙여넣기.

---

## 5. 자주 묻는 질문

**어떤 환자에게 쓰면 안 되는지 프로그램에서 확인할 수 있습니까?**
`GET /api/v1/calculators/{code}`의 `limitations` 배열에 적용 불가 상황이 문장으로 들어 있습니다. 화면에 함께 표시하거나 도움말로 노출하십시오.

**계산기 코드 목록을 프로그램에서 받고 싶습니다.**
`GET /api/v1/calculators`가 코드·이름·분류·엔드포인트 배열을 돌려줍니다.

**입력 필드 이름과 단위를 코드로 확인하고 싶습니다.**
`GET /api/v1/calculators/{code}`의 `inputSchema.properties`에 각 필드의 타입·설명·`x-unit`이 들어 있습니다.

**결과 소수 자릿수를 바꾸고 싶습니다.**
본문에 `"precision": 2`처럼 추가하세요. 0~6 사이 정수입니다.

**단위가 다른 값(µmol/L 크레아티닌 등)을 보내면 어떻게 됩니까?**
서버는 단위를 변환하지 않으므로 잘못된 결과가 나옵니다. 각 표의 단위로 변환한 뒤 보내야 합니다.

**같은 입력인데 예전 프로그램과 소수 마지막 자리가 다릅니다.**
예전 프로그램은 은행가 반올림과 사사오입이 항목마다 섞여 있었고, 이 API는 전체를 사사오입으로 통일했습니다. 0.5 경계 값에서만 차이가 나며 PCR/ACR은 예전과 같이 버림입니다.

**eGFR 값이 예전과 다릅니다.**
기본식이 MDRD에서 CKD-EPI 2021로 바뀌었습니다. `"method": "MDRD_175"`를 주면 예전 값과 같습니다.

**혈당 보정 나트륨 값이 예전 의학계산기와 다릅니다.**
예전 계산기는 포도당 100 mg/dL당 1.0 mEq/L를 더했는데 표준 문헌 계수는 1.6(Katz)입니다. `"method": "LEGACY_1_0"`을 주면 예전 값과 같습니다.

**Young/Clark, U100/U300 탭이 없습니다.**
`PEDIATRIC_DOSE_FRACTION`의 `rule`, `INSULIN_PEN_COUNT`의 `penType`으로 통합되었습니다.

**서버 실행은 어떻게 합니까?**
```bash
npm install
npm run build
npm start          # 기본 포트 3000, PORT 환경변수로 변경
```

---

## 6. 계산기 목록 요약

| 코드 | 이름 | 필수 입력 |
|---|---|---|
| `GLOB` | 글로불린 | totalProtein, albumin |
| `IDB` | 간접 빌리루빈 | totalBilirubin, directBilirubin |
| `AGRATIO` | A/G 비 | albumin, totalProtein |
| `LDL` | LDL-C (Friedewald) | totalCholesterol, hdl, triglyceride |
| `NHDL` | Non-HDL-C | totalCholesterol, hdl |
| `CARF` | TC/HDL 비 | totalCholesterol, hdl |
| `TSAT` | 트랜스페린 포화도 | iron, tibc |
| `ANC` | 절대 호중구 수 | wbc, neutrophilPercent |
| `EGFR` | 추정 GFR | serumCreatinine, age, sex |
| `CCR` | Cockcroft-Gault CrCl | age, sex, weightKg, serumCreatinine |
| `BCRATIO` | BUN/Cr 비 | bun, creatinine |
| `CRCL_URINE_24H` | 실측 CrCl | urineCreatinine, serumCreatinine, totalVolumeMl |
| `PCR` | 소변 단백/Cr | urineProtein, urineCreatinine |
| `ACR` | 소변 알부민/Cr | urineMicroalbumin, urineCreatinine |
| `URINE_24H` | 24시간 소변 정량 | concentration, concentrationUnit, totalVolumeMl |
| `FIB4` | FIB-4 | age, ast, alt, platelets |
| `ASAP` | ASAP HCC 점수 | age, sex, afp, pivkaII |
| `VANCOMYCIN` | 반코마이신 용량 설계 | weightKg, heightCm, sex, age, serumCreatinine |
| `ANION_GAP` | 음이온차 | sodium, chloride, bicarbonate |
| `CORRECTED_CALCIUM` | 알부민 보정 칼슘 | totalCalcium, albumin |
| `CORRECTED_SODIUM` | 혈당 보정 나트륨 | sodium, glucose |
| `FENA` | 나트륨 분획 배설률 | serumCreatinine, urineSodium, serumSodium, urineCreatinine |
| `HOMA_IR` | 인슐린 저항성 | fastingGlucose, fastingInsulin |
| `BMI` | 체질량지수 | weightKg, heightCm |
| `BSA` | 체표면적 | weightKg, heightCm |
| `BMD_LUMBAR_AVERAGE` | 요추 골밀도 평균 | l1~l4 중 1개 이상 |
| `WEIGHT_BASED_DOSE` | 체중 기반 용량 | weightKg, dosePerKg |
| `PEDIATRIC_DOSE_FRACTION` | 소아 용량 분율 | rule + ageYears 또는 weightKg |
| `INSULIN_PEN_COUNT` | 인슐린 펜 개수 | dailyUnits, days, penType |

각 계산기의 공식 원문과 의학적 출처(논문·가이드라인)는 `GET /api/v1/calculators/{code}` 또는 Swagger(`/docs`) 설명란에 있습니다.
