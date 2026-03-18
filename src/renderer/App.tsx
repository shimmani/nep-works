import React from 'react'
import { HashRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu } from 'antd'
import {
  DashboardOutlined,
  ProjectOutlined,
  CalculatorOutlined,
  FileProtectOutlined,
  TeamOutlined,
  AuditOutlined,
  SettingOutlined,
  BankOutlined,
} from '@ant-design/icons'
import Dashboard from './pages/Dashboard'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import Clients from './pages/Clients'
import Giseong from './pages/Giseong'
import Labor from './pages/Labor'
import Jungong from './pages/Jungong'
import Settings from './pages/Settings'

const { Sider, Content } = Layout

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: '대시보드' },
  { key: '/projects', icon: <ProjectOutlined />, label: '프로젝트' },
  { key: '/clients', icon: <BankOutlined />, label: '발주처' },
  { key: '/giseong', icon: <CalculatorOutlined />, label: '기성처리' },
  { key: '/jungong', icon: <FileProtectOutlined />, label: '준공서류' },
  { key: '/labor', icon: <TeamOutlined />, label: '일용직 노무비' },
  { key: '/bidding', icon: <AuditOutlined />, label: '입찰/계약' },
  { key: '/settings', icon: <SettingOutlined />, label: '설정' },
]

function AppLayout(): React.ReactElement {
  const navigate = useNavigate()
  const location = useLocation()

  const selectedKey = menuItems
    .filter(item => location.pathname.startsWith(item.key) && item.key !== '/')
    .sort((a, b) => b.key.length - a.key.length)[0]?.key || '/'

  return (
    <Layout className="app-layout">
      <Sider width={200} className="app-sider">
        <div className="logo">NEP-WORKS</div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0 }}
        />
      </Sider>
      <Content className="app-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/giseong" element={<Giseong />} />
          <Route path="/jungong" element={<Jungong />} />
          <Route path="/labor" element={<Labor />} />
          <Route path="/bidding" element={<div><h2>입찰/계약 (Phase 3)</h2></div>} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Content>
    </Layout>
  )
}

export default function App(): React.ReactElement {
  return (
    <HashRouter>
      <AppLayout />
    </HashRouter>
  )
}
