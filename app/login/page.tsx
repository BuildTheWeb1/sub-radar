'use client'

import { signIn } from 'next-auth/react'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Left brand panel */}
      <div className="relative md:w-[55%] bg-gradient-to-br from-[#1c0a00] via-[#431407] to-[#7c2d12] flex flex-col justify-center px-10 py-12 overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -top-20 -left-20 w-80 h-80 rounded-full bg-white opacity-[0.04]" />
        <div className="absolute -bottom-32 -right-10 w-[28rem] h-[28rem] rounded-full bg-white opacity-[0.03]" />

        <div className="relative z-10 max-w-md">
          {/* Logo */}
          <div className="flex items-center gap-2.5 mb-8">
            <div className="w-7 h-7 bg-[#ea580c] rounded-[6px] flex items-center justify-center">
              <div className="w-[9px] h-[9px] rounded-full bg-white opacity-90" />
            </div>
            <span className="font-bold text-[#fed7aa] tracking-tight text-lg">SubRadar</span>
          </div>

          {/* Eyebrow */}
          <p className="text-[#ea580c] text-xs font-semibold uppercase tracking-widest mb-4">
            Reddit lead intelligence
          </p>

          {/* Headline */}
          <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight mb-4">
            Find customers before your competitors do.
          </h1>

          {/* Body */}
          <p className="text-[#fca474] text-sm leading-relaxed mb-8">
            SubRadar monitors Reddit 24/7 and surfaces conversations where your product is exactly what people are asking for.
          </p>

          {/* Tags */}
          <div className="flex flex-wrap gap-2">
            {['Reddit monitoring', 'Lead generation', 'AI relevance scoring'].map((tag) => (
              <span
                key={tag}
                className="text-xs px-3 py-1 rounded-full text-[#fed7aa]"
                style={{ background: 'rgba(234,88,12,0.2)' }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right sign-in panel */}
      <div className="md:w-[45%] bg-[#fffbf5] flex flex-col items-center justify-center px-8 py-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-1.5">
            <h2 className="text-2xl font-bold text-[#1c0a00]">Welcome back</h2>
            <p className="text-sm text-[#9a6b4b]">Sign in to your SubRadar account to continue.</p>
          </div>

          <button
            onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
            className="w-full flex items-center justify-center gap-3 border border-[#fde8cc] bg-white rounded-lg px-4 py-2.5 text-sm font-medium text-[#431407] hover:bg-[#fffbf5] transition-colors"
          >
            {/* Google logo inline SVG */}
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.64 9.2045c0-.638-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087C16.6582 14.0518 17.64 11.8309 17.64 9.2045Z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.4673-.8064 5.9564-2.1818l-2.9087-2.2582c-.8064.54-1.8382.8591-3.0477.8591-2.3427 0-4.3282-1.5818-5.0368-3.7091H.9573v2.3318C2.4382 15.9836 5.4818 18 9 18Z" fill="#34A853"/>
              <path d="M3.9632 10.71c-.18-.54-.2827-1.1168-.2827-1.71s.1027-1.17.2827-1.71V4.9582H.9573A9.0059 9.0059 0 0 0 0 9c0 1.4523.3477 2.8277.9573 4.0418L3.9632 10.71Z" fill="#FBBC05"/>
              <path d="M9 3.5791c1.3214 0 2.5077.4545 3.4405 1.346l2.5814-2.5814C13.4632.8918 11.43 0 9 0 5.4818 0 2.4382 2.0164.9573 4.9582L3.9632 7.29C4.6718 5.1627 6.6573 3.5791 9 3.5791Z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <p className="text-center text-xs text-[#c4a882]">Access is by invitation only</p>

          <div className="border-t border-[#fde8cc] pt-4">
            <p className="text-center text-xs text-[#9a6b4b]">
              By signing in you agree to our{' '}
              <a href="#" className="underline hover:text-[#431407]">Terms of Service</a>
              {' '}and{' '}
              <a href="#" className="underline hover:text-[#431407]">Privacy Policy</a>.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
