// ===== 발주처 (Client) =====
export interface Client {
  id: number
  name: string
  region: string
  contact_person: string
  contact_phone: string
  address: string
  template_set: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// ===== 프로젝트 (Project) =====
export type ContractType = '종합' | '전문' | '일반' | '용역'
export type ContractMethod = '입찰' | '수의계약'
export type ProjectStatus =
  | '입찰중'
  | '계약체결'
  | '착공전'
  | '시공중'
  | '준공서류작성'
  | '준공검사'
  | '준공완료'
  | '하자보증중'
  | '완료'

export interface Project {
  id: number
  client_id: number
  name: string
  contract_type: ContractType
  contract_method: ContractMethod
  contract_amount: number // 원 단위 정수
  vat_included: boolean
  start_date: string | null
  end_date: string | null
  status: ProjectStatus
  warranty_end_date: string | null
  folder_path: string | null
  notes: string | null
  created_at: string
  updated_at: string
  // join용
  client_name?: string
}

// ===== 설계내역 (Design Items) =====
export interface DesignItem {
  id: number
  project_id: number
  category: string // 대분류 (공종)
  subcategory: string | null // 중분류
  item_name: string // 항목명
  unit: string // 단위
  quantity: number // 수량
  unit_price: number // 단가
  total_price: number // 금액
  cost_type: '재료비' | '노무비' | '경비' // 원가 구분
  sort_order: number
}

// ===== 기성회차 (Giseong Round) =====
export type GiseongStatus = '작성중' | '청구완료' | '승인완료' | '보완요청'

export interface GiseongRound {
  id: number
  project_id: number
  round_no: number
  claim_date: string | null
  claim_amount: number
  approved_amount: number | null
  status: GiseongStatus
  notes: string | null
  created_at: string
}

// ===== 기성 상세 (Giseong Detail) =====
export interface GiseongDetail {
  id: number
  round_id: number
  item_id: number
  prev_rate: number // 전회 진도율 (0~100)
  curr_rate: number // 금회 진도율
  cumul_rate: number // 누계 진도율
  prev_amount: number // 전회 금액
  curr_amount: number // 금회 금액
  cumul_amount: number // 누계 금액
  // join용
  item_name?: string
  category?: string
  total_price?: number
}

// ===== 근로자 (Worker) =====
export type JobType = '보통인부' | '특별인부' | '기능공' | '준기능공' | '기타'

export interface Worker {
  id: number
  name: string
  resident_no: string // 암호화 저장
  bank_name: string
  bank_account: string // 암호화 저장
  job_type: JobType
  default_wage: number // 기본 일당
  phone: string | null
  is_active: boolean
  created_at: string
}

// ===== 출역 (Labor Assignment) =====
export type WorkType = '일반' | '반일' | '야간' | '특근'

export interface LaborAssign {
  id: number
  project_id: number
  worker_id: number
  work_date: string
  work_type: WorkType
  day_fraction: number // 1.0 = 하루, 0.5 = 반일
  daily_wage: number
  notes: string | null
  // join용
  worker_name?: string
  project_name?: string
}

// ===== 급여 (Payroll) =====
export type PayrollStatus = '계산완료' | '지급완료'

export interface Payroll {
  id: number
  worker_id: number
  project_id: number
  year_month: string // 'YYYY-MM'
  work_days: number
  gross_pay: number
  nat_pension: number // 국민연금
  health_ins: number // 건강보험
  long_care_ins: number // 장기요양
  employ_ins: number // 고용보험
  income_tax: number // 소득세
  local_tax: number // 지방소득세
  net_pay: number // 실지급액
  status: PayrollStatus
  created_at: string
}

// ===== 보험요율 (Insurance Rates) =====
export interface InsuranceRate {
  id: number
  year: number
  rate_type: string
  worker_rate: number // 근로자 부담률 (%)
  employer_rate: number // 사업주 부담률 (%)
  notes: string | null
}

// ===== 입찰 (Bid) =====
export type BidResult = '대기중' | '낙찰' | '유찰' | '미참여'

export interface Bid {
  id: number
  announcement_no: string
  title: string
  client_id: number | null
  organization: string // 발주기관명
  estimated_price: number | null
  bid_price: number | null
  bid_date: string | null
  result: BidResult
  project_id: number | null // 낙찰시 프로젝트 연결
  source: string | null // 나라장터 등
  notes: string | null
  created_at: string
}

// ===== 증빙서류 (Evidence Document) =====
export type DocStatus = '미첨부' | '첨부완료' | '확인필요'

export interface EvidenceDoc {
  id: number
  project_id: number
  round_id: number | null
  doc_type: string
  doc_name: string
  file_path: string | null
  status: DocStatus
  notes: string | null
  created_at: string
}

// ===== 준공서류 체크리스트 =====
export interface JungongDoc {
  id: number
  project_id: number
  doc_type: string
  doc_name: string
  status: '미완료' | '완료' | '해당없음'
  file_path: string | null
  notes: string | null
  sort_order: number
}

// ===== 엑셀 템플릿 =====
export interface ExcelTemplate {
  id: number
  client_id: number | null
  template_type: string // 'giseong_detail' | 'giseong_claim' | 'labor_ledger' | etc.
  template_name: string
  file_path: string
  mapping_config: string // JSON
  is_default: boolean
  created_at: string
}

// ===== IPC 채널 =====
export const IPC_CHANNELS = {
  // 프로젝트
  PROJECT_LIST: 'project:list',
  PROJECT_GET: 'project:get',
  PROJECT_CREATE: 'project:create',
  PROJECT_UPDATE: 'project:update',
  PROJECT_DELETE: 'project:delete',
  // 발주처
  CLIENT_LIST: 'client:list',
  CLIENT_GET: 'client:get',
  CLIENT_CREATE: 'client:create',
  CLIENT_UPDATE: 'client:update',
  CLIENT_DELETE: 'client:delete',
  // 기성
  GISEONG_ROUNDS: 'giseong:rounds',
  GISEONG_ROUND_GET: 'giseong:round:get',
  GISEONG_ROUND_CREATE: 'giseong:round:create',
  GISEONG_ROUND_UPDATE: 'giseong:round:update',
  GISEONG_DETAILS: 'giseong:details',
  GISEONG_DETAIL_UPDATE: 'giseong:detail:update',
  GISEONG_EXPORT_EXCEL: 'giseong:export:excel',
  // 설계내역
  DESIGN_ITEMS: 'design:items',
  DESIGN_IMPORT_EXCEL: 'design:import:excel',
  // 프로젝트 검증
  PROJECT_VALIDATE: 'project:validate',
  // 감사 로그
  AUDIT_LIST: 'audit:list',
  AUDIT_PROJECT_ALL: 'audit:project-all',
  // 워크플로우
  WORKFLOW_TASKS: 'workflow:tasks',
  WORKFLOW_COMPLETE: 'workflow:complete',
  WORKFLOW_SKIP: 'workflow:skip',
  WORKFLOW_CREATE: 'workflow:create',
  WORKFLOW_PENDING_ALL: 'workflow:pending-all',
  WORKFLOW_ON_STATUS_CHANGE: 'workflow:on-status-change',
  WORKFLOW_NEXT_STEPS: 'workflow:next-steps',
  // 추천/프리뷰
  RECOMMEND_PROJECT_DEFAULTS: 'recommend:project-defaults',
  RECOMMEND_GISEONG_RATES: 'recommend:giseong-rates',
  RECOMMEND_GISEONG_PREVIEW: 'recommend:giseong-preview',
  RECOMMEND_SAVE_CLIENT_DEFAULT: 'recommend:save-client-default',
  RECOMMEND_DESIGN_PREVIEW: 'recommend:design-preview',
  RECOMMEND_EXPORT_PREVIEW: 'recommend:export-preview',
  // 다이얼로그
  DIALOG_OPEN_FILE: 'dialog:openFile',
  DIALOG_SAVE_FILE: 'dialog:saveFile',
  DIALOG_OPEN_FOLDER: 'dialog:openFolder',
} as const
