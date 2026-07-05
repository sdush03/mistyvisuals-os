'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import PhoneActions from '@/components/PhoneActions'
import { formatINR, formatDate, formatDateTime } from '@/lib/formatters'
import { formatLeadName } from '@/lib/leadNameFormat'

const api = (url: string, init: RequestInit = {}) =>
  fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })

const STATUSES = ['New','Contacted','Quoted','Follow Up','Negotiation','Awaiting Advance','Converted','Lost','Rejected']
const HEAT = ['Cold','Warm','Hot']
const SLOTS = ['Morning','Day','Evening','Night']
const COVERAGES = ['Both Sides','Bride Side','Groom Side']

type Tab = 'overview' | 'profile' | 'timeline' | 'quotes'
type EditSection = 'contact' | 'details' | 'cities' | null
type EditingEvent = { id: string | null; data: any } | null

export default function LeadV2Page() {
  const { id } = useParams() as { id: string }
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('overview')
  const [lead, setLead] = useState<any>(null)
  const [enrichment, setEnrichment] = useState<any>(null)
  const [notes, setNotes] = useState<any[]>([])
  const [activities, setActivities] = useState<any[]>([])
  const [quotes, setQuotes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [statusLoading, setStatusLoading] = useState(false)
  const [heatLoading, setHeatLoading] = useState(false)
  const [editSection, setEditSection] = useState<EditSection>(null)
  const [contactForm, setContactForm] = useState<any>({})
  const [detailsForm, setDetailsForm] = useState<any>({})
  const [citiesForm, setCitiesForm] = useState<any[]>([])
  const [newCityName, setNewCityName] = useState('')
  const [editingEvent, setEditingEvent] = useState<EditingEvent>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ msg: string; ok: boolean } | null>(null)
  const [allCities, setAllCities] = useState<any[]>([])
  const noticeTimer = useRef<any>(null)

  const showNotice = (msg: string, ok = true) => {
    setNotice({ msg, ok })
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 3000)
  }

  const reload = useCallback(async () => {
    setLoading(true)
    const [l, e, n, a, q, c] = await Promise.all([
      api(`/api/leads/${id}`).then(r => r.json()).catch(() => null),
      api(`/api/leads/${id}/enrichment`).then(r => r.json()).catch(() => null),
      api(`/api/leads/${id}/notes`).then(r => r.json()).catch(() => []),
      api(`/api/leads/${id}/activities`).then(r => r.json()).catch(() => []),
      api(`/api/leads/${id}/quotes`).then(r => r.json()).catch(() => []),
      api('/api/cities').then(r => r.json()).catch(() => []),
    ])
    setLead(l); setEnrichment(e)
    setNotes(Array.isArray(n) ? n : [])
    setActivities(Array.isArray(a) ? a : [])
    setQuotes(Array.isArray(q) ? q : [])
    setAllCities(Array.isArray(c) ? c : [])
    if (l) setContactForm({
      name: l.name||'', phone_primary: l.primary_phone||'', phone_secondary: l.phone_secondary||'',
      email: l.email||'', instagram: l.instagram||'',
      bride_name: l.bride_name||'', bride_phone_primary: l.bride_phone_primary||'', bride_phone_secondary: l.bride_phone_secondary||'', bride_email: l.bride_email||'',
      groom_name: l.groom_name||'', groom_phone_primary: l.groom_phone_primary||'', groom_phone_secondary: l.groom_phone_secondary||'', groom_email: l.groom_email||'',
      source: l.source||'', source_name: l.source_name||'',
    })
    if (e) {
      setDetailsForm({
        event_type: e.event_type||'', coverage_scope: e.coverage_scope||'',
        is_destination: e.is_destination ? 'Yes' : 'No',
        client_budget_amount: e.client_budget_amount||'',
      })
      setCitiesForm(Array.isArray(e.cities) ? e.cities.map((c:any) => ({...c})) : [])
    }
    setLoading(false)
  }, [id])

  useEffect(() => { reload() }, [reload])

  const saveNote = async () => {
    const t = noteText.trim(); if (!t || savingNote) return
    setSavingNote(true)
    await api(`/api/leads/${id}/notes`, { method: 'POST', body: JSON.stringify({ note_text: t }) })
    const fresh = await api(`/api/leads/${id}/notes`).then(r => r.json()).catch(() => [])
    setNotes(Array.isArray(fresh) ? fresh : []); setNoteText(''); setSavingNote(false)
  }
  const changeStatus = async (status: string) => {
    setStatusLoading(true)
    await api(`/api/leads/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
    const l = await api(`/api/leads/${id}`).then(r => r.json()).catch(() => lead)
    setLead(l); setStatusLoading(false)
  }
  const changeHeat = async (heat: string) => {
    setHeatLoading(true)
    await api(`/api/leads/${id}/heat`, { method: 'PATCH', body: JSON.stringify({ heat }) })
    const l = await api(`/api/leads/${id}`).then(r => r.json()).catch(() => lead)
    setLead(l); setHeatLoading(false)
  }
  const saveContact = async () => {
    setSaving(true)
    const res = await api(`/api/leads/${id}/contact`, { method: 'PATCH', body: JSON.stringify(contactForm) })
    if (res.ok) { await reload(); setEditSection(null); showNotice('Contact saved') }
    else showNotice('Failed to save contact', false)
    setSaving(false)
  }
  const saveDetails = async () => {
    setSaving(true)
    const payload = { ...detailsForm, is_destination: detailsForm.is_destination === 'Yes' }
    const res = await api(`/api/leads/${id}/enrichment`, { method: 'PATCH', body: JSON.stringify(payload) })
    if (res.ok) { await reload(); setEditSection(null); showNotice('Details saved') }
    else showNotice('Failed to save details', false)
    setSaving(false)
  }
  const saveCities = async () => {
    if (!citiesForm.length || !citiesForm.some((c:any) => c.is_primary)) { showNotice('Set one primary city', false); return }
    setSaving(true)
    const res = await api(`/api/leads/${id}/cities`, { method: 'PUT', body: JSON.stringify({ cities: citiesForm }) })
    if (res.ok) { await reload(); setEditSection(null); showNotice('Cities saved') }
    else { const d = await res.json().catch(() => ({})); showNotice(d.error || 'Failed to save cities', false) }
    setSaving(false)
  }
  const addCity = () => {
    const n = newCityName.trim(); if (!n) return
    const found = allCities.find((c:any) => c.name.toLowerCase() === n.toLowerCase())
    const newEntry = found ? { ...found, is_primary: !citiesForm.length } : { name: n, state: '', country: 'India', is_primary: !citiesForm.length }
    setCitiesForm(f => [...f, newEntry]); setNewCityName('')
  }
  const setPrimaryCity = (idx: number) => setCitiesForm(f => f.map((c, i) => ({ ...c, is_primary: i === idx })))
  const removeCity = (idx: number) => {
    const next = citiesForm.filter((_, i) => i !== idx)
    if (next.length && !next.some((c:any) => c.is_primary)) next[0].is_primary = true
    setCitiesForm(next)
  }
  const saveEvent = async () => {
    if (!editingEvent) return; setSaving(true)
    const { id: evId, data } = editingEvent
    let res: Response
    if (evId) res = await api(`/api/leads/${id}/events/${evId}`, { method: 'PATCH', body: JSON.stringify(data) })
    else res = await api(`/api/leads/${id}/events`, { method: 'POST', body: JSON.stringify(data) })
    if (res.ok) { await reload(); setEditingEvent(null); showNotice(evId ? 'Event updated' : 'Event added') }
    else { const d = await res.json().catch(() => ({})); showNotice(d.error || 'Failed to save event', false) }
    setSaving(false)
  }
  const deleteEvent = async (evId: string) => {
    if (!confirm('Delete this event?')) return; setSaving(true)
    const res = await api(`/api/leads/${id}/events/${evId}`, { method: 'DELETE' })
    if (res.ok) { await reload(); showNotice('Event deleted') }
    else showNotice('Failed to delete event', false)
    setSaving(false)
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-neutral-50"><div className="w-6 h-6 border-2 border-neutral-300 border-t-neutral-800 rounded-full animate-spin"/></div>
  if (!lead) return <div className="min-h-screen flex items-center justify-center bg-neutral-50"><p className="text-sm text-neutral-500">Lead not found</p></div>

  const events = [...(enrichment?.events||[])].sort((a:any,b:any) => (a.event_date||'').localeCompare(b.event_date||''))
  const cities: any[] = enrichment?.cities||[]
  const primaryCity = cities.find((c:any) => c.is_primary)||cities[0]
  const coupleLabel = formatLeadName(lead).fulldisplay
  const latestQuote = quotes[0]||null
  const heatColor = lead.heat==='Hot'?'bg-rose-500':lead.heat==='Warm'?'bg-amber-400':'bg-sky-400'
  const isOverdue = lead.next_followup_date && new Date(lead.next_followup_date)<new Date()
  const timeline = [
    ...notes.map((n:any)=>({...n,_kind:'note',_ts:new Date(n.created_at||0).getTime()})),
    ...activities.map((a:any)=>({...a,_kind:'activity',_ts:new Date(a.created_at||0).getTime()})),
  ].sort((a,b)=>b._ts-a._ts)

  const Field = ({label,value}:{label:string;value?:any}) => value!=null&&value!==''&&value!==false?(
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-neutral-50 last:border-0">
      <span className="text-xs text-neutral-400 shrink-0 w-32">{label}</span>
      <span className="text-xs font-medium text-neutral-800 text-right">{String(value)}</span>
    </div>
  ):null

  const SectionHead = ({label,onEdit,editing}:{label:string;onEdit?:()=>void;editing?:boolean}) => (
    <div className="px-5 py-3 border-b border-neutral-100 flex items-center justify-between">
      <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">{label}</span>
      {onEdit && !editing && <button onClick={onEdit} className="text-[10px] font-semibold text-neutral-400 hover:text-neutral-800 transition">Edit</button>}
      {editing && <button onClick={() => setEditSection(null)} className="text-[10px] font-semibold text-neutral-400 hover:text-neutral-800 transition">Cancel</button>}
    </div>
  )

  const Input = ({label,val,onChange,type='text'}:{label:string;val:string;onChange:(v:string)=>void;type?:string}) => (
    <div>
      <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">{label}</label>
      <input type={type} value={val} onChange={e=>onChange(e.target.value)}
        className="w-full text-sm px-3 py-2 rounded-xl border border-neutral-200 bg-neutral-50 outline-none focus:border-neutral-600 transition"/>
    </div>
  )
  const Select = ({label,val,onChange,opts}:{label:string;val:string;onChange:(v:string)=>void;opts:string[]}) => (
    <div>
      <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">{label}</label>
      <select value={val} onChange={e=>onChange(e.target.value)}
        className="w-full text-sm px-3 py-2 rounded-xl border border-neutral-200 bg-neutral-50 outline-none focus:border-neutral-600 transition">
        <option value="">Select…</option>
        {opts.map(o=><option key={o}>{o}</option>)}
      </select>
    </div>
  )
  const SaveBtn = ({onClick,label='Save'}:{onClick:()=>void;label?:string}) => (
    <div className="flex justify-end pt-3 border-t border-neutral-100">
      <button onClick={onClick} disabled={saving}
        className="px-5 py-2 text-xs font-bold bg-neutral-900 text-white rounded-xl disabled:opacity-40 hover:bg-neutral-700 transition">
        {saving?'Saving…':label}
      </button>
    </div>
  )

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* ── Notice toast ── */}
      {notice && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-lg ${notice.ok?'bg-neutral-900 text-white':'bg-red-600 text-white'}`}>
          {notice.msg}
        </div>
      )}

      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-30 bg-white border-b border-neutral-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 md:px-6">
          <div className="flex items-center gap-3 py-3">
            <button onClick={()=>router.push('/leads')} className="text-neutral-400 hover:text-neutral-700 transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
            </button>
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${heatColor}`}/>
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-bold text-neutral-900 truncate">{coupleLabel}</h1>
              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                {lead.lead_number&&<span className="text-[10px] text-neutral-400">#{lead.lead_number}</span>}
                {primaryCity&&<span className="text-[10px] text-neutral-500">{primaryCity.name}</span>}
                {lead.next_followup_date&&(
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${isOverdue?'bg-amber-100 text-amber-700':'bg-neutral-100 text-neutral-600'}`}>
                    {isOverdue?'⚠ ':''}Followup {formatDate(lead.next_followup_date)}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <select value={lead.heat||'Cold'} onChange={e=>changeHeat(e.target.value)} disabled={heatLoading}
                className="text-[11px] font-semibold border border-neutral-200 rounded-lg px-2 py-1.5 bg-white outline-none">
                {HEAT.map(h=><option key={h}>{h}</option>)}
              </select>
              <select value={lead.status||''} onChange={e=>changeStatus(e.target.value)} disabled={statusLoading}
                className="text-[11px] font-semibold border border-neutral-200 rounded-lg px-2 py-1.5 bg-white outline-none">
                {STATUSES.map(s=><option key={s}>{s}</option>)}
              </select>
              <Link href={`/leads/${id}`} className="text-[11px] text-neutral-400 hover:text-neutral-700 transition px-2">Classic →</Link>
            </div>
          </div>
          {/* Quick contact pills */}
          {lead.primary_phone&&(
            <div className="pb-3 flex items-center gap-2 flex-wrap">
              <PhoneActions phone={lead.primary_phone} leadId={id}
                label={<span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition text-neutral-700">📞 {lead.primary_phone}</span>}/>
              {lead.bride_phone_primary&&lead.bride_phone_primary!==lead.primary_phone&&(
                <PhoneActions phone={lead.bride_phone_primary} leadId={id}
                  label={<span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition text-neutral-700">Bride: {lead.bride_phone_primary}</span>}/>
              )}
              {lead.groom_phone_primary&&lead.groom_phone_primary!==lead.primary_phone&&(
                <PhoneActions phone={lead.groom_phone_primary} leadId={id}
                  label={<span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition text-neutral-700">Groom: {lead.groom_phone_primary}</span>}/>
              )}
            </div>
          )}
          {/* Tabs */}
          <div className="flex items-center gap-1 -mb-px">
            {(['overview','profile','timeline','quotes'] as Tab[]).map(t=>(
              <button key={t} onClick={()=>setTab(t)}
                className={`px-4 py-2 text-xs font-semibold border-b-2 transition capitalize ${tab===t?'border-neutral-900 text-neutral-900':'border-transparent text-neutral-400 hover:text-neutral-700'}`}>
                {t}{t==='quotes'&&quotes.length>0?` (${quotes.length})`:''}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6">

        {/* ═══ OVERVIEW ═══ */}
        {tab==='overview'&&(
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-4">
              {/* Lead snapshot */}
              <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-neutral-100"><span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Lead</span></div>
                <div className="px-5 py-3">
                  <Field label="Status" value={lead.status}/>
                  <Field label="Source" value={lead.source?(lead.source_name?`${lead.source} · ${lead.source_name}`:lead.source):null}/>
                  <Field label="Coverage" value={lead.coverage_scope}/>
                  <Field label="Event Type" value={lead.event_type}/>
                  <Field label="Wedding" value={lead.is_destination?'Destination':'Local'}/>
                  <Field label="Created" value={formatDate(lead.created_at)}/>
                  {lead.next_followup_date&&<Field label="Next Followup" value={formatDate(lead.next_followup_date)}/>}
                </div>
              </div>
              {/* Pricing */}
              <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-neutral-100 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Pricing</span>
                  {latestQuote?(
                    <Link href={`/leads/${id}/quotes/${latestQuote.id}`} className="text-[10px] font-semibold text-neutral-400 hover:text-neutral-800 transition">Open Builder →</Link>
                  ):(
                    <Link href={`/leads/${id}/quotes`} className="text-[10px] font-semibold text-neutral-400 hover:text-neutral-800 transition">+ New Quote</Link>
                  )}
                </div>
                <div className="px-5 py-3">
                  <Field label="Client Budget" value={formatINR(lead.client_budget_amount)}/>
                  <Field label="Amount Quoted" value={formatINR(lead.amount_quoted)}/>
                  <Field label="Discounted" value={formatINR(lead.discounted_amount)}/>
                  <Field label="Client Offer" value={formatINR(lead.client_offer_amount)}/>
                </div>
                {latestQuote&&(
                  <div className="mx-5 mb-4 bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-neutral-400">Latest Quote</div>
                      <div className="text-xs font-semibold text-neutral-700 mt-0.5">v{latestQuote.version} · {latestQuote.status}</div>
                    </div>
                    <div className="text-base font-bold text-neutral-900">{formatINR(latestQuote.discounted_amount||latestQuote.total_amount)||'—'}</div>
                  </div>
                )}
              </div>
              {/* Quick note */}
              <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-neutral-100"><span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Add Note</span></div>
                <div className="p-4 flex gap-2">
                  <textarea value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder="Type a note… (⌘↵ to save)" rows={2}
                    className="flex-1 text-sm px-3 py-2 rounded-xl border border-neutral-200 bg-neutral-50 outline-none resize-none focus:border-neutral-400 transition"
                    onInput={e=>{const t=e.currentTarget;t.style.height='auto';t.style.height=Math.min(t.scrollHeight,120)+'px'}}
                    onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey))saveNote()}}/>
                  <button onClick={saveNote} disabled={savingNote||!noteText.trim()}
                    className="self-start px-4 py-2 text-xs font-bold bg-neutral-900 text-white rounded-xl disabled:opacity-30 hover:bg-neutral-700 transition">
                    {savingNote?'…':'Save'}
                  </button>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              {/* Contact */}
              <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-neutral-100 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Contact</span>
                  <button onClick={()=>setTab('profile')} className="text-[10px] font-semibold text-neutral-400 hover:text-neutral-800 transition">Edit</button>
                </div>
                <div className="px-5 py-3">
                  <Field label="Name" value={lead.name}/>
                  <Field label="Phone" value={lead.primary_phone}/>
                  <Field label="Alt Phone" value={lead.phone_secondary}/>
                  <Field label="Email" value={lead.email}/>
                  {lead.bride_name&&<Field label="Bride" value={`${lead.bride_name}${lead.bride_phone_primary?' · '+lead.bride_phone_primary:''}`}/>}
                  {lead.groom_name&&<Field label="Groom" value={`${lead.groom_name}${lead.groom_phone_primary?' · '+lead.groom_phone_primary:''}`}/>}
                </div>
              </div>
              {/* Events */}
              <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-neutral-100 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Events · {events.length}</span>
                  <button onClick={()=>setTab('profile')} className="text-[10px] font-semibold text-neutral-400 hover:text-neutral-800 transition">Edit</button>
                </div>
                {events.length===0?<p className="px-5 py-4 text-xs text-neutral-400">No events added.</p>:(
                  <div className="divide-y divide-neutral-50">
                    {events.map((ev:any)=>(
                      <div key={ev.id} className="px-5 py-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-neutral-800">{ev.event_type||'—'}</div>
                          {ev.venue&&<div className="text-[11px] text-neutral-500 mt-0.5 truncate">{ev.venue}</div>}
                          {ev.city_name&&<div className="text-[10px] text-neutral-400">{ev.city_name}</div>}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs font-semibold text-neutral-700">{formatDate(ev.event_date)}</div>
                          {ev.slot&&<div className="text-[10px] text-neutral-400">{ev.slot}</div>}
                          {ev.pax!=null&&<div className="text-[10px] text-neutral-400">{ev.pax} guests</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* Recent Notes */}
              <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-neutral-100 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Notes · {notes.length}</span>
                  <button onClick={()=>setTab('timeline')} className="text-[10px] font-semibold text-neutral-400 hover:text-neutral-800 transition">All →</button>
                </div>
                {notes.length===0?<p className="px-5 py-4 text-xs text-neutral-400">No notes yet.</p>:(
                  <div className="divide-y divide-neutral-50">
                    {[...notes].reverse().slice(0,4).map((n:any)=>(
                      <div key={n.id} className="px-5 py-3">
                        <p className="text-xs text-neutral-700 leading-relaxed line-clamp-3">{n.note_text}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[10px] text-neutral-400">{formatDateTime(n.created_at)}</span>
                          {n.status_at_time&&<span className="text-[10px] text-neutral-400">· {n.status_at_time}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* Recent Activity */}
              <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-neutral-100 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Recent Activity</span>
                  <button onClick={()=>setTab('timeline')} className="text-[10px] font-semibold text-neutral-400 hover:text-neutral-800 transition">Full →</button>
                </div>
                {activities.length===0?<p className="px-5 py-4 text-xs text-neutral-400">No activity yet.</p>:(
                  <div className="divide-y divide-neutral-50">
                    {activities.slice(0,5).map((a:any)=>(
                      <div key={a.id} className="px-5 py-3 flex items-start justify-between gap-3">
                        <span className="text-xs text-neutral-600 leading-snug">{a.description||a.activity_type||'—'}</span>
                        <span className="text-[10px] text-neutral-400 shrink-0">{formatDateTime(a.created_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ PROFILE ═══ */}
        {tab==='profile'&&(
          <div className="max-w-2xl space-y-4">

            {/* ── Contact ── */}
            <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
              <SectionHead label="Contact" onEdit={()=>setEditSection('contact')} editing={editSection==='contact'}/>
              {editSection==='contact'?(
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input label="Full Name" val={contactForm.name} onChange={v=>setContactForm((f:any)=>({...f,name:v}))}/>
                    <Input label="Primary Phone" val={contactForm.phone_primary} onChange={v=>setContactForm((f:any)=>({...f,phone_primary:v}))}/>
                    <Input label="Alt Phone" val={contactForm.phone_secondary} onChange={v=>setContactForm((f:any)=>({...f,phone_secondary:v}))}/>
                    <Input label="Email" val={contactForm.email} onChange={v=>setContactForm((f:any)=>({...f,email:v}))}/>
                    <Input label="Instagram" val={contactForm.instagram} onChange={v=>setContactForm((f:any)=>({...f,instagram:v}))}/>
                    <Input label="Source" val={contactForm.source} onChange={v=>setContactForm((f:any)=>({...f,source:v}))}/>
                    <Input label="Source Name" val={contactForm.source_name} onChange={v=>setContactForm((f:any)=>({...f,source_name:v}))}/>
                  </div>
                  <div className="pt-3 border-t border-neutral-100">
                    <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400 mb-3">Bride</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input label="Name" val={contactForm.bride_name} onChange={v=>setContactForm((f:any)=>({...f,bride_name:v}))}/>
                      <Input label="Phone" val={contactForm.bride_phone_primary} onChange={v=>setContactForm((f:any)=>({...f,bride_phone_primary:v}))}/>
                      <Input label="Alt Phone" val={contactForm.bride_phone_secondary} onChange={v=>setContactForm((f:any)=>({...f,bride_phone_secondary:v}))}/>
                      <Input label="Email" val={contactForm.bride_email} onChange={v=>setContactForm((f:any)=>({...f,bride_email:v}))}/>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-neutral-100">
                    <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400 mb-3">Groom</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input label="Name" val={contactForm.groom_name} onChange={v=>setContactForm((f:any)=>({...f,groom_name:v}))}/>
                      <Input label="Phone" val={contactForm.groom_phone_primary} onChange={v=>setContactForm((f:any)=>({...f,groom_phone_primary:v}))}/>
                      <Input label="Alt Phone" val={contactForm.groom_phone_secondary} onChange={v=>setContactForm((f:any)=>({...f,groom_phone_secondary:v}))}/>
                      <Input label="Email" val={contactForm.groom_email} onChange={v=>setContactForm((f:any)=>({...f,groom_email:v}))}/>
                    </div>
                  </div>
                  <SaveBtn onClick={saveContact} label="Save Contact"/>
                </div>
              ):(
                <div className="px-5 py-3">
                  <Field label="Name" value={lead.name}/>
                  <Field label="Phone" value={lead.primary_phone}/>
                  <Field label="Alt Phone" value={lead.phone_secondary}/>
                  <Field label="Email" value={lead.email}/>
                  <Field label="Instagram" value={lead.instagram}/>
                  <Field label="Source" value={lead.source?(lead.source_name?`${lead.source} · ${lead.source_name}`:lead.source):null}/>
                  {lead.bride_name&&<>
                    <div className="pt-2 mt-2 border-t border-neutral-100"><div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400 mb-2">Bride</div></div>
                    <Field label="Name" value={lead.bride_name}/>
                    <Field label="Phone" value={lead.bride_phone_primary}/>
                    <Field label="Alt Phone" value={lead.bride_phone_secondary}/>
                    <Field label="Email" value={lead.bride_email}/>
                  </>}
                  {lead.groom_name&&<>
                    <div className="pt-2 mt-2 border-t border-neutral-100"><div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400 mb-2">Groom</div></div>
                    <Field label="Name" value={lead.groom_name}/>
                    <Field label="Phone" value={lead.groom_phone_primary}/>
                    <Field label="Alt Phone" value={lead.groom_phone_secondary}/>
                    <Field label="Email" value={lead.groom_email}/>
                  </>}
                </div>
              )}
            </div>

            {/* ── Lead Details ── */}
            <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
              <SectionHead label="Lead Details" onEdit={()=>setEditSection('details')} editing={editSection==='details'}/>
              {editSection==='details'?(
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input label="Event Type" val={detailsForm.event_type} onChange={v=>setDetailsForm((f:any)=>({...f,event_type:v}))}/>
                    <Select label="Coverage" val={detailsForm.coverage_scope} onChange={v=>setDetailsForm((f:any)=>({...f,coverage_scope:v}))} opts={COVERAGES}/>
                    <Select label="Wedding Type" val={detailsForm.is_destination} onChange={v=>setDetailsForm((f:any)=>({...f,is_destination:v}))} opts={['No','Yes']}/>
                    <Input label="Client Budget (₹)" val={String(detailsForm.client_budget_amount||'')} onChange={v=>setDetailsForm((f:any)=>({...f,client_budget_amount:v}))} type="number"/>
                  </div>
                  <SaveBtn onClick={saveDetails} label="Save Details"/>
                </div>
              ):(
                <div className="px-5 py-3">
                  <Field label="Event Type" value={lead.event_type}/>
                  <Field label="Coverage" value={lead.coverage_scope}/>
                  <Field label="Wedding" value={lead.is_destination?'Destination':'Local'}/>
                  <Field label="Client Budget" value={formatINR(lead.client_budget_amount)}/>
                </div>
              )}
            </div>

            {/* ── Cities ── */}
            <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
              <SectionHead label={`Cities · ${cities.length}`} onEdit={()=>setEditSection('cities')} editing={editSection==='cities'}/>
              {editSection==='cities'?(
                <div className="p-5 space-y-3">
                  {citiesForm.map((c:any,i:number)=>(
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-neutral-200 bg-neutral-50">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-neutral-800">{c.name}</div>
                        {c.state&&<div className="text-[10px] text-neutral-400">{c.state}</div>}
                      </div>
                      <button onClick={()=>setPrimaryCity(i)}
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition ${c.is_primary?'bg-neutral-900 text-white border-neutral-900':'bg-white text-neutral-500 border-neutral-200 hover:border-neutral-500'}`}>
                        {c.is_primary?'Primary':'Set Primary'}
                      </button>
                      <button onClick={()=>removeCity(i)} className="text-[10px] text-neutral-400 hover:text-red-600 transition font-semibold">Remove</button>
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <div className="relative flex-1">
                      <input value={newCityName} onChange={e=>setNewCityName(e.target.value)}
                        onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addCity()}}}
                        placeholder="Add city…"
                        className="w-full text-sm px-3 py-2 rounded-xl border border-neutral-200 bg-neutral-50 outline-none focus:border-neutral-600 transition"
                        list="city-suggestions"/>
                      <datalist id="city-suggestions">
                        {allCities.filter((c:any)=>c.name.toLowerCase().includes(newCityName.toLowerCase())).slice(0,8).map((c:any)=>(
                          <option key={c.id} value={c.name}/>
                        ))}
                      </datalist>
                    </div>
                    <button onClick={addCity} className="px-4 py-2 text-xs font-bold bg-neutral-900 text-white rounded-xl hover:bg-neutral-700 transition">Add</button>
                  </div>
                  <SaveBtn onClick={saveCities} label="Save Cities"/>
                </div>
              ):(
                <div className="px-5 py-3">
                  {cities.length===0?<p className="py-2 text-xs text-neutral-400">No cities added.</p>:(
                    <div className="flex flex-wrap gap-2 py-2">
                      {cities.map((c:any)=>(
                        <span key={c.id} className={`text-xs px-3 py-1 rounded-full border ${c.is_primary?'bg-neutral-900 text-white border-neutral-900':'bg-neutral-50 text-neutral-600 border-neutral-200'}`}>
                          {c.name}{c.is_primary?' · Primary':''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Events ── */}
            <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-neutral-100 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Events · {events.length}</span>
                <button onClick={()=>setEditingEvent({id:null,data:{event_type:'',event_date:'',slot:'',pax:'',venue:'',city_id:cities[0]?.id||''}})}
                  className="text-[10px] font-semibold text-neutral-400 hover:text-neutral-800 transition">+ Add Event</button>
              </div>
              <div className="divide-y divide-neutral-50">
                {events.length===0&&!editingEvent&&<p className="px-5 py-4 text-xs text-neutral-400">No events yet.</p>}
                {events.map((ev:any)=>(
                  <div key={ev.id}>
                    {editingEvent?.id===ev.id?(
                      <div className="p-5 space-y-3 bg-neutral-50">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <Input label="Event Name" val={editingEvent!.data.event_type} onChange={v=>setEditingEvent(e=>e?{...e,data:{...e.data,event_type:v}}:e)}/>
                          <div>
                            <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">Date</label>
                            <input type="date" value={editingEvent!.data.event_date?.slice(0,10)||''} onChange={e=>setEditingEvent(ev2=>ev2?{...ev2,data:{...ev2.data,event_date:e.target.value}}:ev2)}
                              className="w-full text-sm px-3 py-2 rounded-xl border border-neutral-200 bg-white outline-none focus:border-neutral-600 transition"/>
                          </div>
                          <Select label="Slot" val={editingEvent!.data.slot||''} onChange={v=>setEditingEvent(e=>e?{...e,data:{...e.data,slot:v}}:e)} opts={SLOTS}/>
                          <Input label="Guests (Pax)" val={String(editingEvent!.data.pax||'')} onChange={v=>setEditingEvent(e=>e?{...e,data:{...e.data,pax:v}}:e)} type="number"/>
                          <Input label="Venue" val={editingEvent!.data.venue||''} onChange={v=>setEditingEvent(e=>e?{...e,data:{...e.data,venue:v}}:e)}/>
                          {cities.length>0&&(
                            <div>
                              <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">City</label>
                              <select value={editingEvent!.data.city_id||''} onChange={e2=>setEditingEvent(e=>e?{...e,data:{...e.data,city_id:e2.target.value}}:e)}
                                className="w-full text-sm px-3 py-2 rounded-xl border border-neutral-200 bg-white outline-none focus:border-neutral-600 transition">
                                <option value="">No city</option>
                                {cities.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 pt-2 border-t border-neutral-200">
                          <button onClick={saveEvent} disabled={saving} className="px-4 py-2 text-xs font-bold bg-neutral-900 text-white rounded-xl disabled:opacity-40 hover:bg-neutral-700 transition">{saving?'Saving…':'Save'}</button>
                          <button onClick={()=>setEditingEvent(null)} className="px-4 py-2 text-xs font-semibold text-neutral-500 hover:text-neutral-800 transition">Cancel</button>
                          {ev.id&&<button onClick={()=>deleteEvent(ev.id)} className="ml-auto px-4 py-2 text-xs font-semibold text-red-500 hover:text-red-700 transition">Delete</button>}
                        </div>
                      </div>
                    ):(
                      <div className="px-5 py-3.5 flex items-start justify-between gap-3 group">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-neutral-800">{ev.event_type||'—'}</div>
                          {ev.venue&&<div className="text-[11px] text-neutral-500 mt-0.5 truncate">{ev.venue}</div>}
                          <div className="flex items-center gap-2 mt-0.5">
                            {ev.city_name&&<span className="text-[10px] text-neutral-400">{ev.city_name}</span>}
                            {ev.pax!=null&&<span className="text-[10px] text-neutral-400">{ev.pax} guests</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <div className="text-xs font-semibold text-neutral-700">{formatDate(ev.event_date)}</div>
                            {ev.slot&&<div className="text-[10px] text-neutral-400">{ev.slot}</div>}
                          </div>
                          <button onClick={()=>setEditingEvent({id:ev.id,data:{event_type:ev.event_type||'',event_date:ev.event_date?.slice(0,10)||'',slot:ev.slot||'',pax:ev.pax||'',venue:ev.venue||'',city_id:ev.city_id||''}})}
                            className="opacity-0 group-hover:opacity-100 transition text-[10px] font-semibold text-neutral-400 hover:text-neutral-800">Edit</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {/* New event form */}
                {editingEvent?.id===null&&(
                  <div className="p-5 space-y-3 bg-neutral-50">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">New Event</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input label="Event Name" val={editingEvent.data.event_type} onChange={v=>setEditingEvent(e=>e?{...e,data:{...e.data,event_type:v}}:e)}/>
                      <div>
                        <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">Date</label>
                        <input type="date" value={editingEvent.data.event_date||''} onChange={e=>setEditingEvent(ev2=>ev2?{...ev2,data:{...ev2.data,event_date:e.target.value}}:ev2)}
                          className="w-full text-sm px-3 py-2 rounded-xl border border-neutral-200 bg-white outline-none focus:border-neutral-600 transition"/>
                      </div>
                      <Select label="Slot" val={editingEvent.data.slot||''} onChange={v=>setEditingEvent(e=>e?{...e,data:{...e.data,slot:v}}:e)} opts={SLOTS}/>
                      <Input label="Guests (Pax)" val={String(editingEvent.data.pax||'')} onChange={v=>setEditingEvent(e=>e?{...e,data:{...e.data,pax:v}}:e)} type="number"/>
                      <Input label="Venue" val={editingEvent.data.venue||''} onChange={v=>setEditingEvent(e=>e?{...e,data:{...e.data,venue:v}}:e)}/>
                      {cities.length>0&&(
                        <div>
                          <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">City</label>
                          <select value={editingEvent.data.city_id||''} onChange={e2=>setEditingEvent(e=>e?{...e,data:{...e.data,city_id:e2.target.value}}:e)}
                            className="w-full text-sm px-3 py-2 rounded-xl border border-neutral-200 bg-white outline-none focus:border-neutral-600 transition">
                            <option value="">No city</option>
                            {cities.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 pt-2 border-t border-neutral-200">
                      <button onClick={saveEvent} disabled={saving} className="px-4 py-2 text-xs font-bold bg-neutral-900 text-white rounded-xl disabled:opacity-40 hover:bg-neutral-700 transition">{saving?'Saving…':'Add Event'}</button>
                      <button onClick={()=>setEditingEvent(null)} className="px-4 py-2 text-xs font-semibold text-neutral-500 hover:text-neutral-800 transition">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ TIMELINE ═══ */}
        {tab==='timeline'&&(
          <div className="max-w-2xl space-y-4">
            <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
              <div className="p-4 flex gap-2">
                <textarea value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder="Add a note… (⌘↵ to save)" rows={2}
                  className="flex-1 text-sm px-3 py-2.5 rounded-xl border border-neutral-200 bg-neutral-50 outline-none resize-none focus:border-neutral-400 transition"
                  onInput={e=>{const t=e.currentTarget;t.style.height='auto';t.style.height=Math.min(t.scrollHeight,120)+'px'}}
                  onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey))saveNote()}}/>
                <button onClick={saveNote} disabled={savingNote||!noteText.trim()}
                  className="self-start px-4 py-2.5 text-xs font-bold bg-neutral-900 text-white rounded-xl disabled:opacity-30 hover:bg-neutral-700 transition">{savingNote?'…':'Save'}</button>
              </div>
            </div>
            {timeline.length===0&&<div className="text-center py-16 text-sm text-neutral-400">No notes or activity yet.</div>}
            <div className="relative">
              <div className="absolute left-[19px] top-0 bottom-0 w-px bg-neutral-200"/>
              <div className="space-y-3 pl-12">
                {timeline.map((item:any,i)=>{
                  const isNote=item._kind==='note'
                  return (
                    <div key={i} className="relative">
                      <div className={`absolute -left-[2.15rem] top-3.5 w-5 h-5 rounded-full border-2 flex items-center justify-center text-[9px] ${isNote?'bg-neutral-900 border-neutral-900 text-white':'bg-white border-neutral-300 text-neutral-500'}`}>
                        {isNote?'✍':'·'}
                      </div>
                      <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
                        <div className="px-4 py-3">
                          <div className="flex items-start justify-between gap-3 mb-1.5">
                            <span className={`text-[10px] font-bold uppercase tracking-widest ${isNote?'text-neutral-700':'text-neutral-400'}`}>
                              {isNote?'Note':(item.activity_type||item.type||'Activity')}
                            </span>
                            <span className="text-[10px] text-neutral-400 shrink-0">{formatDateTime(item.created_at)}</span>
                          </div>
                          <p className={`text-sm leading-relaxed whitespace-pre-wrap ${isNote?'text-neutral-800':'text-neutral-500'}`}>
                            {isNote?item.note_text:(item.description||item.summary||item.activity_type||'')}
                          </p>
                          {isNote&&item.status_at_time&&<div className="text-[10px] mt-1.5 text-neutral-400">Status: {item.status_at_time}</div>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ═══ QUOTES ═══ */}
        {tab==='quotes'&&(
          <div className="max-w-2xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-500">{quotes.length} version{quotes.length!==1?'s':''}</span>
              <Link href={`/leads/${id}/quotes`} className="text-xs font-bold px-4 py-2 bg-neutral-900 text-white rounded-xl hover:bg-neutral-700 transition">+ New Quote</Link>
            </div>
            {quotes.length===0&&<div className="text-center py-16 text-sm text-neutral-400">No quotes yet.</div>}
            {quotes.map((q:any)=>(
              <Link key={q.id} href={`/leads/${id}/quotes/${q.id}`} className="block">
                <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
                  <div className="p-5 flex items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-sm font-bold text-neutral-900">Version {q.version}</span>
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-600">{q.status}</span>
                      </div>
                      <div className="text-xs text-neutral-400 mt-1">{formatDate(q.created_at)}</div>
                    </div>
                    <div className="text-right">
                      {q.total_amount&&q.discounted_amount&&q.total_amount!==q.discounted_amount&&(
                        <div className="text-xs line-through text-neutral-400">{formatINR(q.total_amount)}</div>
                      )}
                      <div className="text-xl font-bold text-neutral-900">{formatINR(q.discounted_amount||q.total_amount)||'—'}</div>
                      <div className="text-[10px] text-neutral-400 mt-0.5">Open builder →</div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
