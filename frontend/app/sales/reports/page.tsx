'use client'

import { useEffect, useState } from 'react'
import { toISTISOString } from '@/lib/formatters'

type FunnelRow = {
  stage: string
  count: number
}

type LostReasonRow = {
  reason: string
  previous_status: string
  count: number
}

type HeatRow = {
  heat: 'Hot' | 'Warm' | 'Cold'
  count: number
}

type RangeKey = '7' | '30' | '90'

function getRangeParams(range: RangeKey) {
  const to = new Date()
  const from = new Date(
    Date.now() - Number(range) * 24 * 60 * 60 * 1000
  )

  return `from=${toISTISOString(from)}&to=${toISTISOString(to)}`
}

export default function SalesReportsPage() {
  const [funnel, setFunnel] = useState<FunnelRow[]>([])
  const [lostReasons, setLostReasons] = useState<LostReasonRow[]>([])
  const [heat, setHeat] = useState<HeatRow[]>([])
  const [range, setRange] = useState<RangeKey>('30')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)

    const params = getRangeParams(range)

    Promise.all([
      fetch(`/api/reports/funnel?${params}`, { credentials: 'include' }).then(r => r.json()),
      fetch(`/api/reports/lost-reasons?${params}`, { credentials: 'include' }).then(r => r.json()),
      fetch(`/api/reports/heat-distribution?${params}`, { credentials: 'include' }).then(r => r.json()),
    ]).then(([funnelData, lostData, heatData]) => {
      setFunnel(funnelData)
      setLostReasons(lostData)
      setHeat(heatData)
      setLoading(false)
    })
  }, [range])

  return (
    <div className="max-w-6xl space-y-8 sm:space-y-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-xl sm:text-2xl font-semibold">
          Sales Reports
        </h2>

        {/* RANGE SELECTOR */}
        <select
          value={range}
          onChange={e => setRange(e.target.value as RangeKey)}
          className="border border-neutral-200 bg-white rounded-xl px-3 py-2 text-xs sm:text-sm self-start sm:self-auto"
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
      </div>

      {loading && (
        <div className="text-sm text-neutral-500">
          Loading reports…
        </div>
      )}

      {!loading && (
        <>
          {/* FUNNEL */}
          <section>
            <h3 className="text-base sm:text-lg font-medium mb-3 sm:mb-4">
              Funnel Overview
            </h3>

            <div className="bg-white border rounded-xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-xs sm:text-sm min-w-[300px]">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="px-3.5 sm:px-4 py-2.5 sm:py-3 text-left">Stage</th>
                      <th className="px-3.5 sm:px-4 py-2.5 sm:py-3 text-right">Leads</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funnel.map(row => (
                      <tr key={row.stage} className="border-t">
                        <td className="px-3.5 sm:px-4 py-2.5 sm:py-3">{row.stage}</td>
                        <td className="px-3.5 sm:px-4 py-2.5 sm:py-3 text-right font-medium">
                          {row.count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* LOST REASONS */}
          <section>
            <h3 className="text-base sm:text-lg font-medium mb-3 sm:mb-4">
              Lost Reasons
            </h3>

            <div className="bg-white border rounded-xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-xs sm:text-sm min-w-[400px]">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="px-3.5 sm:px-4 py-2.5 sm:py-3 text-left">Reason</th>
                      <th className="px-3.5 sm:px-4 py-2.5 sm:py-3 text-left">Last Stage</th>
                      <th className="px-3.5 sm:px-4 py-2.5 sm:py-3 text-right">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lostReasons.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-3.5 sm:px-4 py-6 text-center text-neutral-500">
                          No lost leads in this period
                        </td>
                      </tr>
                    )}

                    {lostReasons.map((row, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3.5 sm:px-4 py-2.5 sm:py-3">{row.reason}</td>
                        <td className="px-3.5 sm:px-4 py-2.5 sm:py-3">{row.previous_status || '—'}</td>
                        <td className="px-3.5 sm:px-4 py-2.5 sm:py-3 text-right font-medium">
                          {row.count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* HEAT */}
          <section>
            <h3 className="text-base sm:text-lg font-medium mb-3 sm:mb-4">
              Heat Distribution
            </h3>

            <div className="bg-white border rounded-xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-xs sm:text-sm min-w-[300px]">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="px-3.5 sm:px-4 py-2.5 sm:py-3 text-left">Heat</th>
                      <th className="px-3.5 sm:px-4 py-2.5 sm:py-3 text-right">Leads</th>
                    </tr>
                  </thead>
                  <tbody>
                    {heat.map(row => (
                      <tr key={row.heat} className="border-t">
                        <td className="px-3.5 sm:px-4 py-2.5 sm:py-3">{row.heat}</td>
                        <td className="px-3.5 sm:px-4 py-2.5 sm:py-3 text-right font-medium">
                          {row.count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
