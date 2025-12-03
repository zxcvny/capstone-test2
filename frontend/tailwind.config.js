/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Zero to Mars Palette (초기 제안 색상 코드와 일치)
        deep: '#0b0d17',       // --bg-deep
        surface: '#151922',    // --bg-surface
        hover: '#1c212e',      // --bg-hover
        border: '#2a3040',     // --border-color
        
        mars: {
          red: '#ff4d4d',      // --mars-red
          dark: '#c0392b',
        },
        space: {
          blue: '#3399ff',     // --space-blue
        },
        
        txt: {
          main: '#ffffff',     // --text-main
          sub: '#8b9bb4',      // --text-sub
        }
      },
      fontFamily: {
        sans: ['Pretendard', 'sans-serif'], // 기본 폰트 설정
      },
      // AuthPage 배경 그라디언트 그대로 적용
      backgroundImage: {
        'auth-gradient': 'radial-gradient(circle at 50% -20%, #1a233a 0%, #0b0d17 100%)',
        'banner-gradient': 'linear-gradient(135deg, #151922 0%, #1a1f2e 100%)',
      },
      boxShadow: {
        'neon-red': '0 0 10px rgba(255, 77, 77, 0.4)',
        'neon-blue': '0 0 10px rgba(51, 153, 255, 0.4)',
        'card': '0 20px 50px rgba(0, 0, 0, 0.5)',
      }
    },
  },
  plugins: [],
}