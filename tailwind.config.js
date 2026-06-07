/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary cyberpunk color palette
        gold: {
          DEFAULT: '#F4B942',
          light: '#FFD666',
          dark: '#D4A137',
        },
        cyber: {
          DEFAULT: '#00D9FF',
          light: '#33E3FF',
          dark: '#00B8D4',
        },
        // Background colors
        bg: {
          primary: '#0a0a0a',
          secondary: '#1a1a1a',
          tertiary: '#2a2a2a',
        },
        // Border colors
        border: {
          DEFAULT: '#333333',
          light: '#444444',
          dark: '#2a2a2a',
        },
        // Text colors
        text: {
          primary: '#eeeeee',
          secondary: '#dddddd',
          muted: '#888888',
          light: '#aaaaaa',
        },
        // Status colors
        success: '#4ade80',
        warning: '#ff9800',
        danger: '#ff4444',
        error: '#dc3545',
      },
      fontFamily: {
        custom: ['InpinHongMeti', 'sans-serif'],
      },
      boxShadow: {
        'neon-gold': '0 0 10px rgba(244, 185, 66, 0.5), 0 0 20px rgba(244, 185, 66, 0.3), 0 0 30px rgba(244, 185, 66, 0.2)',
        'neon-gold-lg': '0 0 15px rgba(244, 185, 66, 0.6), 0 0 30px rgba(244, 185, 66, 0.4), 0 0 45px rgba(244, 185, 66, 0.3)',
        'neon-cyan': '0 0 10px rgba(0, 217, 255, 0.5), 0 0 20px rgba(0, 217, 255, 0.3), 0 0 30px rgba(0, 217, 255, 0.2)',
        'neon-cyan-lg': '0 0 15px rgba(0, 217, 255, 0.6), 0 0 30px rgba(0, 217, 255, 0.4), 0 0 45px rgba(0, 217, 255, 0.3)',
        'card': '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)',
        'card-hover': '0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -2px rgba(0, 0, 0, 0.3)',
        'glow': '0 0 20px rgba(244, 185, 66, 0.4)',
      },
      backgroundImage: {
        'gradient-gold': 'linear-gradient(135deg, #F4B942 0%, #FFD666 100%)',
        'gradient-cyber': 'linear-gradient(135deg, #00D9FF 0%, #0099CC 100%)',
        'gradient-purple': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        'gradient-danger': 'linear-gradient(135deg, #ff4757 0%, #dc3545 100%)',
        'grid-pattern': 'repeating-linear-gradient(0deg, transparent, transparent 49px, rgba(244, 185, 66, 0.1) 49px, rgba(244, 185, 66, 0.1) 50px), repeating-linear-gradient(90deg, transparent, transparent 49px, rgba(244, 185, 66, 0.1) 49px, rgba(244, 185, 66, 0.1) 50px)',
      },
      animation: {
        'neon-pulse': 'neon-pulse 2s ease-in-out infinite',
        'neon-pulse-cyan': 'neon-pulse-cyan 2s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'scanline': 'scanline 6s linear infinite',
        'glow-intensify': 'glow-intensify 2s ease-in-out infinite',
        'spin-slow': 'spin 3s linear infinite',
        'float': 'float 3s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'slide-in': 'slideIn 0.3s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
        'fade-in-up': 'fadeInUp 0.5s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
      },
      keyframes: {
        'neon-pulse': {
          '0%, 100%': {
            boxShadow: '0 0 5px rgba(244, 185, 66, 0.5), 0 0 10px rgba(244, 185, 66, 0.3), 0 0 15px rgba(244, 185, 66, 0.2)',
          },
          '50%': {
            boxShadow: '0 0 10px rgba(244, 185, 66, 0.8), 0 0 20px rgba(244, 185, 66, 0.5), 0 0 30px rgba(244, 185, 66, 0.3)',
          },
        },
        'neon-pulse-cyan': {
          '0%, 100%': {
            boxShadow: '0 0 5px rgba(0, 217, 255, 0.5), 0 0 10px rgba(0, 217, 255, 0.3), 0 0 15px rgba(0, 217, 255, 0.2)',
          },
          '50%': {
            boxShadow: '0 0 10px rgba(0, 217, 255, 0.8), 0 0 20px rgba(0, 217, 255, 0.5), 0 0 30px rgba(0, 217, 255, 0.3)',
          },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        'glow-intensify': {
          '0%, 100%': { filter: 'brightness(1) drop-shadow(0 0 5px rgba(244, 185, 66, 0.5))' },
          '50%': { filter: 'brightness(1.2) drop-shadow(0 0 15px rgba(244, 185, 66, 0.8))' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '1', textShadow: '0 0 10px rgba(244, 185, 66, 0.5)' },
          '50%': { opacity: '0.8', textShadow: '0 0 20px rgba(244, 185, 66, 0.8)' },
        },
        slideIn: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      transitionDuration: {
        '400': '400ms',
      },
      transitionTimingFunction: {
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/aspect-ratio'),
  ],
}
