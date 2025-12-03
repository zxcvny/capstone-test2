import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Layout from './components/Layout'
import Home from './pages/sidebar/Home'
import LoginPage from './pages/auth/LoginPage'
import SignUpPage from './pages/auth/SignUpPage'
import SocialCallbackPage from './pages/auth/SocialCallbackPage'
import MyInfo from './pages/sidebar/MyInfo'

function App() {

  return (
    <AuthProvider>
      <Routes>
        <Route path='/' element={<Layout />}>
          <Route index element={<Home />} />
          <Route path='/myinfo' element={<MyInfo />} />
        </Route>
        <Route path='/login' element={<LoginPage />} />
        <Route path='/signup' element={<SignUpPage />} />
        <Route path='/social/callback' element={<SocialCallbackPage />} />
      </Routes>
    </AuthProvider>
  )
}

export default App
