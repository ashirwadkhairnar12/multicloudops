/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0a0e1a',
          secondary: '#0f1628',
          card: '#131929',
          hover: '#1a2236',
          border: '#1e2d45',
        },
        status: {
          healthy: '#00d68f',
          warning: '#ffcc00',
          critical: '#ff3d71',
          fluctuating: '#ff8c00',
          stopped: '#6b7280',
        },
        cloud: {
          aws: '#ff9900',
          azure: '#0089d6',
          gcp: '#4285f4',
          oracle: '#f80000',
          k8s: '#326ce5',
          onprem: '#8b5cf6',
        },
        accent: '#00b4d8',
        muted: '#4a5568',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        display: ['Syne', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'blink': 'blink 1s step-end infinite',
        'slide-in': 'slideIn 0.3s ease-out',
        'fade-in': 'fadeIn 0.4s ease-out',
      },
      keyframes: {
        blink: { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0 } },
        slideIn: { from: { transform: 'translateX(-10px)', opacity: 0 }, to: { transform: 'translateX(0)', opacity: 1 } },
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
      }
    },
  },
  plugins: [],
}
