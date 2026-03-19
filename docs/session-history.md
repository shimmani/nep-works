# 개발 세션 히스토리

## 세션 1: 프로젝트 기획 및 Phase 1 구현 (2026-03-16)

### 1단계: 요구사항 분석 및 인터뷰

**사용자 인터뷰 결과:**

| 질문 | 답변 |
|------|------|
| 주요 사업 분야 | 시설물 유지관리 |
| 현재 경리 방식 | 엑셀 수작업 |
| 자동화 우선순위 | 전체 경리 업무 |
| 연간 프로젝트 수 | 20~50건 |
| 계약 방식 | 입찰 + 수의계약 혼합 |
| 기성 애로점 | 증빙서류 취합, 기성내역서 작성 |
| 일용직 규모 | 10~30명, 수기 출역관리 |
| 시스템 사용자 | 본인 1명 |
| 작업 환경 | Windows PC |
| 준공 애로점 | 준공사진/문서 취합 |
| 양식 | 내부 양식 + 지자체 지정 양식 혼용 |

### 2단계: 시장조사

건설업/시설관리업 경리 자동화 관련 시장조사 수행:
- 나라장터 API 존재 확인 (data.go.kr 무료)
- **준공서류 자동화 전용 솔루션이 시장에 거의 없음** (핵심 기회)
- 기성처리 End-to-End 통합 솔루션 부족
- 2026.1.2부터 수의계약 한도 2배 상향
- 기존 ERP(더존, 영림원)는 중소업체에 과도

### 3단계: 기술 스택 결정

**후보 비교**: Tauri (Rust) vs Electron (JS) vs Python (PyQt) vs 엑셀 매크로

**최종 선택**: Electron + React + TypeScript + SQLite
- 이유: Rust 러닝커브 없이 JS/TS 생태계의 풍부한 엑셀 라이브러리(ExcelJS) 활용
- 프로젝트명: **nep-works**

### 4단계: 플랜 작성 및 승인

상세 구현 계획 작성 → 사용자 승인 완료

### 5단계: Phase 1 구현

#### 구현 내용

**프로젝트 초기화:**
- Electron + React + TypeScript 프로젝트 생성
- electron-vite 빌드 설정
- 의존성: antd, better-sqlite3, exceljs, dayjs, react-router-dom

**Backend (Main Process):**
- `src/main/db/schema.ts` — SQLite 12개 테이블 스키마
  - clients, projects, design_items, giseong_rounds, giseong_details
  - workers, labor_assign, payroll, insurance_rates
  - bids, evidence_docs, jungong_docs, excel_templates
  - 2026년 보험요율 기본 데이터 삽입
- `src/main/services/project.ts` — 프로젝트 CRUD (필터링, JOIN)
- `src/main/services/client.ts` — 발주처 CRUD (삭제 보호)
- `src/main/services/giseong.ts` — 기성처리 핵심 로직
  - 회차 자동 생성 (전회 누계 이월)
  - 진도율 입력 → 금액 자동 산출
  - 100% 초과 방지 검증
  - 회차 총액 자동 재계산
- `src/main/services/design.ts` — 설계내역 엑셀 임포트
- `src/main/excel/reader.ts` — 엑셀 파서 (헤더 자동 탐지, 원가구분 추정)
- `src/main/excel/writer.ts` — 기성내역서 엑셀 생성 (서식, 병합셀, 합계행)

**Frontend (Renderer):**
- `src/renderer/App.tsx` — HashRouter + 사이드바 레이아웃 (8개 메뉴)
- `src/renderer/pages/Dashboard.tsx` — 통계 카드 4개 + 진행중 프로젝트 테이블
- `src/renderer/pages/Projects.tsx` — 프로젝트 CRUD (모달 폼)
- `src/renderer/pages/ProjectDetail.tsx` — 프로젝트 상세 (설계내역/기성/증빙 탭)
- `src/renderer/pages/Clients.tsx` — 발주처 CRUD
- `src/renderer/pages/Giseong.tsx` — 기성처리 (프로젝트/회차 선택, 진도율 실시간 입력, 엑셀 내보내기)
- `src/renderer/pages/Settings.tsx` — 보험요율 정보

**공유:**
- `src/shared/types.ts` — 전체 타입 정의, IPC 채널 상수
- `src/preload/index.ts` — contextBridge API 노출

#### 이슈 및 해결

1. **electron-vite/node 임포트 오류**: `is.dev` 대신 `!app.isPackaged`로 자체 구현
2. **vite v7 + electron-vite 버전 충돌**: vite@^7로 고정하여 해결
3. **npx create-electron-vite 인터랙티브 실패**: 수동 프로젝트 구성으로 전환

#### 빌드 결과

```
✓ main: 3 파일, 86ms
✓ preload: 1 파일, 7ms
✓ renderer: 2,905KB, 2.70s
```

TypeScript 타입 체크 + electron-vite 빌드 모두 성공.

### 6단계: GitHub 레포 생성 및 문서화

