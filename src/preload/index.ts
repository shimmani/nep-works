import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/types'

// 타입 안전한 IPC 래퍼
const api = {
  // 프로젝트
  projectList: (filters?: Record<string, unknown>) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_LIST, filters),
  projectGet: (id: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_GET, id),
  projectCreate: (data: Record<string, unknown>) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_CREATE, data),
  projectUpdate: (id: number, data: Record<string, unknown>) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_UPDATE, id, data),
  projectDelete: (id: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_DELETE, id),
  projectValidate: (data: Record<string, unknown>) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_VALIDATE, data),

  // 발주처
  clientList: () => ipcRenderer.invoke(IPC_CHANNELS.CLIENT_LIST),
  clientGet: (id: number) => ipcRenderer.invoke(IPC_CHANNELS.CLIENT_GET, id),
  clientCreate: (data: Record<string, unknown>) =>
    ipcRenderer.invoke(IPC_CHANNELS.CLIENT_CREATE, data),
  clientUpdate: (id: number, data: Record<string, unknown>) =>
    ipcRenderer.invoke(IPC_CHANNELS.CLIENT_UPDATE, id, data),
  clientDelete: (id: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.CLIENT_DELETE, id),

  // 기성
  giseongRounds: (projectId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.GISEONG_ROUNDS, projectId),
  giseongRoundGet: (roundId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.GISEONG_ROUND_GET, roundId),
  giseongRoundCreate: (data: Record<string, unknown>) =>
    ipcRenderer.invoke(IPC_CHANNELS.GISEONG_ROUND_CREATE, data),
  giseongRoundUpdate: (roundId: number, data: Record<string, unknown>) =>
    ipcRenderer.invoke(IPC_CHANNELS.GISEONG_ROUND_UPDATE, roundId, data),
  giseongDetails: (roundId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.GISEONG_DETAILS, roundId),
  giseongDetailUpdate: (detailId: number, data: Record<string, unknown>) =>
    ipcRenderer.invoke(IPC_CHANNELS.GISEONG_DETAIL_UPDATE, detailId, data),
  giseongExportExcel: (roundId: number, savePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GISEONG_EXPORT_EXCEL, roundId, savePath),

  // 설계내역
  designItems: (projectId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.DESIGN_ITEMS, projectId),
  designImportExcel: (projectId: number, filePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.DESIGN_IMPORT_EXCEL, projectId, filePath),

  // 감사 로그
  auditList: (entityType: string, entityId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.AUDIT_LIST, entityType, entityId),
  auditProjectAll: (projectId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.AUDIT_PROJECT_ALL, projectId),

  // 워크플로우
  workflowTasks: (projectId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.WORKFLOW_TASKS, projectId),
  workflowComplete: (taskId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.WORKFLOW_COMPLETE, taskId),
  workflowSkip: (taskId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.WORKFLOW_SKIP, taskId),
  workflowCreate: (data: { project_id: number; title: string; description?: string; due_date?: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.WORKFLOW_CREATE, data),
  workflowPendingAll: () =>
    ipcRenderer.invoke(IPC_CHANNELS.WORKFLOW_PENDING_ALL),
  workflowOnStatusChange: (projectId: number, newStatus: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.WORKFLOW_ON_STATUS_CHANGE, projectId, newStatus),
  workflowNextSteps: (projectId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.WORKFLOW_NEXT_STEPS, projectId),

  // 추천/프리뷰
  recommendProjectDefaults: (clientId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.RECOMMEND_PROJECT_DEFAULTS, clientId),
  recommendGiseongRates: (projectId: number, roundNo: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.RECOMMEND_GISEONG_RATES, projectId, roundNo),
  recommendGiseongPreview: (projectId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.RECOMMEND_GISEONG_PREVIEW, projectId),
  recommendSaveClientDefault: (clientId: number, key: string, value: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.RECOMMEND_SAVE_CLIENT_DEFAULT, clientId, key, value),
  recommendDesignPreview: (filePath: string, contractAmount: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.RECOMMEND_DESIGN_PREVIEW, filePath, contractAmount),
  recommendExportPreview: (roundId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.RECOMMEND_EXPORT_PREVIEW, roundId),

  // 다이얼로그
  openFileDialog: (options?: Record<string, unknown>) =>
    ipcRenderer.invoke(IPC_CHANNELS.DIALOG_OPEN_FILE, options),
  saveFileDialog: (options?: Record<string, unknown>) =>
    ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SAVE_FILE, options),
  openFolderDialog: () =>
    ipcRenderer.invoke(IPC_CHANNELS.DIALOG_OPEN_FOLDER),
}

contextBridge.exposeInMainWorld('api', api)

export type NepAPI = typeof api
