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

## 다음 세션 예정 작업

- [ ] `npm run dev`로 실행 테스트
- [ ] 실제 설계내역서 엑셀로 임포트 테스트
- [ ] 기성내역서 엑셀 출력물 검증
- [ ] Phase 2 준공서류/노무비 구현 시작
