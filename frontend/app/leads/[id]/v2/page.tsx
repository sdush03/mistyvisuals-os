'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

const apiFetch = (url: string, init: RequestInit = {}) =>
  fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })

const fmtDate = (d?: string | null) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
const fmtDT = (d?: string | null) => {
  if (!d) return ''
  const dt = new Date(d)
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' · ' + dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}
const fmtINR = (n?: any) => (n != null && n !== '') ? '₹' + Number(n).toLocaleString('en-IN') : null

const STATUSES = ['New','Contacted','Quoted','Follow Up','Negotiation','Awaiting Advance','Converted','Lost','Rejected']

type Tab = 'overview' | 'profile' | 'timeline' | 'quotes'

const igHandle = (v?: string | null) => {
  if (!v) return null
  const m = v.match(/(?:instagram\.com\/)?@?([A-Za-z0-9._]+)/)
  return m ? m[1] : null
}

const venueType = (ev: any) => {
  try {
    const meta = typeof ev.venue_metadata === 'string' ? JSON.parse(ev.venue_metadata) : ev.venue_metadata
    if (!meta) return null
    const PRI = ['banquet_hall','wedding_venue','event_venue','resort','hotel','lodging']
    const raw: string[] = meta.types || []
    const found = PRI.find(p => raw.includes(p))
    const label = found ? found.replace(/_/g,' ').replace(/\b\w/g, l => l.toUpperCase()) : null
    const stars = meta.hotel_class ? `${meta.hotel_class}★` : null
    return [stars, label].filter(Boolean).join(' · ')
  } catch { return null }
}

