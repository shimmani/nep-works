import React, { useEffect, useState } from 'react'
import {
  Table, Button, Tag, Space, Typography, Modal, Form, Input, Select,
  InputNumber, DatePicker, message, Popconfirm, Alert
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import type { Project, Client, ContractType, ContractMethod, ProjectStatus } from '../../shared/types'

const { Title } = Typography
const { RangePicker } = DatePicker

const statusColors: Record<string, string> = {
  '입찰중': 'blue', '계약체결': 'cyan', '착공전': 'geekblue',
  '시공중': 'orange', '준공서류작성': 'gold', '준공검사': 'lime',
  '준공완료': 'green', '하자보증중': 'purple', '완료': 'default',
}

const contractTypes: ContractType[] = ['종합', '전문', '일반', '용역']
const contractMethods: ContractMethod[] = ['입찰', '수의계약']
const projectStatuses: ProjectStatus[] = [
  '입찰중', '계약체결', '착공전', '시공중', '준공서류작성',
  '준공검사', '준공완료', '하자보증중', '완료'
]

interface Recommendation {
  hasHistory: boolean
  projectCount: number
  recommended: {
    contract_type: ContractType
    contract_method: ContractMethod
    avg_amount: number
    avg_duration_days: number
  }
  customDefaults: Record<string, unknown> | null
}

export default function Projects(): React.ReactElement {
  const [projects, setProjects] = useState<Project[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null)
  const [form] = Form.useForm()
  const navigate = useNavigate()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [projectData, clientData] = await Promise.all([
        window.api.projectList(),
        window.api.clientList(),
      ])
      setProjects(projectData)
      setClients(clientData)
    } catch {
      // empty
    } finally {
      setLoading(false)
    }
  }

  function openCreate() {
    form.resetFields()
    form.setFieldsValue({
      contract_type: '일반',
      contract_method: '수의계약',
      status: '계약체결',
      vat_included: 1,
    })
    setEditingId(null)
    setRecommendation(null)
    setModalOpen(true)
  }

  function openEdit(record: Project) {
    form.setFieldsValue({
      ...record,
      period: record.start_date && record.end_date
        ? [dayjs(record.start_date), dayjs(record.end_date)]
        : undefined,
    })
    setEditingId(record.id)
    setRecommendation(null)
    setModalOpen(true)
  }

  async function handleClientChange(clientId: number) {
    try {
      const result = await window.api.recommendProjectDefaults(clientId)
      if (result.hasHistory) {
        setRecommendation(result)
      } else {
        setRecommendation(null)
      }
    } catch {
      setRecommendation(null)
    }
  }

  function applyRecommendation() {
    if (!recommendation) return
    const { recommended } = recommendation
    form.setFieldsValue({
      contract_type: recommended.contract_type,
      contract_method: recommended.contract_method,
      contract_amount: Math.round(recommended.avg_amount),
    })
    setRecommendation(null)
    message.info('추천 값이 적용되었습니다.')
  }

  async function handleSave() {
    try {
      const values = await form.validateFields()
      const data = {
        ...values,
        start_date: values.period?.[0]?.format('YYYY-MM-DD') || null,
        end_date: values.period?.[1]?.format('YYYY-MM-DD') || null,
        warranty_end_date: values.warranty_end_date || null,
        folder_path: values.folder_path || null,
        notes: values.notes || null,
      }
      delete data.period

      // Validation
      const validation = await window.api.projectValidate(data)
      if (!validation.valid && validation.errors.length > 0) {
        validation.errors.forEach((err: string) => message.error(err))
        return
      }

      if (validation.warnings.length > 0) {
        const confirmed = await new Promise<boolean>((resolve) => {
          Modal.confirm({
            title: '확인 필요',
            content: (
              <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
                {validation.warnings.map((w: string, i: number) => (
                  <li key={i} style={{ color: '#faad14' }}>{w}</li>
                ))}
              </ul>
            ),
            okText: '계속 진행',
            cancelText: '취소',
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
          })
        })
        if (!confirmed) return
      }

      if (editingId) {
        await window.api.projectUpdate(editingId, data)
        message.success('프로젝트가 수정되었습니다.')
      } else {
        await window.api.projectCreate(data)
        message.success('프로젝트가 등록되었습니다.')
      }
      setModalOpen(false)
      loadData()
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    }
  }

  async function handleDelete(id: number) {
    try {
      await window.api.projectDelete(id)
      message.success('프로젝트가 삭제되었습니다.')
      loadData()
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    }
  }

  const columns = [
    {
      title: '공사명',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: Project) => (
        <a onClick={() => navigate(`/projects/${record.id}`)}>{text}</a>
      )
    },
    { title: '발주처', dataIndex: 'client_name', key: 'client_name', width: 120 },
    { title: '계약방식', dataIndex: 'contract_method', key: 'contract_method', width: 90 },
    {
      title: '계약금액',
      dataIndex: 'contract_amount',
      key: 'contract_amount',
      width: 140,
      render: (v: number) => `${v.toLocaleString()}원`,
      align: 'right' as const,
    },
    {
      title: '상태',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (s: string) => <Tag color={statusColors[s]}>{s}</Tag>
    },
    {
      title: '계약기간',
      key: 'period',
      width: 200,
      render: (_: unknown, r: Project) =>
        r.start_date && r.end_date ? `${r.start_date} ~ ${r.end_date}` : '-'
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_: unknown, record: Project) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <div>
      <div className="page-header">
        <Title level={3}>프로젝트 관리</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          새 프로젝트
        </Button>
      </div>

      <Table
        dataSource={projects}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={{ pageSize: 20 }}
      />

      <Modal
        title={editingId ? '프로젝트 수정' : '새 프로젝트'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => { setModalOpen(false); setRecommendation(null) }}
        width={700}
        okText="저장"
        cancelText="취소"
      >
        <Form form={form} layout="vertical" size="small">
          <Form.Item name="client_id" label="발주처" rules={[{ required: true, message: '발주처를 선택하세요' }]}>
            <Select placeholder="발주처 선택" showSearch optionFilterProp="label"
              options={clients.map(c => ({ label: `${c.name} (${c.region})`, value: c.id }))}
              onChange={handleClientChange}
            />
          </Form.Item>
          {recommendation && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={`이 발주처의 이전 프로젝트 ${recommendation.projectCount}건 기준 추천`}
              description={
                <div>
                  <span>계약유형: <strong>{recommendation.recommended.contract_type}</strong></span>
                  {' / '}
                  <span>계약방식: <strong>{recommendation.recommended.contract_method}</strong></span>
                  {' / '}
                  <span>평균 금액: <strong>{Math.round(recommendation.recommended.avg_amount).toLocaleString()}원</strong></span>
                  <Button type="link" size="small" onClick={applyRecommendation} style={{ marginLeft: 8 }}>
                    적용
                  </Button>
                </div>
              }
            />
          )}
          <Form.Item name="name" label="공사명" rules={[{ required: true, message: '공사명을 입력하세요' }]}>
            <Input placeholder="시설물 유지보수 공사" />
          </Form.Item>
          <Space size="large">
            <Form.Item name="contract_type" label="계약유형">
              <Select style={{ width: 120 }} options={contractTypes.map(t => ({ label: t, value: t }))} />
            </Form.Item>
            <Form.Item name="contract_method" label="계약방식">
              <Select style={{ width: 120 }} options={contractMethods.map(m => ({ label: m, value: m }))} />
            </Form.Item>
            <Form.Item name="status" label="상태">
              <Select style={{ width: 130 }} options={projectStatuses.map(s => ({ label: s, value: s }))} />
            </Form.Item>
          </Space>
          <Form.Item name="contract_amount" label="계약금액 (원)" rules={[{ required: true }]}>
            <InputNumber
              style={{ width: '100%' }}
              formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={v => Number(v?.replace(/,/g, '') || 0)}
              placeholder="100,000,000"
            />
          </Form.Item>
          <Form.Item name="period" label="계약기간">
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notes" label="비고">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
