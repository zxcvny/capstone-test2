import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Layout from './components/Layout'
import Home from './pages/sidebar/Home'
import MyInvestList from './pages/sidebar/MyInvestList'
import MyFavorite from './pages/sidebar/MyFavorite'
import MyInfo from './pages/sidebar/MyInfo'
import StockDetailPage from './pages/StockDetailPage'
import LoginPage from './pages/auth/LoginPage'
import SignUpPage from './pages/auth/SignUpPage'
import SocialCallbackPage from './pages/auth/SocialCallbackPage'

function App() {

  return (
    <AuthProvider>
      <Routes>
        <Route path='/' element={<Layout />}>
          <Route index element={<Home />} />
          <Route path='/myfavorite' element={<MyFavorite />} />
          <Route path='/myinvestlist' element={<MyInvestList />} />
          <Route path='/myinfo' element={<MyInfo />} />
          <Route path='/stock/:market/:stockId' element={<StockDetailPage />} />
        </Route>
        <Route path='/login' element={<LoginPage />} />
        <Route path='/signup' element={<SignUpPage />} />
        <Route path='/social/callback' element={<SocialCallbackPage />} />
      </Routes>
    </AuthProvider>
  )
}

export default App
