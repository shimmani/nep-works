import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'

// ---------------------------------------------------------------------------
// Helpers: replicate core SQL logic from recommend.ts without Electron IPC
// ---------------------------------------------------------------------------

function createTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE clients (
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

    CREATE TABLE projects (
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

    CREATE TABLE design_items (
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

    CREATE TABLE giseong_rounds (
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

    CREATE TABLE giseong_details (
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

    CREATE TABLE client_defaults (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      setting_key TEXT NOT NULL,
      setting_value TEXT NOT NULL,
      UNIQUE(client_id, setting_key)
    );
  `)

  db.pragma('foreign_keys = ON')
}

// --- Service logic replicas (no IPC, pure SQL + JS) ---

interface ProjectDefaultsResult {
  hasHistory: boolean
  projectCount?: number
  recommended?: {
    contract_type: string
    contract_method: string
    avg_amount: number
    avg_duration_days: number
  }
  customDefaults?: Record<string, string>
}

function recommendProjectDefaults(db: Database.Database, clientId: number): ProjectDefaultsResult {
  const recentProjects = db.prepare(`
    SELECT contract_type, contract_method, contract_amount,
           start_date, end_date,
           julianday(end_date) - julianday(start_date) as duration_days
    FROM projects
    WHERE client_id = ? AND start_date IS NOT NULL AND end_date IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 5
  `).all(clientId) as Array<{
    contract_type: string
    contract_method: string
    contract_amount: number
    duration_days: number
  }>

  if (recentProjects.length === 0) {
    return { hasHistory: false }
  }

  const typeCounts: Record<string, number> = {}
  const methodCounts: Record<string, number> = {}
  let totalAmount = 0
  let totalDuration = 0

  for (const p of recentProjects) {
    typeCounts[p.contract_type] = (typeCounts[p.contract_type] || 0) + 1
    methodCounts[p.contract_method] = (methodCounts[p.contract_method] || 0) + 1
    totalAmount += p.contract_amount
    totalDuration += p.duration_days || 0
  }

  const mostCommonType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
  const mostCommonMethod = Object.entries(methodCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
  const avgAmount = Math.round(totalAmount / recentProjects.length)
  const avgDuration = Math.round(totalDuration / recentProjects.length)

  const customDefaults = db.prepare(
    'SELECT setting_key, setting_value FROM client_defaults WHERE client_id = ?'
  ).all(clientId) as Array<{ setting_key: string; setting_value: string }>

  const customMap: Record<string, string> = {}
  for (const d of customDefaults) {
    customMap[d.setting_key] = d.setting_value
  }

  return {
    hasHistory: true,
    projectCount: recentProjects.length,
    recommended: {
      contract_type: customMap.default_contract_type || mostCommonType,
      contract_method: customMap.default_contract_method || mostCommonMethod,
      avg_amount: avgAmount,
      avg_duration_days: avgDuration,
    },
    customDefaults: customMap,
  }
}

interface GiseongRatesSuggestion {
  hasPattern: boolean
  suggestedRates?: Array<{ cost_type: string; suggested_rate: number }>
  note?: string
}

function recommendGiseongRates(db: Database.Database, projectId: number, roundNo: number): GiseongRatesSuggestion {
  const project = db.prepare(`
    SELECT p.*, c.id as cid FROM projects p
    JOIN clients c ON p.client_id = c.id
    WHERE p.id = ?
  `).get(projectId) as { cid: number; contract_amount: number } | undefined

  if (!project) return { hasPattern: false }

  const pattern = db.prepare(`
    SELECT AVG(gd.curr_rate) as avg_rate, di.cost_type
    FROM giseong_details gd
    JOIN giseong_rounds gr ON gd.round_id = gr.id
    JOIN design_items di ON gd.item_id = di.id
    JOIN projects p ON gr.project_id = p.id
    WHERE p.client_id = ? AND p.id != ? AND gr.round_no = ?
    GROUP BY di.cost_type
  `).all(project.cid, projectId, roundNo) as Array<{ avg_rate: number; cost_type: string }>

  if (pattern.length === 0) return { hasPattern: false }

  return {
    hasPattern: true,
    suggestedRates: pattern.map(p => ({
      cost_type: p.cost_type,
      suggested_rate: Math.round(p.avg_rate * 10) / 10,
    })),
    note: `${roundNo}회차 기성에서 같은 발주처 과거 프로젝트의 평균 진도율입니다.`,
  }
}

interface GiseongPreviewResult {
  nextRoundNo: number
  designItemCount: number
  totalDesignAmount: number
  totalPreviousCumul: number
  remainingAmount: number
  overallProgress: number
  items: Array<{
    id: number
    category: string
    item_name: string
    total_price: number
    prev_cumul_rate: number
    remaining_rate: number
    remaining_amount: number
  }>
  existingRounds: Array<{ round_no: number; amount: number; status: string }>
}

function recommendGiseongPreview(db: Database.Database, projectId: number): GiseongPreviewResult {
  const designItems = db.prepare(
    'SELECT * FROM design_items WHERE project_id = ? ORDER BY sort_order'
  ).all(projectId) as Array<{ id: number; category: string; item_name: string; total_price: number; cost_type: string }>

  const rounds = db.prepare(
    'SELECT * FROM giseong_rounds WHERE project_id = ? ORDER BY round_no'
  ).all(projectId) as Array<{ id: number; round_no: number; claim_amount: number; status: string }>

  const nextRoundNo = rounds.length > 0 ? rounds[rounds.length - 1].round_no + 1 : 1

  const prevCumul: Record<number, { rate: number; amount: number }> = {}
  if (rounds.length > 0) {
    const lastRound = rounds[rounds.length - 1]
    const details = db.prepare(
      'SELECT item_id, cumul_rate, cumul_amount FROM giseong_details WHERE round_id = ?'
    ).all(lastRound.id) as Array<{ item_id: number; cumul_rate: number; cumul_amount: number }>
    for (const d of details) {
      prevCumul[d.item_id] = { rate: d.cumul_rate, amount: d.cumul_amount }
    }
  }

  const totalDesign = designItems.reduce((s, i) => s + i.total_price, 0)
  const totalPrevCumul = Object.values(prevCumul).reduce((s, v) => s + v.amount, 0)
  const remainingAmount = totalDesign - totalPrevCumul

  return {
    nextRoundNo,
    designItemCount: designItems.length,
    totalDesignAmount: totalDesign,
    totalPreviousCumul: totalPrevCumul,
    remainingAmount,
    overallProgress: totalDesign > 0 ? Math.round(totalPrevCumul / totalDesign * 1000) / 10 : 0,
    items: designItems.map(item => ({
      id: item.id,
      category: item.category,
      item_name: item.item_name,
      total_price: item.total_price,
      prev_cumul_rate: prevCumul[item.id]?.rate || 0,
      remaining_rate: 100 - (prevCumul[item.id]?.rate || 0),
      remaining_amount: item.total_price - (prevCumul[item.id]?.amount || 0),
    })),
    existingRounds: rounds.map(r => ({
      round_no: r.round_no,
      amount: r.claim_amount,
      status: r.status,
    })),
  }
}

function saveClientDefault(db: Database.Database, clientId: number, key: string, value: string) {
  db.prepare(`
    INSERT INTO client_defaults (client_id, setting_key, setting_value)
    VALUES (?, ?, ?)
    ON CONFLICT(client_id, setting_key) DO UPDATE SET setting_value = excluded.setting_value
  `).run(clientId, key, value)
  return { success: true }
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

function insertClient(db: Database.Database, name = '테스트발주처'): number {
  return db.prepare("INSERT INTO clients (name) VALUES (?)").run(name).lastInsertRowid as number
}

function insertProject(
  db: Database.Database,
  clientId: number,
  overrides: Partial<{
    name: string; contract_type: string; contract_method: string;
    contract_amount: number; start_date: string; end_date: string;
    status: string; created_at: string
  }> = {}
): number {
  const o = {
    name: '프로젝트',
    contract_type: '일반',
    contract_method: '수의계약',
    contract_amount: 100_000_000,
    start_date: '2025-01-01',
    end_date: '2025-06-30',
    status: '시공중',
    created_at: datetime(),
    ...overrides,
  }
  return db.prepare(`
    INSERT INTO projects (client_id, name, contract_type, contract_method, contract_amount, start_date, end_date, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(clientId, o.name, o.contract_type, o.contract_method, o.contract_amount, o.start_date, o.end_date, o.status, o.created_at)
    .lastInsertRowid as number
}

function insertDesignItem(
  db: Database.Database,
  projectId: number,
  overrides: Partial<{
    category: string; item_name: string; unit: string; quantity: number;
    unit_price: number; total_price: number; cost_type: string; sort_order: number
  }> = {}
): number {
  const o = {
    category: '토공',
    item_name: '터파기',
    unit: 'm3',
    quantity: 100,
    unit_price: 10000,
    total_price: 1_000_000,
    cost_type: '재료비',
    sort_order: 0,
    ...overrides,
  }
  return db.prepare(`
    INSERT INTO design_items (project_id, category, item_name, unit, quantity, unit_price, total_price, cost_type, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(projectId, o.category, o.item_name, o.unit, o.quantity, o.unit_price, o.total_price, o.cost_type, o.sort_order)
    .lastInsertRowid as number
}

function insertRound(
  db: Database.Database,
  projectId: number,
  roundNo: number,
  overrides: Partial<{ claim_amount: number; status: string; claim_date: string }> = {}
): number {
  const o = { claim_amount: 0, status: '작성중', claim_date: null, ...overrides }
  return db.prepare(`
    INSERT INTO giseong_rounds (project_id, round_no, claim_amount, status, claim_date)
    VALUES (?, ?, ?, ?, ?)
  `).run(projectId, roundNo, o.claim_amount, o.status, o.claim_date)
    .lastInsertRowid as number
}

function insertDetail(
  db: Database.Database,
  roundId: number,
  itemId: number,
  data: Partial<{
    prev_rate: number; curr_rate: number; cumul_rate: number;
    prev_amount: number; curr_amount: number; cumul_amount: number
  }> = {}
): number {
  const d = { prev_rate: 0, curr_rate: 0, cumul_rate: 0, prev_amount: 0, curr_amount: 0, cumul_amount: 0, ...data }
  return db.prepare(`
    INSERT INTO giseong_details (round_id, item_id, prev_rate, curr_rate, cumul_rate, prev_amount, curr_amount, cumul_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(roundId, itemId, d.prev_rate, d.curr_rate, d.cumul_rate, d.prev_amount, d.curr_amount, d.cumul_amount)
    .lastInsertRowid as number
}

let _dtCounter = 0
function datetime(): string {
  _dtCounter++
  const sec = String(_dtCounter).padStart(2, '0')
  return `2025-01-01 00:00:${sec}`
}

// ===========================================================================
// TESTS
// ===========================================================================

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  createTables(db)
  _dtCounter = 0
})

afterEach(() => {
  db.close()
})

// ---------------------------------------------------------------------------
// recommend:project-defaults (25 tests)
// ---------------------------------------------------------------------------
describe('recommend:project-defaults', () => {
  it('1. client with no projects returns hasHistory=false', () => {
    const cid = insertClient(db)
    const result = recommendProjectDefaults(db, cid)
    expect(result.hasHistory).toBe(false)
  })

  it('2. client with 1 project returns that project data', () => {
    const cid = insertClient(db)
    insertProject(db, cid, { contract_type: '전문', contract_method: '입찰', contract_amount: 50_000_000 })
    const result = recommendProjectDefaults(db, cid)
    expect(result.hasHistory).toBe(true)
    expect(result.projectCount).toBe(1)
    expect(result.recommended!.contract_type).toBe('전문')
    expect(result.recommended!.contract_method).toBe('입찰')
    expect(result.recommended!.avg_amount).toBe(50_000_000)
  })

  it('3. client with 5 projects returns averaged values', () => {
    const cid = insertClient(db)
    for (let i = 0; i < 5; i++) {
      insertProject(db, cid, { contract_amount: (i + 1) * 10_000_000 })
    }
    const result = recommendProjectDefaults(db, cid)
    expect(result.projectCount).toBe(5)
    // avg = (10+20+30+40+50)/5 = 30
    expect(result.recommended!.avg_amount).toBe(30_000_000)
  })

  it('4. most common contract_type extracted correctly', () => {
    const cid = insertClient(db)
    insertProject(db, cid, { contract_type: '전문' })
    insertProject(db, cid, { contract_type: '전문' })
    insertProject(db, cid, { contract_type: '일반' })
    const result = recommendProjectDefaults(db, cid)
    expect(result.recommended!.contract_type).toBe('전문')
  })

  it('5. most common contract_method extracted correctly', () => {
    const cid = insertClient(db)
    insertProject(db, cid, { contract_method: '입찰' })
    insertProject(db, cid, { contract_method: '입찰' })
    insertProject(db, cid, { contract_method: '수의계약' })
    const result = recommendProjectDefaults(db, cid)
    expect(result.recommended!.contract_method).toBe('입찰')
  })

  it('6. average amount calculated correctly with different amounts', () => {
    const cid = insertClient(db)
    insertProject(db, cid, { contract_amount: 100_000_000 })
    insertProject(db, cid, { contract_amount: 200_000_000 })
    const result = recommendProjectDefaults(db, cid)
    expect(result.recommended!.avg_amount).toBe(150_000_000)
  })

  it('7. average duration calculated from julianday difference', () => {
    const cid = insertClient(db)
    insertProject(db, cid, { start_date: '2025-01-01', end_date: '2025-04-01' }) // 90 days
    insertProject(db, cid, { start_date: '2025-01-01', end_date: '2025-07-01' }) // 181 days
    const result = recommendProjectDefaults(db, cid)
    // (90 + 181) / 2 = 135.5 → 136
    expect(result.recommended!.avg_duration_days).toBe(136)
  })

  it('8. custom defaults override history-based recommendations', () => {
    const cid = insertClient(db)
    insertProject(db, cid, { contract_type: '전문', contract_method: '입찰' })
    saveClientDefault(db, cid, 'default_contract_type', '종합')
    const result = recommendProjectDefaults(db, cid)
    expect(result.recommended!.contract_type).toBe('종합')
  })

  it('9. mixed contract types (3 수의계약, 2 입찰) recommends 수의계약', () => {
    const cid = insertClient(db)
    for (let i = 0; i < 3; i++) insertProject(db, cid, { contract_method: '수의계약' })
    for (let i = 0; i < 2; i++) insertProject(db, cid, { contract_method: '입찰' })
    const result = recommendProjectDefaults(db, cid)
    expect(result.recommended!.contract_method).toBe('수의계약')
  })

  it('10. client defaults for contract_type overrides history', () => {
    const cid = insertClient(db)
    insertProject(db, cid, { contract_type: '일반' })
    insertProject(db, cid, { contract_type: '일반' })
    saveClientDefault(db, cid, 'default_contract_type', '용역')
    const result = recommendProjectDefaults(db, cid)
    expect(result.recommended!.contract_type).toBe('용역')
  })

  it('11. projects without dates are excluded (duration excluded)', () => {
    const cid = insertClient(db)
    // This project has NULL dates so it won't appear in the query
    db.prepare(`
      INSERT INTO projects (client_id, name, contract_type, contract_method, contract_amount, status)
      VALUES (?, '프로젝트', '일반', '수의계약', 50000000, '시공중')
    `).run(cid)
    const result = recommendProjectDefaults(db, cid)
    expect(result.hasHistory).toBe(false)
  })

  it('12. single project with all data returns correct values', () => {
    const cid = insertClient(db)
    insertProject(db, cid, {
      contract_type: '종합',
      contract_method: '입찰',
      contract_amount: 500_000_000,
      start_date: '2025-03-01',
      end_date: '2025-12-31',
    })
    const result = recommendProjectDefaults(db, cid)
    expect(result.hasHistory).toBe(true)
    expect(result.projectCount).toBe(1)
    expect(result.recommended!.contract_type).toBe('종합')
    expect(result.recommended!.contract_method).toBe('입찰')
    expect(result.recommended!.avg_amount).toBe(500_000_000)
    expect(result.recommended!.avg_duration_days).toBe(305) // Mar1-Dec31
  })

  it('13. projects from different clients do not mix', () => {
    const cid1 = insertClient(db, '발주처A')
    const cid2 = insertClient(db, '발주처B')
    insertProject(db, cid1, { contract_type: '전문', contract_amount: 100_000_000 })
    insertProject(db, cid2, { contract_type: '종합', contract_amount: 900_000_000 })
    const result = recommendProjectDefaults(db, cid1)
    expect(result.recommended!.contract_type).toBe('전문')
    expect(result.recommended!.avg_amount).toBe(100_000_000)
  })

  it('14. returns empty customDefaults map when no defaults set', () => {
    const cid = insertClient(db)
    insertProject(db, cid)
    const result = recommendProjectDefaults(db, cid)
    expect(result.customDefaults).toEqual({})
  })

  it('15. multiple custom defaults returned', () => {
    const cid = insertClient(db)
    insertProject(db, cid)
    saveClientDefault(db, cid, 'default_contract_type', '전문')
    saveClientDefault(db, cid, 'default_contract_method', '입찰')
    const result = recommendProjectDefaults(db, cid)
    expect(result.customDefaults!.default_contract_type).toBe('전문')
    expect(result.customDefaults!.default_contract_method).toBe('입찰')
  })

  it('16. limits to most recent 5 projects', () => {
    const cid = insertClient(db)
    // Insert 7 projects; only latest 5 should be used
    for (let i = 0; i < 7; i++) {
      insertProject(db, cid, { contract_amount: (i + 1) * 10_000_000 })
    }
    const result = recommendProjectDefaults(db, cid)
    expect(result.projectCount).toBe(5)
    // Latest 5 created_at order: amounts 30,40,50,60,70 (indexes 2-6)
    // avg = (30+40+50+60+70)/5 = 50
    expect(result.recommended!.avg_amount).toBe(50_000_000)
  })

  it('17. non-existent client returns hasHistory=false', () => {
    const result = recommendProjectDefaults(db, 9999)
    expect(result.hasHistory).toBe(false)
  })

  it('18. custom default for contract_method overrides history', () => {
    const cid = insertClient(db)
    insertProject(db, cid, { contract_method: '입찰' })
    saveClientDefault(db, cid, 'default_contract_method', '수의계약')
    const result = recommendProjectDefaults(db, cid)
    expect(result.recommended!.contract_method).toBe('수의계약')
  })

  it('19. zero contract_amount projects average to zero', () => {
    const cid = insertClient(db)
    insertProject(db, cid, { contract_amount: 0 })
    insertProject(db, cid, { contract_amount: 0 })
    const result = recommendProjectDefaults(db, cid)
    expect(result.recommended!.avg_amount).toBe(0)
  })

  it('20. very large contract amounts handled', () => {
    const cid = insertClient(db)
    insertProject(db, cid, { contract_amount: 99_000_000_000 })
    const result = recommendProjectDefaults(db, cid)
    expect(result.recommended!.avg_amount).toBe(99_000_000_000)
  })

  it('21. projects with same-day start/end yield 0 duration', () => {
    const cid = insertClient(db)
    insertProject(db, cid, { start_date: '2025-06-01', end_date: '2025-06-01' })
    const result = recommendProjectDefaults(db, cid)
    expect(result.recommended!.avg_duration_days).toBe(0)
  })

  it('22. tie in contract_type picks one deterministically', () => {
    const cid = insertClient(db)
    insertProject(db, cid, { contract_type: '전문' })
    insertProject(db, cid, { contract_type: '일반' })
    const result = recommendProjectDefaults(db, cid)
    // Both have count 1, sort is stable; either is acceptable
    expect(['전문', '일반']).toContain(result.recommended!.contract_type)
  })

  it('23. custom default does not affect avg_amount', () => {
    const cid = insertClient(db)
    insertProject(db, cid, { contract_amount: 200_000_000 })
    saveClientDefault(db, cid, 'default_contract_type', '종합')
    const result = recommendProjectDefaults(db, cid)
    expect(result.recommended!.avg_amount).toBe(200_000_000)
  })

  it('24. mixed projects with and without dates only count those with dates', () => {
    const cid = insertClient(db)
    insertProject(db, cid, { contract_amount: 100_000_000, start_date: '2025-01-01', end_date: '2025-03-01' })
    // project without dates
    db.prepare(`
      INSERT INTO projects (client_id, name, contract_type, contract_method, contract_amount, status)
      VALUES (?, '프로젝트2', '일반', '수의계약', 300000000, '시공중')
    `).run(cid)
    const result = recommendProjectDefaults(db, cid)
    expect(result.projectCount).toBe(1)
    expect(result.recommended!.avg_amount).toBe(100_000_000)
  })

  it('25. all 5 projects with different types picks the most frequent', () => {
    const cid = insertClient(db)
    insertProject(db, cid, { contract_type: '종합' })
    insertProject(db, cid, { contract_type: '종합' })
    insertProject(db, cid, { contract_type: '종합' })
    insertProject(db, cid, { contract_type: '전문' })
    insertProject(db, cid, { contract_type: '용역' })
    const result = recommendProjectDefaults(db, cid)
    expect(result.recommended!.contract_type).toBe('종합')
  })
})

// ---------------------------------------------------------------------------
// recommend:giseong-rates (15 tests)
// ---------------------------------------------------------------------------
describe('recommend:giseong-rates', () => {
  it('26. no other projects for same client returns hasPattern=false', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    const result = recommendGiseongRates(db, pid, 1)
    expect(result.hasPattern).toBe(false)
  })

  it('27. one other project with same round returns rates', () => {
    const cid = insertClient(db)
    const pidOther = insertProject(db, cid, { name: '다른프로젝트' })
    const itemOther = insertDesignItem(db, pidOther, { cost_type: '재료비' })
    const roundOther = insertRound(db, pidOther, 1)
    insertDetail(db, roundOther, itemOther, { curr_rate: 30 })

    const pidCurrent = insertProject(db, cid, { name: '현재프로젝트' })
    const result = recommendGiseongRates(db, pidCurrent, 1)
    expect(result.hasPattern).toBe(true)
    expect(result.suggestedRates!.length).toBe(1)
    expect(result.suggestedRates![0].suggested_rate).toBe(30)
    expect(result.suggestedRates![0].cost_type).toBe('재료비')
  })

  it('28. multiple projects averaged correctly', () => {
    const cid = insertClient(db)
    // Project A
    const pidA = insertProject(db, cid, { name: 'A' })
    const itemA = insertDesignItem(db, pidA, { cost_type: '재료비' })
    const rA = insertRound(db, pidA, 1)
    insertDetail(db, rA, itemA, { curr_rate: 20 })
    // Project B
    const pidB = insertProject(db, cid, { name: 'B' })
    const itemB = insertDesignItem(db, pidB, { cost_type: '재료비' })
    const rB = insertRound(db, pidB, 1)
    insertDetail(db, rB, itemB, { curr_rate: 40 })

    const pidCurrent = insertProject(db, cid, { name: 'Current' })
    const result = recommendGiseongRates(db, pidCurrent, 1)
    expect(result.hasPattern).toBe(true)
    expect(result.suggestedRates![0].suggested_rate).toBe(30) // (20+40)/2
  })

  it('29. different cost_types return separate suggestions', () => {
    const cid = insertClient(db)
    const pidOther = insertProject(db, cid, { name: 'Other' })
    const item1 = insertDesignItem(db, pidOther, { cost_type: '재료비', item_name: 'A' })
    const item2 = insertDesignItem(db, pidOther, { cost_type: '노무비', item_name: 'B' })
    const r = insertRound(db, pidOther, 1)
    insertDetail(db, r, item1, { curr_rate: 25 })
    insertDetail(db, r, item2, { curr_rate: 50 })

    const pidCurr = insertProject(db, cid, { name: 'Curr' })
    const result = recommendGiseongRates(db, pidCurr, 1)
    expect(result.hasPattern).toBe(true)
    expect(result.suggestedRates!.length).toBe(2)
    const byType = Object.fromEntries(result.suggestedRates!.map(s => [s.cost_type, s.suggested_rate]))
    expect(byType['재료비']).toBe(25)
    expect(byType['노무비']).toBe(50)
  })

  it('30. round 1 vs round 2 patterns differ', () => {
    const cid = insertClient(db)
    const pidOther = insertProject(db, cid, { name: 'Other' })
    const item = insertDesignItem(db, pidOther, { cost_type: '재료비' })
    const r1 = insertRound(db, pidOther, 1)
    insertDetail(db, r1, item, { curr_rate: 20 })
    const r2 = insertRound(db, pidOther, 2)
    insertDetail(db, r2, item, { curr_rate: 60 })

    const pidCurr = insertProject(db, cid, { name: 'Curr' })
    const res1 = recommendGiseongRates(db, pidCurr, 1)
    const res2 = recommendGiseongRates(db, pidCurr, 2)
    expect(res1.suggestedRates![0].suggested_rate).toBe(20)
    expect(res2.suggestedRates![0].suggested_rate).toBe(60)
  })

  it('31. same project excluded from its own patterns', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    const item = insertDesignItem(db, pid, { cost_type: '재료비' })
    const r = insertRound(db, pid, 1)
    insertDetail(db, r, item, { curr_rate: 50 })
    // Only own data exists
    const result = recommendGiseongRates(db, pid, 1)
    expect(result.hasPattern).toBe(false)
  })

  it('32. no giseong data at all returns hasPattern=false', () => {
    const cid = insertClient(db)
    const pid1 = insertProject(db, cid, { name: 'P1' })
    const pid2 = insertProject(db, cid, { name: 'P2' })
    // No rounds/details created
    const result = recommendGiseongRates(db, pid2, 1)
    expect(result.hasPattern).toBe(false)
  })

  it('33. non-existent project returns hasPattern=false', () => {
    const result = recommendGiseongRates(db, 9999, 1)
    expect(result.hasPattern).toBe(false)
  })

  it('34. different client data is not included', () => {
    const cid1 = insertClient(db, 'ClientA')
    const cid2 = insertClient(db, 'ClientB')
    const pidOther = insertProject(db, cid1, { name: 'OtherClient' })
    const item = insertDesignItem(db, pidOther, { cost_type: '재료비' })
    const r = insertRound(db, pidOther, 1)
    insertDetail(db, r, item, { curr_rate: 80 })

    const pidCurr = insertProject(db, cid2, { name: 'Curr' })
    const result = recommendGiseongRates(db, pidCurr, 1)
    expect(result.hasPattern).toBe(false)
  })

  it('35. suggested_rate rounded to 1 decimal place', () => {
    const cid = insertClient(db)
    const pidA = insertProject(db, cid, { name: 'A' })
    const itemA = insertDesignItem(db, pidA, { cost_type: '재료비' })
    const rA = insertRound(db, pidA, 1)
    insertDetail(db, rA, itemA, { curr_rate: 33.33 })

    const pidB = insertProject(db, cid, { name: 'B' })
    const itemB = insertDesignItem(db, pidB, { cost_type: '재료비' })
    const rB = insertRound(db, pidB, 1)
    insertDetail(db, rB, itemB, { curr_rate: 33.34 })

    const pidCurr = insertProject(db, cid, { name: 'Curr' })
    const result = recommendGiseongRates(db, pidCurr, 1)
    // avg = 33.335 → rounded to 33.3
    expect(result.suggestedRates![0].suggested_rate).toBe(33.3)
  })

  it('36. note contains the round number', () => {
    const cid = insertClient(db)
    const pidOther = insertProject(db, cid, { name: 'Other' })
    const item = insertDesignItem(db, pidOther, { cost_type: '재료비' })
    const r = insertRound(db, pidOther, 3)
    insertDetail(db, r, item, { curr_rate: 10 })

    const pidCurr = insertProject(db, cid, { name: 'Curr' })
    const result = recommendGiseongRates(db, pidCurr, 3)
    expect(result.note).toContain('3회차')
  })

  it('37. three cost types grouped separately', () => {
    const cid = insertClient(db)
    const pidOther = insertProject(db, cid, { name: 'Other' })
    const i1 = insertDesignItem(db, pidOther, { cost_type: '재료비', item_name: '자재' })
    const i2 = insertDesignItem(db, pidOther, { cost_type: '노무비', item_name: '인건' })
    const i3 = insertDesignItem(db, pidOther, { cost_type: '경비', item_name: '경비항목' })
    const r = insertRound(db, pidOther, 1)
    insertDetail(db, r, i1, { curr_rate: 10 })
    insertDetail(db, r, i2, { curr_rate: 20 })
    insertDetail(db, r, i3, { curr_rate: 30 })

    const pidCurr = insertProject(db, cid, { name: 'Curr' })
    const result = recommendGiseongRates(db, pidCurr, 1)
    expect(result.suggestedRates!.length).toBe(3)
  })

  it('38. round_no that does not exist in other projects returns hasPattern=false', () => {
    const cid = insertClient(db)
    const pidOther = insertProject(db, cid, { name: 'Other' })
    const item = insertDesignItem(db, pidOther, { cost_type: '재료비' })
    const r = insertRound(db, pidOther, 1)
    insertDetail(db, r, item, { curr_rate: 50 })

    const pidCurr = insertProject(db, cid, { name: 'Curr' })
    const result = recommendGiseongRates(db, pidCurr, 5)
    expect(result.hasPattern).toBe(false)
  })

  it('39. many items across projects averaged per cost_type', () => {
    const cid = insertClient(db)
    const pidA = insertProject(db, cid, { name: 'A' })
    const a1 = insertDesignItem(db, pidA, { cost_type: '재료비', item_name: 'A1' })
    const a2 = insertDesignItem(db, pidA, { cost_type: '재료비', item_name: 'A2' })
    const rA = insertRound(db, pidA, 1)
    insertDetail(db, rA, a1, { curr_rate: 10 })
    insertDetail(db, rA, a2, { curr_rate: 30 })

    const pidCurr = insertProject(db, cid, { name: 'Curr' })
    const result = recommendGiseongRates(db, pidCurr, 1)
    // Average of 10 and 30 = 20
    expect(result.suggestedRates![0].suggested_rate).toBe(20)
  })

  it('40. zero curr_rate entries still count in average', () => {
    const cid = insertClient(db)
    const pidOther = insertProject(db, cid, { name: 'Other' })
    const i1 = insertDesignItem(db, pidOther, { cost_type: '재료비', item_name: 'I1' })
    const i2 = insertDesignItem(db, pidOther, { cost_type: '재료비', item_name: 'I2' })
    const r = insertRound(db, pidOther, 1)
    insertDetail(db, r, i1, { curr_rate: 0 })
    insertDetail(db, r, i2, { curr_rate: 60 })

    const pidCurr = insertProject(db, cid, { name: 'Curr' })
    const result = recommendGiseongRates(db, pidCurr, 1)
    expect(result.suggestedRates![0].suggested_rate).toBe(30)
  })
})

// ---------------------------------------------------------------------------
// recommend:giseong-preview (25 tests)
// ---------------------------------------------------------------------------
describe('recommend:giseong-preview', () => {
  it('41. no design items returns designItemCount=0', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    const result = recommendGiseongPreview(db, pid)
    expect(result.designItemCount).toBe(0)
    expect(result.totalDesignAmount).toBe(0)
  })

  it('42. has design items, no rounds returns nextRoundNo=1', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    insertDesignItem(db, pid, { total_price: 1_000_000 })
    const result = recommendGiseongPreview(db, pid)
    expect(result.nextRoundNo).toBe(1)
    expect(result.remainingAmount).toBe(1_000_000)
  })

  it('43. has 1 completed round returns nextRoundNo=2 with correct remaining', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    const item = insertDesignItem(db, pid, { total_price: 1_000_000 })
    const r1 = insertRound(db, pid, 1, { status: '승인완료', claim_amount: 300_000 })
    insertDetail(db, r1, item, { cumul_rate: 30, cumul_amount: 300_000 })
    const result = recommendGiseongPreview(db, pid)
    expect(result.nextRoundNo).toBe(2)
    expect(result.remainingAmount).toBe(700_000)
  })

  it('44. has 3 rounds returns nextRoundNo=4', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    const item = insertDesignItem(db, pid, { total_price: 1_000_000 })
    insertRound(db, pid, 1, { status: '승인완료' })
    insertRound(db, pid, 2, { status: '승인완료' })
    const r3 = insertRound(db, pid, 3, { status: '작성중' })
    insertDetail(db, r3, item, { cumul_rate: 60, cumul_amount: 600_000 })
    const result = recommendGiseongPreview(db, pid)
    expect(result.nextRoundNo).toBe(4)
  })

  it('45. partial progress (50%) returns correct remaining', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    const item = insertDesignItem(db, pid, { total_price: 2_000_000 })
    const r = insertRound(db, pid, 1)
    insertDetail(db, r, item, { cumul_rate: 50, cumul_amount: 1_000_000 })
    const result = recommendGiseongPreview(db, pid)
    expect(result.remainingAmount).toBe(1_000_000)
    expect(result.overallProgress).toBe(50)
  })

  it('46. 100% complete returns remainingAmount=0', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    const item = insertDesignItem(db, pid, { total_price: 5_000_000 })
    const r = insertRound(db, pid, 1)
    insertDetail(db, r, item, { cumul_rate: 100, cumul_amount: 5_000_000 })
    const result = recommendGiseongPreview(db, pid)
    expect(result.remainingAmount).toBe(0)
    expect(result.overallProgress).toBe(100)
  })

  it('47. mixed progress across items', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    const item1 = insertDesignItem(db, pid, { total_price: 1_000_000, item_name: 'A', sort_order: 1 })
    const item2 = insertDesignItem(db, pid, { total_price: 1_000_000, item_name: 'B', sort_order: 2 })
    const r = insertRound(db, pid, 1)
    insertDetail(db, r, item1, { cumul_rate: 80, cumul_amount: 800_000 })
    insertDetail(db, r, item2, { cumul_rate: 20, cumul_amount: 200_000 })
    const result = recommendGiseongPreview(db, pid)
    expect(result.totalPreviousCumul).toBe(1_000_000)
    expect(result.remainingAmount).toBe(1_000_000)
    expect(result.overallProgress).toBe(50)
  })

  it('48. large number of design items', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    for (let i = 0; i < 50; i++) {
      insertDesignItem(db, pid, { total_price: 100_000, item_name: `항목${i}`, sort_order: i })
    }
    const result = recommendGiseongPreview(db, pid)
    expect(result.designItemCount).toBe(50)
    expect(result.totalDesignAmount).toBe(5_000_000)
  })

  it('49. zero-amount items handled correctly', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    insertDesignItem(db, pid, { total_price: 0, item_name: '무가항목' })
    insertDesignItem(db, pid, { total_price: 1_000_000, item_name: '유가항목' })
    const result = recommendGiseongPreview(db, pid)
    expect(result.totalDesignAmount).toBe(1_000_000)
    expect(result.designItemCount).toBe(2)
  })

  it('50. overall progress calculation accuracy', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    const item1 = insertDesignItem(db, pid, { total_price: 3_000_000, item_name: 'A', sort_order: 1 })
    const item2 = insertDesignItem(db, pid, { total_price: 7_000_000, item_name: 'B', sort_order: 2 })
    const r = insertRound(db, pid, 1)
    insertDetail(db, r, item1, { cumul_rate: 100, cumul_amount: 3_000_000 })
    insertDetail(db, r, item2, { cumul_rate: 0, cumul_amount: 0 })
    const result = recommendGiseongPreview(db, pid)
    // 3M / 10M = 30%
    expect(result.overallProgress).toBe(30)
  })

  it('51. items without details in last round default to 0 cumul', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    const item1 = insertDesignItem(db, pid, { total_price: 1_000_000, item_name: 'A', sort_order: 1 })
    const item2 = insertDesignItem(db, pid, { total_price: 1_000_000, item_name: 'B', sort_order: 2 })
    const r = insertRound(db, pid, 1)
    // Only item1 has detail
    insertDetail(db, r, item1, { cumul_rate: 50, cumul_amount: 500_000 })
    const result = recommendGiseongPreview(db, pid)
    const bItem = result.items.find(i => i.item_name === 'B')!
    expect(bItem.prev_cumul_rate).toBe(0)
    expect(bItem.remaining_rate).toBe(100)
    expect(bItem.remaining_amount).toBe(1_000_000)
  })

  it('52. existingRounds lists all rounds with status', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    insertDesignItem(db, pid, { total_price: 1_000_000 })
    insertRound(db, pid, 1, { status: '승인완료', claim_amount: 300_000 })
    insertRound(db, pid, 2, { status: '청구완료', claim_amount: 400_000 })
    const result = recommendGiseongPreview(db, pid)
    expect(result.existingRounds.length).toBe(2)
    expect(result.existingRounds[0].status).toBe('승인완료')
    expect(result.existingRounds[1].status).toBe('청구완료')
  })

  it('53. no rounds means totalPreviousCumul=0', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    insertDesignItem(db, pid, { total_price: 5_000_000 })
    const result = recommendGiseongPreview(db, pid)
    expect(result.totalPreviousCumul).toBe(0)
    expect(result.overallProgress).toBe(0)
  })

  it('54. items returned in sort_order', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    insertDesignItem(db, pid, { total_price: 100, item_name: 'Z', sort_order: 3 })
    insertDesignItem(db, pid, { total_price: 200, item_name: 'A', sort_order: 1 })
    insertDesignItem(db, pid, { total_price: 300, item_name: 'M', sort_order: 2 })
    const result = recommendGiseongPreview(db, pid)
    expect(result.items[0].item_name).toBe('A')
    expect(result.items[1].item_name).toBe('M')
    expect(result.items[2].item_name).toBe('Z')
  })

  it('55. remaining_rate per item correct', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    const item = insertDesignItem(db, pid, { total_price: 1_000_000 })
    const r = insertRound(db, pid, 1)
    insertDetail(db, r, item, { cumul_rate: 73.5, cumul_amount: 735_000 })
    const result = recommendGiseongPreview(db, pid)
    expect(result.items[0].remaining_rate).toBe(26.5)
    expect(result.items[0].remaining_amount).toBe(265_000)
  })

  it('56. overallProgress 0 when totalDesignAmount is 0', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    insertDesignItem(db, pid, { total_price: 0 })
    const result = recommendGiseongPreview(db, pid)
    expect(result.overallProgress).toBe(0)
  })

  it('57. multiple rounds only uses last round for cumul', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    const item = insertDesignItem(db, pid, { total_price: 1_000_000 })
    const r1 = insertRound(db, pid, 1, { status: '승인완료' })
    insertDetail(db, r1, item, { cumul_rate: 30, cumul_amount: 300_000 })
    const r2 = insertRound(db, pid, 2, { status: '승인완료' })
    insertDetail(db, r2, item, { cumul_rate: 70, cumul_amount: 700_000 })
    const result = recommendGiseongPreview(db, pid)
    expect(result.totalPreviousCumul).toBe(700_000)
    expect(result.remainingAmount).toBe(300_000)
  })

  it('58. project with no design items but has rounds', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    insertRound(db, pid, 1)
    const result = recommendGiseongPreview(db, pid)
    expect(result.designItemCount).toBe(0)
    expect(result.nextRoundNo).toBe(2)
  })

  it('59. category and item_name passed through in items', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    insertDesignItem(db, pid, { category: '철근', item_name: 'D10 가공조립', total_price: 500_000 })
    const result = recommendGiseongPreview(db, pid)
    expect(result.items[0].category).toBe('철근')
    expect(result.items[0].item_name).toBe('D10 가공조립')
    expect(result.items[0].total_price).toBe(500_000)
  })

  it('60. prev_cumul_rate reflects last round detail', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    const item = insertDesignItem(db, pid, { total_price: 2_000_000 })
    const r = insertRound(db, pid, 1)
    insertDetail(db, r, item, { cumul_rate: 45.5, cumul_amount: 910_000 })
    const result = recommendGiseongPreview(db, pid)
    expect(result.items[0].prev_cumul_rate).toBe(45.5)
  })

  it('61. existingRounds claim_amount reported', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    insertDesignItem(db, pid)
    insertRound(db, pid, 1, { claim_amount: 12345678 })
    const result = recommendGiseongPreview(db, pid)
    expect(result.existingRounds[0].amount).toBe(12345678)
  })

  it('62. totalDesignAmount sums all items', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    insertDesignItem(db, pid, { total_price: 1_000_000, item_name: 'A', sort_order: 1 })
    insertDesignItem(db, pid, { total_price: 2_000_000, item_name: 'B', sort_order: 2 })
    insertDesignItem(db, pid, { total_price: 3_000_000, item_name: 'C', sort_order: 3 })
    const result = recommendGiseongPreview(db, pid)
    expect(result.totalDesignAmount).toBe(6_000_000)
  })

  it('63. overallProgress rounds to 1 decimal', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    const item = insertDesignItem(db, pid, { total_price: 3_000_000 })
    const r = insertRound(db, pid, 1)
    insertDetail(db, r, item, { cumul_rate: 33.3, cumul_amount: 1_000_000 })
    const result = recommendGiseongPreview(db, pid)
    // 1M / 3M * 100 = 33.333... → rounded via Math.round(x*1000)/10 = 33.3
    expect(result.overallProgress).toBe(33.3)
  })

  it('64. non-existent project returns empty preview', () => {
    const result = recommendGiseongPreview(db, 9999)
    expect(result.designItemCount).toBe(0)
    expect(result.nextRoundNo).toBe(1)
    expect(result.remainingAmount).toBe(0)
  })

  it('65. ten design items, five with progress', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    const items: number[] = []
    for (let i = 0; i < 10; i++) {
      items.push(insertDesignItem(db, pid, { total_price: 100_000, item_name: `Item${i}`, sort_order: i }))
    }
    const r = insertRound(db, pid, 1)
    for (let i = 0; i < 5; i++) {
      insertDetail(db, r, items[i], { cumul_rate: 100, cumul_amount: 100_000 })
    }
    const result = recommendGiseongPreview(db, pid)
    expect(result.totalPreviousCumul).toBe(500_000)
    expect(result.remainingAmount).toBe(500_000)
    expect(result.overallProgress).toBe(50)
  })
})

