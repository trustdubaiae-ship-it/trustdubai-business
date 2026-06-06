// trustdubai/src/App.jsx
import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import './index.css'
import './styles/theme.css'
import Home from './pages/Home'
import SearchResults from './pages/SearchResults'
import CompanyProfile from './pages/CompanyProfile'
import EmployeeProfile from './pages/EmployeeProfile'
import AddReview from './pages/AddReview'
import AddEmpReview from './pages/AddEmpReview'
import RegisterCompany from './pages/RegisterCompany'
import RegisterEmployee from './pages/RegisterEmployee'
import PublicProfile from './pages/PublicProfile'
import PublicLeadForm from './pages/PublicLeadForm'
import CustomerProfile from './pages/CustomerProfile'
import MyRequests from './pages/MyRequests'
import ServiceArea from './pages/ServiceArea'
import Legal from './pages/Legal'
import BottomNav from './components/BottomNav'
function useIsMobile() {
  const [mobile, setMobile] = useState(
    () => document.documentElement.clientWidth < 481
  )
  useState(() => {
    function check() {
      setMobile(document.documentElement.clientWidth < 481)
    }
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  })
  return mobile
}
export default function App() {
  const [screen, setScreen] = useState('home')
  const [params, setParams] = useState({})
  const isMobile = useIsMobile()
  function navigate(to, p = {}) {
    setScreen(to)
    setParams(p)
    window.scrollTo(0, 0)
  }
  const screenProps = { navigate, params }
  return (
    <div style={{ background:'var(--bg-primary)', minHeight:'100vh' }}>
      <Routes>
        {/* Static / reserved routes — MUST come before the catch-all "/:slug" */}
        <Route path="/terms"   element={<Legal page="terms" />} />
        <Route path="/privacy" element={<Legal page="privacy" />} />
        <Route path="/refund"  element={<Legal page="refund" />} />
        <Route path="/form/:formId" element={<PublicLeadForm />} />
        <Route path="/services/:serviceArea" element={<ServiceArea />} />
        <Route path="/:slug" element={<PublicProfile />} />
        <Route path="/" element={
          <div style={{ paddingBottom: isMobile ? 64 : 0 }}>
            {screen === 'home'              && <Home {...screenProps} />}
            {screen === 'search'            && <SearchResults {...screenProps} />}
            {screen === 'company'           && <CompanyProfile {...screenProps} />}
            {screen === 'employee'          && <EmployeeProfile {...screenProps} />}
            {screen === 'add-review'        && <AddReview {...screenProps} />}
            {screen === 'add-emp-review'    && <AddEmpReview {...screenProps} />}
            {screen === 'register-company'  && <RegisterCompany {...screenProps} />}
            {screen === 'register-employee' && <RegisterEmployee {...screenProps} />}
            {screen === 'customer-profile'  && <CustomerProfile {...screenProps} />}
            {screen === 'my-requests'       && <MyRequests {...screenProps} />}
            {isMobile && <BottomNav screen={screen} navigate={navigate} />}
          </div>
        } />
      </Routes>
    </div>
  )
}
