import React, { useEffect, useState, useCallback } from 'react'
import {
  Card, Table, Select, Button, Tag, Typography, Space, message, Empty,
  Progress, Input
} from 'antd'
import { ExportOutlined, FileAddOutlined, FolderOpenOutlined } from '@ant-design/icons'
import type { JungongDoc, JungongDocStatus, Project } from '../../shared/types'

const { Title, Text } = Typography

const DOC_TYPE_COLORS: Record<string, string> = {
  '행정': 'blue',
  '품질': 'green',
  '안전': 'orange',
  '환경': 'cyan',
  '노무': 'purple',
  '보험': 'gold',
}

const STATUS_OPTIONS: { value: JungongDocStatus; label: string }[] = [
  { value: '미완료', label: '미완료' },
  { value: '완료', label: '완료' },
  { value: '해당없음', label: '해당없음' },
]

const STATUS_COLORS: Record<JungongDocStatus, string> = {
  '미완료': 'default',
  '완료': 'green',
  '해당없음': 'gray',
}

export default function Jungong(): React.ReactElement {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<number | null>(null)
  const [docs, setDocs] = useState<JungongDoc[]>([])
  const [loading, setLoading] = useState(false)
  const [progressInfo, setProgressInfo] = useState<{
    total: number; completed: number; notApplicable: number; remaining: number; progress: number
  } | null>(null)

  useEffect(() => {
    loadProjects()
  }, [])

  async function loadProjects() {
    const data = await window.api.projectList()
    setProjects(data.filter((p: Project) =>
      ['시공중', '준공서류작성', '계약체결', '착공전'].includes(p.status)
    ))
  }

  const loadDocs = useCallback(async (projectId: number) => {
    setLoading(true)
    try {
      const [docData, prog] = await Promise.all([
        window.api.jungongList(projectId),
        window.api.jungongProgress(projectId),
      ])
      setDocs(docData)
      setProgressInfo(prog)
    } finally {
      setLoading(false)
    }
  }, [])

  async function handleProjectSelect(projectId: number) {
    setSelectedProject(projectId)
    setDocs([])
    setProgressInfo(null)
    await loadDocs(projectId)
  }

  async function handleInitChecklist() {
    if (!selectedProject) return
    try {
      const result = await window.api.jungongInitChecklist(selectedProject)
      message.success(`체크리스트가 초기화되었습니다. (${result.created}건 생성)`)
      await loadDocs(selectedProject)
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    }
  }

  async function handleUpdateItem(id: number, data: Partial<Pick<JungongDoc, 'status' | 'file_path' | 'notes'>>) {
    try {
      const updated = await window.api.jungongUpdateItem(id, data)
      setDocs(prev => prev.map(d => d.id === id ? updated : d))
      if (selectedProject) {
        const prog = await window.api.jungongProgress(selectedProject)
        setProgressInfo(prog)
      }
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    }
  }

  async function handleSelectFile(record: JungongDoc) {
    const filePath = await window.api.openFileDialog({
      title: '파일 선택',
      filters: [{ name: '모든 파일', extensions: ['*'] }],
    })
    if (filePath) {
      await handleUpdateItem(record.id, { file_path: filePath })
    }
  }

  async function handleExportExcel() {
    if (!selectedProject) return
    const project = projects.find(p => p.id === selectedProject)
    const savePath = await window.api.saveFileDialog({
      defaultPath: `준공서류_${project?.name || ''}.xlsx`,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    })
    if (!savePath) return

    try {
      await window.api.jungongExportExcel(selectedProject, savePath)
      message.success('준공서류 목록이 저장되었습니다.')
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    }
  }

  const columns = [
    {
      title: 'No', dataIndex: 'sort_order', key: 'sort_order', width: 55,
      align: 'center' as const,
    },
    {
      title: '구분', dataIndex: 'doc_type', key: 'doc_type', width: 80,
      align: 'center' as const,
      render: (v: string) => <Tag color={DOC_TYPE_COLORS[v] || 'default'}>{v}</Tag>,
    },
    {
      title: '서류명', dataIndex: 'doc_name', key: 'doc_name', ellipsis: true,
    },
    {
      title: '상태', dataIndex: 'status', key: 'status', width: 120,
      render: (status: JungongDocStatus, record: JungongDoc) => (
        <Select
          size="small"
          value={status}
          onChange={(value: JungongDocStatus) => handleUpdateItem(record.id, { status: value })}
          style={{ width: '100%' }}
          options={STATUS_OPTIONS}
          optionRender={(option) => (
            <Tag color={STATUS_COLORS[option.value as JungongDocStatus]}>
              {option.label}
            </Tag>
          )}
        />
      ),
    },
    {
      title: '파일경로', key: 'file_path', width: 200,
      render: (_: unknown, record: JungongDoc) => (
        <Space size="small">
          <Button
            size="small"
            icon={<FolderOpenOutlined />}
            onClick={() => handleSelectFile(record)}
          >
            파일 선택
          </Button>
          {record.file_path && (
            <Text
              ellipsis={{ tooltip: record.file_path }}
              style={{ maxWidth: 100, fontSize: 12 }}
            >
              {record.file_path.split(/[\\/]/).pop()}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: '비고', dataIndex: 'notes', key: 'notes', width: 180,
      render: (notes: string | null, record: JungongDoc) => (
        <Input
          size="small"
          defaultValue={notes || ''}
          placeholder="비고 입력"
          onBlur={(e) => {
            const newValue = e.target.value
            if (newValue !== (notes || '')) {
              handleUpdateItem(record.id, { notes: newValue || null })
            }
          }}
          onPressEnter={(e) => (e.target as HTMLInputElement).blur()}
        />
      ),
    },
  ]

  return (
    <div>
      <Title level={3}>준공서류 관리</Title>

      <Card style={{ marginBottom: 16 }}>
        <Space size="large" align="end">
          <div>
            <div style={{ marginBottom: 4, fontSize: 12, color: '#888' }}>프로젝트</div>
            <Select
              style={{ width: 350 }}
              placeholder="프로젝트 선택"
              value={selectedProject}
              onChange={handleProjectSelect}
              showSearch
              optionFilterProp="label"
              options={projects.map(p => ({
                label: `${p.name} (${p.client_name || ''})`,
                value: p.id,
              }))}
            />
          </div>
          {selectedProject && docs.length === 0 && !loading && (
            <Button
              type="primary"
              icon={<FileAddOutlined />}
              onClick={handleInitChecklist}
            >
              체크리스트 초기화
            </Button>
          )}
          {selectedProject && docs.length > 0 && (
            <Button
              icon={<ExportOutlined />}
              onClick={handleExportExcel}
            >
              엑셀 내보내기
            </Button>
          )}
        </Space>
      </Card>

      {selectedProject && progressInfo && docs.length > 0 ? (
        <Card
          title="준공서류 체크리스트"
          style={{ marginBottom: 16 }}
        >
          <div style={{ marginBottom: 16 }}>
            <Progress
              percent={Math.round(progressInfo.progress * 10) / 10}
              status={progressInfo.progress >= 100 ? 'success' : 'active'}
              style={{ marginBottom: 8 }}
            />
            <Text type="secondary">
              전체 {progressInfo.total}건 / 완료 {progressInfo.completed}건 / 미완료 {progressInfo.remaining}건 / 해당없음 {progressInfo.notApplicable}건
            </Text>
          </div>

          <Table
            dataSource={docs}
            columns={columns}
            rowKey="id"
            loading={loading}
            size="small"
            pagination={false}
            scroll={{ y: 500 }}
          />
        </Card>
      ) : selectedProject && !loading ? (
        <Card>
          <Empty description="체크리스트가 없습니다. 초기화 버튼을 눌러주세요." />
        </Card>
      ) : !selectedProject ? (
        <Card>
          <Empty description="프로젝트를 선택해주세요." />
        </Card>
      ) : null}
    </div>
  )
}