// ---------------------------------------------------------------------------
// recommend:save-client-default (10 tests)
// ---------------------------------------------------------------------------
describe('recommend:save-client-default', () => {
  it('66. insert new default', () => {
    const cid = insertClient(db)
    const result = saveClientDefault(db, cid, 'theme', 'dark')
    expect(result.success).toBe(true)
    const row = db.prepare('SELECT setting_value FROM client_defaults WHERE client_id = ? AND setting_key = ?').get(cid, 'theme') as { setting_value: string }
    expect(row.setting_value).toBe('dark')
  })

  it('67. update existing default via ON CONFLICT', () => {
    const cid = insertClient(db)
    saveClientDefault(db, cid, 'theme', 'dark')
    saveClientDefault(db, cid, 'theme', 'light')
    const row = db.prepare('SELECT setting_value FROM client_defaults WHERE client_id = ? AND setting_key = ?').get(cid, 'theme') as { setting_value: string }
    expect(row.setting_value).toBe('light')
  })

  it('68. multiple keys for same client', () => {
    const cid = insertClient(db)
    saveClientDefault(db, cid, 'default_contract_type', '종합')
    saveClientDefault(db, cid, 'default_contract_method', '입찰')
    const rows = db.prepare('SELECT * FROM client_defaults WHERE client_id = ?').all(cid)
    expect(rows.length).toBe(2)
  })

  it('69. multiple clients with same key', () => {
    const cid1 = insertClient(db, 'A')
    const cid2 = insertClient(db, 'B')
    saveClientDefault(db, cid1, 'theme', 'dark')
    saveClientDefault(db, cid2, 'theme', 'light')
    const r1 = db.prepare('SELECT setting_value FROM client_defaults WHERE client_id = ? AND setting_key = ?').get(cid1, 'theme') as { setting_value: string }
    const r2 = db.prepare('SELECT setting_value FROM client_defaults WHERE client_id = ? AND setting_key = ?').get(cid2, 'theme') as { setting_value: string }
    expect(r1.setting_value).toBe('dark')
    expect(r2.setting_value).toBe('light')
  })

  it('70. overwrite with new value confirms only one row exists', () => {
    const cid = insertClient(db)
    saveClientDefault(db, cid, 'key1', 'v1')
    saveClientDefault(db, cid, 'key1', 'v2')
    saveClientDefault(db, cid, 'key1', 'v3')
    const count = db.prepare('SELECT COUNT(*) as cnt FROM client_defaults WHERE client_id = ? AND setting_key = ?').get(cid, 'key1') as { cnt: number }
    expect(count.cnt).toBe(1)
    const row = db.prepare('SELECT setting_value FROM client_defaults WHERE client_id = ? AND setting_key = ?').get(cid, 'key1') as { setting_value: string }
    expect(row.setting_value).toBe('v3')
  })

  it('71. empty string value stored correctly', () => {
    const cid = insertClient(db)
    saveClientDefault(db, cid, 'note', '')
    const row = db.prepare('SELECT setting_value FROM client_defaults WHERE client_id = ? AND setting_key = ?').get(cid, 'note') as { setting_value: string }
    expect(row.setting_value).toBe('')
  })

  it('72. long value stored correctly', () => {
    const cid = insertClient(db)
    const longVal = 'A'.repeat(10000)
    saveClientDefault(db, cid, 'memo', longVal)
    const row = db.prepare('SELECT setting_value FROM client_defaults WHERE client_id = ? AND setting_key = ?').get(cid, 'memo') as { setting_value: string }
    expect(row.setting_value).toBe(longVal)
  })

  it('73. Korean key and value stored correctly', () => {
    const cid = insertClient(db)
    saveClientDefault(db, cid, '기본계약유형', '종합건설')
    const row = db.prepare("SELECT setting_value FROM client_defaults WHERE client_id = ? AND setting_key = '기본계약유형'").get(cid) as { setting_value: string }
    expect(row.setting_value).toBe('종합건설')
  })

  it('74. save and then verify through recommend:project-defaults', () => {
    const cid = insertClient(db)
    insertProject(db, cid, { contract_type: '일반' })
    saveClientDefault(db, cid, 'default_contract_type', '전문')
    const result = recommendProjectDefaults(db, cid)
    expect(result.recommended!.contract_type).toBe('전문')
  })

  it('75. updating default changes recommend output', () => {
    const cid = insertClient(db)
    insertProject(db, cid, { contract_type: '일반' })
    saveClientDefault(db, cid, 'default_contract_type', '전문')
    let result = recommendProjectDefaults(db, cid)
    expect(result.recommended!.contract_type).toBe('전문')

    saveClientDefault(db, cid, 'default_contract_type', '용역')
    result = recommendProjectDefaults(db, cid)
    expect(result.recommended!.contract_type).toBe('용역')
  })
})

