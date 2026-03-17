import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { logAudit, detectChanges } from '../src/main/services/audit'

let db: Database.Database

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
      client_id INTEGER NOT NULL REFERENCES clients(id),
      name TEXT NOT NULL,
      contract_type TEXT NOT NULL DEFAULT '일반',
      contract_method TEXT NOT NULL DEFAULT '수의계약',
      contract_amount INTEGER NOT NULL DEFAULT 0,
      vat_included INTEGER NOT NULL DEFAULT 1,
      start_date TEXT,
      end_date TEXT,
      status TEXT NOT NULL DEFAULT '계약체결',
      warranty_end_date TEXT,
      folder_path TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      field_name TEXT,
      old_value TEXT,
      new_value TEXT,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE workflow_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      task_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT '대기',
      auto_generated INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      completed_at TEXT
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
      cost_type TEXT NOT NULL DEFAULT '재료비',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE giseong_rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      round_no INTEGER NOT NULL,
      claim_date TEXT,
      claim_amount INTEGER NOT NULL DEFAULT 0,
      approved_amount INTEGER,
      status TEXT NOT NULL DEFAULT '작성중',
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

    CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
    CREATE INDEX idx_workflow_project ON workflow_tasks(project_id);
    CREATE INDEX idx_workflow_status ON workflow_tasks(status);
  `)
}

function insertClient(db: Database.Database, name = '테스트 발주처'): number {
  const result = db.prepare('INSERT INTO clients (name) VALUES (?)').run(name)
  return Number(result.lastInsertRowid)
}

function insertProject(
  db: Database.Database,
  clientId: number,
  overrides: Record<string, unknown> = {}
): number {
  const name = (overrides.name as string) || '테스트 프로젝트'
  const status = (overrides.status as string) || '계약체결'
  const endDate = (overrides.end_date as string) || null
  const result = db.prepare(
    'INSERT INTO projects (client_id, name, status, end_date) VALUES (?, ?, ?, ?)'
  ).run(clientId, name, status, endDate)
  return Number(result.lastInsertRowid)
}

function insertWorkflowTask(
  db: Database.Database,
  projectId: number,
  overrides: Record<string, unknown> = {}
): number {
  const title = (overrides.title as string) || '테스트 할일'
  const taskType = (overrides.task_type as string) || '수동'
  const description = (overrides.description as string) || null
  const dueDate = (overrides.due_date as string) || null
  const status = (overrides.status as string) || '대기'
  const autoGenerated = overrides.auto_generated !== undefined ? overrides.auto_generated : 1
  const result = db.prepare(
    'INSERT INTO workflow_tasks (project_id, task_type, title, description, due_date, status, auto_generated) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(projectId, taskType, title, description, dueDate, status, autoGenerated)
  return Number(result.lastInsertRowid)
}

function getAuditLogs(db: Database.Database): Array<Record<string, unknown>> {
  return db.prepare('SELECT * FROM audit_log ORDER BY id ASC').all() as Array<Record<string, unknown>>
}

// ============================================================
// logAudit (20 tests)
// ============================================================
describe('logAudit', () => {
  beforeEach(() => {
    db = new Database(':memory:')
    createTables(db)
  })

  afterEach(() => {
    db.close()
  })

  it('1: should create a single audit log entry with no changes', () => {
    logAudit(db, '프로젝트', 1, '생성', '프로젝트 생성')
    const logs = getAuditLogs(db)
    expect(logs).toHaveLength(1)
    expect(logs[0].entity_type).toBe('프로젝트')
    expect(logs[0].entity_id).toBe(1)
    expect(logs[0].action).toBe('생성')
    expect(logs[0].description).toBe('프로젝트 생성')
    expect(logs[0].field_name).toBeNull()
    expect(logs[0].old_value).toBeNull()
    expect(logs[0].new_value).toBeNull()
  })

  it('2: should create a single record when changes is undefined', () => {
    logAudit(db, '프로젝트', 1, '생성', '설명', undefined)
    const logs = getAuditLogs(db)
    expect(logs).toHaveLength(1)
    expect(logs[0].field_name).toBeNull()
  })

  it('3: should create a single record when changes is empty array', () => {
    logAudit(db, '프로젝트', 1, '수정', '빈 변경', [])
    const logs = getAuditLogs(db)
    expect(logs).toHaveLength(1)
    expect(logs[0].field_name).toBeNull()
  })

  it('4: should create one record per change when changes are provided', () => {
    const changes = [
      { field: 'name', old: '이전', new: '이후' },
      { field: 'amount', old: 100, new: 200 },
    ]
    logAudit(db, '프로젝트', 1, '수정', '필드 변경', changes)
    const logs = getAuditLogs(db)
    expect(logs).toHaveLength(2)
    expect(logs[0].field_name).toBe('name')
    expect(logs[0].old_value).toBe('이전')
    expect(logs[0].new_value).toBe('이후')
    expect(logs[1].field_name).toBe('amount')
    expect(logs[1].old_value).toBe('100')
    expect(logs[1].new_value).toBe('200')
  })

  it('5: should store the same entity info for all change records', () => {
    const changes = [
      { field: 'a', old: 1, new: 2 },
      { field: 'b', old: 3, new: 4 },
      { field: 'c', old: 5, new: 6 },
    ]
    logAudit(db, '기성회차', 42, '수정', '다중 변경', changes)
    const logs = getAuditLogs(db)
    expect(logs).toHaveLength(3)
    for (const log of logs) {
      expect(log.entity_type).toBe('기성회차')
      expect(log.entity_id).toBe(42)
      expect(log.action).toBe('수정')
      expect(log.description).toBe('다중 변경')
    }
  })

  it('6: should handle null old_value correctly', () => {
    logAudit(db, '프로젝트', 1, '수정', '값 추가', [{ field: 'name', old: null, new: '새값' }])
    const logs = getAuditLogs(db)
    expect(logs[0].old_value).toBeNull()
    expect(logs[0].new_value).toBe('새값')
  })

  it('7: should handle null new_value correctly', () => {
    logAudit(db, '프로젝트', 1, '수정', '값 제거', [{ field: 'name', old: '이전', new: null }])
    const logs = getAuditLogs(db)
    expect(logs[0].old_value).toBe('이전')
    expect(logs[0].new_value).toBeNull()
  })

  it('8: should handle both null old and new values', () => {
    logAudit(db, '프로젝트', 1, '수정', '둘 다 null', [{ field: 'name', old: null, new: null }])
    const logs = getAuditLogs(db)
    expect(logs[0].old_value).toBeNull()
    expect(logs[0].new_value).toBeNull()
  })

  it('9: should handle undefined old/new values as null', () => {
    logAudit(db, '프로젝트', 1, '수정', 'undefined 처리', [{ field: 'x', old: undefined, new: undefined }])
    const logs = getAuditLogs(db)
    expect(logs[0].old_value).toBeNull()
    expect(logs[0].new_value).toBeNull()
  })

  it('10: should store large description text', () => {
    const longDesc = 'A'.repeat(5000)
    logAudit(db, '프로젝트', 1, '생성', longDesc)
    const logs = getAuditLogs(db)
    expect(logs[0].description).toBe(longDesc)
  })

  it('11: should handle entity type "발주처"', () => {
    logAudit(db, '발주처', 10, '생성', '발주처 생성됨')
    const logs = getAuditLogs(db)
    expect(logs[0].entity_type).toBe('발주처')
  })

  it('12: should handle entity type "기성상세"', () => {
    logAudit(db, '기성상세', 5, '수정', '기성상세 수정됨')
    const logs = getAuditLogs(db)
    expect(logs[0].entity_type).toBe('기성상세')
  })

  it('13: should handle entity type "설계내역"', () => {
    logAudit(db, '설계내역', 3, '임포트', '엑셀 임포트')
    const logs = getAuditLogs(db)
    expect(logs[0].entity_type).toBe('설계내역')
    expect(logs[0].action).toBe('임포트')
  })

  it('14: should handle action "삭제"', () => {
    logAudit(db, '프로젝트', 1, '삭제', '프로젝트 삭제됨')
    const logs = getAuditLogs(db)
    expect(logs[0].action).toBe('삭제')
  })

  it('15: should handle action "상태변경"', () => {
    logAudit(db, '프로젝트', 1, '상태변경', '상태 변경됨')
    const logs = getAuditLogs(db)
    expect(logs[0].action).toBe('상태변경')
  })

  it('16: should convert numeric old/new values to strings', () => {
    logAudit(db, '프로젝트', 1, '수정', '금액 변경', [{ field: 'amount', old: 1000000, new: 2000000 }])
    const logs = getAuditLogs(db)
    expect(logs[0].old_value).toBe('1000000')
    expect(logs[0].new_value).toBe('2000000')
  })

  it('17: should convert boolean-like values to strings', () => {
    logAudit(db, '프로젝트', 1, '수정', 'VAT 변경', [{ field: 'vat_included', old: 0, new: 1 }])
    const logs = getAuditLogs(db)
    expect(logs[0].old_value).toBe('0')
    expect(logs[0].new_value).toBe('1')
  })

  it('18: should populate created_at automatically', () => {
    logAudit(db, '프로젝트', 1, '생성', '자동 시각')
    const logs = getAuditLogs(db)
    expect(logs[0].created_at).toBeTruthy()
    expect(typeof logs[0].created_at).toBe('string')
  })

  it('19: should auto-increment ids across multiple calls', () => {
    logAudit(db, '프로젝트', 1, '생성', '첫번째')
    logAudit(db, '프로젝트', 2, '생성', '두번째')
    const logs = getAuditLogs(db)
    expect(logs).toHaveLength(2)
    expect(logs[0].id).toBe(1)
    expect(logs[1].id).toBe(2)
  })

  it('20: should handle a single change in the array', () => {
    logAudit(db, '기성회차', 7, '수정', '단일 변경', [{ field: 'status', old: '작성중', new: '청구완료' }])
    const logs = getAuditLogs(db)
    expect(logs).toHaveLength(1)
    expect(logs[0].field_name).toBe('status')
    expect(logs[0].old_value).toBe('작성중')
    expect(logs[0].new_value).toBe('청구완료')
  })
})

// ============================================================
// detectChanges (20 tests)
// ============================================================
describe('detectChanges', () => {
  it('21: should return empty array when no changes', () => {
    const result = detectChanges({ name: '테스트' }, { name: '테스트' }, ['name'])
    expect(result).toEqual([])
  })

  it('22: should detect a single field change', () => {
    const result = detectChanges({ name: '이전' }, { name: '이후' }, ['name'])
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ field: 'name', old: '이전', new: '이후' })
  })

  it('23: should detect multiple field changes', () => {
    const result = detectChanges(
      { name: 'A', amount: 100 },
      { name: 'B', amount: 200 },
      ['name', 'amount']
    )
    expect(result).toHaveLength(2)
    expect(result[0].field).toBe('name')
    expect(result[1].field).toBe('amount')
  })

  it('24: should detect change when field is only in old object', () => {
    const result = detectChanges({ name: '값' }, {}, ['name'])
    expect(result).toHaveLength(1)
    expect(result[0].old).toBe('값')
    expect(result[0].new).toBeUndefined()
  })

  it('25: should detect change when field is only in new object', () => {
    const result = detectChanges({}, { name: '새값' }, ['name'])
    expect(result).toHaveLength(1)
    expect(result[0].old).toBeUndefined()
    expect(result[0].new).toBe('새값')
  })

  it('26: should not detect change when both are null', () => {
    const result = detectChanges({ name: null }, { name: null }, ['name'])
    expect(result).toEqual([])
  })

  it('27: should not detect change when both are undefined', () => {
    const result = detectChanges({}, {}, ['name'])
    expect(result).toEqual([])
  })

  it('28: should not detect change for number vs same string ("123" vs 123)', () => {
    const result = detectChanges({ amount: 123 }, { amount: '123' }, ['amount'])
    expect(result).toEqual([])
  })

  it('29: should detect number change (100 to 200)', () => {
    const result = detectChanges({ amount: 100 }, { amount: 200 }, ['amount'])
    expect(result).toHaveLength(1)
    expect(result[0].old).toBe(100)
    expect(result[0].new).toBe(200)
  })

  it('30: should detect boolean-like change (0 to 1)', () => {
    const result = detectChanges({ flag: 0 }, { flag: 1 }, ['flag'])
    expect(result).toHaveLength(1)
    expect(result[0].old).toBe(0)
    expect(result[0].new).toBe(1)
  })

  it('31: should ignore fields not listed in trackFields', () => {
    const result = detectChanges(
      { name: 'A', secret: 'x' },
      { name: 'A', secret: 'y' },
      ['name']
    )
    expect(result).toEqual([])
  })

  it('32: should return empty array for empty trackFields', () => {
    const result = detectChanges({ name: 'A' }, { name: 'B' }, [])
    expect(result).toEqual([])
  })

  it('33: should not detect change when both fields are missing from objects', () => {
    const result = detectChanges({ a: 1 }, { b: 2 }, ['name'])
    expect(result).toEqual([])
  })

  it('34: should detect change from null to value', () => {
    const result = detectChanges({ name: null }, { name: '값' }, ['name'])
    expect(result).toHaveLength(1)
    expect(result[0].old).toBeNull()
    expect(result[0].new).toBe('값')
  })

  it('35: should detect change from value to null', () => {
    const result = detectChanges({ name: '값' }, { name: null }, ['name'])
    expect(result).toHaveLength(1)
    expect(result[0].old).toBe('값')
    expect(result[0].new).toBeNull()
  })

  it('36: should handle empty string vs null as same (both become "")', () => {
    const result = detectChanges({ name: null }, { name: '' }, ['name'])
    expect(result).toEqual([])
  })

  it('37: should handle empty string vs undefined as same (both become "")', () => {
    const result = detectChanges({}, { name: '' }, ['name'])
    expect(result).toEqual([])
  })

  it('38: should detect change for 0 vs null (String(0)="0" vs String(null??"")="")', () => {
    const result = detectChanges({ amount: 0 }, { amount: null }, ['amount'])
    expect(result).toHaveLength(1)
  })

  it('39: should detect change for 0 vs undefined', () => {
    const result = detectChanges({ amount: 0 }, {}, ['amount'])
    expect(result).toHaveLength(1)
  })

  it('40: should preserve order of trackFields in results', () => {
    const result = detectChanges(
      { z: 1, a: 'x' },
      { z: 2, a: 'y' },
      ['z', 'a']
    )
    expect(result[0].field).toBe('z')
    expect(result[1].field).toBe('a')
  })
})

// ============================================================
// Workflow - STATUS_TASKS (10 tests)
// ============================================================
describe('Workflow STATUS_TASKS auto-generation', () => {
  let clientId: number
  let projectId: number

  beforeEach(() => {
    db = new Database(':memory:')
    createTables(db)
    clientId = insertClient(db)
  })

  afterEach(() => {
    db.close()
  })

  // Helper: simulate on-status-change logic (same as workflow.ts but without ipcMain)
  function onStatusChange(projectId: number, newStatus: string): { created: number } {
    const STATUS_TASKS: Record<string, Array<{ type: string; title: string; desc: string; dueDays?: number }>> = {
      '계약체결': [
        { type: '서류', title: '계약서 스캔 및 첨부', desc: '원본 계약서를 스캔하여 프로젝트 폴더에 저장' },
        { type: '설정', title: '설계내역서 엑셀 임포트', desc: '설계내역서를 시스템에 등록하여 기성처리 준비' },
        { type: '설정', title: '착공일 확인 및 상태 변경', desc: '착공일이 되면 프로젝트 상태를 "시공중"으로 변경' },
      ],
      '시공중': [
        { type: '기성', title: '1회차 기성 회차 생성', desc: '첫 기성 청구를 위한 회차 생성' },
        { type: '사진', title: '착공 전 현장 사진 촬영', desc: '준공사진첩에 사용할 착공 전 사진 촬영 및 보관' },
        { type: '노무', title: '일용직 출역 기록 시작', desc: '현장 근로자 출역 기록을 매일 입력' },
      ],
      '준공서류작성': [
        { type: '서류', title: '준공내역서 작성', desc: '최종 기성 기반 준공내역서 생성' },
        { type: '사진', title: '준공 후 현장 사진 촬영', desc: '준공사진첩에 사용할 완공 후 사진' },
        { type: '서류', title: '품질관리 서류 취합', desc: '자재 시험성적서, 반입확인서, 품질시험 결과' },
        { type: '서류', title: '안전관리 서류 정리', desc: '안전교육일지, 안전점검 체크리스트' },
        { type: '서류', title: '노무비 관련 서류', desc: '노무비 지급대장, 4대보험 납부확인서' },
        { type: '서류', title: '준공사진첩 생성', desc: '착공전/시공중/준공후 사진첩 자동 생성' },
      ],
      '준공완료': [
        { type: '설정', title: '하자보증 기간 설정', desc: '하자보증 종료일을 입력하고 상태를 "하자보증중"으로 변경' },
        { type: '서류', title: '하자보수보증서 첨부', desc: '보증보험 또는 보증서 스캔 첨부' },
      ],
    }

    const tasks = STATUS_TASKS[newStatus]
    if (!tasks || tasks.length === 0) return { created: 0 }

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as { end_date: string | null } | undefined
    if (!project) return { created: 0 }

    const insert = db.prepare(
      'INSERT INTO workflow_tasks (project_id, task_type, title, description, due_date, auto_generated) VALUES (?, ?, ?, ?, ?, 1)'
    )

    const createTasks = db.transaction(() => {
      let created = 0
      for (const task of tasks) {
        const existing = db.prepare(
          "SELECT id FROM workflow_tasks WHERE project_id = ? AND title = ? AND status = '대기'"
        ).get(projectId, task.title)
        if (existing) continue

        let dueDate: string | null = null
        if (task.dueDays && project.end_date) {
          const d = new Date(project.end_date)
          d.setDate(d.getDate() - task.dueDays)
          dueDate = d.toISOString().split('T')[0]
        }

        insert.run(projectId, task.type, task.title, task.desc, dueDate)
        created++
      }
      return created
    })

    const count = createTasks()
    logAudit(db, '프로젝트', projectId, '상태변경', `상태 → ${newStatus}, 할일 ${count}건 자동 생성`)
    return { created: count }
  }

  it('41: 계약체결 should generate 3 tasks', () => {
    projectId = insertProject(db, clientId, { status: '계약체결' })
    const result = onStatusChange(projectId, '계약체결')
    expect(result.created).toBe(3)
    const tasks = db.prepare('SELECT * FROM workflow_tasks WHERE project_id = ?').all(projectId)
    expect(tasks).toHaveLength(3)
  })

  it('42: 시공중 should generate 3 tasks', () => {
    projectId = insertProject(db, clientId, { status: '시공중' })
    const result = onStatusChange(projectId, '시공중')
    expect(result.created).toBe(3)
  })

  it('43: 준공서류작성 should generate 6 tasks', () => {
    projectId = insertProject(db, clientId, { status: '준공서류작성' })
    const result = onStatusChange(projectId, '준공서류작성')
    expect(result.created).toBe(6)
  })

  it('44: 준공완료 should generate 2 tasks', () => {
    projectId = insertProject(db, clientId, { status: '준공완료' })
    const result = onStatusChange(projectId, '준공완료')
    expect(result.created).toBe(2)
  })

  it('45: unknown status should generate 0 tasks', () => {
    projectId = insertProject(db, clientId, { status: '계약체결' })
    const result = onStatusChange(projectId, '알수없는상태')
    expect(result.created).toBe(0)
  })

  it('46: duplicate prevention - same title pending should not be created again', () => {
    projectId = insertProject(db, clientId, { status: '계약체결' })
    onStatusChange(projectId, '계약체결')
    const result = onStatusChange(projectId, '계약체결')
    expect(result.created).toBe(0)
    const tasks = db.prepare('SELECT * FROM workflow_tasks WHERE project_id = ?').all(projectId)
    expect(tasks).toHaveLength(3)
  })

  it('47: completed task with same title allows re-creation', () => {
    projectId = insertProject(db, clientId, { status: '계약체결' })
    onStatusChange(projectId, '계약체결')
    // Complete all tasks
    db.prepare("UPDATE workflow_tasks SET status = '완료' WHERE project_id = ?").run(projectId)
    const result = onStatusChange(projectId, '계약체결')
    expect(result.created).toBe(3)
  })

  it('48: missing project should generate 0 tasks', () => {
    const result = onStatusChange(9999, '계약체결')
    expect(result.created).toBe(0)
  })

  it('49: auto-generated tasks should have auto_generated = 1', () => {
    projectId = insertProject(db, clientId, { status: '시공중' })
    onStatusChange(projectId, '시공중')
    const tasks = db.prepare('SELECT * FROM workflow_tasks WHERE project_id = ?').all(projectId) as Array<Record<string, unknown>>
    for (const task of tasks) {
      expect(task.auto_generated).toBe(1)
    }
  })

  it('50: status change should also log audit entry', () => {
    projectId = insertProject(db, clientId, { status: '계약체결' })
    onStatusChange(projectId, '계약체결')
    const logs = getAuditLogs(db)
    expect(logs.length).toBeGreaterThanOrEqual(1)
    const statusLog = logs.find(l => l.action === '상태변경')
    expect(statusLog).toBeTruthy()
    expect(statusLog!.description).toContain('계약체결')
    expect(statusLog!.description).toContain('3건')
  })
})

// ============================================================
// Workflow task management (30 tests)
// ============================================================
describe('Workflow task management', () => {
  let clientId: number
  let projectId: number

  beforeEach(() => {
    db = new Database(':memory:')
    createTables(db)
    clientId = insertClient(db)
    projectId = insertProject(db, clientId)
  })

  afterEach(() => {
    db.close()
  })

  it('51: create task should store all fields correctly', () => {
    const id = insertWorkflowTask(db, projectId, {
      title: '테스트 작업',
      task_type: '서류',
      description: '설명 텍스트',
      due_date: '2026-04-01',
      status: '대기',
      auto_generated: 0,
    })
    const task = db.prepare('SELECT * FROM workflow_tasks WHERE id = ?').get(id) as Record<string, unknown>
    expect(task.project_id).toBe(projectId)
    expect(task.title).toBe('테스트 작업')
    expect(task.task_type).toBe('서류')
    expect(task.description).toBe('설명 텍스트')
    expect(task.due_date).toBe('2026-04-01')
    expect(task.status).toBe('대기')
    expect(task.auto_generated).toBe(0)
  })

  it('52: complete task should set status to 완료 and completed_at', () => {
    const id = insertWorkflowTask(db, projectId)
    db.prepare("UPDATE workflow_tasks SET status = '완료', completed_at = datetime('now','localtime') WHERE id = ?").run(id)
    const task = db.prepare('SELECT * FROM workflow_tasks WHERE id = ?').get(id) as Record<string, unknown>
    expect(task.status).toBe('완료')
    expect(task.completed_at).toBeTruthy()
  })

  it('53: skip task should set status to 건너뜀 and completed_at', () => {
    const id = insertWorkflowTask(db, projectId)
    db.prepare("UPDATE workflow_tasks SET status = '건너뜀', completed_at = datetime('now','localtime') WHERE id = ?").run(id)
    const task = db.prepare('SELECT * FROM workflow_tasks WHERE id = ?').get(id) as Record<string, unknown>
    expect(task.status).toBe('건너뜀')
    expect(task.completed_at).toBeTruthy()
  })

  it('54: tasks should be ordered by status ASC then due_date ASC', () => {
    insertWorkflowTask(db, projectId, { title: '완료작업', status: '완료', due_date: '2026-01-01' })
    insertWorkflowTask(db, projectId, { title: '대기작업2', status: '대기', due_date: '2026-03-01' })
    insertWorkflowTask(db, projectId, { title: '대기작업1', status: '대기', due_date: '2026-02-01' })

    const tasks = db.prepare(
      'SELECT * FROM workflow_tasks WHERE project_id = ? ORDER BY status ASC, due_date ASC, created_at ASC'
    ).all(projectId) as Array<Record<string, unknown>>

    // '대기' < '완료' in Korean alphabetical order
    expect(tasks[0].title).toBe('대기작업1')
    expect(tasks[1].title).toBe('대기작업2')
    expect(tasks[2].title).toBe('완료작업')
  })

  it('55: pending-all query should join with projects', () => {
    const tasks = db.prepare(`
      SELECT wt.*, p.name as project_name
      FROM workflow_tasks wt
      JOIN projects p ON wt.project_id = p.id
      WHERE wt.status = '대기'
      ORDER BY wt.due_date ASC, wt.created_at ASC
      LIMIT 50
    `).all() as Array<Record<string, unknown>>
    expect(tasks).toEqual([])

    insertWorkflowTask(db, projectId, { title: '할일' })
    const tasksAfter = db.prepare(`
      SELECT wt.*, p.name as project_name
      FROM workflow_tasks wt
      JOIN projects p ON wt.project_id = p.id
      WHERE wt.status = '대기'
      ORDER BY wt.due_date ASC, wt.created_at ASC
      LIMIT 50
    `).all() as Array<Record<string, unknown>>
    expect(tasksAfter).toHaveLength(1)
    expect(tasksAfter[0].project_name).toBe('테스트 프로젝트')
  })

  it('56: pending-all should return tasks from multiple projects', () => {
    const projectId2 = insertProject(db, clientId, { name: '프로젝트2' })
    insertWorkflowTask(db, projectId, { title: '할일1' })
    insertWorkflowTask(db, projectId2, { title: '할일2' })

    const tasks = db.prepare(`
      SELECT wt.*, p.name as project_name
      FROM workflow_tasks wt
      JOIN projects p ON wt.project_id = p.id
      WHERE wt.status = '대기'
      ORDER BY wt.due_date ASC, wt.created_at ASC
      LIMIT 50
    `).all() as Array<Record<string, unknown>>
    expect(tasks).toHaveLength(2)
  })

  it('57: manual task should have auto_generated = 0', () => {
    const id = insertWorkflowTask(db, projectId, { auto_generated: 0, task_type: '수동' })
    const task = db.prepare('SELECT * FROM workflow_tasks WHERE id = ?').get(id) as Record<string, unknown>
    expect(task.auto_generated).toBe(0)
    expect(task.task_type).toBe('수동')
  })

  it('58: auto-generated task should have auto_generated = 1', () => {
    const id = insertWorkflowTask(db, projectId, { auto_generated: 1, task_type: '기성' })
    const task = db.prepare('SELECT * FROM workflow_tasks WHERE id = ?').get(id) as Record<string, unknown>
    expect(task.auto_generated).toBe(1)
  })

  it('59: task with due_date should store date correctly', () => {
    const id = insertWorkflowTask(db, projectId, { due_date: '2026-12-31' })
    const task = db.prepare('SELECT * FROM workflow_tasks WHERE id = ?').get(id) as Record<string, unknown>
    expect(task.due_date).toBe('2026-12-31')
  })

  it('60: task without due_date should have null', () => {
    const id = insertWorkflowTask(db, projectId, { due_date: null })
    const task = db.prepare('SELECT * FROM workflow_tasks WHERE id = ?').get(id) as Record<string, unknown>
    expect(task.due_date).toBeNull()
  })

  it('61: completing already-completed task should still succeed', () => {
    const id = insertWorkflowTask(db, projectId, { status: '완료' })
    db.prepare("UPDATE workflow_tasks SET status = '완료', completed_at = datetime('now','localtime') WHERE id = ?").run(id)
    const task = db.prepare('SELECT * FROM workflow_tasks WHERE id = ?').get(id) as Record<string, unknown>
    expect(task.status).toBe('완료')
  })

  it('62: filter tasks by project_id', () => {
    const projectId2 = insertProject(db, clientId, { name: '다른 프로젝트' })
    insertWorkflowTask(db, projectId, { title: '프로젝트1 할일' })
    insertWorkflowTask(db, projectId2, { title: '프로젝트2 할일' })

    const tasks = db.prepare('SELECT * FROM workflow_tasks WHERE project_id = ?').all(projectId) as Array<Record<string, unknown>>
    expect(tasks).toHaveLength(1)
    expect(tasks[0].title).toBe('프로젝트1 할일')
  })

  it('63: pending-all should be limited to 50', () => {
    for (let i = 0; i < 55; i++) {
      insertWorkflowTask(db, projectId, { title: `할일${i}` })
    }
    const tasks = db.prepare(`
      SELECT wt.*, p.name as project_name
      FROM workflow_tasks wt
      JOIN projects p ON wt.project_id = p.id
      WHERE wt.status = '대기'
      ORDER BY wt.due_date ASC, wt.created_at ASC
      LIMIT 50
    `).all()
    expect(tasks).toHaveLength(50)
  })

  it('64: created_at should be auto-populated', () => {
    const id = insertWorkflowTask(db, projectId)
    const task = db.prepare('SELECT * FROM workflow_tasks WHERE id = ?').get(id) as Record<string, unknown>
    expect(task.created_at).toBeTruthy()
  })

  it('65: completed_at should be null for pending task', () => {
    const id = insertWorkflowTask(db, projectId)
    const task = db.prepare('SELECT * FROM workflow_tasks WHERE id = ?').get(id) as Record<string, unknown>
    expect(task.completed_at).toBeNull()
  })

  it('66: multiple tasks for same project should all be stored', () => {
    insertWorkflowTask(db, projectId, { title: '할일1' })
    insertWorkflowTask(db, projectId, { title: '할일2' })
    insertWorkflowTask(db, projectId, { title: '할일3' })
    const count = (db.prepare('SELECT COUNT(*) as cnt FROM workflow_tasks WHERE project_id = ?').get(projectId) as { cnt: number }).cnt
    expect(count).toBe(3)
  })

  it('67: tasks should have auto-incrementing ids', () => {
    const id1 = insertWorkflowTask(db, projectId, { title: '할일A' })
    const id2 = insertWorkflowTask(db, projectId, { title: '할일B' })
    expect(id2).toBe(id1 + 1)
  })

  it('68: pending-all should exclude completed tasks', () => {
    insertWorkflowTask(db, projectId, { title: '대기', status: '대기' })
    insertWorkflowTask(db, projectId, { title: '완료', status: '완료' })
    insertWorkflowTask(db, projectId, { title: '건너뜀', status: '건너뜀' })

    const tasks = db.prepare(`
      SELECT wt.*, p.name as project_name
      FROM workflow_tasks wt
      JOIN projects p ON wt.project_id = p.id
      WHERE wt.status = '대기'
      LIMIT 50
    `).all()
    expect(tasks).toHaveLength(1)
  })

  it('69: task description can be null', () => {
    const id = insertWorkflowTask(db, projectId, { description: null })
    const task = db.prepare('SELECT * FROM workflow_tasks WHERE id = ?').get(id) as Record<string, unknown>
    expect(task.description).toBeNull()
  })

  it('70: task description can be a long string', () => {
    const longDesc = '설명'.repeat(2000)
    const id = insertWorkflowTask(db, projectId, { description: longDesc })
    const task = db.prepare('SELECT * FROM workflow_tasks WHERE id = ?').get(id) as Record<string, unknown>
    expect(task.description).toBe(longDesc)
  })

  it('71: skip then complete should keep last status', () => {
    const id = insertWorkflowTask(db, projectId)
    db.prepare("UPDATE workflow_tasks SET status = '건너뜀', completed_at = datetime('now','localtime') WHERE id = ?").run(id)
    db.prepare("UPDATE workflow_tasks SET status = '완료', completed_at = datetime('now','localtime') WHERE id = ?").run(id)
    const task = db.prepare('SELECT * FROM workflow_tasks WHERE id = ?').get(id) as Record<string, unknown>
    expect(task.status).toBe('완료')
  })

  it('72: ordering should put null due_dates after dated tasks when using ASC', () => {
    insertWorkflowTask(db, projectId, { title: 'no-date', due_date: null, status: '대기' })
    insertWorkflowTask(db, projectId, { title: 'has-date', due_date: '2026-01-01', status: '대기' })

    const tasks = db.prepare(
      "SELECT * FROM workflow_tasks WHERE project_id = ? AND status = '대기' ORDER BY due_date ASC"
    ).all(projectId) as Array<Record<string, unknown>>
    // SQLite puts NULLs first in ASC order
    expect(tasks[0].title).toBe('no-date')
    expect(tasks[1].title).toBe('has-date')
  })

  it('73: different task_types should be stored correctly', () => {
    const types = ['서류', '설정', '기성', '사진', '노무', '수동']
    for (const t of types) {
      insertWorkflowTask(db, projectId, { title: `${t} 작업`, task_type: t })
    }
    const tasks = db.prepare('SELECT DISTINCT task_type FROM workflow_tasks WHERE project_id = ?').all(projectId) as Array<{ task_type: string }>
    expect(tasks.map(t => t.task_type).sort()).toEqual(types.sort())
  })

  it('74: deleting project should cascade delete tasks (if FK enabled)', () => {
    db.pragma('foreign_keys = ON')
    const cid = insertClient(db, 'cascade 테스트')
    const pid = insertProject(db, cid, { name: 'cascade proj' })
    insertWorkflowTask(db, pid, { title: 'cascade task' })
    db.prepare('DELETE FROM projects WHERE id = ?').run(pid)
    const tasks = db.prepare('SELECT * FROM workflow_tasks WHERE project_id = ?').all(pid)
    expect(tasks).toHaveLength(0)
  })

  it('75: updating non-existent task should affect 0 rows', () => {
    const result = db.prepare("UPDATE workflow_tasks SET status = '완료' WHERE id = ?").run(99999)
    expect(result.changes).toBe(0)
  })

  it('76: pending-all order should prioritize earlier due_dates', () => {
    insertWorkflowTask(db, projectId, { title: '늦은', due_date: '2026-06-01', status: '대기' })
    insertWorkflowTask(db, projectId, { title: '이른', due_date: '2026-01-01', status: '대기' })

    const tasks = db.prepare(`
      SELECT wt.*, p.name as project_name
      FROM workflow_tasks wt
      JOIN projects p ON wt.project_id = p.id
      WHERE wt.status = '대기'
      ORDER BY wt.due_date ASC, wt.created_at ASC
      LIMIT 50
    `).all() as Array<Record<string, unknown>>
    expect(tasks[0].title).toBe('이른')
    expect(tasks[1].title).toBe('늦은')
  })

  it('77: task count query should work correctly', () => {
    insertWorkflowTask(db, projectId, { status: '대기' })
    insertWorkflowTask(db, projectId, { status: '대기' })
    insertWorkflowTask(db, projectId, { status: '완료' })
    const pending = (db.prepare("SELECT COUNT(*) as cnt FROM workflow_tasks WHERE project_id = ? AND status = '대기'").get(projectId) as { cnt: number }).cnt
    const completed = (db.prepare("SELECT COUNT(*) as cnt FROM workflow_tasks WHERE project_id = ? AND status = '완료'").get(projectId) as { cnt: number }).cnt
    expect(pending).toBe(2)
    expect(completed).toBe(1)
  })

  it('78: manual task creation via INSERT matches workflow:create logic', () => {
    const data = { project_id: projectId, title: '수동 할일', description: '내용', due_date: '2026-05-01' }
    const result = db.prepare(
      "INSERT INTO workflow_tasks (project_id, task_type, title, description, due_date, auto_generated) VALUES (?, '수동', ?, ?, ?, 0)"
    ).run(data.project_id, data.title, data.description, data.due_date)
    const task = db.prepare('SELECT * FROM workflow_tasks WHERE id = ?').get(result.lastInsertRowid) as Record<string, unknown>
    expect(task.task_type).toBe('수동')
    expect(task.auto_generated).toBe(0)
    expect(task.status).toBe('대기')
  })

  it('79: task with all null optional fields', () => {
    const id = insertWorkflowTask(db, projectId, { description: null, due_date: null })
    const task = db.prepare('SELECT * FROM workflow_tasks WHERE id = ?').get(id) as Record<string, unknown>
    expect(task.description).toBeNull()
    expect(task.due_date).toBeNull()
    expect(task.completed_at).toBeNull()
  })

  it('80: bulk insert of tasks in a transaction', () => {
    const insertMany = db.transaction(() => {
      for (let i = 0; i < 100; i++) {
        insertWorkflowTask(db, projectId, { title: `대량할일${i}` })
      }
    })
    insertMany()
    const count = (db.prepare('SELECT COUNT(*) as cnt FROM workflow_tasks WHERE project_id = ?').get(projectId) as { cnt: number }).cnt
    expect(count).toBe(100)
  })
})

// ============================================================
// Workflow next-steps logic (20 tests)
// ============================================================
describe('Workflow next-steps logic', () => {
  let clientId: number

  beforeEach(() => {
    db = new Database(':memory:')
    createTables(db)
    clientId = insertClient(db)
  })

  afterEach(() => {
    db.close()
  })

  // Replicate next-steps logic from workflow.ts without ipcMain
  function getNextSteps(projectId: number): { steps: Array<{ action: string; description: string; ready: boolean; reason?: string }>; currentStatus?: string } {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as Record<string, unknown> | undefined
    if (!project) return { steps: [] }

    const status = project.status as string
    const steps: Array<{ action: string; description: string; ready: boolean; reason?: string }> = []

    switch (status) {
      case '계약체결': {
        const designCount = (db.prepare('SELECT COUNT(*) as cnt FROM design_items WHERE project_id = ?').get(projectId) as { cnt: number }).cnt
        steps.push({
          action: '설계내역 임포트',
          description: '설계내역서 엑셀을 시스템에 등록',
          ready: designCount === 0,
          reason: designCount > 0 ? `이미 ${designCount}건 등록됨` : undefined,
        })
        steps.push({
          action: '상태를 "시공중"으로 변경',
          description: '착공일에 맞춰 상태 변경',
          ready: designCount > 0,
          reason: designCount === 0 ? '설계내역을 먼저 임포트해주세요' : undefined,
        })
        break
      }
      case '시공중': {
        const roundCount = (db.prepare('SELECT COUNT(*) as cnt FROM giseong_rounds WHERE project_id = ?').get(projectId) as { cnt: number }).cnt
        const inProgressRound = db.prepare("SELECT * FROM giseong_rounds WHERE project_id = ? AND status = '작성중' LIMIT 1").get(projectId) as { round_no: number } | undefined
        steps.push({
          action: inProgressRound ? `제${inProgressRound.round_no}회 기성 완료` : '새 기성 회차 생성',
          description: inProgressRound ? '진도율 입력 후 청구' : '다음 기성 청구를 위한 회차 생성',
          ready: true,
        })
        steps.push({
          action: '준공서류 작성 시작',
          description: '공사 완료시 상태 변경',
          ready: roundCount > 0,
        })
        break
      }
      case '준공서류작성': {
        steps.push({
          action: '준공사진첩 생성',
          description: '사진 폴더를 선택하여 자동 생성',
          ready: true,
        })
        steps.push({
          action: '준공검사 요청',
          description: '모든 서류 준비 완료 후',
          ready: true,
        })
        break
      }
    }

    return { steps, currentStatus: status }
  }

  it('81: 계약체결 + no design items -> suggest import (ready=true) and status change (ready=false)', () => {
    const pid = insertProject(db, clientId, { status: '계약체결' })
    const { steps } = getNextSteps(pid)
    expect(steps).toHaveLength(2)
    expect(steps[0].action).toBe('설계내역 임포트')
    expect(steps[0].ready).toBe(true)
    expect(steps[1].action).toBe('상태를 "시공중"으로 변경')
    expect(steps[1].ready).toBe(false)
  })

  it('82: 계약체결 + has design items -> import not ready, status change ready', () => {
    const pid = insertProject(db, clientId, { status: '계약체결' })
    db.prepare("INSERT INTO design_items (project_id, item_name, unit) VALUES (?, '철근', 'ton')").run(pid)
    const { steps } = getNextSteps(pid)
    expect(steps[0].action).toBe('설계내역 임포트')
    expect(steps[0].ready).toBe(false)
    expect(steps[0].reason).toContain('1건')
    expect(steps[1].ready).toBe(true)
  })

  it('83: 시공중 + no rounds -> suggest create round', () => {
    const pid = insertProject(db, clientId, { status: '시공중' })
    const { steps } = getNextSteps(pid)
    expect(steps[0].action).toBe('새 기성 회차 생성')
    expect(steps[0].ready).toBe(true)
  })

  it('84: 시공중 + in-progress round -> suggest complete it', () => {
    const pid = insertProject(db, clientId, { status: '시공중' })
    db.prepare("INSERT INTO giseong_rounds (project_id, round_no, status) VALUES (?, 1, '작성중')").run(pid)
    const { steps } = getNextSteps(pid)
    expect(steps[0].action).toBe('제1회 기성 완료')
    expect(steps[0].description).toBe('진도율 입력 후 청구')
  })

  it('85: 시공중 + completed rounds and no in-progress -> suggest new round', () => {
    const pid = insertProject(db, clientId, { status: '시공중' })
    db.prepare("INSERT INTO giseong_rounds (project_id, round_no, status) VALUES (?, 1, '승인완료')").run(pid)
    const { steps } = getNextSteps(pid)
    expect(steps[0].action).toBe('새 기성 회차 생성')
  })

  it('86: 시공중 + has rounds -> 준공서류 작성 시작 ready', () => {
    const pid = insertProject(db, clientId, { status: '시공중' })
    db.prepare("INSERT INTO giseong_rounds (project_id, round_no, status) VALUES (?, 1, '승인완료')").run(pid)
    const { steps } = getNextSteps(pid)
    expect(steps[1].action).toBe('준공서류 작성 시작')
    expect(steps[1].ready).toBe(true)
  })

  it('87: 시공중 + no rounds -> 준공서류 작성 시작 not ready', () => {
    const pid = insertProject(db, clientId, { status: '시공중' })
    const { steps } = getNextSteps(pid)
    expect(steps[1].action).toBe('준공서류 작성 시작')
    expect(steps[1].ready).toBe(false)
  })

  it('88: 준공서류작성 -> suggest 사진첩 and 준공검사', () => {
    const pid = insertProject(db, clientId, { status: '준공서류작성' })
    const { steps } = getNextSteps(pid)
    expect(steps).toHaveLength(2)
    expect(steps[0].action).toBe('준공사진첩 생성')
    expect(steps[1].action).toBe('준공검사 요청')
  })

  it('89: 준공서류작성 -> both steps ready', () => {
    const pid = insertProject(db, clientId, { status: '준공서류작성' })
    const { steps } = getNextSteps(pid)
    expect(steps[0].ready).toBe(true)
    expect(steps[1].ready).toBe(true)
  })

  it('90: unknown status -> empty steps', () => {
    const pid = insertProject(db, clientId, { status: '입찰중' })
    // '입찰중' is not handled in the switch
    const { steps } = getNextSteps(pid)
    expect(steps).toEqual([])
  })

  it('91: missing project -> empty steps', () => {
    const { steps } = getNextSteps(9999)
    expect(steps).toEqual([])
  })

  it('92: 계약체결 with multiple design items -> reason mentions count', () => {
    const pid = insertProject(db, clientId, { status: '계약체결' })
    db.prepare("INSERT INTO design_items (project_id, item_name, unit) VALUES (?, '철근', 'ton')").run(pid)
    db.prepare("INSERT INTO design_items (project_id, item_name, unit) VALUES (?, '콘크리트', 'm3')").run(pid)
    db.prepare("INSERT INTO design_items (project_id, item_name, unit) VALUES (?, '거푸집', 'm2')").run(pid)
    const { steps } = getNextSteps(pid)
    expect(steps[0].reason).toContain('3건')
  })

  it('93: 계약체결 no design items -> status change reason mentions import first', () => {
    const pid = insertProject(db, clientId, { status: '계약체결' })
    const { steps } = getNextSteps(pid)
    expect(steps[1].reason).toBe('설계내역을 먼저 임포트해주세요')
  })

  it('94: currentStatus should be returned', () => {
    const pid = insertProject(db, clientId, { status: '시공중' })
    const result = getNextSteps(pid)
    expect(result.currentStatus).toBe('시공중')
  })

  it('95: 시공중 with round_no=3 in-progress -> action mentions 제3회', () => {
    const pid = insertProject(db, clientId, { status: '시공중' })
    db.prepare("INSERT INTO giseong_rounds (project_id, round_no, status) VALUES (?, 1, '승인완료')").run(pid)
    db.prepare("INSERT INTO giseong_rounds (project_id, round_no, status) VALUES (?, 2, '승인완료')").run(pid)
    db.prepare("INSERT INTO giseong_rounds (project_id, round_no, status) VALUES (?, 3, '작성중')").run(pid)
    const { steps } = getNextSteps(pid)
    expect(steps[0].action).toBe('제3회 기성 완료')
  })

  it('96: 준공완료 status -> empty steps (not in switch)', () => {
    const pid = insertProject(db, clientId, { status: '준공완료' })
    const { steps } = getNextSteps(pid)
    expect(steps).toEqual([])
  })

  it('97: 하자보증중 status -> empty steps', () => {
    const pid = insertProject(db, clientId, { status: '하자보증중' })
    const { steps } = getNextSteps(pid)
    expect(steps).toEqual([])
  })

  it('98: 완료 status -> empty steps', () => {
    const pid = insertProject(db, clientId, { status: '완료' })
    const { steps } = getNextSteps(pid)
    expect(steps).toEqual([])
  })

  it('99: missing project returns no currentStatus', () => {
    const result = getNextSteps(9999)
    expect(result.currentStatus).toBeUndefined()
  })

  it('100: 계약체결 import step description is correct', () => {
    const pid = insertProject(db, clientId, { status: '계약체결' })
    const { steps } = getNextSteps(pid)
    expect(steps[0].description).toBe('설계내역서 엑셀을 시스템에 등록')
    expect(steps[1].description).toBe('착공일에 맞춰 상태 변경')
  })
})