export default function LeadV2() {
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

  const reload = async () => {
    setLoading(true)
    const [l, e, n, a, q] = await Promise.all([
      apiFetch(`/api/leads/${id}`).then(r => r.json()).catch(() => null),
      apiFetch(`/api/leads/${id}/enrichment`).then(r => r.json()).catch(() => null),
      apiFetch(`/api/leads/${id}/notes`).then(r => r.json()).catch(() => []),
      apiFetch(`/api/leads/${id}/activities`).then(r => r.json()).catch(() => []),
      apiFetch(`/api/leads/${id}/quotes`).then(r => r.json()).catch(() => []),
    ])
    setLead(l); setEnrichment(e)
    setNotes(Array.isArray(n) ? n : [])
    setActivities(Array.isArray(a) ? a : [])
    setQuotes(Array.isArray(q) ? q : [])
    setLoading(false)
  }

  useEffect(() => { reload() }, [id])

  const saveNote = async () => {
    const t = noteText.trim()
    if (!t || savingNote) return
    setSavingNote(true)
    await apiFetch(`/api/leads/${id}/notes`, { method: 'POST', body: JSON.stringify({ note_text: t }) })
    const fresh = await apiFetch(`/api/leads/${id}/notes`).then(r => r.json()).catch(() => [])
    setNotes(Array.isArray(fresh) ? fresh : [])
    setNoteText('')
    setSavingNote(false)
  }

  const events = [...(enrichment?.events || [])].sort((a: any, b: any) => {
    const d = (a.event_date||'').localeCompare(b.event_date||'')
    if (d !== 0) return d
    const s: Record<string,number> = { Morning: 0, Day: 1, Evening: 2 }
    return (s[a.slot]??9) - (s[b.slot]??9)
  })
  const cities: any[] = enrichment?.cities || []
  const primaryCity = cities.find((c:any)=>c.is_primary) || cities[0]
  const coupleLabel = [lead?.bride_name, lead?.groom_name].filter(Boolean).join(' & ') || lead?.name || '—'
  const ig = igHandle(lead?.instagram)
  const isOverdue = (d?: string) => !!d && new Date(d) < new Date()

  const timeline = [
    ...notes.map((n:any)=>({...n,_type:'note',_ts:new Date(n.created_at||0).getTime()})),
    ...activities.map((a:any)=>({...a,_type:'activity',_ts:new Date(a.created_at||0).getTime()})),
  ].sort((a,b)=>b._ts-a._ts)

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{background:'var(--background)'}}>
      <span className="text-sm" style={{color:'var(--foreground)',opacity:0.4}}>Loading…</span>
    </div>
  )
  if (!lead) return (
    <div className="min-h-screen flex items-center justify-center" style={{background:'var(--background)'}}>
      <span className="text-sm text-red-500">Lead not found</span>
    </div>
  )

  // ── shared styles ──
  const card = 'rounded-2xl border mb-5'
  const cs = { background:'var(--surface)', borderColor:'var(--border)' }
  const muted = { color:'var(--foreground)', opacity: 0.4 }
  const fg = { color:'var(--foreground)' }
  const tabBg = { background:'var(--background)' }

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{...tabBg, minHeight:'100vh', fontFamily:"'Open Sans', sans-serif"}}>

      {/* ── Header ── */}
      <div className="sticky top-0 z-30 border-b" style={{background:'var(--surface)', borderColor:'var(--border)'}}>
        <div className="max-w-5xl mx-auto px-5 md:px-8">

          {/* Row 1: back + name + actions */}
          <div className="flex items-center gap-3 pt-4 pb-3">
            <button onClick={()=>router.push('/leads')} style={muted} className="hover:opacity-100 transition shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7"/></svg>
            </button>

            {/* Heat dot */}
            <span className={`w-2 h-2 rounded-full shrink-0 ${lead.heat==='Hot'?'bg-rose-400':lead.heat==='Cold'?'bg-sky-400':'bg-amber-400'}`} />

            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <h1 className="text-lg font-semibold tracking-tight truncate" style={fg}>{coupleLabel}</h1>
                {lead.lead_number && <span className="text-xs" style={muted}>#{lead.lead_number}</span>}
                {lead.important && <span className="text-[10px] font-semibold tracking-wide px-2 py-0.5 rounded-full" style={{background:'var(--surface-muted)', color:'var(--foreground)', opacity:0.7}}>Important</span>}
                {lead.potential && <span className="text-[10px] font-semibold tracking-wide px-2 py-0.5 rounded-full" style={{background:'var(--surface-muted)', color:'var(--foreground)', opacity:0.7}}>Potential</span>}
              </div>
            </div>

            {/* Contact quick actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              {lead.primary_phone && (
                <>
                  <a href={`tel:${lead.primary_phone}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition hover:opacity-80"
                    style={{borderColor:'var(--border)', background:'var(--surface)', color:'var(--foreground)'}}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                    Call
                  </a>
                  <a href={`https://wa.me/91${lead.primary_phone.replace(/\D/g,'').slice(-10)}`} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition hover:opacity-80"
                    style={{borderColor:'var(--border)', background:'var(--surface)', color:'var(--foreground)'}}>
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.478 2 2 6.478 2 12c0 1.85.504 3.58 1.38 5.065L2 22l5.083-1.335A9.945 9.945 0 0012 22c5.522 0 10-4.478 10-10S17.522 2 12 2zm0 18.182a8.168 8.168 0 01-4.169-1.145l-.299-.178-3.017.791.806-2.944-.196-.303A8.14 8.14 0 013.818 12C3.818 7.48 7.48 3.818 12 3.818c4.52 0 8.182 3.662 8.182 8.182 0 4.52-3.662 8.182-8.183 8.182z"/></svg>
                    WhatsApp
                  </a>
                </>
              )}
              {ig && (
                <a href={`https://instagram.com/${ig}`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition hover:opacity-80"
                  style={{borderColor:'var(--border)', background:'var(--surface)', color:'var(--foreground)'}}>
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                  @{ig}
                </a>
              )}
              <Link href={`/leads/${id}`}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border transition hover:opacity-80"
                style={{borderColor:'var(--border)', background:'var(--surface-muted)', color:'var(--foreground)', opacity:0.6}}>
                Original
              </Link>
            </div>
          </div>

          {/* Row 2: status + followup */}
          <div className="flex items-center gap-3 pb-3 flex-wrap">
            <select value={lead.status} onChange={async e => {
              const s = e.target.value
              await apiFetch(`/api/leads/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: s }) })
              const updated = await apiFetch(`/api/leads/${id}`).then(r => r.json()).catch(() => lead)
              setLead(updated)
            }} className="text-xs font-medium rounded-lg border px-3 py-1.5 outline-none transition"
              style={{background:'var(--surface)', borderColor:'var(--border)', color:'var(--foreground)'}}>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>

            {lead.heat && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-lg border"
                style={{background:'var(--surface-muted)', borderColor:'var(--border)', color:'var(--foreground)', opacity:0.7}}>
                {lead.heat === 'Hot' ? '🔥' : lead.heat === 'Cold' ? '❄' : '🌤'} {lead.heat}
              </span>
            )}

            {lead.next_followup_date && (
              <span className={`text-xs font-medium px-2.5 py-1 rounded-lg border ${isOverdue(lead.next_followup_date) ? 'text-amber-700 bg-amber-50 border-amber-200' : ''}`}
                style={isOverdue(lead.next_followup_date) ? {} : {background:'var(--surface-muted)', borderColor:'var(--border)', color:'var(--foreground)', opacity:0.7}}>
                Followup: {fmtDate(lead.next_followup_date)}{isOverdue(lead.next_followup_date) ? ' · Overdue' : ''}
              </span>
            )}

            <Link href={`/leads/${id}?tab=dashboard`}
              className="ml-auto text-xs font-medium px-3 py-1.5 rounded-lg border transition hover:opacity-80"
              style={{borderColor:'var(--border)', background:'var(--surface)', color:'var(--foreground)', opacity:0.6}}>
              Full actions →
            </Link>
          </div>

          {/* Row 3: tabs */}
          <div className="flex gap-1 -mb-px">
            {(['overview','profile','timeline','quotes'] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className="px-4 py-2 text-xs font-semibold tracking-wide uppercase border-b-[1.5px] transition capitalize"
                style={tab === t
                  ? {borderColor:'var(--foreground)', color:'var(--foreground)'}
                  : {borderColor:'transparent', color:'var(--foreground)', opacity:0.4}}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="max-w-5xl mx-auto px-5 md:px-8 py-7">


        {/* ═══ OVERVIEW ═══ */}
        {tab === 'overview' && (
          <div className="columns-1 lg:columns-2 gap-6">

            {/* Lead snapshot */}
            <div className={card} style={{...cs, breakInside:'avoid', marginBottom:'1.25rem'}}>
              <div className="px-5 pt-4 pb-2 border-b" style={{borderColor:'var(--border)'}}>
                <span className="text-[10px] font-bold uppercase tracking-widest" style={muted}>Lead Snapshot</span>
              </div>
              <div className="p-5 grid grid-cols-2 gap-x-6 gap-y-4">
                {[
                  ['Wedding Type', lead.is_destination ? 'Destination' : 'Local'],
                  ['Coverage', lead.coverage_scope || 'Both Sides'],
                  ['Event Type', lead.event_type],
                  ['City', primaryCity ? `${primaryCity.name}, ${primaryCity.state}` : null],
                  ['Source', lead.source ? (lead.source_name ? `${lead.source} · ${lead.source_name}` : lead.source) : null],
                  ['All Cities', cities.length > 1 ? cities.map((c:any)=>c.name).join(', ') : null],
                ].filter(([,v])=>v).map(([l,v])=>(
                  <div key={l as string}>
                    <div className="text-[10px] uppercase tracking-widest font-semibold mb-0.5" style={muted}>{l}</div>
                    <div className="text-sm font-medium" style={fg}>{v}</div>
                  </div>
                ))}
              </div>
              {lead.status === 'Rejected' && lead.rejected_reason && (
                <div className="mx-5 mb-4 text-xs px-3 py-2 rounded-lg" style={{background:'var(--surface-muted)', color:'var(--foreground)', opacity:0.7}}>Rejection reason: {lead.rejected_reason}</div>
              )}
              {lead.status === 'Lost' && (lead as any).lost_reason && (
                <div className="mx-5 mb-4 text-xs px-3 py-2 rounded-lg" style={{background:'var(--surface-muted)', color:'var(--foreground)', opacity:0.7}}>Lost reason: {(lead as any).lost_reason}</div>
              )}
            </div>

            {/* Contact */}
            <div className={card} style={{...cs, breakInside:'avoid', marginBottom:'1.25rem'}}>
              <div className="px-5 pt-4 pb-2 border-b flex items-center justify-between" style={{borderColor:'var(--border)'}}>
                <span className="text-[10px] font-bold uppercase tracking-widest" style={muted}>Contact</span>
                <Link href={`/leads/${id}?tab=contact`} className="text-[10px] font-semibold uppercase tracking-wider hover:opacity-100 transition" style={muted}>Edit</Link>
              </div>
              <div className="p-5 space-y-3">
                {[
                  ['Name', lead.name],
                  ['Phone', lead.primary_phone],
                  ['Alt', lead.phone_secondary],
                  ['Email', lead.email],
                ].filter(([,v])=>v).map(([l,v])=>(
                  <div key={l as string} className="flex items-center justify-between gap-3">
                    <span className="text-[10px] uppercase tracking-widest font-semibold shrink-0" style={muted}>{l}</span>
                    <span className="text-sm font-medium text-right" style={fg}>{v}</span>
                  </div>
                ))}
                {ig && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] uppercase tracking-widest font-semibold" style={muted}>Instagram</span>
                    <a href={`https://instagram.com/${ig}`} target="_blank" rel="noreferrer" className="text-sm font-medium underline underline-offset-2" style={fg}>@{ig}</a>
                  </div>
                )}
                {(lead.bride_name || lead.groom_name) && (
                  <div className="pt-2 border-t" style={{borderColor:'var(--border)'}}>
                    {lead.bride_name && (
                      <div className="flex items-center justify-between gap-3 py-1">
                        <span className="text-[10px] uppercase tracking-widest font-semibold" style={muted}>Bride</span>
                        <span className="text-sm font-medium" style={fg}>{lead.bride_name}{lead.bride_phone_primary ? ` · ${lead.bride_phone_primary}` : ''}</span>
                      </div>
                    )}
                    {lead.groom_name && (
                      <div className="flex items-center justify-between gap-3 py-1">
                        <span className="text-[10px] uppercase tracking-widest font-semibold" style={muted}>Groom</span>
                        <span className="text-sm font-medium" style={fg}>{lead.groom_name}{lead.groom_phone_primary ? ` · ${lead.groom_phone_primary}` : ''}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Events */}
            <div className={card} style={{...cs, breakInside:'avoid', marginBottom:'1.25rem'}}>
              <div className="px-5 pt-4 pb-2 border-b flex items-center justify-between" style={{borderColor:'var(--border)'}}>
                <span className="text-[10px] font-bold uppercase tracking-widest" style={muted}>Events · {events.length}</span>
                <Link href={`/leads/${id}?tab=enrichment`} className="text-[10px] font-semibold uppercase tracking-wider hover:opacity-100 transition" style={muted}>Edit</Link>
              </div>
              {events.length === 0 ? (
                <div className="p-5 text-sm" style={muted}>No events added.</div>
              ) : (
                <div className="divide-y" style={{borderColor:'var(--border)'}}>
                  {events.map((ev:any)=>(
                    <div key={ev.id} className="px-5 py-3.5 flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold" style={fg}>{ev.event_type || '—'}</div>
                        {ev.venue ? (
                          <div className="mt-0.5">
                            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${ev.venue} ${ev.city_name||''}`)}`}
                              target="_blank" rel="noreferrer"
                              className="text-xs font-medium underline underline-offset-2 hover:opacity-70 transition" style={fg}>
                              {ev.venue}
                            </a>
                            {venueType(ev) && <span className="ml-2 text-[10px]" style={muted}>{venueType(ev)}</span>}
                          </div>
                        ) : null}
                        {ev.city_name && <div className="text-[10px] mt-0.5" style={muted}>{ev.city_name}</div>}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-semibold" style={fg}>{fmtDate(ev.event_date)}</div>
                        {ev.slot && <div className="text-[10px] mt-0.5" style={muted}>{ev.slot}</div>}
                        {ev.pax != null && <div className="text-[10px] mt-0.5" style={muted}>{ev.pax} guests</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pricing */}
            <div className={card} style={{...cs, breakInside:'avoid', marginBottom:'1.25rem'}}>
              <div className="px-5 pt-4 pb-2 border-b flex items-center justify-between" style={{borderColor:'var(--border)'}}>
                <span className="text-[10px] font-bold uppercase tracking-widest" style={muted}>Pricing</span>
                {quotes.length > 0 && <Link href={`/leads/${id}/quotes/${quotes[0].id}`} className="text-[10px] font-semibold uppercase tracking-wider hover:opacity-100 transition" style={muted}>Open Builder</Link>}
              </div>
              <div className="p-5 grid grid-cols-2 gap-x-6 gap-y-4">
                {[
                  ['Client Budget', fmtINR(lead.client_budget_amount)],
                  ['Amount Quoted', fmtINR(lead.amount_quoted)],
                  ['Discounted', fmtINR(lead.discounted_amount)],
                  ['Client Offer', fmtINR(lead.client_offer_amount)],
                ].map(([l,v])=>(
                  <div key={l as string}>
                    <div className="text-[10px] uppercase tracking-widest font-semibold mb-0.5" style={muted}>{l}</div>
                    <div className="text-sm font-semibold" style={{...fg, opacity: v ? 1 : 0.3}}>{v || '—'}</div>
                  </div>
                ))}
              </div>
              {quotes.length > 0 && (
                <div className="mx-5 mb-4 px-4 py-3 rounded-xl border flex items-center justify-between" style={{borderColor:'var(--border)', background:'var(--surface-muted)'}}>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest font-semibold" style={muted}>Latest Quote</div>
                    <div className="text-xs font-medium mt-0.5" style={fg}>v{quotes[0].version} · {quotes[0].status}</div>
                  </div>
                  <div className="text-base font-bold" style={fg}>{fmtINR(quotes[0].discounted_amount||quotes[0].total_amount)}</div>
                </div>
              )}
            </div>

            {/* Notes */}
            <div className={card} style={{...cs, breakInside:'avoid', marginBottom:'1.25rem'}}>
              <div className="px-5 pt-4 pb-2 border-b flex items-center justify-between" style={{borderColor:'var(--border)'}}>
                <span className="text-[10px] font-bold uppercase tracking-widest" style={muted}>Notes · {notes.length}</span>
                <button onClick={()=>setTab('timeline')} className="text-[10px] font-semibold uppercase tracking-wider hover:opacity-100 transition" style={muted}>All</button>
              </div>
              <div className="p-4">
                <div className="flex gap-2 mb-4">
                  <textarea value={noteText} onChange={e=>setNoteText(e.target.value)}
                    placeholder="Add a note…"
                    rows={1}
                    className="flex-1 text-sm px-3 py-2 rounded-xl border outline-none resize-none transition focus:opacity-100"
                    style={{background:'var(--surface-muted)', borderColor:'var(--border)', color:'var(--foreground)'}}
                    onInput={e=>{const t=e.currentTarget;t.style.height='auto';t.style.height=Math.min(t.scrollHeight,96)+'px'}}
                    onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey))saveNote()}} />
                  <button onClick={saveNote} disabled={savingNote||!noteText.trim()}
                    className="px-3 py-2 text-xs font-semibold rounded-xl border self-start transition hover:opacity-80 disabled:opacity-30"
                    style={{background:'var(--accent)', color:'var(--surface)', borderColor:'var(--accent)'}}>
                    {savingNote?'…':'Add'}
                  </button>
                </div>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {notes.length===0&&<div className="text-sm" style={muted}>No notes yet.</div>}
                  {[...notes].reverse().map((n:any)=>(
                    <div key={n.id} className="px-4 py-3 rounded-xl border" style={{background:'var(--surface-muted)', borderColor:'var(--border)'}}>
                      <div className="text-sm leading-relaxed whitespace-pre-wrap" style={fg}>{n.note_text}</div>
                      <div className="text-[10px] mt-2 flex items-center gap-2" style={muted}>
                        <span>{fmtDT(n.created_at)}</span>
                        {n.status_at_time && <><span>·</span><span>{n.status_at_time}</span></>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Activity */}
            <div className={card} style={{...cs, breakInside:'avoid', marginBottom:'1.25rem'}}>
              <div className="px-5 pt-4 pb-2 border-b flex items-center justify-between" style={{borderColor:'var(--border)'}}>
                <span className="text-[10px] font-bold uppercase tracking-widest" style={muted}>Recent Activity</span>
                <button onClick={()=>setTab('timeline')} className="text-[10px] font-semibold uppercase tracking-wider hover:opacity-100 transition" style={muted}>Full Timeline</button>
              </div>
              <div className="divide-y" style={{borderColor:'var(--border)'}}>
                {activities.length===0&&<div className="p-5 text-sm" style={muted}>No activity yet.</div>}
                {activities.slice(0,6).map((a:any)=>(
                  <div key={a.id} className="px-5 py-3 flex items-start justify-between gap-4">
                    <div className="text-xs font-medium" style={fg}>{a.description||a.activity_type||a.type||'—'}</div>
                    <div className="text-[10px] shrink-0" style={muted}>{fmtDT(a.created_at)}</div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}


        {/* ═══ PROFILE ═══ */}
        {tab === 'profile' && (
          <div className="space-y-5">

            {/* Contact */}
            <div className={card} style={cs}>
              <div className="px-5 pt-4 pb-2 border-b flex items-center justify-between" style={{borderColor:'var(--border)'}}>
                <span className="text-[10px] font-bold uppercase tracking-widest" style={muted}>Contact Details</span>
                <Link href={`/leads/${id}?tab=contact`} className="text-[10px] font-semibold uppercase tracking-wider hover:opacity-100" style={muted}>Edit</Link>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-4">
                  {[['Name',lead.name],['Primary Phone',lead.primary_phone],['Alt Phone',lead.phone_secondary],['Email',lead.email],['Instagram',ig?`@${ig}`:null],['Source',lead.source?(lead.source_name?`${lead.source} · ${lead.source_name}`:lead.source):null]].filter(([,v])=>v).map(([l,v])=>(
                    <div key={l as string}>
                      <div className="text-[10px] uppercase tracking-widest font-semibold mb-0.5" style={muted}>{l}</div>
                      <div className="text-sm font-medium" style={fg}>{v}</div>
                    </div>
                  ))}
                </div>
                {lead.primary_phone && (
                  <div className="mt-5 flex gap-2">
                    <a href={`tel:${lead.primary_phone}`} className="flex-1 text-center py-2 text-xs font-semibold rounded-xl border transition hover:opacity-80" style={{background:'var(--accent)', color:'var(--surface)', borderColor:'var(--accent)'}}>📞 Call</a>
                    <a href={`https://wa.me/91${lead.primary_phone.replace(/\D/g,'').slice(-10)}`} target="_blank" rel="noreferrer" className="flex-1 text-center py-2 text-xs font-semibold rounded-xl border transition hover:opacity-80" style={{background:'var(--surface-muted)', borderColor:'var(--border)', color:'var(--foreground)'}}>💬 WhatsApp</a>
                  </div>
                )}
              </div>
            </div>

            {/* Couple */}
            {(lead.bride_name || lead.groom_name) && (
              <div className={card} style={cs}>
                <div className="px-5 pt-4 pb-2 border-b" style={{borderColor:'var(--border)'}}>
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={muted}>Couple</span>
                </div>
                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-8">
                  {lead.bride_name && (
                    <div>
                      <div className="text-[10px] uppercase tracking-widest font-bold mb-3" style={muted}>Bride</div>
                      <div className="space-y-2">
                        {[['Name',lead.bride_name],['Phone',lead.bride_phone_primary],['Alt',lead.bride_phone_secondary],['Email',lead.bride_email]].filter(([,v])=>v).map(([l,v])=>(
                          <div key={l as string}>
                            <div className="text-[10px] uppercase tracking-widest font-semibold" style={muted}>{l}</div>
                            <div className="text-sm font-medium" style={fg}>{v}</div>
                          </div>
                        ))}
                        {lead.bride_phone_primary && (
                          <div className="flex gap-2 pt-1">
                            <a href={`tel:${lead.bride_phone_primary}`} className="flex-1 text-center py-2 text-xs font-semibold rounded-xl border" style={{background:'var(--accent)',color:'var(--surface)',borderColor:'var(--accent)'}}>Call</a>
                            <a href={`https://wa.me/91${lead.bride_phone_primary.replace(/\D/g,'').slice(-10)}`} target="_blank" rel="noreferrer" className="flex-1 text-center py-2 text-xs font-semibold rounded-xl border" style={{background:'var(--surface-muted)',borderColor:'var(--border)',color:'var(--foreground)'}}>WhatsApp</a>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {lead.groom_name && (
                    <div>
                      <div className="text-[10px] uppercase tracking-widest font-bold mb-3" style={muted}>Groom</div>
                      <div className="space-y-2">
                        {[['Name',lead.groom_name],['Phone',lead.groom_phone_primary],['Alt',lead.groom_phone_secondary],['Email',lead.groom_email]].filter(([,v])=>v).map(([l,v])=>(
                          <div key={l as string}>
                            <div className="text-[10px] uppercase tracking-widest font-semibold" style={muted}>{l}</div>
                            <div className="text-sm font-medium" style={fg}>{v}</div>
                          </div>
                        ))}
                        {lead.groom_phone_primary && (
                          <div className="flex gap-2 pt-1">
                            <a href={`tel:${lead.groom_phone_primary}`} className="flex-1 text-center py-2 text-xs font-semibold rounded-xl border" style={{background:'var(--accent)',color:'var(--surface)',borderColor:'var(--accent)'}}>Call</a>
                            <a href={`https://wa.me/91${lead.groom_phone_primary.replace(/\D/g,'').slice(-10)}`} target="_blank" rel="noreferrer" className="flex-1 text-center py-2 text-xs font-semibold rounded-xl border" style={{background:'var(--surface-muted)',borderColor:'var(--border)',color:'var(--foreground)'}}>WhatsApp</a>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Wedding details + events */}
            <div className={card} style={cs}>
              <div className="px-5 pt-4 pb-2 border-b flex items-center justify-between" style={{borderColor:'var(--border)'}}>
                <span className="text-[10px] font-bold uppercase tracking-widest" style={muted}>Wedding & Events</span>
                <Link href={`/leads/${id}?tab=enrichment`} className="text-[10px] font-semibold uppercase tracking-wider hover:opacity-100" style={muted}>Edit</Link>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4 mb-5">
                  {[['Type',lead.event_type],['Coverage',lead.coverage_scope],['Wedding',lead.is_destination?'Destination':'Local'],['Budget',fmtINR(lead.client_budget_amount)],['Quoted',fmtINR(lead.amount_quoted||lead.discounted_amount)],['Cities',cities.map((c:any)=>c.name).join(', ')||null]].filter(([,v])=>v).map(([l,v])=>(
                    <div key={l as string}>
                      <div className="text-[10px] uppercase tracking-widest font-semibold mb-0.5" style={muted}>{l}</div>
                      <div className="text-sm font-medium" style={fg}>{v}</div>
                    </div>
                  ))}
                </div>
                {events.length > 0 && (
                  <div className="space-y-3 pt-4 border-t" style={{borderColor:'var(--border)'}}>
                    {events.map((ev:any)=>(
                      <div key={ev.id} className="rounded-xl border p-4 flex items-start justify-between gap-4" style={{borderColor:'var(--border)', background:'var(--surface-muted)'}}>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold" style={fg}>{ev.event_type||'—'}</div>
                          {ev.venue && (
                            <div className="mt-1">
                              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${ev.venue} ${ev.city_name||''}`)}`} target="_blank" rel="noreferrer" className="text-xs font-medium underline underline-offset-2 hover:opacity-70 transition" style={fg}>{ev.venue}</a>
                              {venueType(ev) && <span className="ml-2 text-[10px]" style={muted}>{venueType(ev)}</span>}
                            </div>
                          )}
                          {ev.city_name && <div className="text-[10px] mt-0.5" style={muted}>{ev.city_name}</div>}
                          {(ev.start_time||ev.end_time) && <div className="text-[10px] mt-0.5" style={muted}>{ev.start_time||'—'} – {ev.end_time||'—'}</div>}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs font-semibold" style={fg}>{fmtDate(ev.event_date)}</div>
                          {ev.slot&&<div className="text-[10px] mt-0.5" style={muted}>{ev.slot}</div>}
                          {ev.pax!=null&&<div className="text-[10px] mt-0.5" style={muted}>{ev.pax} guests</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ TIMELINE ═══ */}
        {tab === 'timeline' && (
          <div className="space-y-4 max-w-2xl">
            <div className={card} style={cs}>
              <div className="p-4 flex gap-2">
                <textarea value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder="Add a note…" rows={2}
                  className="flex-1 text-sm px-4 py-2.5 rounded-xl border outline-none resize-none"
                  style={{background:'var(--surface-muted)',borderColor:'var(--border)',color:'var(--foreground)'}}
                  onInput={e=>{const t=e.currentTarget;t.style.height='auto';t.style.height=Math.min(t.scrollHeight,120)+'px'}}
                  onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey))saveNote()}} />
                <button onClick={saveNote} disabled={savingNote||!noteText.trim()}
                  className="px-4 self-start py-2.5 text-xs font-semibold rounded-xl border transition disabled:opacity-30"
                  style={{background:'var(--accent)',color:'var(--surface)',borderColor:'var(--accent)'}}>
                  {savingNote?'…':'Save'}
                </button>
              </div>
              <div className="px-5 pb-3 text-[10px]" style={muted}>⌘↵ to save</div>
            </div>

            {timeline.length === 0 && (
              <div className={card + ' p-10 text-center text-sm'} style={{...cs,...muted}}>No notes or activity yet.</div>
            )}

            <div className="relative">
              <div className="absolute left-[19px] top-0 bottom-0 w-px" style={{background:'var(--border)'}} />
              <div className="space-y-3 pl-12">
                {timeline.map((item:any, i)=>{
                  const isNote = item._type === 'note'
                  return (
                    <div key={i} className="relative">
                      <div className="absolute -left-[2.15rem] top-4 w-5 h-5 rounded-full border-2 flex items-center justify-center text-[9px]"
                        style={{background: isNote ? 'var(--accent)' : 'var(--surface)', borderColor: isNote ? 'var(--accent)' : 'var(--border)', color: isNote ? 'var(--surface)' : 'var(--foreground)'}}>
                        {isNote ? '✍' : '·'}
                      </div>
                      <div className={card} style={{...cs, marginBottom:0}}>
                        <div className="px-4 py-3">
                          <div className="flex items-start justify-between gap-3 mb-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-widest" style={{...muted, opacity: isNote ? 0.8 : 0.4}}>
                              {isNote ? 'Note' : (item.activity_type||item.type||'Activity')}
                            </span>
                            <span className="text-[10px] shrink-0" style={muted}>{fmtDT(item.created_at)}</span>
                          </div>
                          <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{...fg, opacity: isNote ? 1 : 0.65}}>
                            {isNote ? item.note_text : (item.description||item.summary||item.activity_type||'')}
                          </div>
                          {isNote && item.status_at_time && (
                            <div className="text-[10px] mt-1.5" style={muted}>Status: {item.status_at_time}</div>
                          )}
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
        {tab === 'quotes' && (
          <div className="space-y-4 max-w-2xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-widest" style={muted}>{quotes.length} version{quotes.length!==1?'s':''}</span>
              <Link href={`/leads/${id}/quotes/new`} className="text-xs font-semibold px-4 py-2 rounded-xl border transition hover:opacity-80"
                style={{background:'var(--accent)',color:'var(--surface)',borderColor:'var(--accent)'}}>
                + New Quote
              </Link>
            </div>
            {quotes.length === 0 && (
              <div className={card+' p-10 text-center text-sm'} style={{...cs,...muted}}>No quotes yet.</div>
            )}
            {quotes.map((q:any)=>(
              <Link key={q.id} href={`/leads/${id}/quotes/${q.id}`} className={card+' block p-5 transition hover:shadow-md group'} style={cs}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-sm font-bold" style={fg}>Version {q.version}</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md border"
                        style={{background:'var(--surface-muted)',borderColor:'var(--border)',color:'var(--foreground)',opacity:0.7}}>
                        {q.status}
                      </span>
                    </div>
                    <div className="text-xs mt-1" style={muted}>{fmtDate(q.created_at)}</div>
                  </div>
                  <div className="text-right">
                    {q.total_amount && q.discounted_amount && q.total_amount !== q.discounted_amount && (
                      <div className="text-xs line-through" style={muted}>{fmtINR(q.total_amount)}</div>
                    )}
                    <div className="text-xl font-bold" style={fg}>{fmtINR(q.discounted_amount||q.total_amount)||'—'}</div>
                    <div className="text-[10px] mt-0.5 group-hover:opacity-80 transition" style={muted}>Open builder →</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

      </div>
    </div>
    </>
  )
}