- GitHub `shimmani/nep-works` 레포 생성
- `/docs/` 디렉토리에 프로젝트 문서 작성
- 초기 커밋 및 푸시

---

## 세션 2: 슈퍼 개인화 + 휴먼 체크포인트 + 테스트 (2026-03-17)

### 목표

기존 Phase 1 구현에 "슈퍼 개인화" 레이어 추가: 100% 자동화가 아니더라도 시간을 1/10로 단축하면서, 휴먼이 모든 중요 단계에서 확인·검증할 수 있도록.

### 1단계: Backend 서비스 신규 구현

**감사 로그 (audit.ts):**
- `logAudit()` — 모든 엔티티(프로젝트, 발주처, 기성, 설계내역)의 변경이력 자동 기록
- `detectChanges()` — 이전/새 객체 비교하여 필드별 변경사항 감지
- `audit:list`, `audit:project-all` IPC 핸들러

**비즈니스 검증 (validation.ts):**
- `validateProject()` — 필수값, 수의계약 한도(2026년: 종합 4억/전문 2억/일반 1.6억/용역 1억), 날짜 논리
- `validateStatusTransition()` — 유효 상태전이 검증 (상태 머신)
- `validateGiseongRound()` — 설계내역 존재 확인, 이전 회차 미완료 경고
- `validateGiseongRate()` — 진도율 범위, 누계 100% 초과 방지, 고액 경고
- `validateDesignImport()` — 계약금액 대비 설계금액 비율, 0원/음수 항목 경고
- `validateGiseongExport()` — 내보내기 전 검증 (전체 0%, 0원 기성 등)
- 모든 검증: errors(차단) + warnings(경고, 사용자 확인 후 진행 가능) 분리

**워크플로우 자동화 (workflow.ts):**
- 프로젝트 상태 변경시 자동 할일 생성 (계약체결 3건, 시공중 3건, 준공서류작성 6건, 준공완료 2건)
- 중복 방지, 완료/건너뛰기 처리
- 다음 단계 추천 (workflow:next-steps)

**추천 엔진 (recommend.ts):**
- `recommend:project-defaults` — 발주처별 과거 프로젝트 기반 기본값 추천 (계약유형, 방식, 평균 금액)
- `recommend:giseong-rates` — 같은 발주처의 과거 프로젝트에서 동일 회차 평균 진도율 추천
- `recommend:giseong-preview` — 기성 회차 생성 전 미리보기 (잔여금액, 진행률, 기존 회차)
- `recommend:design-preview` — 설계내역 임포트 전 파싱 결과 미리보기 + 검증
- `recommend:export-preview` — 엑셀 내보내기 전 검증 프리뷰
- `recommend:save-client-default` — 발주처별 커스텀 기본값 저장

### 2단계: DB 스키마 확장

3개 신규 테이블:
- `audit_log` — 변경이력 (entity_type, entity_id, action, field_name, old_value, new_value, description)
- `client_defaults` — 발주처별 커스텀 기본값 (setting_key/value, UNIQUE 제약)
- `workflow_tasks` — 할일 (project_id, task_type, title, due_date, status, auto_generated)

### 3단계: 기존 서비스 강화

- **project.ts** — 생성/수정시 검증(validateProject) + 상태전이 검증 + 감사 로그 + 경고 반환
- **giseong.ts** — 회차 생성시 검증 + confirmed 패턴, 진도율 수정시 검증, 상태전이 강화, 감사 로그
- **design.ts** — 임포트시 감사 로그 (파일명, 건수, 합계)
- **client.ts** — CRUD 감사 로그 + 필드별 변경 추적

### 4단계: Frontend 전면 업데이트

- **Dashboard** — 할일 목록(workflowPendingAll) 표시 + 완료 처리 버튼
- **Projects** — 발주처 선택시 과거 데이터 기반 추천 표시(Alert) + 적용 버튼, 저장시 검증 경고 Modal.confirm
- **ProjectDetail** — 설계내역 임포트 프리뷰 모달, 기성 회차 생성 프리뷰 모달, 할일 탭, 변경이력 탭
- **Giseong** — 엑셀 내보내기 프리뷰 모달 (6개 통계 카드 + 검증 경고)

### 5단계: IPC 채널 정리

- `src/shared/types.ts`에 16개 신규 IPC 채널 상수 추가
- `src/preload/index.ts`에 16개 신규 API 메서드 추가
- `src/main/index.ts`에 3개 신규 핸들러 등록 (audit, workflow, recommend)

### 6단계: 테스트

- **vitest** 도입 (devDependency)
- 300개 테스트 케이스 작성 및 전체 통과:
  - `tests/validation.test.ts` (100건) — 6개 검증 함수 전체 분기 커버
  - `tests/audit-workflow.test.ts` (100건) — 감사 로그, 변경 감지, 워크플로우 자동생성/관리/다음단계
  - `tests/recommend-integration.test.ts` (100건) — 추천 엔진 + 기성 통합 워크플로우

### 이슈 및 해결

