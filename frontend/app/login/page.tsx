'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { clearAuthCache, getAuth } from '@/lib/authClient'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [shake, setShake] = useState(false)
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const nextErrors: { email?: string; password?: string } = {}
    if (!email.trim()) nextErrors.email = 'Email or phone is required'
    if (!password.trim()) nextErrors.password = 'Password is required'
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors)
      setShake(true)
      setTimeout(() => setShake(false), 300)
      return
    }
    setFieldErrors({})
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || 'Login failed')
        setLoading(false)
        return
      }

      sessionStorage.setItem('mv_authed', '1')
      clearAuthCache()
      // Prime auth cache so sidebar renders immediately after redirect.
      await getAuth({ force: true })
      router.replace('/salesdashboard')
    } catch {
      setError('Login failed')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[100svh] bg-[var(--background)] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
          <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">Sales V1</div>
          <h1 className="text-2xl font-semibold mt-2">Sign in</h1>
          <p className="text-sm text-neutral-600 mt-1">Use your work email or phone to continue.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4" autoComplete="off">
            {/* ... input fields ... */}
            <div>
              <label className="text-xs text-neutral-500">Email or Phone *</label>
              <input
                type="text"
                autoComplete="off"
                className={`mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm ${fieldErrors.email ? 'field-error' : ''} ${fieldErrors.email && shake ? 'shake' : ''}`}
                value={email}
                onChange={e => {
                  setEmail(e.target.value)
                  if (fieldErrors.email && e.target.value.trim()) {
                    setFieldErrors(prev => ({ ...prev, email: undefined }))
                  }
                }}
              />
              {fieldErrors.email && (
                <div className="mt-1 text-xs text-red-600">{fieldErrors.email}</div>
              )}
            </div>
            <div>
              <label className="text-xs text-neutral-500">Password *</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="off"
                  className={`mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 pr-10 text-sm ${fieldErrors.password ? 'field-error' : ''} ${fieldErrors.password && shake ? 'shake' : ''}`}
                  value={password}
                  onChange={e => {
                    setPassword(e.target.value)
                    if (fieldErrors.password && e.target.value.trim()) {
                      setFieldErrors(prev => ({ ...prev, password: undefined }))
                    }
                  }}
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-neutral-500 hover:text-neutral-800"
                  onClick={() => setShowPassword(prev => !prev)}
                >
                  {showPassword ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-5 w-5"
                    >
                      <path d="M3 3l18 18" />
                      <path d="M10.5 10.5a2 2 0 002.83 2.83" />
                      <path d="M7.4 7.4A9.9 9.9 0 002 12c1.6 3.6 5.1 6 10 6a9.9 9.9 0 005.6-1.7" />
                      <path d="M14.1 9.9A3 3 0 0112 15a3 3 0 01-2.1-.9" />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-5 w-5"
                    >
                      <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z" />
                      <circle cx="12" cy="12" r="3.2" />
                    </svg>
                  )}
                </button>
              </div>
              {fieldErrors.password && (
                <div className="mt-1 text-xs text-red-600">{fieldErrors.password}</div>
              )}
            </div>

            {error && (
              <div className="text-sm text-red-600">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {loading ? 'Signing in…' : 'Login'}
            </button>
          </form>
        </div>
        
        <div className="mt-8 flex justify-center gap-6 text-[10px] uppercase tracking-[0.2em] text-neutral-400 relative z-10">
          <a href="/privacy" className="hover:text-neutral-900 hover:underline transition-colors cursor-pointer">Privacy</a>
          <a href="/terms" className="hover:text-neutral-900 hover:underline transition-colors cursor-pointer">Terms</a>
          <a href="/refund" className="hover:text-neutral-900 hover:underline transition-colors cursor-pointer">Refund</a>
          <a href="/contact" className="hover:text-neutral-900 hover:underline transition-colors cursor-pointer">Contact</a>
        </div>
      </div>
    </div>
  )
}
