import { ipcMain } from 'electron'
import Database from 'better-sqlite3'

/**
 * 감사 로그 기록 유틸리티
 * 모든 중요 변경사항을 audit_log 테이블에 기록
 */
export function logAudit(
  db: Database.Database,
  entityType: string,
  entityId: number,
  action: string,
  description: string,
  changes?: { field: string; old: unknown; new: unknown }[]
): void {
  const stmt = db.prepare(`
    INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, description)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  if (changes && changes.length > 0) {
    const logAll = db.transaction(() => {
      for (const change of changes) {
        stmt.run(
          entityType, entityId, action,
          change.field,
          change.old != null ? String(change.old) : null,
          change.new != null ? String(change.new) : null,
          description
        )
      }
    })
    logAll()
  } else {
    stmt.run(entityType, entityId, action, null, null, null, description)
  }
}

/**
 * 변경된 필드 감지 (이전 객체 vs 새 객체 비교)
 */
export function detectChanges(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  trackFields: string[]
): { field: string; old: unknown; new: unknown }[] {
  const changes: { field: string; old: unknown; new: unknown }[] = []
  for (const field of trackFields) {
    const oldVal = oldObj[field]
    const newVal = newObj[field]
    if (String(oldVal ?? '') !== String(newVal ?? '')) {
      changes.push({ field, old: oldVal, new: newVal })
    }
  }
  return changes
}

export function registerAuditHandlers(db: Database.Database): void {
  // 감사 로그 조회
  ipcMain.handle('audit:list', (_event, entityType: string, entityId: number) => {
    return db.prepare(`
      SELECT * FROM audit_log
      WHERE entity_type = ? AND entity_id = ?
      ORDER BY created_at DESC
      LIMIT 100
    `).all(entityType, entityId)
  })

  // 프로젝트 전체 감사 로그
  ipcMain.handle('audit:project-all', (_event, projectId: number) => {
    return db.prepare(`
      SELECT * FROM audit_log
      WHERE (entity_type = '프로젝트' AND entity_id = ?)
         OR (entity_type = '기성회차' AND entity_id IN (SELECT id FROM giseong_rounds WHERE project_id = ?))
         OR (entity_type = '기성상세' AND entity_id IN (
              SELECT gd.id FROM giseong_details gd
              JOIN giseong_rounds gr ON gd.round_id = gr.id
              WHERE gr.project_id = ?))
         OR (entity_type = '설계내역' AND entity_id = ?)
      ORDER BY created_at DESC
      LIMIT 200
    `).all(projectId, projectId, projectId, projectId)
  })
}
