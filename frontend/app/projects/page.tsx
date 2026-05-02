'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { getAuth } from '@/lib/authClient'
import type { ProjectListItem } from './components/types'
import { STATUS_COLORS } from './components/types'

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
  const [mounted, setMounted] = useState(false)

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
    if (filterStatus === 'all') return projects
    return projects.filter(p => p.status === filterStatus)
  }, [projects, filterStatus])

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

      {/* Status Filters */}
      <div className="flex flex-wrap gap-2">
        {['all', 'upcoming', 'ongoing', 'completed', 'archived'].map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              filterStatus === s
                ? 'bg-[var(--surface-strong)] text-[var(--foreground)] border-[var(--border-strong)]'
                : 'bg-transparent text-neutral-500 border-transparent hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]'
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)} {statusCounts[s] ? `(${statusCounts[s]})` : ''}
          </button>
        ))}
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-6 animate-pulse">
              <div className="h-5 bg-[var(--surface-strong)] rounded w-3/4 mb-3" />
              <div className="h-3 bg-[var(--surface-strong)] rounded w-1/2 mb-2" />
              <div className="h-3 bg-[var(--surface-strong)] rounded w-1/3" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredProjects.length === 0 && (
        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-12 text-center">
          <div className="text-4xl mb-3">📋</div>
          <div className="text-base font-medium text-[var(--foreground)] mb-1">No projects yet</div>
          <p className="text-sm text-neutral-500">
            Projects are automatically created when a lead is converted. Convert a lead to see it here.
          </p>
        </div>
      )}

      {/* Project Cards Grid */}
      {!loading && filteredProjects.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredProjects.map((project, idx) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="group bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-5 md:p-6 shadow-sm hover:shadow-md hover:border-[var(--border-strong)] transition-all animate-waterfall"
              style={{ animationDelay: `${idx * 60}ms` }}
            >
              {/* Top: Name + Status */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <h3 className="text-sm md:text-base font-semibold text-[var(--foreground)] group-hover:text-blue-400 transition-colors truncate">
                  {project.name}
                </h3>
                <span className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider border ${STATUS_COLORS[project.status]}`}>
                  {project.status}
                </span>
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

              {/* PM */}
              {project.project_manager_name && (
                <div className="mt-3 pt-3 border-t border-[var(--border)] text-[11px] text-neutral-500">
                  PM: <span className="text-neutral-400 font-medium">{project.project_manager_nickname || project.project_manager_name}</span>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
