import React, { useEffect, useState, useCallback } from 'react'
import {
  Table, Button, Tag, Space, Typography, Modal, Form, Input, Select,
  InputNumber, DatePicker, message, Popconfirm, Tabs
} from 'antd'
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ExportOutlined,
  CalculatorOutlined, CopyOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import type { ColumnsType } from 'antd/es/table'
import type {
  Worker, Project, LaborAssign, Payroll, JobType, WorkType
} from '../../shared/types'

const { Title } = Typography

const jobTypes: JobType[] = ['보통인부', '특별인부', '기능공', '준기능공', '기타']
const workTypes: WorkType[] = ['일반', '반일', '야간', '특근']

const wonFormat = (v: number) => `${v.toLocaleString()}원`

export default function Labor(): React.ReactElement {
  // --- shared state ---
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [selectedMonth, setSelectedMonth] = useState<dayjs.Dayjs>(dayjs())
  const [activeTab, setActiveTab] = useState('workers')

  // --- Tab 1: 근로자 관리 ---
  const [workers, setWorkers] = useState<Worker[]>([])
  const [workersLoading, setWorkersLoading] = useState(false)
  const [workerModalOpen, setWorkerModalOpen] = useState(false)
  const [editingWorkerId, setEditingWorkerId] = useState<number | null>(null)
  const [workerForm] = Form.useForm()

  // --- Tab 2: 출역 관리 ---
  const [laborList, setLaborList] = useState<LaborAssign[]>([])
  const [laborLoading, setLaborLoading] = useState(false)
  const [laborModalOpen, setLaborModalOpen] = useState(false)
  const [laborForm] = Form.useForm()
  const [copyDate, setCopyDate] = useState<dayjs.Dayjs | null>(null)
  const [copyModalOpen, setCopyModalOpen] = useState(false)
  const [copyForm] = Form.useForm()

  // --- Tab 3: 급여 계산 ---
  const [payrollList, setPayrollList] = useState<Payroll[]>([])
  const [payrollLoading, setPayrollLoading] = useState(false)
  const [payrollWarnings, setPayrollWarnings] = useState<string[]>([])

  // --- load projects ---
  useEffect(() => {
    window.api.projectList().then(setProjects).catch(() => {})
  }, [])

  // --- load workers ---
  const loadWorkers = useCallback(async () => {
    setWorkersLoading(true)
    try {
      const data = await window.api.workerList()
      setWorkers(data)
    } catch {
      // empty
    } finally {
      setWorkersLoading(false)
    }
  }, [])

  useEffect(() => {
    loadWorkers()
  }, [loadWorkers])

  // --- load labor ---
  const loadLabor = useCallback(async () => {
    if (!selectedProjectId) return
    setLaborLoading(true)
    try {
      const yearMonth = selectedMonth.format('YYYY-MM')
      const data = await window.api.laborList(selectedProjectId, yearMonth)
      setLaborList(data)
    } catch {
      // empty
    } finally {
      setLaborLoading(false)
    }
  }, [selectedProjectId, selectedMonth])

  useEffect(() => {
    if (activeTab === 'labor') loadLabor()
  }, [activeTab, loadLabor])

  // =====================
  // Tab 1: 근로자 관리
  // =====================
  function openWorkerCreate() {
    workerForm.resetFields()
    setEditingWorkerId(null)
    setWorkerModalOpen(true)
  }

  function openWorkerEdit(record: Worker) {
    workerForm.setFieldsValue(record)
    setEditingWorkerId(record.id)
    setWorkerModalOpen(true)
  }

  async function handleWorkerSave() {
    try {
      const values = await workerForm.validateFields()
      if (editingWorkerId) {
        await window.api.workerUpdate(editingWorkerId, values)
        message.success('근로자 정보가 수정되었습니다.')
      } else {
        await window.api.workerCreate(values)
        message.success('근로자가 등록되었습니다.')
      }
      setWorkerModalOpen(false)
      loadWorkers()
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    }
  }

  async function handleWorkerDelete(id: number) {
    try {
      await window.api.workerDelete(id)
      message.success('근로자가 삭제되었습니다.')
      loadWorkers()
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    }
  }

  async function handleToggleActive(id: number) {
    try {
      await window.api.workerToggleActive(id)
      loadWorkers()
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    }
  }

  const workerColumns: ColumnsType<Worker> = [
    { title: '이름', dataIndex: 'name', key: 'name', width: 100 },
    { title: '직종', dataIndex: 'job_type', key: 'job_type', width: 100 },
    {
      title: '기본 일당',
      dataIndex: 'default_wage',
      key: 'default_wage',
      width: 130,
      align: 'right',
      render: (v: number) => wonFormat(v),
    },
    { title: '연락처', dataIndex: 'phone', key: 'phone', width: 140 },
    {
      title: '상태',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 80,
      render: (active: boolean) => (
        <Tag color={active ? 'green' : 'default'}>{active ? '활성' : '비활성'}</Tag>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 140,
      render: (_: unknown, record: Worker) => (
        <Space>
          <Button
            type="link"
            size="small"
            onClick={() => handleToggleActive(record.id)}
          >
            {record.is_active ? '비활성' : '활성'}
          </Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openWorkerEdit(record)} />
          <Popconfirm
            title="삭제하시겠습니까?"
            description="출역 기록이 있는 근로자는 삭제가 불가할 수 있습니다."
            onConfirm={() => handleWorkerDelete(record.id)}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  // =====================
  // Tab 2: 출역 관리
  // =====================
  function openLaborCreate() {
    if (!selectedProjectId) {
      message.warning('프로젝트를 먼저 선택하세요.')
      return
    }
    laborForm.resetFields()
    laborForm.setFieldsValue({
      work_type: '일반',
      day_fraction: 1,
    })
    setLaborModalOpen(true)
  }

  async function handleLaborSave() {
    try {
      const values = await laborForm.validateFields()
      const data = {
        project_id: selectedProjectId!,
        worker_id: values.worker_id,
        work_date: values.work_date.format('YYYY-MM-DD'),
        work_type: values.work_type,
        day_fraction: values.day_fraction,
        daily_wage: values.daily_wage,
        notes: values.notes || null,
      }
      await window.api.laborCreate(data)
      message.success('출역이 등록되었습니다.')
      setLaborModalOpen(false)
      loadLabor()
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    }
  }

  async function handleLaborDelete(id: number) {
    try {
      await window.api.laborDelete(id)
      message.success('출역 기록이 삭제되었습니다.')
      loadLabor()
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    }
  }

  function openCopyDay() {
    if (!selectedProjectId) {
      message.warning('프로젝트를 먼저 선택하세요.')
      return
    }
    copyForm.resetFields()
    setCopyModalOpen(true)
  }

  async function handleCopyDay() {
    try {
      const values = await copyForm.validateFields()
      const fromDate = values.from_date.format('YYYY-MM-DD')
      const toDate = values.to_date.format('YYYY-MM-DD')
      const result = await window.api.laborCopyDay(selectedProjectId!, fromDate, toDate)
      message.success(`${result.created}건의 출역이 복사되었습니다.`)
      setCopyModalOpen(false)
      loadLabor()
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    }
  }

  function handleWorkerSelect(workerId: number) {
    const worker = workers.find(w => w.id === workerId)
    if (worker) {
      laborForm.setFieldsValue({ daily_wage: worker.default_wage })
    }
  }

  const laborColumns: ColumnsType<LaborAssign> = [
    { title: '날짜', dataIndex: 'work_date', key: 'work_date', width: 120 },
    { title: '근로자', dataIndex: 'worker_name', key: 'worker_name', width: 100 },
    { title: '근무유형', dataIndex: 'work_type', key: 'work_type', width: 90 },
    {
      title: '일수',
      dataIndex: 'day_fraction',
      key: 'day_fraction',
      width: 70,
      align: 'right',
    },
    {
      title: '일당',
      dataIndex: 'daily_wage',
      key: 'daily_wage',
      width: 130,
      align: 'right',
      render: (v: number) => wonFormat(v),
    },
    { title: '비고', dataIndex: 'notes', key: 'notes' },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_: unknown, record: LaborAssign) => (
        <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleLaborDelete(record.id)}>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ]

  // =====================
  // Tab 3: 급여 계산
  // =====================
  async function handlePayrollCalculate() {
    if (!selectedProjectId) {
      message.warning('프로젝트를 먼저 선택하세요.')
      return
    }
    setPayrollLoading(true)
    try {
      const yearMonth = selectedMonth.format('YYYY-MM')
      const result = await window.api.payrollCalculate(selectedProjectId, yearMonth)
      setPayrollList(result.records)
      setPayrollWarnings(result.warnings || [])
      if (result.warnings?.length > 0) {
        result.warnings.forEach((w: string) => message.warning(w))
      }
      message.success('급여가 계산되었습니다.')
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    } finally {
      setPayrollLoading(false)
    }
  }

  async function handleLoadPayroll() {
    if (!selectedProjectId) return
    setPayrollLoading(true)
    try {
      const yearMonth = selectedMonth.format('YYYY-MM')
      const data = await window.api.payrollList(selectedProjectId, yearMonth)
      setPayrollList(data)
    } catch {
      // empty
    } finally {
      setPayrollLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'payroll' && selectedProjectId) {
      handleLoadPayroll()
    }
  }, [activeTab, selectedProjectId, selectedMonth])

  async function handleExportExcel() {
    if (!selectedProjectId) return
    try {
      const yearMonth = selectedMonth.format('YYYY-MM')
      const savePath = await window.api.saveFileDialog({
        title: '급여대장 엑셀 저장',
        defaultPath: `급여대장_${yearMonth}.xlsx`,
        filters: [{ name: 'Excel', extensions: ['xlsx'] }],
      })
      if (!savePath) return
      const result = await window.api.payrollExportExcel(selectedProjectId, yearMonth, savePath)
      if (result.success) {
        message.success('엑셀 파일이 저장되었습니다.')
      }
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    }
  }

  const payrollColumns: ColumnsType<Payroll> = [
    { title: '근로자', dataIndex: 'worker_name', key: 'worker_name', width: 100 },
    { title: '근무일수', dataIndex: 'work_days', key: 'work_days', width: 80, align: 'right' },
    { title: '총액', dataIndex: 'gross_pay', key: 'gross_pay', width: 120, align: 'right', render: (v: number) => wonFormat(v) },
    { title: '국민연금', dataIndex: 'nat_pension', key: 'nat_pension', width: 100, align: 'right', render: (v: number) => wonFormat(v) },
    { title: '건강보험', dataIndex: 'health_ins', key: 'health_ins', width: 100, align: 'right', render: (v: number) => wonFormat(v) },
    { title: '장기요양', dataIndex: 'long_care_ins', key: 'long_care_ins', width: 100, align: 'right', render: (v: number) => wonFormat(v) },
    { title: '고용보험', dataIndex: 'employ_ins', key: 'employ_ins', width: 100, align: 'right', render: (v: number) => wonFormat(v) },
    { title: '소득세', dataIndex: 'income_tax', key: 'income_tax', width: 100, align: 'right', render: (v: number) => wonFormat(v) },
    { title: '지방소득세', dataIndex: 'local_tax', key: 'local_tax', width: 100, align: 'right', render: (v: number) => wonFormat(v) },
    { title: '실지급액', dataIndex: 'net_pay', key: 'net_pay', width: 130, align: 'right', render: (v: number) => wonFormat(v) },
  ]

  const payrollSummary = () => {
    if (payrollList.length === 0) return null
    const sum = payrollList.reduce(
      (acc, r) => ({
        work_days: acc.work_days + r.work_days,
        gross_pay: acc.gross_pay + r.gross_pay,
        nat_pension: acc.nat_pension + r.nat_pension,
        health_ins: acc.health_ins + r.health_ins,
        long_care_ins: acc.long_care_ins + r.long_care_ins,
        employ_ins: acc.employ_ins + r.employ_ins,
        income_tax: acc.income_tax + r.income_tax,
        local_tax: acc.local_tax + r.local_tax,
        net_pay: acc.net_pay + r.net_pay,
      }),
      {
        work_days: 0, gross_pay: 0, nat_pension: 0, health_ins: 0,
        long_care_ins: 0, employ_ins: 0, income_tax: 0, local_tax: 0, net_pay: 0,
      }
    )
    return (
      <Table.Summary fixed>
        <Table.Summary.Row>
          <Table.Summary.Cell index={0}><strong>합계</strong></Table.Summary.Cell>
          <Table.Summary.Cell index={1} align="right"><strong>{sum.work_days}</strong></Table.Summary.Cell>
          <Table.Summary.Cell index={2} align="right"><strong>{wonFormat(sum.gross_pay)}</strong></Table.Summary.Cell>
          <Table.Summary.Cell index={3} align="right"><strong>{wonFormat(sum.nat_pension)}</strong></Table.Summary.Cell>
          <Table.Summary.Cell index={4} align="right"><strong>{wonFormat(sum.health_ins)}</strong></Table.Summary.Cell>
          <Table.Summary.Cell index={5} align="right"><strong>{wonFormat(sum.long_care_ins)}</strong></Table.Summary.Cell>
          <Table.Summary.Cell index={6} align="right"><strong>{wonFormat(sum.employ_ins)}</strong></Table.Summary.Cell>
          <Table.Summary.Cell index={7} align="right"><strong>{wonFormat(sum.income_tax)}</strong></Table.Summary.Cell>
          <Table.Summary.Cell index={8} align="right"><strong>{wonFormat(sum.local_tax)}</strong></Table.Summary.Cell>
          <Table.Summary.Cell index={9} align="right"><strong>{wonFormat(sum.net_pay)}</strong></Table.Summary.Cell>
        </Table.Summary.Row>
      </Table.Summary>
    )
  }

  // --- Project/Month selector ---
  const projectMonthSelector = (
    <Space style={{ marginBottom: 16 }}>
      <Select
        placeholder="프로젝트 선택"
        style={{ width: 280 }}
        value={selectedProjectId}
        onChange={setSelectedProjectId}
        showSearch
        optionFilterProp="label"
        options={projects.map(p => ({ label: p.name, value: p.id }))}
      />
      <DatePicker
        picker="month"
        value={selectedMonth}
        onChange={(v) => { if (v) setSelectedMonth(v) }}
        allowClear={false}
      />
    </Space>
  )

  const tabItems = [
    {
      key: 'workers',
      label: '근로자 관리',
      children: (
        <div>
          <div className="page-header">
            <span />
            <Button type="primary" icon={<PlusOutlined />} onClick={openWorkerCreate}>
              근로자 등록
            </Button>
          </div>
          <Table
            dataSource={workers}
            columns={workerColumns}
            rowKey="id"
            loading={workersLoading}
            size="small"
            pagination={{ pageSize: 20 }}
          />
        </div>
      ),
    },
    {
      key: 'labor',
      label: '출역 관리',
      children: (
        <div>
          {projectMonthSelector}
          <div className="page-header">
            <span />
            <Space>
              <Button icon={<CopyOutlined />} onClick={openCopyDay}>
                전일 복사
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={openLaborCreate}>
                출역 등록
              </Button>
            </Space>
          </div>
          <Table
            dataSource={laborList}
            columns={laborColumns}
            rowKey="id"
            loading={laborLoading}
            size="small"
            pagination={{ pageSize: 31 }}
          />
        </div>
      ),
    },
    {
      key: 'payroll',
      label: '급여 계산',
      children: (
        <div>
          {projectMonthSelector}
          <div className="page-header">
            <span />
            <Space>
              <Button
                type="primary"
                icon={<CalculatorOutlined />}
                onClick={handlePayrollCalculate}
                loading={payrollLoading}
              >
                급여 계산
              </Button>
              <Button
                icon={<ExportOutlined />}
                onClick={handleExportExcel}
                disabled={payrollList.length === 0}
              >
                엑셀 내보내기
              </Button>
            </Space>
          </div>
          <Table
            dataSource={payrollList}
            columns={payrollColumns}
            rowKey="id"
            loading={payrollLoading}
            size="small"
            pagination={false}
            scroll={{ x: 1100 }}
            summary={payrollSummary}
          />
        </div>
      ),
    },
  ]

  return (
    <div>
      <div className="page-header">
        <Title level={3}>노무 관리</Title>
      </div>

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />

      {/* 근로자 등록/수정 모달 */}
      <Modal
        title={editingWorkerId ? '근로자 수정' : '근로자 등록'}
        open={workerModalOpen}
        onOk={handleWorkerSave}
        onCancel={() => setWorkerModalOpen(false)}
        width={500}
        okText="저장"
        cancelText="취소"
      >
        <Form form={workerForm} layout="vertical" size="small">
          <Form.Item name="name" label="이름" rules={[{ required: true, message: '이름을 입력하세요' }]}>
            <Input placeholder="홍길동" />
          </Form.Item>
          <Form.Item name="job_type" label="직종" rules={[{ required: true, message: '직종을 선택하세요' }]}>
            <Select
              placeholder="직종 선택"
              options={jobTypes.map(t => ({ label: t, value: t }))}
            />
          </Form.Item>
          <Form.Item name="default_wage" label="기본 일당 (원)" rules={[{ required: true, message: '일당을 입력하세요' }]}>
            <InputNumber
              style={{ width: '100%' }}
              formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={v => Number(v?.replace(/,/g, '') || 0)}
              placeholder="150,000"
            />
          </Form.Item>
          <Form.Item name="phone" label="연락처">
            <Input placeholder="010-1234-5678" />
          </Form.Item>
          <Form.Item name="resident_no" label="주민등록번호" rules={[{ required: true, message: '주민등록번호를 입력하세요' }]}>
            <Input placeholder="000000-0000000" />
          </Form.Item>
          <Form.Item name="bank_name" label="은행명" rules={[{ required: true, message: '은행명을 입력하세요' }]}>
            <Input placeholder="국민은행" />
          </Form.Item>
          <Form.Item name="bank_account" label="계좌번호" rules={[{ required: true, message: '계좌번호를 입력하세요' }]}>
            <Input placeholder="000-000000-00-000" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 출역 등록 모달 */}
      <Modal
        title="출역 등록"
        open={laborModalOpen}
        onOk={handleLaborSave}
        onCancel={() => setLaborModalOpen(false)}
        width={500}
        okText="저장"
        cancelText="취소"
      >
        <Form form={laborForm} layout="vertical" size="small">
          <Form.Item name="worker_id" label="근로자" rules={[{ required: true, message: '근로자를 선택하세요' }]}>
            <Select
              placeholder="근로자 선택"
              showSearch
              optionFilterProp="label"
              options={workers
                .filter(w => w.is_active)
                .map(w => ({ label: `${w.name} (${w.job_type})`, value: w.id }))}
              onChange={handleWorkerSelect}
            />
          </Form.Item>
          <Form.Item name="work_date" label="날짜" rules={[{ required: true, message: '날짜를 선택하세요' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="work_type" label="근무유형" rules={[{ required: true }]}>
            <Select options={workTypes.map(t => ({ label: t, value: t }))} />
          </Form.Item>
          <Form.Item name="day_fraction" label="일수" rules={[{ required: true }]}>
            <InputNumber min={0.5} max={2} step={0.5} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="daily_wage" label="일당 (원)" rules={[{ required: true, message: '일당을 입력하세요' }]}>
            <InputNumber
              style={{ width: '100%' }}
              formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={v => Number(v?.replace(/,/g, '') || 0)}
            />
          </Form.Item>
          <Form.Item name="notes" label="비고">
            <Input placeholder="비고" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 전일 복사 모달 */}
      <Modal
        title="전일 복사"
        open={copyModalOpen}
        onOk={handleCopyDay}
        onCancel={() => setCopyModalOpen(false)}
        width={400}
        okText="복사"
        cancelText="취소"
      >
        <Form form={copyForm} layout="vertical" size="small">
          <Form.Item name="from_date" label="복사할 날짜 (원본)" rules={[{ required: true, message: '원본 날짜를 선택하세요' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="to_date" label="붙여넣을 날짜 (대상)" rules={[{ required: true, message: '대상 날짜를 선택하세요' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
