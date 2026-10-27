'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import Link from 'next/link'
import { getAuth } from '@/lib/authClient'
import type { ProjectListItem } from './components/types'
import { STATUS_COLORS } from './components/types'
import { type SortKey, SORT_OPTIONS, sortItemsByRule } from '@/lib/eventSort'

const fetcher = (url: string) => fetch(url, { credentials: 'include' }).then(r => r.json())

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return dateStr }
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return 'Dates TBD'
  if (start && end) {
    const s = new Date(start)
    const e = new Date(end)
    const sMonth = s.toLocaleDateString('en-IN', { month: 'short' })
    const eMonth = e.toLocaleDateString('en-IN', { month: 'short' })
    if (sMonth === eMonth && s.getFullYear() === e.getFullYear()) {
      return `${s.getDate()} – ${e.getDate()} ${sMonth} ${s.getFullYear()}`
    }
    return `${formatDate(start)} → ${formatDate(end)}`
  }
  return formatDate(start || end)
}

export default function ProjectsPage() {
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const [error, setError] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [sortBy, setSortBy] = useState<SortKey>('event_soon')
  const [showSortMenu, setShowSortMenu] = useState(false)
  const sortRef = useRef<HTMLDivElement | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (!showSortMenu) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (target && sortRef.current && !sortRef.current.contains(target)) {
        setShowSortMenu(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [showSortMenu])

  useEffect(() => {
    setMounted(true)
    getAuth().then(data => {
      if (!data?.authenticated) {
        window.location.href = '/login'
        return
      }
      fetcher('/api/projects')
        .then(res => {
          setProjects(res?.data || [])
          setLoading(false)
        })
        .catch(() => {
          setError('Unable to load projects.')
          setLoading(false)
        })
    })
  }, [])

  const filteredProjects = useMemo(() => {
    const statusFiltered = filterStatus === 'all'
      ? projects
      : projects.filter(p => p.status === filterStatus)
    return sortItemsByRule(statusFiltered, sortBy)
  }, [projects, filterStatus, sortBy])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: projects.length, upcoming: 0, ongoing: 0, completed: 0, archived: 0 }
    projects.forEach(p => { counts[p.status] = (counts[p.status] || 0) + 1 })
    return counts
  }, [projects])

  if (error) {
    return (
      <div className="max-w-6xl">
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-6 text-rose-400 text-center">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className={`max-w-[1400px] space-y-6 transition-opacity duration-700 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-[var(--foreground)]">Projects</h1>
          <p className="text-sm text-neutral-500 mt-1">Active production projects from converted leads.</p>
        </div>
      </div>

      {/* Status Filters & Sort */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-3 px-3 sm:mx-0 sm:px-0 flex-nowrap sm:flex-wrap">
          {['all', 'upcoming', 'ongoing', 'completed', 'archived'].map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                filterStatus === s
                  ? 'bg-[var(--surface-strong)] text-[var(--foreground)] border-[var(--border-strong)]'
                  : 'bg-transparent text-neutral-500 border-transparent hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)} {statusCounts[s] ? `(${statusCounts[s]})` : ''}
            </button>
          ))}
        </div>

        {/* Sort Dropdown */}
        <div className="relative shrink-0 self-end sm:self-auto" ref={sortRef}>
          <button
            onClick={() => setShowSortMenu(prev => !prev)}
            className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:border-[var(--border-strong)] transition shadow-sm whitespace-nowrap"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
            </svg>
            {SORT_OPTIONS.find(o => o.key === sortBy)?.shortLabel || 'Sort'}
          </button>
          {showSortMenu && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow-md z-50 py-1 overflow-hidden">
              {SORT_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => { setSortBy(opt.key); setShowSortMenu(false) }}
                  className={`w-full text-left px-3 py-2 text-xs transition ${
                    sortBy === opt.key ? 'bg-[var(--surface-muted)] font-semibold text-[var(--foreground)]' : 'text-neutral-500 hover:bg-[var(--surface-muted)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4 sm:p-6 animate-pulse">
              <div className="h-5 bg-[var(--surface-strong)] rounded w-3/4 mb-3" />
              <div className="h-3 bg-[var(--surface-strong)] rounded w-1/2 mb-2" />
              <div className="h-3 bg-[var(--surface-strong)] rounded w-1/3" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredProjects.length === 0 && (
        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-8 sm:p-12 text-center">
          <div className="text-4xl mb-3">📋</div>
          <div className="text-base font-medium text-[var(--foreground)] mb-1">No projects yet</div>
          <p className="text-sm text-neutral-500">
            Projects are automatically created when a lead is converted. Convert a lead to see it here.
          </p>
        </div>
      )}

      {/* Project Cards Grid */}
      {!loading && filteredProjects.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-4">
          {filteredProjects.map((project, idx) => (
            <Link
              key={project.id}
              href={`/projects/${project.slug || project.id}`}
              className="group bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4 sm:p-5 md:p-6 shadow-sm hover:shadow-md hover:border-[var(--border-strong)] transition-all animate-waterfall"
              style={{ animationDelay: `${idx * 60}ms` }}
            >
              {/* Top: Name + Status */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm md:text-base font-semibold text-[var(--foreground)] group-hover:text-blue-400 transition-colors truncate">
                    {project.name}
                  </h3>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {project.can_edit === false && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-neutral-500/15 text-neutral-400 border border-neutral-500/20">
                      Read-Only
                    </span>
                  )}
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider border ${STATUS_COLORS[project.status]}`}>
                    {project.status}
                  </span>
                </div>
              </div>

              {/* Date Range */}
              <div className="text-xs text-neutral-500 mb-2">
                {formatDateRange(project.start_date, project.end_date)}
              </div>

              {/* City + Destination */}
              <div className="flex items-center gap-2 flex-wrap">
                {project.city && (
                  <span className="text-xs text-neutral-400">📍 {project.city}</span>
                )}
                {project.is_destination && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/20">
                    Destination
                  </span>
                )}
              </div>

              {/* PM / Assigned Rep */}
              {(project.project_manager_name || project.assigned_user_name) && (
                <div className="mt-3 pt-3 border-t border-[var(--border)] text-[11px] text-neutral-500 flex items-center justify-between">
                  {project.project_manager_name ? (
                    <span>PM: <span className="text-neutral-400 font-medium">{project.project_manager_nickname || project.project_manager_name}</span></span>
                  ) : <span />}
                  {project.assigned_user_name && (
                    <span>Rep: <span className="text-neutral-400 font-medium">{project.assigned_user_name}</span></span>
                  )}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
