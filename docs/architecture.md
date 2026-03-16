# 시스템 아키텍처

## 전체 구조

```
┌─────────────────────────────────────────────────────┐
│                  Electron App                        │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │         Renderer (React + Ant Design)        │    │
│  │  ┌──────────┐ ┌──────────┐ ┌─────────────┐ │    │
│  │  │ 대시보드  │ │ 프로젝트 │ │  기성처리   │ │    │
│  │  └──────────┘ └──────────┘ └─────────────┘ │    │
│  │  ┌──────────┐ ┌──────────┐ ┌─────────────┐ │    │
│  │  │ 발주처   │ │ 준공서류 │ │ 일용직노무비│ │    │
│  │  └──────────┘ └──────────┘ └─────────────┘ │    │
│  └─────────────────┬───────────────────────────┘    │
│                    │ IPC (contextBridge)              │
│  ┌─────────────────┴───────────────────────────┐    │
│  │           Main Process (Node.js)              │    │
│  │  ┌──────────┐ ┌──────────┐ ┌─────────────┐ │    │
│  │  │ Services │ │  Excel   │ │  외부 API   │ │    │
│  │  │ (CRUD)   │ │  엔진    │ │  (나라장터) │ │    │
│  │  └────┬─────┘ └──────────┘ └─────────────┘ │    │
│  │       │                                      │    │
│  │  ┌────┴─────────────────────────────────┐   │    │
│  │  │     SQLite (better-sqlite3)           │   │    │
│  │  └──────────────────────────────────────┘   │    │
│  └──────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

## 디렉토리 구조

```
nep-works/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── index.ts             # 앱 진입점, IPC 등록
│   │   ├── db/
│   │   │   └── schema.ts        # SQLite 스키마, 마이그레이션
│   │   ├── services/            # 비즈니스 로직 (IPC 핸들러)
│   │   │   ├── project.ts       # 프로젝트 CRUD
│   │   │   ├── client.ts        # 발주처 CRUD
│   │   │   ├── giseong.ts       # 기성처리 (핵심)
│   │   │   └── design.ts        # 설계내역 임포트
│   │   ├── excel/               # 엑셀 엔진
│   │   │   ├── reader.ts        # 엑셀 파싱 (설계내역서)
│   │   │   └── writer.ts        # 엑셀 생성 (기성내역서)
│   │   └── api/                 # 외부 API (Phase 3)
│   ├── preload/
│   │   └── index.ts             # contextBridge API 노출
│   ├── renderer/                # React 프론트엔드
│   │   ├── App.tsx              # 라우팅 + 레이아웃
│   │   ├── main.tsx             # React 엔트리
│   │   ├── pages/               # 페이지 컴포넌트
│   │   ├── components/          # 공통 컴포넌트
│   │   ├── hooks/               # 커스텀 훅
│   │   └── styles/              # CSS
│   └── shared/
│       └── types.ts             # 공유 타입, IPC 채널 상수
├── templates/                   # 엑셀 템플릿 파일
├── docs/                        # 프로젝트 문서
├── electron.vite.config.ts      # 빌드 설정
├── tsconfig.json
└── package.json
```

## 데이터 모델 (ERD)

### 핵심 엔티티

```
clients (발주처)          projects (프로젝트)         workers (근로자)
├── id (PK)              ├── id (PK)                ├── id (PK)
├── name                 ├── client_id (FK)         ├── name
├── region               ├── name                   ├── resident_no (암호화)
├── contact_person       ├── contract_type           ├── bank_account (암호화)
├── contact_phone        ├── contract_method         ├── job_type
├── address              ├── contract_amount         ├── default_wage
├── template_set         ├── start_date              └── is_active
└── notes                ├── end_date
                         ├── status
                         └── folder_path

design_items (설계내역)   giseong_rounds (기성회차)   labor_assign (출역)
├── id (PK)              ├── id (PK)                ├── id (PK)
├── project_id (FK)      ├── project_id (FK)        ├── project_id (FK)
├── category             ├── round_no               ├── worker_id (FK)
├── item_name            ├── claim_amount            ├── work_date
├── unit / quantity      ├── approved_amount         ├── day_fraction
├── unit_price           ├── status                  └── daily_wage
├── total_price          └── claim_date
└── cost_type
                         giseong_details (기성상세)   payroll (급여)
                         ├── id (PK)                ├── id (PK)
                         ├── round_id (FK)          ├── worker_id (FK)
                         ├── item_id (FK)           ├── year_month
                         ├── prev_rate / amount     ├── gross_pay
                         ├── curr_rate / amount     ├── 4대보험 각 항목
                         └── cumul_rate / amount    └── net_pay
```

### 설계 원칙

- **금액**: `INTEGER` (원 단위) — 부동소수점 오차 방지
- **날짜**: `TEXT` (ISO8601 `YYYY-MM-DD`)
- **개인정보**: 주민번호·계좌번호는 AES 암호화 저장
- **파일**: DB에 경로만 저장, 실제 파일은 로컬 파일시스템

## IPC 통신

Renderer → Main 통신은 `contextBridge`를 통한 타입 안전한 IPC:

```typescript
// preload/index.ts에서 노출
window.api.projectList(filters)      // 프로젝트 목록
window.api.giseongRoundCreate(data)  // 기성 회차 생성
window.api.giseongDetailUpdate(id, { curr_rate: 30 })  // 진도율 입력
window.api.giseongExportExcel(roundId, savePath)        // 엑셀 내보내기
window.api.designImportExcel(projectId, filePath)       // 설계내역 임포트
```

## 엑셀 템플릿 시스템

핵심 경쟁력. 지자체마다 다른 양식을 유연하게 지원:

1. 기존 엑셀 양식을 템플릿으로 등록
2. 매핑 설정 (JSON): 각 셀에 어떤 데이터를 넣을지 정의
3. 생성시: 템플릿 복사 → 데이터 주입 → 테이블 행 동적 삽입
4. 결과: 지자체 원본 양식 그대로 + 데이터 자동 채움

```json
{
  "mappings": [
    {"cell": "B3", "field": "project.name"},
    {"cell": "D5", "field": "project.contract_amount", "format": "#,##0"},
    {"cell": "A10:F10", "field": "giseong_details", "type": "table_row"}
  ]
}
```