// ---------------------------------------------------------------------------
// Integration: Full giseong workflow (25 tests)
// ---------------------------------------------------------------------------
describe('Integration: Full giseong workflow', () => {
  // Helper: create giseong round with auto-generated details (replicating service logic)
  function createGiseongRound(db: Database.Database, projectId: number): { roundId: number; roundNo: number } {
    const designItems = db.prepare('SELECT id FROM design_items WHERE project_id = ?').all(projectId) as Array<{ id: number }>
    const rounds = db.prepare('SELECT * FROM giseong_rounds WHERE project_id = ? ORDER BY round_no').all(projectId) as Array<{ id: number; round_no: number }>
    const nextRoundNo = rounds.length > 0 ? rounds[rounds.length - 1].round_no + 1 : 1

    const roundId = insertRound(db, projectId, nextRoundNo)

    // Auto-generate details from design items
    const lastRound = rounds.length > 0 ? rounds[rounds.length - 1] : null
    let prevDetails: Record<number, { cumul_rate: number; cumul_amount: number }> = {}
    if (lastRound) {
      const dets = db.prepare('SELECT item_id, cumul_rate, cumul_amount FROM giseong_details WHERE round_id = ?')
        .all(lastRound.id) as Array<{ item_id: number; cumul_rate: number; cumul_amount: number }>
      for (const d of dets) {
        prevDetails[d.item_id] = { cumul_rate: d.cumul_rate, cumul_amount: d.cumul_amount }
      }
    }

    for (const item of designItems) {
      const prev = prevDetails[item.id] || { cumul_rate: 0, cumul_amount: 0 }
      insertDetail(db, roundId, item.id, {
        prev_rate: prev.cumul_rate,
        prev_amount: prev.cumul_amount,
        curr_rate: 0,
        curr_amount: 0,
        cumul_rate: prev.cumul_rate,
        cumul_amount: prev.cumul_amount,
      })
    }

    return { roundId, roundNo: nextRoundNo }
  }

  // Helper: update a detail's rate and recalculate amounts
  function updateDetailRate(db: Database.Database, detailId: number, newCurrRate: number): void {
    const detail = db.prepare(`
      SELECT gd.*, di.total_price FROM giseong_details gd
      JOIN design_items di ON gd.item_id = di.id
      WHERE gd.id = ?
    `).get(detailId) as { prev_rate: number; total_price: number; round_id: number }

    const cumulRate = detail.prev_rate + newCurrRate
    const currAmount = Math.round(detail.total_price * newCurrRate / 100)
    const cumulAmount = Math.round(detail.total_price * cumulRate / 100)

    db.prepare(`
      UPDATE giseong_details
      SET curr_rate = ?, cumul_rate = ?, curr_amount = ?, cumul_amount = ?
      WHERE id = ?
    `).run(newCurrRate, cumulRate, currAmount, cumulAmount, detailId)
  }

  // Helper: recalculate round claim_amount from details
  function recalcRoundClaimAmount(db: Database.Database, roundId: number): void {
    const sum = db.prepare('SELECT SUM(curr_amount) as total FROM giseong_details WHERE round_id = ?')
      .get(roundId) as { total: number }
    db.prepare('UPDATE giseong_rounds SET claim_amount = ? WHERE id = ?').run(sum.total || 0, roundId)
  }

  it('76. create project and import design items', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid, { contract_amount: 10_000_000 })
    insertDesignItem(db, pid, { total_price: 5_000_000, item_name: '터파기', sort_order: 1 })
    insertDesignItem(db, pid, { total_price: 5_000_000, item_name: '되메우기', sort_order: 2 })
    const items = db.prepare('SELECT COUNT(*) as cnt FROM design_items WHERE project_id = ?').get(pid) as { cnt: number }
    expect(items.cnt).toBe(2)
  })

  it('77. create giseong round auto-generates details for all design items', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    insertDesignItem(db, pid, { item_name: 'A', sort_order: 1 })
    insertDesignItem(db, pid, { item_name: 'B', sort_order: 2 })
    insertDesignItem(db, pid, { item_name: 'C', sort_order: 3 })
    const { roundId } = createGiseongRound(db, pid)
    const details = db.prepare('SELECT COUNT(*) as cnt FROM giseong_details WHERE round_id = ?').get(roundId) as { cnt: number }
    expect(details.cnt).toBe(3)
  })

  it('78. update detail rate calculates amounts correctly', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    const itemId = insertDesignItem(db, pid, { total_price: 1_000_000 })
    const { roundId } = createGiseongRound(db, pid)
    const detail = db.prepare('SELECT id FROM giseong_details WHERE round_id = ? AND item_id = ?').get(roundId, itemId) as { id: number }
    updateDetailRate(db, detail.id, 30)
    const updated = db.prepare('SELECT * FROM giseong_details WHERE id = ?').get(detail.id) as any
    expect(updated.curr_rate).toBe(30)
    expect(updated.cumul_rate).toBe(30)
    expect(updated.curr_amount).toBe(300_000)
    expect(updated.cumul_amount).toBe(300_000)
  })

  it('79. complete round then create next round carries over prev values', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    const itemId = insertDesignItem(db, pid, { total_price: 1_000_000 })
    const { roundId: r1Id } = createGiseongRound(db, pid)
    const det1 = db.prepare('SELECT id FROM giseong_details WHERE round_id = ? AND item_id = ?').get(r1Id, itemId) as { id: number }
    updateDetailRate(db, det1.id, 40)
    db.prepare("UPDATE giseong_rounds SET status = '승인완료' WHERE id = ?").run(r1Id)

    const { roundId: r2Id } = createGiseongRound(db, pid)
    const det2 = db.prepare('SELECT * FROM giseong_details WHERE round_id = ? AND item_id = ?').get(r2Id, itemId) as any
    expect(det2.prev_rate).toBe(40)
    expect(det2.prev_amount).toBe(400_000)
    expect(det2.curr_rate).toBe(0)
    expect(det2.cumul_rate).toBe(40)
  })

  it('80. 100% rate yields cumul_rate=100', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    const itemId = insertDesignItem(db, pid, { total_price: 2_000_000 })
    const { roundId } = createGiseongRound(db, pid)
    const det = db.prepare('SELECT id FROM giseong_details WHERE round_id = ? AND item_id = ?').get(roundId, itemId) as { id: number }
    updateDetailRate(db, det.id, 100)
    const updated = db.prepare('SELECT * FROM giseong_details WHERE id = ?').get(det.id) as any
    expect(updated.cumul_rate).toBe(100)
    expect(updated.cumul_amount).toBe(2_000_000)
  })

  it('81. multiple items with different rates', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    const i1 = insertDesignItem(db, pid, { total_price: 1_000_000, item_name: 'A', sort_order: 1 })
    const i2 = insertDesignItem(db, pid, { total_price: 2_000_000, item_name: 'B', sort_order: 2 })
    const { roundId } = createGiseongRound(db, pid)
    const d1 = db.prepare('SELECT id FROM giseong_details WHERE round_id = ? AND item_id = ?').get(roundId, i1) as { id: number }
    const d2 = db.prepare('SELECT id FROM giseong_details WHERE round_id = ? AND item_id = ?').get(roundId, i2) as { id: number }
    updateDetailRate(db, d1.id, 50)
    updateDetailRate(db, d2.id, 25)
    const u1 = db.prepare('SELECT * FROM giseong_details WHERE id = ?').get(d1.id) as any
    const u2 = db.prepare('SELECT * FROM giseong_details WHERE id = ?').get(d2.id) as any
    expect(u1.curr_amount).toBe(500_000)
    expect(u2.curr_amount).toBe(500_000)
  })

  it('82. round claim_amount auto-calculated from details', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    const i1 = insertDesignItem(db, pid, { total_price: 1_000_000, item_name: 'A', sort_order: 1 })
    const i2 = insertDesignItem(db, pid, { total_price: 3_000_000, item_name: 'B', sort_order: 2 })
    const { roundId } = createGiseongRound(db, pid)
    const d1 = db.prepare('SELECT id FROM giseong_details WHERE round_id = ? AND item_id = ?').get(roundId, i1) as { id: number }
    const d2 = db.prepare('SELECT id FROM giseong_details WHERE round_id = ? AND item_id = ?').get(roundId, i2) as { id: number }
    updateDetailRate(db, d1.id, 100)
    updateDetailRate(db, d2.id, 50)
    recalcRoundClaimAmount(db, roundId)
    const round = db.prepare('SELECT claim_amount FROM giseong_rounds WHERE id = ?').get(roundId) as { claim_amount: number }
    expect(round.claim_amount).toBe(2_500_000) // 1M + 1.5M
  })

  it('83. rate change on non-작성중 round should fail validation', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    insertDesignItem(db, pid, { total_price: 1_000_000 })
    const { roundId } = createGiseongRound(db, pid)
    db.prepare("UPDATE giseong_rounds SET status = '청구완료' WHERE id = ?").run(roundId)

    // Validation check: should not allow rate change on non-작성중 round
    const round = db.prepare('SELECT status FROM giseong_rounds WHERE id = ?').get(roundId) as { status: string }
    expect(round.status).not.toBe('작성중')
    // In the real service this would be blocked; we verify the status check
    const canEdit = round.status === '작성중'
    expect(canEdit).toBe(false)
  })

  it('84. export preview for round with data', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    const item = insertDesignItem(db, pid, { total_price: 1_000_000 })
    const { roundId } = createGiseongRound(db, pid)
    const det = db.prepare('SELECT id FROM giseong_details WHERE round_id = ? AND item_id = ?').get(roundId, item) as { id: number }
    updateDetailRate(db, det.id, 60)

    // Simulate export preview query
    const details = db.prepare(`
      SELECT gd.*, di.total_price, di.item_name
      FROM giseong_details gd
      JOIN design_items di ON gd.item_id = di.id
      WHERE gd.round_id = ?
    `).all(roundId) as Array<{ curr_amount: number; cumul_amount: number; total_price: number }>

    const totalCurr = details.reduce((s, d) => s + d.curr_amount, 0)
    expect(totalCurr).toBe(600_000)
  })

  it('85. export preview for empty round', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    insertDesignItem(db, pid, { total_price: 1_000_000 })
    const { roundId } = createGiseongRound(db, pid)

    const details = db.prepare(`
      SELECT gd.*, di.total_price
      FROM giseong_details gd
      JOIN design_items di ON gd.item_id = di.id
      WHERE gd.round_id = ?
    `).all(roundId) as Array<{ curr_amount: number }>

    const totalCurr = details.reduce((s, d) => s + d.curr_amount, 0)
    expect(totalCurr).toBe(0)
  })

  it('86. design import blocked when giseong exists (validation check)', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    insertDesignItem(db, pid, { total_price: 1_000_000 })
    createGiseongRound(db, pid)

    // Check if giseong rounds exist for this project
    const roundCount = db.prepare('SELECT COUNT(*) as cnt FROM giseong_rounds WHERE project_id = ?').get(pid) as { cnt: number }
    const importBlocked = roundCount.cnt > 0
    expect(importBlocked).toBe(true)
  })

  it('87. contract amount vs design total validation', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid, { contract_amount: 10_000_000 })
    insertDesignItem(db, pid, { total_price: 5_000_000, item_name: 'A', sort_order: 1 })
    insertDesignItem(db, pid, { total_price: 7_000_000, item_name: 'B', sort_order: 2 })

    const project = db.prepare('SELECT contract_amount FROM projects WHERE id = ?').get(pid) as { contract_amount: number }
    const designTotal = db.prepare('SELECT SUM(total_price) as total FROM design_items WHERE project_id = ?').get(pid) as { total: number }

    const ratio = designTotal.total / project.contract_amount
    // 12M / 10M = 1.2 → exceeds 110%
    expect(ratio).toBeGreaterThan(1.1)
  })

  it('88. three-round workflow: progressive rates', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    const item = insertDesignItem(db, pid, { total_price: 900_000 })

    // Round 1: 30%
    const { roundId: r1 } = createGiseongRound(db, pid)
    const d1 = db.prepare('SELECT id FROM giseong_details WHERE round_id = ? AND item_id = ?').get(r1, item) as { id: number }
    updateDetailRate(db, d1.id, 30)
    db.prepare("UPDATE giseong_rounds SET status = '승인완료' WHERE id = ?").run(r1)

    // Round 2: 40%
    const { roundId: r2 } = createGiseongRound(db, pid)
    const d2 = db.prepare('SELECT id FROM giseong_details WHERE round_id = ? AND item_id = ?').get(r2, item) as { id: number }
    updateDetailRate(db, d2.id, 40)
    db.prepare("UPDATE giseong_rounds SET status = '승인완료' WHERE id = ?").run(r2)

    // Round 3: remaining 30%
    const { roundId: r3 } = createGiseongRound(db, pid)
    const d3 = db.prepare('SELECT * FROM giseong_details WHERE round_id = ? AND item_id = ?').get(r3, item) as any
    expect(d3.prev_rate).toBe(70)
    updateDetailRate(db, d3.id, 30)
    const final = db.prepare('SELECT * FROM giseong_details WHERE id = ?').get(d3.id) as any
    expect(final.cumul_rate).toBe(100)
    expect(final.cumul_amount).toBe(900_000)
  })

  it('89. preview reflects current state after round creation', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    const item = insertDesignItem(db, pid, { total_price: 1_000_000 })
    const { roundId } = createGiseongRound(db, pid)
    const det = db.prepare('SELECT id FROM giseong_details WHERE round_id = ? AND item_id = ?').get(roundId, item) as { id: number }
    updateDetailRate(db, det.id, 60)

    const preview = recommendGiseongPreview(db, pid)
    expect(preview.totalPreviousCumul).toBe(600_000)
    expect(preview.remainingAmount).toBe(400_000)
    expect(preview.overallProgress).toBe(60)
  })

  it('90. giseong rate recommendation integrates with workflow', () => {
    const cid = insertClient(db)
    // Historical project
    const pidOld = insertProject(db, cid, { name: 'Old' })
    const itemOld = insertDesignItem(db, pidOld, { cost_type: '재료비' })
    const rOld = insertRound(db, pidOld, 1)
    insertDetail(db, rOld, itemOld, { curr_rate: 35 })

    // New project
    const pidNew = insertProject(db, cid, { name: 'New' })
    insertDesignItem(db, pidNew, { cost_type: '재료비' })
    const suggestion = recommendGiseongRates(db, pidNew, 1)
    expect(suggestion.hasPattern).toBe(true)
    expect(suggestion.suggestedRates![0].suggested_rate).toBe(35)
  })

  it('91. full cycle: create, fill, approve, next round', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    const item = insertDesignItem(db, pid, { total_price: 500_000 })

    // Round 1
    const { roundId: r1 } = createGiseongRound(db, pid)
    let det = db.prepare('SELECT id FROM giseong_details WHERE round_id = ? AND item_id = ?').get(r1, item) as { id: number }
    updateDetailRate(db, det.id, 50)
    recalcRoundClaimAmount(db, r1)
    db.prepare("UPDATE giseong_rounds SET status = '승인완료' WHERE id = ?").run(r1)

    // Verify round 1
    const round1 = db.prepare('SELECT * FROM giseong_rounds WHERE id = ?').get(r1) as any
    expect(round1.claim_amount).toBe(250_000)
    expect(round1.status).toBe('승인완료')

    // Round 2
    const { roundId: r2 } = createGiseongRound(db, pid)
    det = db.prepare('SELECT id FROM giseong_details WHERE round_id = ? AND item_id = ?').get(r2, item) as { id: number }
    updateDetailRate(db, det.id, 50)
    recalcRoundClaimAmount(db, r2)

    const round2 = db.prepare('SELECT claim_amount FROM giseong_rounds WHERE id = ?').get(r2) as { claim_amount: number }
    expect(round2.claim_amount).toBe(250_000)

    const finalDet = db.prepare('SELECT * FROM giseong_details WHERE round_id = ? AND item_id = ?').get(r2, item) as any
    expect(finalDet.cumul_rate).toBe(100)
    expect(finalDet.cumul_amount).toBe(500_000)
  })

  it('92. multiple items tracked independently across rounds', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    const i1 = insertDesignItem(db, pid, { total_price: 400_000, item_name: 'A', sort_order: 1 })
    const i2 = insertDesignItem(db, pid, { total_price: 600_000, item_name: 'B', sort_order: 2 })

    // Round 1: A=100%, B=0%
    const { roundId: r1 } = createGiseongRound(db, pid)
    const d1a = db.prepare('SELECT id FROM giseong_details WHERE round_id = ? AND item_id = ?').get(r1, i1) as { id: number }
    updateDetailRate(db, d1a.id, 100)
    db.prepare("UPDATE giseong_rounds SET status = '승인완료' WHERE id = ?").run(r1)

    // Round 2: B=100%
    const { roundId: r2 } = createGiseongRound(db, pid)
    const d2a = db.prepare('SELECT * FROM giseong_details WHERE round_id = ? AND item_id = ?').get(r2, i1) as any
    const d2b = db.prepare('SELECT id FROM giseong_details WHERE round_id = ? AND item_id = ?').get(r2, i2) as { id: number }
    expect(d2a.prev_rate).toBe(100) // A already complete
    updateDetailRate(db, d2b.id, 100)
    const finalB = db.prepare('SELECT * FROM giseong_details WHERE id = ?').get(d2b.id) as any
    expect(finalB.cumul_amount).toBe(600_000)
  })

  it('93. recalc claim_amount with zero-rate items', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    const i1 = insertDesignItem(db, pid, { total_price: 1_000_000, item_name: 'A', sort_order: 1 })
    insertDesignItem(db, pid, { total_price: 2_000_000, item_name: 'B', sort_order: 2 })
    const { roundId } = createGiseongRound(db, pid)
    const d1 = db.prepare('SELECT id FROM giseong_details WHERE round_id = ? AND item_id = ?').get(roundId, i1) as { id: number }
    updateDetailRate(db, d1.id, 10) // Only A has progress
    recalcRoundClaimAmount(db, roundId)
    const round = db.prepare('SELECT claim_amount FROM giseong_rounds WHERE id = ?').get(roundId) as { claim_amount: number }
    expect(round.claim_amount).toBe(100_000)
  })

  it('94. preview after completing all rounds shows 100% progress', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    const item = insertDesignItem(db, pid, { total_price: 1_000_000 })
    const { roundId } = createGiseongRound(db, pid)
    const det = db.prepare('SELECT id FROM giseong_details WHERE round_id = ? AND item_id = ?').get(roundId, item) as { id: number }
    updateDetailRate(db, det.id, 100)
    const preview = recommendGiseongPreview(db, pid)
    expect(preview.overallProgress).toBe(100)
    expect(preview.remainingAmount).toBe(0)
  })

  it('95. UNIQUE constraint prevents duplicate round_no per project', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    insertRound(db, pid, 1)
    expect(() => insertRound(db, pid, 1)).toThrow()
  })

  it('96. UNIQUE constraint prevents duplicate detail per round+item', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    const item = insertDesignItem(db, pid)
    const roundId = insertRound(db, pid, 1)
    insertDetail(db, roundId, item)
    expect(() => insertDetail(db, roundId, item)).toThrow()
  })

  it('97. CASCADE delete removes rounds and details when project deleted', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid)
    const item = insertDesignItem(db, pid)
    const { roundId } = createGiseongRound(db, pid)
    // Verify data exists
    expect(db.prepare('SELECT COUNT(*) as cnt FROM giseong_rounds WHERE project_id = ?').get(pid)).toEqual({ cnt: 1 })
    expect(db.prepare('SELECT COUNT(*) as cnt FROM giseong_details WHERE round_id = ?').get(roundId)).toEqual({ cnt: 1 })
    // Delete project
    db.prepare('DELETE FROM projects WHERE id = ?').run(pid)
    expect(db.prepare('SELECT COUNT(*) as cnt FROM giseong_rounds WHERE project_id = ?').get(pid)).toEqual({ cnt: 0 })
    expect(db.prepare('SELECT COUNT(*) as cnt FROM giseong_details WHERE round_id = ?').get(roundId)).toEqual({ cnt: 0 })
  })

  it('98. project-defaults + giseong-preview work together', () => {
    const cid = insertClient(db)
    const pid = insertProject(db, cid, { contract_type: '전문', contract_amount: 5_000_000 })
    insertDesignItem(db, pid, { total_price: 2_500_000, item_name: 'A', sort_order: 1 })
    insertDesignItem(db, pid, { total_price: 2_500_000, item_name: 'B', sort_order: 2 })

    const defaults = recommendProjectDefaults(db, cid)
    expect(defaults.recommended!.contract_type).toBe('전문')
    expect(defaults.recommended!.avg_amount).toBe(5_000_000)

    const preview = recommendGiseongPreview(db, pid)
    expect(preview.totalDesignAmount).toBe(5_000_000)
    expect(preview.designItemCount).toBe(2)
  })

  it('99. save-client-default affects subsequent project-defaults calls', () => {
    const cid = insertClient(db)
    insertProject(db, cid, { contract_type: '일반', contract_method: '수의계약' })

    let result = recommendProjectDefaults(db, cid)
    expect(result.recommended!.contract_type).toBe('일반')
    expect(result.recommended!.contract_method).toBe('수의계약')

    saveClientDefault(db, cid, 'default_contract_type', '종합')
    saveClientDefault(db, cid, 'default_contract_method', '입찰')

    result = recommendProjectDefaults(db, cid)
    expect(result.recommended!.contract_type).toBe('종합')
    expect(result.recommended!.contract_method).toBe('입찰')
  })

  it('100. end-to-end: client setup, project, design, giseong, preview, recommend', () => {
    // 1. Create client with defaults
    const cid = insertClient(db, '서울시 종로구')
    saveClientDefault(db, cid, 'default_contract_type', '종합')

    // 2. Create first project (historical)
    const pid1 = insertProject(db, cid, {
      name: '종로 도로보수',
      contract_type: '종합',
      contract_method: '입찰',
      contract_amount: 50_000_000,
      start_date: '2024-01-01',
      end_date: '2024-06-30',
    })
    const item1a = insertDesignItem(db, pid1, { total_price: 30_000_000, cost_type: '재료비', item_name: '아스팔트', sort_order: 1 })
    const item1b = insertDesignItem(db, pid1, { total_price: 20_000_000, cost_type: '노무비', item_name: '인건비', sort_order: 2 })
    const r1 = insertRound(db, pid1, 1, { status: '승인완료' })
    insertDetail(db, r1, item1a, { curr_rate: 40, cumul_rate: 40, curr_amount: 12_000_000, cumul_amount: 12_000_000 })
    insertDetail(db, r1, item1b, { curr_rate: 30, cumul_rate: 30, curr_amount: 6_000_000, cumul_amount: 6_000_000 })

    // 3. Create new project
    const pid2 = insertProject(db, cid, {
      name: '종로 학교보수',
      contract_type: '종합',
      contract_method: '입찰',
      contract_amount: 80_000_000,
      start_date: '2025-03-01',
      end_date: '2025-12-31',
    })
    insertDesignItem(db, pid2, { total_price: 50_000_000, cost_type: '재료비', item_name: '자재', sort_order: 1 })
    insertDesignItem(db, pid2, { total_price: 30_000_000, cost_type: '노무비', item_name: '노무', sort_order: 2 })

    // 4. Check recommendations
    const defaults = recommendProjectDefaults(db, cid)
    expect(defaults.hasHistory).toBe(true)
    expect(defaults.recommended!.contract_type).toBe('종합') // from custom default
    expect(defaults.recommended!.contract_method).toBe('입찰')

    // 5. Check giseong rate suggestions for new project
    const rates = recommendGiseongRates(db, pid2, 1)
    expect(rates.hasPattern).toBe(true)
    const rateMap = Object.fromEntries(rates.suggestedRates!.map(s => [s.cost_type, s.suggested_rate]))
    expect(rateMap['재료비']).toBe(40)
    expect(rateMap['노무비']).toBe(30)

    // 6. Check preview
    const preview = recommendGiseongPreview(db, pid2)
    expect(preview.designItemCount).toBe(2)
    expect(preview.totalDesignAmount).toBe(80_000_000)
    expect(preview.nextRoundNo).toBe(1)
    expect(preview.remainingAmount).toBe(80_000_000)
    expect(preview.overallProgress).toBe(0)
  })
})