1. **Divider orientation 타입 오류**: antd Divider의 `orientation="left"` 속성이 타입 에러 → `plain`만 사용으로 해결
2. **Spread types 타입 오류**: `...db.prepare().get()` 결과가 undefined 가능성 → `as Record<string, unknown>` 캐스팅
3. **better-sqlite3 NODE_MODULE_VERSION 불일치**: Electron용으로 빌드된 네이티브 모듈 → `npm rebuild` 실행

### 빌드 결과

```
✓ main: 13 modules, 152ms
✓ preload: 2 modules, 15ms
✓ renderer: 3,062 modules, 2.84s
✓ TypeScript 타입 체크 통과
✓ 테스트 300/300 통과 (258ms)
```

---

## 세션 3: Phase 2 — 준공서류 + 일용직 노무비 (2026-03-19)

### 목표

Phase 2 핵심 기능 구현: 준공서류 체크리스트 + 일용직 노무비 관리 (급여 계산 엔진 포함). 준공사진첩은 범위에서 제외.

### 1단계: Backend 서비스 구현

**신규 서비스 4개:**
- `src/main/services/worker.ts` — 근로자 CRUD + 활성/비활성 전환 + 감사 로그
- `src/main/services/labor.ts` — 출역 단건/일괄 등록, 전일 복사, 중복 방지
- `src/main/services/payroll.ts` — 급여 계산 엔진
  - 4대보험: 국민연금(4.5%), 건강보험(3.545%), 장기요양(건강보험×12.95%), 고용보험(0.9%)
  - 일용근로소득세: 일별 (일당-15만원) × 6% × 45% = 2.7%
  - 지방소득세: 소득세 × 10%
  - delete + insert 패턴으로 월별 재계산
- `src/main/services/jungong.ts` — 준공서류 체크리스트 (12항목 기본 템플릿)

**기존 파일 확장:**
- `src/main/services/validation.ts` — 검증 함수 4개 추가 (validateWorker, validateLaborAssign, validatePayrollCalc, validatePayrollExport)
- `src/main/excel/writer.ts` — 엑셀 내보내기 2개 추가 (exportPayrollLedger, exportJungongChecklist)

### 2단계: IPC 연결

- `src/shared/types.ts` — IPC 채널 21개 + JungongDocStatus 타입 추가
- `src/preload/index.ts` — API 메서드 21개 추가
- `src/main/index.ts` — 핸들러 등록 4개 추가
- `src/main/db/schema.ts` — 인덱스 2개 추가 (payroll_project_month, jungong_project)

### 3단계: Frontend

**신규 페이지 2개:**
- `src/renderer/pages/Labor.tsx` — 3개 탭:
  1. 근로자 관리: 테이블 + 모달 CRUD + 활성/비활성 토글
  2. 출역 관리: 프로젝트+월 선택 → 출역 테이블, 일괄 등록, 전일 복사
  3. 급여 계산: 계산 실행 → 결과 테이블 (공제 내역) + 엑셀 내보내기
- `src/renderer/pages/Jungong.tsx` — 프로젝트별 체크리스트, 인라인 상태 변경, 파일 첨부, Progress 바

**라우팅:**
- `src/renderer/App.tsx` — `/labor`, `/jungong` 플레이스홀더를 실제 컴포넌트로 교체

### 4단계: 테스트

- `tests/phase2-validation.test.ts` — 100건 (근로자/출역/급여계산/급여내보내기 검증)
- `tests/phase2-payroll.test.ts` — 100건 (급여 계산 수식 정확성, 경계값, 현실 시나리오)
- **전체 500/500 통과** (기존 300 + 신규 200)

### 빌드 결과

```
✓ main: 17 modules, 153ms
✓ preload: 2 modules, 8ms
✓ renderer: 3,064 modules, 3.23s
✓ TypeScript 타입 체크 통과
✓ 테스트 500/500 통과 (275ms)
```

### 설계 결정

1. 개인정보 암호화 건너뜀 (단일 사용자 로컬 앱)
2. 출역 UI는 테이블 방식 (달력 위젯 대신)
3. 급여는 프로젝트×월 단위 계산 (delete + insert 재계산)
4. 일용근로소득세는 일별 계산 (15만원 공제는 일별 적용)
5. 준공서류는 기본 템플릿 1개 (발주처별 커스텀은 추후)

---

## 다음 세션 예정 작업

- [ ] `npm run dev`로 실행 테스트 (실제 UI 동작 확인)
- [ ] 실제 설계내역서 엑셀로 임포트 + 프리뷰 기능 검증
- [ ] 기성내역서 엑셀 출력물 검증 + 내보내기 프리뷰 검증
- [ ] 워크플로우 할일 자동생성 실제 동작 확인
- [ ] 근로자 등록 → 출역 입력 → 급여 계산 → 엑셀 내보내기 실제 동작 확인
- [ ] 준공서류 체크리스트 초기화 → 상태 변경 → 엑셀 내보내기 검증
- [ ] 준공사진첩 자동 생성 구현 (EXIF/PDF)
- [ ] Phase 3 입찰/계약 + 외부 연동 시작
