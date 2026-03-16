# 개발 가이드

## 개발 환경 설정

### 필수 요구사항

- **Node.js** v22+ (nvm 사용 권장)
- **npm** v10+
- **Git**

### 설치

```bash
cd /Users/gmh_dev/git/nep-works
npm install
```

### 개발 모드 실행

```bash
npm run dev
```

개발 모드에서는:
- Renderer는 Vite HMR (Hot Module Replacement) 지원
- Main/Preload 변경시 자동 재시작
- DevTools 사용 가능

### 프로덕션 빌드

```bash
npm run build
```

빌드 결과물은 `out/` 디렉토리에 생성:
- `out/main/` — Electron main process
- `out/preload/` — Preload script
- `out/renderer/` — React 프론트엔드

### 타입 체크

```bash
npm run typecheck
```

### Windows 인스톨러 패키징

```bash
npm run package
```

`dist/` 디렉토리에 NSIS 인스톨러 생성 (Windows에서만 동작)

## 프로젝트 구조 가이드

### 새 기능 추가 흐름

1. **타입 정의** — `src/shared/types.ts`에 인터페이스 및 IPC 채널 추가
2. **DB 스키마** — `src/main/db/schema.ts`에 테이블 추가
3. **서비스** — `src/main/services/`에 IPC 핸들러 구현
4. **핸들러 등록** — `src/main/index.ts`에서 `register*Handlers(db)` 호출
5. **Preload API** — `src/preload/index.ts`에 프론트엔드용 함수 추가
6. **페이지** — `src/renderer/pages/`에 React 컴포넌트 구현
7. **라우팅** — `src/renderer/App.tsx`에 Route 추가

### 코드 규칙

- **금액은 항상 정수** (원 단위). `number` 타입이지만 소수점 사용 금지
- **날짜는 ISO8601 문자열** (`YYYY-MM-DD`). dayjs 라이브러리로 파싱
- **IPC 채널명은 상수** (`IPC_CHANNELS`) 사용. 문자열 직접 입력 금지
- **에러 처리**: 서비스에서 `throw new Error(한글메시지)`, 프론트에서 `message.error()`

## 데이터베이스

SQLite DB 파일 위치: `{userData}/nep-works.db`
- macOS: `~/Library/Application Support/nep-works/`
- Windows: `%APPDATA%/nep-works/`

### 마이그레이션

현재는 `CREATE TABLE IF NOT EXISTS`로 처리. 스키마 변경시:
1. `schema.ts`의 `createTables()`에 `ALTER TABLE` 추가
2. 버전 관리는 별도 `schema_version` 테이블로 추적 (향후 구현)

## 엑셀 엔진

### 읽기 (reader.ts)

`ExcelJS.Workbook`으로 파일 로드 후:
1. 헤더 행 자동 탐지 (키워드 매칭)
2. 컬럼 매핑 자동 설정
3. 데이터 행 순회 및 파싱

### 쓰기 (writer.ts)

1. `ExcelJS.Workbook` 생성
2. 시트 추가, 열 너비/스타일 설정
3. 헤더 행 작성 (병합셀 포함)
4. 데이터 행 반복 작성
5. 합계 행 추가
6. `writeFile()`로 저장
