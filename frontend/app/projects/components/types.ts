export interface Project {
  id: string
  lead_id: number
  quote_group_id: number | null
  quote_version_id: number | null
  proposal_snapshot_id: number | null
  invoice_id: number | null
  name: string
  status: 'upcoming' | 'ongoing' | 'completed' | 'archived'
  start_date: string | null
  end_date: string | null
  city: string | null
  is_destination: boolean
  project_manager_id: number | null
  project_manager_name: string | null
  project_manager_nickname: string | null
  lead_name: string | null
  notes: string | null
  created_at: string
}

export interface ProjectEvent {
  id: string
  project_id: string
  lead_event_id: number | null
  event_type: string | null
  event_date: string | null
  pax: number | null
  venue: string | null
  venue_address: string | null
  start_time: string | null
  end_time: string | null
  slot: string | null
  notes: string | null
  created_at: string
}

export interface TeamAssignment {
  id: string
  project_event_id: string
  user_id: number
  role: string
  call_time: string | null
  wrap_time: string | null
  notes: string | null
  user_name: string
  user_nickname: string | null
  created_at: string
}

export interface Deliverable {
  id: string
  project_id: string
  title: string
  type: string | null
  quantity: number
  due_date: string | null
  status: 'pending' | 'in_progress' | 'client_preview' | 'revision' | 'delivered'
  notes: string | null
  created_at: string
}

export interface ChecklistItem {
  id: string
  project_id: string
  title: string
  phase: 'pre_shoot' | 'shoot_day' | 'post_shoot'
  is_completed: boolean
  created_at: string
}

export interface LineItem {
  id: number
  invoice_id: number
  description: string
  amount: string
  quantity: number
}

export interface Invoice {
  id: number
  lead_id: number
  project_id: string
  quote_group_id: number | null
  total_amount: string | null
  advance_amount: string | null
  balance_amount: string | null
  advance_paid: boolean
  status: string
  metadata: Record<string, unknown> | null
  created_at: string
  line_items: LineItem[] | null
}

export interface ProjectListItem {
  id: string
  name: string
  status: 'upcoming' | 'ongoing' | 'completed' | 'archived'
  start_date: string | null
  end_date: string | null
  city: string | null
  is_destination: boolean
  lead_id: number
  created_at: string
  project_manager_name: string | null
  project_manager_nickname: string | null
}

export interface ProjectDetailData {
  project: Project
  events: ProjectEvent[]
  team_assignments: TeamAssignment[]
  deliverables: Deliverable[]
  checklist: ChecklistItem[]
  invoice: Invoice | null
}

export interface UserOption {
  id: number
  name: string
  nickname: string | null
}

export const STATUS_COLORS: Record<string, string> = {
  upcoming: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  ongoing: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  completed: 'bg-neutral-500/15 text-neutral-400 border-neutral-500/20',
  archived: 'bg-neutral-500/10 text-neutral-500 border-neutral-500/15',
}

export const INVOICE_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-neutral-500/15 text-neutral-400 border-neutral-500/20',
  partial: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  paid: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  overdue: 'bg-rose-500/15 text-rose-400 border-rose-500/20',
}

export const DELIVERABLE_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-neutral-500/15 text-neutral-400',
  in_progress: 'bg-blue-500/15 text-blue-400',
  client_preview: 'bg-violet-500/15 text-violet-400',
  revision: 'bg-amber-500/15 text-amber-400',
  delivered: 'bg-emerald-500/15 text-emerald-400',
}

export const PHASE_LABELS: Record<string, string> = {
  pre_shoot: 'Pre-Shoot',
  shoot_day: 'Shoot Day',
  post_shoot: 'Post-Shoot',
}

export const VALID_ROLES = ['photographer', 'cinematographer', 'drone', 'editor', 'album_designer'] as const

export const DELIVERABLE_STATUSES = ['pending', 'in_progress', 'client_preview', 'revision', 'delivered'] as const
