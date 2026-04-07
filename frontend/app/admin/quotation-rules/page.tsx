'use client'

import { useEffect, useState } from 'react'

type RuleCondition = {
  field: string
  operator: string
  value: string | number
}

type RuleItem = {
  catalogId?: number
  name: string
  quantity: number
}

type PricingRule = {
  id: number
  ruleName: string
  conditionsJson: RuleCondition[] | any
  defaultTeamJson: RuleItem[] | any
  defaultDeliverablesJson: RuleItem[] | any
  priority: number
  active: boolean
}

type CatalogItem = {
  id: number
  name: string
  price: number
}

const cardClass = 'rounded-2xl border border-neutral-200 bg-white shadow-sm'

export default function QuotationRulesPage() {
  const [rules, setRules] = useState<PricingRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [teamCatalog, setTeamCatalog] = useState<CatalogItem[]>([])
  const [deliverablesCatalog, setDeliverablesCatalog] = useState<CatalogItem[]>([])

  const [modalOpen, setModalOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<PricingRule | null>(null)
  const [saving, setSaving] = useState(false)

  // Form states
  const [ruleName, setRuleName] = useState('')
  const [priority, setPriority] = useState(0)

  const [conditions, setConditions] = useState<RuleCondition[]>([])
  const [teamItems, setTeamItems] = useState<RuleItem[]>([])
  const [deliverableItems, setDeliverableItems] = useState<RuleItem[]>([])

  const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
    fetch(input, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...init,
    })

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [rulesRes, teamRes, delRes] = await Promise.all([
        apiFetch('/api/pricing-rules'),
        apiFetch('/api/catalog/team-roles'),
        apiFetch('/api/catalog/deliverables'),
      ])
      const rData = await rulesRes.json().catch(() => [])
      const tData = await teamRes.json().catch(() => [])
      const dData = await delRes.json().catch(() => [])

      if (rulesRes.ok) setRules(Array.isArray(rData) ? rData : [])
      if (teamRes.ok) setTeamCatalog(Array.isArray(tData) ? tData : [])
      if (delRes.ok) setDeliverablesCatalog(Array.isArray(dData) ? dData : [])
    } catch {
      setError('Failed to load rules')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const openModal = (rule?: PricingRule) => {
    if (rule) {
      setEditingRule(rule)
      setRuleName(rule.ruleName || '')
      setPriority(rule.priority || 0)
      
      const c = Array.isArray(rule.conditionsJson) ? rule.conditionsJson : (rule.conditionsJson?.items || [])
      setConditions(c)
      
      const t = Array.isArray(rule.defaultTeamJson) ? rule.defaultTeamJson : (rule.defaultTeamJson?.items || [])
      setTeamItems(t)
      
      const d = Array.isArray(rule.defaultDeliverablesJson) ? rule.defaultDeliverablesJson : (rule.defaultDeliverablesJson?.items || [])
      setDeliverableItems(d)
    } else {
      setEditingRule(null)
      setRuleName('')
      setPriority(0)
      setConditions([])
      setTeamItems([])
      setDeliverableItems([])
    }
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!ruleName.trim()) return setError('Rule Name is required')
    setSaving(true)
    setError(null)

    const payload = {
      ruleName: ruleName.trim(),
      priority,
      conditionsJson: conditions,
      defaultTeamJson: teamItems,
      defaultDeliverablesJson: deliverableItems,
    }

    try {
      const url = editingRule ? `/api/pricing-rules/${editingRule.id}` : '/api/pricing-rules'
      const method = editingRule ? 'PATCH' : 'POST'
      
      const res = await apiFetch(url, { method, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error('Failed to save rule')
      
      closeModal()
      loadData()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this rule entirely?')) return
    try {
      const res = await apiFetch(`/api/pricing-rules/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setRules(rules.filter(r => r.id !== id))
      }
    } catch (err) {
      console.error(err)
    }
  }

  const closeModal = () => !saving && setModalOpen(false)

  return (
    <div className="min-h-screen bg-neutral-50 px-6 py-8 pb-24">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.35em] text-neutral-500">Admin</div>
            <h1 className="mt-2 text-2xl font-semibold text-neutral-900">Quotation Rules Engine</h1>
            <p className="mt-1 text-sm text-neutral-600">
              Automatically suggest Team composition and Deliverables based on Event type and Pax length.
            </p>
          </div>
          <button
            onClick={() => openModal()}
            className="rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 transition shadow-sm"
          >
            Create New Rule
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="h-40 rounded-2xl border border-neutral-100 bg-white animate-pulse" />
        ) : rules.length === 0 ? (
           <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-neutral-200 py-20 bg-white">
              <h3 className="text-lg font-semibold text-neutral-800">No Rules Setup</h3>
              <p className="text-sm text-neutral-500 mt-1 max-w-sm text-center">
                 Create rules here so your Quotation Builder automatically knows exactly what team is required for which event.
              </p>
           </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {rules.map(rule => (
              <div key={rule.id} className={`${cardClass} p-5 flex flex-col group relative overflow-hidden`}>
                <div className="absolute top-0 left-0 w-1 h-full bg-neutral-200 group-hover:bg-neutral-900 transition-colors" />
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-semibold text-neutral-900 pl-2">{rule.ruleName}</h3>
                </div>
                
                <div className="pl-2 space-y-3 flex-1">
                   <div className="text-xs space-y-1">
                     <div className="font-semibold text-neutral-500 uppercase">Conditions</div>
                     {Array.isArray(rule.conditionsJson) && rule.conditionsJson.length > 0 ? (
                       rule.conditionsJson.map((c, i) => (
                         <div key={i} className="text-neutral-700 truncate bg-neutral-50 p-1.5 rounded border border-neutral-100">
                           <span className="font-medium text-neutral-900">{c.field}</span> {c.operator ?? '='} <span className="text-blue-600 font-medium">{c.value}</span>
                         </div>
                       ))
                     ) : (
                       <div className="text-neutral-400 italic">Global Default (Always triggers)</div>
                     )}
                   </div>

                   <div className="grid grid-cols-2 gap-2 text-xs border-t border-neutral-100 pt-3">
                     <div>
                       <span className="font-semibold text-neutral-500 uppercase block mb-1">Team</span>
                       <span className="text-neutral-900 font-medium text-lg">
                          {(Array.isArray(rule.defaultTeamJson) ? rule.defaultTeamJson.length : 0)}
                       </span> roles
                     </div>
                     <div>
                       <span className="font-semibold text-neutral-500 uppercase block mb-1">Deliverables</span>
                       <span className="text-neutral-900 font-medium text-lg">
                          {(Array.isArray(rule.defaultDeliverablesJson) ? rule.defaultDeliverablesJson.length : 0)}
                       </span> items
                     </div>
                   </div>
                </div>

                <div className="mt-4 pt-3 border-t border-neutral-100 flex gap-2 w-full">
                  <button onClick={() => openModal(rule)} className="flex-1 text-xs font-semibold py-2 rounded-lg bg-neutral-50 hover:bg-neutral-100 text-neutral-700 transition">
                    Edit Rule
                  </button>
                  <button onClick={() => handleDelete(rule.id)} className="px-3 text-xs font-semibold py-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 transition">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
             <div className="p-5 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
               <h2 className="text-xl font-bold text-neutral-900">{editingRule ? 'Edit' : 'Create'} Quotation Rule</h2>
               <button onClick={closeModal} className="text-neutral-500 hover:text-neutral-900">
                 <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                 </svg>
               </button>
             </div>

             <div className="p-6 overflow-y-auto flex-1 space-y-8">
                {/* Basic Settings */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-neutral-600">Rule Name</label>
                    <input type="text" value={ruleName} onChange={e => setRuleName(e.target.value)} placeholder="e.g. Haldi Low Pax" className="mt-1.5 w-full rounded-xl border border-neutral-200 px-4 py-2 text-sm focus:border-neutral-900 focus:outline-none" />
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="text-xs font-semibold text-neutral-600">Priority (Higher runs first)</label>
                      <input type="number" value={priority} onChange={e => setPriority(Number(e.target.value) || 0)} className="mt-1.5 w-full rounded-xl border border-neutral-200 px-4 py-2 text-sm focus:border-neutral-900 focus:outline-none" />
                    </div>
                  </div>
                </div>

                <div className="bg-neutral-50 p-5 rounded-xl border border-neutral-100">
                   <h3 className="text-sm font-bold text-neutral-900 mb-4 border-b border-neutral-200 pb-2">Triggers & Conditions</h3>
                   <div className="space-y-3">
                     {conditions.map((c, i) => (
                       <div key={i} className="flex gap-2 items-center">
                         <select value={c.field} onChange={(e) => {
                           const n = [...conditions]; n[i].field = e.target.value; setConditions(n)
                         }} className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm bg-white">
                           <option value="event">Event Name</option>
                           <option value="pax">Guest Count (Pax)</option>
                           <option value="destination">Destination (true/false)</option>
                         </select>
                         
                         <select value={c.operator} onChange={(e) => {
                           const n = [...conditions]; n[i].operator = e.target.value; setConditions(n)
                         }} className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm bg-white">
                           <option value="=">Equals</option>
                           <option value=">=">Greater or Equal</option>
                           <option value="<=">Less or Equal</option>
                         </select>

                         <input type="text" value={c.value} onChange={(e) => {
                           const n = [...conditions]; n[i].value = e.target.value; setConditions(n)
                         }} placeholder="Value" className="flex-1 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm bg-white" />

                         <button onClick={() => setConditions(conditions.filter((_, idx) => idx !== i))} className="text-rose-500 hover:text-rose-700 p-2">✕</button>
                       </div>
                     ))}
                     <button onClick={() => setConditions([...conditions, { field: 'event', operator: '=', value: '' }])} className="text-xs font-semibold px-3 py-1.5 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 shadow-sm mt-2 transition">
                       + Add Condition
                     </button>
                   </div>
                   <p className="text-[10px] text-neutral-500 mt-3 pt-3 border-t border-neutral-200/50">If multiple conditions are added, ALL must match (AND). If empty, it becomes a universal fallback.</p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                   <div className="space-y-3">
                      <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                         <h3 className="text-sm font-bold text-neutral-900">Suggested Team</h3>
                         <button onClick={() => setTeamItems([...teamItems, { catalogId: teamCatalog[0]?.id || 0, name: teamCatalog[0]?.name || '', quantity: 1 }])} className="text-xs font-semibold px-2 py-1 bg-neutral-900 text-white rounded hover:bg-neutral-800 transition">+ Add Role</button>
                      </div>
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                        {teamItems.map((item, i) => (
                           <div key={i} className="flex gap-2 items-center bg-white p-2 rounded-lg border border-neutral-200">
                              <select value={item.catalogId || ''} onChange={(e) => {
                                 const catId = Number(e.target.value);
                                 const cat = teamCatalog.find(t => t.id === catId);
                                 if(!cat) return;
                                 const n = [...teamItems];
                                 n[i] = { catalogId: catId, name: cat.name, quantity: n[i].quantity || 1 };
                                 setTeamItems(n);
                              }} className="flex-1 rounded-md border-neutral-200 text-sm focus:ring-0">
                                 <option disabled value="">Select Role...</option>
                                 {teamCatalog.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                              </select>
                              <input type="number" min="1" value={item.quantity} onChange={(e) => {
                                 const n = [...teamItems]; n[i].quantity = Number(e.target.value) || 1; setTeamItems(n)
                              }} className="w-16 rounded-md border-neutral-200 text-sm focus:ring-0 text-center" />
                              <button onClick={() => setTeamItems(teamItems.filter((_, idx) => idx !== i))} className="text-neutral-400 hover:text-rose-500">✕</button>
                           </div>
                        ))}
                      </div>
                   </div>

                   <div className="space-y-3">
                      <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                         <h3 className="text-sm font-bold text-neutral-900">Suggested Deliverables</h3>
                         <button onClick={() => setDeliverableItems([...deliverableItems, { catalogId: deliverablesCatalog[0]?.id || 0, name: deliverablesCatalog[0]?.name || '', quantity: 1 }])} className="text-xs font-semibold px-2 py-1 bg-neutral-900 text-white rounded hover:bg-neutral-800 transition">+ Add Output</button>
                      </div>
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                        {deliverableItems.map((item, i) => (
                           <div key={i} className="flex gap-2 items-center bg-white p-2 rounded-lg border border-neutral-200">
                              <select value={item.catalogId || ''} onChange={(e) => {
                                 const catId = Number(e.target.value);
                                 const cat = deliverablesCatalog.find(t => t.id === catId);
                                 if(!cat) return;
                                 const n = [...deliverableItems];
                                 n[i] = { catalogId: catId, name: cat.name, quantity: n[i].quantity || 1 };
                                 setDeliverableItems(n);
                              }} className="flex-1 rounded-md border-neutral-200 text-sm focus:ring-0">
                                 <option disabled value="">Select Deliverable...</option>
                                 {deliverablesCatalog.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                              </select>
                              <input type="number" min="1" value={item.quantity} onChange={(e) => {
                                 const n = [...deliverableItems]; n[i].quantity = Number(e.target.value) || 1; setDeliverableItems(n)
                              }} className="w-16 rounded-md border-neutral-200 text-sm focus:ring-0 text-center" />
                              <button onClick={() => setDeliverableItems(deliverableItems.filter((_, idx) => idx !== i))} className="text-neutral-400 hover:text-rose-500">✕</button>
                           </div>
                        ))}
                      </div>
                   </div>
                </div>

             </div>

             <div className="p-5 border-t border-neutral-200 bg-neutral-50 flex justify-end gap-3">
               <button onClick={closeModal} className="px-5 py-2.5 rounded-xl border border-neutral-300 text-sm font-semibold text-neutral-700 bg-white hover:bg-neutral-50 transition shadow-sm">Cancel</button>
               <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 rounded-xl bg-neutral-900 text-sm font-semibold text-white hover:bg-neutral-800 transition disabled:opacity-50 shadow-sm flex items-center justify-center min-w-[120px]">
                  {saving ? 'Saving...' : 'Save Rule'}
               </button>
             </div>
          </div>
        </div>
      )}
    </div>
  )
}
