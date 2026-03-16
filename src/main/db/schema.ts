import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

let db: Database.Database | null = null

export function initDatabase(): Database.Database {
  if (db) return db

  const dbPath = join(app.getPath('userData'), 'nep-works.db')
  db = new Database(dbPath)

  // WAL 모드 (성능 향상)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // 테이블 생성
  createTables(db)

  // 기본 데이터 삽입
  insertDefaultData(db)

  return db
}

function createTables(db: Database.Database): void {
  db.exec(`
    -- 발주처
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      region TEXT NOT NULL DEFAULT '',
      contact_person TEXT NOT NULL DEFAULT '',
      contact_phone TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      template_set TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- 프로젝트
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
      name TEXT NOT NULL,
      contract_type TEXT NOT NULL CHECK(contract_type IN ('종합','전문','일반','용역')) DEFAULT '일반',
      contract_method TEXT NOT NULL CHECK(contract_method IN ('입찰','수의계약')) DEFAULT '수의계약',
      contract_amount INTEGER NOT NULL DEFAULT 0,
      vat_included INTEGER NOT NULL DEFAULT 1,
      start_date TEXT,
      end_date TEXT,
      status TEXT NOT NULL CHECK(status IN (
        '입찰중','계약체결','착공전','시공중','준공서류작성',
        '준공검사','준공완료','하자보증중','완료'
      )) DEFAULT '계약체결',
      warranty_end_date TEXT,
      folder_path TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- 설계내역 항목
    CREATE TABLE IF NOT EXISTS design_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      category TEXT NOT NULL DEFAULT '',
      subcategory TEXT,
      item_name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT '',
      quantity REAL NOT NULL DEFAULT 0,
      unit_price INTEGER NOT NULL DEFAULT 0,
      total_price INTEGER NOT NULL DEFAULT 0,
      cost_type TEXT NOT NULL CHECK(cost_type IN ('재료비','노무비','경비')) DEFAULT '재료비',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    -- 기성 회차
    CREATE TABLE IF NOT EXISTS giseong_rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      round_no INTEGER NOT NULL,
      claim_date TEXT,
      claim_amount INTEGER NOT NULL DEFAULT 0,
      approved_amount INTEGER,
      status TEXT NOT NULL CHECK(status IN ('작성중','청구완료','승인완료','보완요청')) DEFAULT '작성중',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      UNIQUE(project_id, round_no)
    );

    -- 기성 상세 (내역별 진도율)
    CREATE TABLE IF NOT EXISTS giseong_details (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER NOT NULL REFERENCES giseong_rounds(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL REFERENCES design_items(id) ON DELETE CASCADE,
      prev_rate REAL NOT NULL DEFAULT 0,
      curr_rate REAL NOT NULL DEFAULT 0,
      cumul_rate REAL NOT NULL DEFAULT 0,
      prev_amount INTEGER NOT NULL DEFAULT 0,
      curr_amount INTEGER NOT NULL DEFAULT 0,
      cumul_amount INTEGER NOT NULL DEFAULT 0,
      UNIQUE(round_id, item_id)
    );

    -- 근로자
    CREATE TABLE IF NOT EXISTS workers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      resident_no TEXT NOT NULL DEFAULT '',
      bank_name TEXT NOT NULL DEFAULT '',
      bank_account TEXT NOT NULL DEFAULT '',
      job_type TEXT NOT NULL CHECK(job_type IN ('보통인부','특별인부','기능공','준기능공','기타')) DEFAULT '보통인부',
      default_wage INTEGER NOT NULL DEFAULT 0,
      phone TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- 출역 기록
    CREATE TABLE IF NOT EXISTS labor_assign (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      worker_id INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
      work_date TEXT NOT NULL,
      work_type TEXT NOT NULL CHECK(work_type IN ('일반','반일','야간','특근')) DEFAULT '일반',
      day_fraction REAL NOT NULL DEFAULT 1.0,
      daily_wage INTEGER NOT NULL DEFAULT 0,
      notes TEXT
    );

    -- 급여
    CREATE TABLE IF NOT EXISTS payroll (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worker_id INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      year_month TEXT NOT NULL,
      work_days REAL NOT NULL DEFAULT 0,
      gross_pay INTEGER NOT NULL DEFAULT 0,
      nat_pension INTEGER NOT NULL DEFAULT 0,
      health_ins INTEGER NOT NULL DEFAULT 0,
      long_care_ins INTEGER NOT NULL DEFAULT 0,
      employ_ins INTEGER NOT NULL DEFAULT 0,
      income_tax INTEGER NOT NULL DEFAULT 0,
      local_tax INTEGER NOT NULL DEFAULT 0,
      net_pay INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK(status IN ('계산완료','지급완료')) DEFAULT '계산완료',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- 보험요율
    CREATE TABLE IF NOT EXISTS insurance_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      rate_type TEXT NOT NULL,
      worker_rate REAL NOT NULL DEFAULT 0,
      employer_rate REAL NOT NULL DEFAULT 0,
      notes TEXT,
      UNIQUE(year, rate_type)
    );

    -- 입찰
    CREATE TABLE IF NOT EXISTS bids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      announcement_no TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      client_id INTEGER REFERENCES clients(id),
      organization TEXT NOT NULL DEFAULT '',
      estimated_price INTEGER,
      bid_price INTEGER,
      bid_date TEXT,
      result TEXT NOT NULL CHECK(result IN ('대기중','낙찰','유찰','미참여')) DEFAULT '대기중',
      project_id INTEGER REFERENCES projects(id),
      source TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- 증빙서류
    CREATE TABLE IF NOT EXISTS evidence_docs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      round_id INTEGER REFERENCES giseong_rounds(id) ON DELETE SET NULL,
      doc_type TEXT NOT NULL,
      doc_name TEXT NOT NULL,
      file_path TEXT,
      status TEXT NOT NULL CHECK(status IN ('미첨부','첨부완료','확인필요')) DEFAULT '미첨부',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- 준공서류 체크리스트
    CREATE TABLE IF NOT EXISTS jungong_docs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      doc_type TEXT NOT NULL,
      doc_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('미완료','완료','해당없음')) DEFAULT '미완료',
      file_path TEXT,
      notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    -- 엑셀 템플릿
    CREATE TABLE IF NOT EXISTS excel_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      template_type TEXT NOT NULL,
      template_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mapping_config TEXT NOT NULL DEFAULT '{}',
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- 인덱스
    CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id);
    CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
    CREATE INDEX IF NOT EXISTS idx_design_items_project ON design_items(project_id);
    CREATE INDEX IF NOT EXISTS idx_giseong_rounds_project ON giseong_rounds(project_id);
    CREATE INDEX IF NOT EXISTS idx_giseong_details_round ON giseong_details(round_id);
    CREATE INDEX IF NOT EXISTS idx_labor_assign_project ON labor_assign(project_id);
    CREATE INDEX IF NOT EXISTS idx_labor_assign_worker ON labor_assign(worker_id);
    CREATE INDEX IF NOT EXISTS idx_labor_assign_date ON labor_assign(work_date);
    CREATE INDEX IF NOT EXISTS idx_payroll_worker ON payroll(worker_id);
    CREATE INDEX IF NOT EXISTS idx_payroll_month ON payroll(year_month);
  `)
}

function insertDefaultData(db: Database.Database): void {
  // 2026년 보험요율 기본값
  const existing = db.prepare('SELECT COUNT(*) as cnt FROM insurance_rates WHERE year = 2026').get() as { cnt: number }
  if (existing.cnt === 0) {
    const insert = db.prepare(
      'INSERT INTO insurance_rates (year, rate_type, worker_rate, employer_rate, notes) VALUES (?, ?, ?, ?, ?)'
    )

    const rates = db.transaction(() => {
      insert.run(2026, '국민연금', 4.5, 4.5, '총 9%')
      insert.run(2026, '건강보험', 3.545, 3.545, '총 7.09%')
      insert.run(2026, '장기요양보험', 0.4591, 0.4591, '건강보험의 12.95%')
      insert.run(2026, '고용보험_실업급여', 0.9, 0.9, '총 1.8%')
      insert.run(2026, '고용보험_고용안정', 0, 0.25, '사업주만 부담 (150인 미만)')
      insert.run(2026, '산재보험', 0, 3.7, '건설업 평균 (사업주 전액)')
    })

    rates()
  }
}

export function getDatabase(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}
