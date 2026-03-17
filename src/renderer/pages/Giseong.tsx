import React, { useEffect, useState } from 'react'
import {
  Card, Table, Select, InputNumber, Button, Tag, Typography, Space, message, Empty,
  Modal, Alert, Descriptions, Statistic
} from 'antd'
import { ExportOutlined, SaveOutlined } from '@ant-design/icons'
import type { Project, GiseongRound, GiseongDetail } from '../../shared/types'

const { Title } = Typography

interface ExportPreviewData {
  round: {
    project_name: string
    client_name: string
    round_no: number
    status: string
    claim_amount: number
  }
  summary: {
    totalDesign: number
    totalCurr: number
    totalCumul: number
    progressPercent: number
    itemCount: number
    changedItems: number
  }
  validation: {
    valid: boolean
    errors: string[]
    warnings: string[]
  }
}

export default function Giseong(): React.ReactElement {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<number | null>(null)
  const [rounds, setRounds] = useState<GiseongRound[]>([])
  const [selectedRound, setSelectedRound] = useState<number | null>(null)
  const [details, setDetails] = useState<GiseongDetail[]>([])
  const [loading, setLoading] = useState(false)
  const [roundInfo, setRoundInfo] = useState<GiseongRound | null>(null)
  const [exportPreview, setExportPreview] = useState<ExportPreviewData | null>(null)
  const [exportPreviewVisible, setExportPreviewVisible] = useState(false)

  useEffect(() => {
    loadProjects()
  }, [])

  async function loadProjects() {
    const data = await window.api.projectList()
    // 기성 가능한 프로젝트만 (시공중 또는 준공서류작성)
    setProjects(data.filter((p: Project) =>
      ['시공중', '준공서류작성', '계약체결', '착공전'].includes(p.status)
    ))
  }

  async function handleProjectSelect(projectId: number) {
    setSelectedProject(projectId)
    setSelectedRound(null)
    setDetails([])
    const data = await window.api.giseongRounds(projectId)
    setRounds(data)
  }

  async function handleRoundSelect(roundId: number) {
    setSelectedRound(roundId)
    setLoading(true)
    try {
      const [round, detailData] = await Promise.all([
        window.api.giseongRoundGet(roundId),
        window.api.giseongDetails(roundId),
      ])
      setRoundInfo(round)
      setDetails(detailData)
    } finally {
      setLoading(false)
    }
  }

  async function handleRateChange(detailId: number, currRate: number) {
    try {
      const updated = await window.api.giseongDetailUpdate(detailId, { curr_rate: currRate })
      setDetails(prev => prev.map(d => d.id === detailId ? updated : d))
      // 회차 총액 갱신
      const round = await window.api.giseongRoundGet(selectedRound!)
      setRoundInfo(round)
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    }
  }

  async function handleExportExcel() {
    if (!selectedRound) return

    try {
      const preview: ExportPreviewData = await window.api.recommendExportPreview(selectedRound)
      setExportPreview(preview)
      setExportPreviewVisible(true)
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    }
  }

  async function handleExportConfirm() {
    if (!selectedRound || !exportPreview) return

    const savePath = await window.api.saveFileDialog({
      defaultPath: `기성내역서_제${roundInfo?.round_no}회.xlsx`,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    })
    if (!savePath) return

    try {
      await window.api.giseongExportExcel(selectedRound, savePath)
      message.success('기성내역서가 저장되었습니다.')
      setExportPreviewVisible(false)
      setExportPreview(null)
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    }
  }

  const totalDesign = details.reduce((sum, d) => sum + (d.total_price || 0), 0)
  const totalCurr = details.reduce((sum, d) => sum + d.curr_amount, 0)
  const totalCumul = details.reduce((sum, d) => sum + d.cumul_amount, 0)

  const columns = [
    {
      title: 'No', key: 'no', width: 45, align: 'center' as const,
      render: (_: unknown, __: unknown, idx: number) => idx + 1
    },
    { title: '공종', dataIndex: 'category', key: 'category', width: 90 },
    { title: '항목명', dataIndex: 'item_name', key: 'item_name', ellipsis: true },
    {
      title: '설계금액', dataIndex: 'total_price', key: 'total_price', width: 110,
      align: 'right' as const,
      render: (v: number) => v?.toLocaleString()
    },
    {
      title: '전회(%)', dataIndex: 'prev_rate', key: 'prev_rate', width: 75,
      align: 'center' as const,
      render: (v: number) => `${v}%`
    },
    {
      title: '전회 금액', dataIndex: 'prev_amount', key: 'prev_amount', width: 110,
      align: 'right' as const,
      render: (v: number) => v.toLocaleString()
    },
    {
      title: '금회(%)', key: 'curr_rate', width: 100,
      render: (_: unknown, record: GiseongDetail) => (
        <InputNumber
          size="small"
          min={0}
          max={100 - record.prev_rate}
          value={record.curr_rate}
          onChange={(value) => {
            if (value !== null) handleRateChange(record.id, value)
          }}
          formatter={v => `${v}%`}
          parser={v => Number(v?.replace('%', '') || 0)}
          style={{ width: '100%' }}
          disabled={roundInfo?.status !== '작성중'}
        />
      )
    },
    {
      title: '금회 금액', dataIndex: 'curr_amount', key: 'curr_amount', width: 110,
      align: 'right' as const,
      render: (v: number) => v.toLocaleString()
    },
    {
      title: '누계(%)', dataIndex: 'cumul_rate', key: 'cumul_rate', width: 75,
      align: 'center' as const,
      render: (v: number) => <span style={{ fontWeight: 'bold' }}>{v}%</span>
    },
    {
      title: '누계 금액', dataIndex: 'cumul_amount', key: 'cumul_amount', width: 110,
      align: 'right' as const,
      render: (v: number) => <strong>{v.toLocaleString()}</strong>
    },
  ]

  return (
    <div>
      <Title level={3}>기성처리</Title>

      <Card style={{ marginBottom: 16 }}>
        <Space size="large">
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
                label: `${p.name} (${p.client_name})`,
                value: p.id
              }))}
            />
          </div>
          <div>
            <div style={{ marginBottom: 4, fontSize: 12, color: '#888' }}>기성 회차</div>
            <Select
              style={{ width: 150 }}
              placeholder="회차 선택"
              value={selectedRound}
              onChange={handleRoundSelect}
              disabled={rounds.length === 0}
              options={rounds.map(r => ({
                label: `제${r.round_no}회`,
                value: r.id
              }))}
            />
          </div>
          {roundInfo && (
            <>
              <div>
                <div style={{ marginBottom: 4, fontSize: 12, color: '#888' }}>상태</div>
                <Tag color={
                  roundInfo.status === '작성중' ? 'blue'
                    : roundInfo.status === '승인완료' ? 'green'
                    : 'orange'
                }>
                  {roundInfo.status}
                </Tag>
              </div>
              <div>
                <div style={{ marginBottom: 4, fontSize: 12, color: '#888' }}>기성금액</div>
                <strong style={{ fontSize: 16 }}>{roundInfo.claim_amount.toLocaleString()}원</strong>
              </div>
            </>
          )}
        </Space>
      </Card>

      {selectedRound && details.length > 0 ? (
        <Card
          title={`기성내역서 - 제${roundInfo?.round_no}회`}
          extra={
            <Button icon={<ExportOutlined />} onClick={handleExportExcel}>
              엑셀 내보내기
            </Button>
          }
        >
          <Table
            dataSource={details}
            columns={columns}
            rowKey="id"
            loading={loading}
            size="small"
            pagination={false}
            scroll={{ y: 500 }}
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={3} align="center">
                    <strong>합 계</strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">
                    <strong>{totalDesign.toLocaleString()}</strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="center">
                    {totalDesign > 0 ? `${Math.round((totalCumul - totalCurr) / totalDesign * 1000) / 10}%` : '-'}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="right">
                    {details.reduce((s, d) => s + d.prev_amount, 0).toLocaleString()}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={6} />
                  <Table.Summary.Cell index={7} align="right">
                    <strong style={{ color: '#1677ff' }}>{totalCurr.toLocaleString()}</strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={8} align="center">
                    <strong>{totalDesign > 0 ? `${Math.round(totalCumul / totalDesign * 1000) / 10}%` : '-'}</strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={9} align="right">
                    <strong>{totalCumul.toLocaleString()}</strong>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
        </Card>
      ) : selectedRound ? (
        <Card><Empty description="설계내역이 없습니다." /></Card>
      ) : (
        <Card><Empty description="프로젝트와 기성 회차를 선택해주세요." /></Card>
      )}

      <Modal
        title="엑셀 내보내기 미리보기"
        open={exportPreviewVisible}
        onOk={handleExportConfirm}
        onCancel={() => {
          setExportPreviewVisible(false)
          setExportPreview(null)
        }}
        okText="내보내기"
        cancelText="취소"
        okButtonProps={{
          disabled: exportPreview?.validation.valid === false
        }}
        width={640}
      >
        {exportPreview && (
          <div>
            <Descriptions
              bordered
              size="small"
              column={2}
              style={{ marginBottom: 16 }}
            >
              <Descriptions.Item label="프로젝트명">
                {exportPreview.round.project_name}
              </Descriptions.Item>
              <Descriptions.Item label="발주처">
                {exportPreview.round.client_name}
              </Descriptions.Item>
              <Descriptions.Item label="회차">
                제{exportPreview.round.round_no}회
              </Descriptions.Item>
              <Descriptions.Item label="상태">
                <Tag color={
                  exportPreview.round.status === '작성중' ? 'blue'
                    : exportPreview.round.status === '승인완료' ? 'green'
                    : 'orange'
                }>
                  {exportPreview.round.status}
                </Tag>
              </Descriptions.Item>
            </Descriptions>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 16,
              marginBottom: 16
            }}>
              <Card size="small">
                <Statistic
                  title="설계금액"
                  value={exportPreview.summary.totalDesign}
                  suffix="원"
                  groupSeparator=","
                />
              </Card>
              <Card size="small">
                <Statistic
                  title="금회 금액"
                  value={exportPreview.summary.totalCurr}
                  suffix="원"
                  groupSeparator=","
                  valueStyle={{ color: '#1677ff' }}
                />
              </Card>
              <Card size="small">
                <Statistic
                  title="누계 금액"
                  value={exportPreview.summary.totalCumul}
                  suffix="원"
                  groupSeparator=","
                />
              </Card>
              <Card size="small">
                <Statistic
                  title="진행률"
                  value={exportPreview.summary.progressPercent}
                  suffix="%"
                  precision={1}
                />
              </Card>
              <Card size="small">
                <Statistic
                  title="항목 수"
                  value={exportPreview.summary.itemCount}
                  suffix="건"
                />
              </Card>
              <Card size="small">
                <Statistic
                  title="변경 항목"
                  value={exportPreview.summary.changedItems}
                  suffix="건"
                  valueStyle={exportPreview.summary.changedItems > 0 ? { color: '#fa8c16' } : undefined}
                />
              </Card>
            </div>

            {exportPreview.validation.errors.length > 0 && (
              <Alert
                type="error"
                message="검증 오류"
                description={
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {exportPreview.validation.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                }
                style={{ marginBottom: 12 }}
                showIcon
              />
            )}

            {exportPreview.validation.warnings.length > 0 && (
              <Alert
                type="warning"
                message="검증 경고"
                description={
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {exportPreview.validation.warnings.map((warn, i) => (
                      <li key={i}>{warn}</li>
                    ))}
                  </ul>
                }
                showIcon
              />
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
