'use client'

import React from 'react'
import { Landmark, Church, Moon, Globe, Sparkles } from 'lucide-react'

export interface TraditionsAnswers {
  primary_tradition?: string
  main_traditions?: string[]
  main_other_custom?: string
  multicultural_details?: string
  indian_regions?: string[]
  north_indian_communities?: string[]
  north_indian_other_custom?: string
  south_indian_communities?: string[]
  south_indian_other_custom?: string
  west_indian_communities?: string[]
  west_indian_other_custom?: string
  east_indian_communities?: string[]
  east_indian_other_custom?: string
  northeast_indian_communities?: string[]
  northeast_indian_other_custom?: string
  other_indian_community_custom?: string
  sikh_community?: string
  hindu_community?: string
  christian_community?: string
  muslim_community?: string
  international_styles?: string[]
  international_other_custom?: string
  q7_important_details?: string
}

interface SectionTraditionsProps {
  answers: TraditionsAnswers
  onChange: (answers: TraditionsAnswers) => void
}

export default function SectionTraditions({ answers, onChange }: SectionTraditionsProps) {
  const toggleArrayItem = (field: keyof TraditionsAnswers, item: string) => {
    const list = ((answers[field] as string[]) || []).slice()
    const index = list.indexOf(item)
    if (index >= 0) {
      list.splice(index, 1)
    } else {
      list.push(item)
    }
    onChange({
      ...answers,
      [field]: list
    })
  }

  const updateField = (field: keyof TraditionsAnswers, val: any) => {
    onChange({
      ...answers,
      [field]: val
    })
  }

  const mainTraditions = answers.main_traditions || []
  const selectedTradition = mainTraditions[0] || ''
  const hasHinduIndian = selectedTradition === 'Hindu / Indian wedding' || selectedTradition === 'Indian wedding' || selectedTradition === 'Hindu wedding' || selectedTradition === 'Sikh wedding'
  const hasMuslim = selectedTradition === 'Muslim wedding'
  const hasChristian = selectedTradition === 'Christian wedding'
  const hasInternational = selectedTradition === 'International / Western wedding'
  const hasMulticultural = selectedTradition === 'Multicultural wedding' || selectedTradition === 'Interfaith / multicultural wedding'

  const indianRegions = answers.indian_regions || []
  const selectedRegion = indianRegions[0] || ''
  const hasNorth = selectedRegion === 'North Indian'
  const hasSouth = selectedRegion === 'South Indian'
  const hasWest = selectedRegion === 'West Indian'
  const hasEast = selectedRegion === 'East Indian'
  const hasNorthEast = selectedRegion === 'North-East Indian'
  const hasOtherIndianRegion = selectedRegion === 'Other Indian region / community'

  const selectSingleTradition = (traditionId: string) => {
    const isDeselect = selectedTradition === traditionId
    onChange({
      ...answers,
      main_traditions: isDeselect ? [] : [traditionId],
      primary_tradition: isDeselect ? '' : traditionId
    })
  }

  const selectSingleRegion = (region: string) => {
    updateField('indian_regions', selectedRegion === region ? [] : [region])
  }

  return (
    <div className="space-y-8 max-w-3xl mx-auto py-2">
      {/* Section Header */}
      <div className="space-y-2 border-b border-neutral-100 pb-5">
        <h2 className="text-2xl md:text-3xl font-extrabold text-neutral-900 tracking-tight">
          Traditions & Culture
        </h2>
        <p className="text-sm text-neutral-500">
          Every wedding has its own traditions, cultural influences and personality. Help us understand yours.
        </p>
      </div>

      <div className="space-y-8 text-left">
        {/* Q1 Header */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-neutral-900">
              Q1. Which cultural, religious or regional wedding traditions are you following?
            </label>
            <p className="text-xs text-neutral-500 mt-1">
              Select the primary tradition for your wedding celebrations.
            </p>
          </div>

          {/* 5 Clean Expandable Categories - Single Select with In-Place Extended Question */}
          <div className="space-y-3">
            {[
              { id: 'Hindu / Indian wedding', label: 'Hindu / Indian Wedding', icon: Landmark, desc: 'Includes Hindu & Sikh celebrations' },
              { id: 'Christian wedding', label: 'Christian Wedding', icon: Church, desc: 'Church ceremony, vows & reception' },
              { id: 'Muslim wedding', label: 'Muslim Wedding', icon: Moon, desc: 'Nikah, Walima & family celebrations' },
              { id: 'International / Western wedding', label: 'International / Western', icon: Globe, desc: 'Western ceremonies & celebrations' },
              { id: 'Multicultural wedding', label: 'Multicultural Wedding', icon: Sparkles, desc: 'Blending two cultures or faiths' }
            ].map((cat) => {
              const selected = selectedTradition === cat.id
              const Icon = cat.icon
              return (
                <div
                  key={cat.id}
                  className={`rounded-2xl transition-all bg-white overflow-hidden ${
                    selected
                      ? 'border-2 border-neutral-900 shadow-sm ring-1 ring-neutral-900/10'
                      : 'border border-neutral-200/80 hover:border-neutral-300 hover:bg-neutral-50/60'
                  }`}
                >
                  {/* Option Header Button */}
                  <button
                    type="button"
                    onClick={() => selectSingleTradition(cat.id)}
                    className="w-full p-4 text-left cursor-pointer flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0 text-amber-600">
                        <Icon className="w-5 h-5 stroke-[1.8]" />
                      </div>
                      <div>
                        <div className="font-semibold text-xs sm:text-sm text-neutral-900 leading-snug">
                          {cat.label}
                        </div>
                        <div className="text-[11px] text-neutral-500 mt-0.5">
                          {cat.desc}
                        </div>
                      </div>
                    </div>
                    {selected ? (
                      <span className="w-5 h-5 rounded-full bg-neutral-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                        ✓
                      </span>
                    ) : (
                      <span className="w-5 h-5 rounded-full border border-neutral-300 shrink-0" />
                    )}
                  </button>

                  {/* EXTENDED QUESTIONS: Opened directly below the selected option */}
                  {selected && (
                    <div className="px-4 pb-5 pt-2 border-t border-neutral-100 bg-neutral-50/30 space-y-4 animate-fade-in">
                      {/* 1. Hindu / Indian Wedding Extension */}
                      {cat.id === 'Hindu / Indian wedding' && (
                        <div className="space-y-4 pt-1">
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-amber-800 uppercase tracking-widest bg-amber-100/70 px-2.5 py-0.5 rounded-full inline-block">
                              Indian Regional Traditions
                            </span>
                            <div className="text-xs font-bold text-neutral-900">
                              Which Indian regions or communities best represent your celebrations?
                            </div>
                            <p className="text-[11px] text-neutral-500">
                              Select your region to view specific community options.
                            </p>
                          </div>

                          {/* Single Select Region Buttons */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {[
                              'North Indian',
                              'South Indian',
                              'West Indian',
                              'East Indian',
                              'North-East Indian',
                              'Other Indian region / community'
                            ].map((region) => {
                              const isRegSelected = selectedRegion === region
                              return (
                                <button
                                  key={region}
                                  type="button"
                                  onClick={() => selectSingleRegion(region)}
                                  className={`px-3 py-2 rounded-xl text-xs transition text-left cursor-pointer flex items-center justify-between ${
                                    isRegSelected
                                      ? 'bg-white border-2 border-neutral-900 shadow-sm ring-1 ring-neutral-900/10 text-neutral-900 font-semibold'
                                      : 'bg-white hover:bg-neutral-100 border border-neutral-200/80 text-neutral-700 font-normal'
                                  }`}
                                >
                                  <span className="text-xs">{region}</span>
                                  {isRegSelected ? (
                                    <span className="w-4 h-4 rounded-full bg-neutral-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0">✓</span>
                                  ) : (
                                    <span className="w-4 h-4 rounded-full border border-neutral-300 shrink-0" />
                                  )}
                                </button>
                              )
                            })}
                          </div>

                          {/* Level 3: North Indian Communities */}
                          {hasNorth && (
                            <div className="p-3.5 bg-white rounded-2xl border border-amber-200/80 space-y-2.5">
                              <div className="text-xs font-bold text-neutral-900">
                                North Indian Traditions & Communities:
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {[
                                  'Punjabi',
                                  'Sikh / Anand Karaj',
                                  'Rajasthani',
                                  'Marwari',
                                  'Kashmiri',
                                  'Himachali',
                                  'Haryanvi',
                                  'Bihari / Maithil',
                                  'Uttar Pradesh',
                                  'General North Indian wedding / no specific community',
                                  'Other North Indian tradition'
                                ].map((comm) => {
                                  const isCommSelected = (answers.north_indian_communities || []).includes(comm)
                                  return (
                                    <button
                                      key={comm}
                                      type="button"
                                      onClick={() => toggleArrayItem('north_indian_communities', comm)}
                                      className={`px-3 py-1.5 rounded-xl text-xs transition cursor-pointer flex items-center gap-1.5 ${
                                        isCommSelected
                                          ? 'bg-white border-2 border-neutral-900 text-neutral-900 font-bold shadow-2xs'
                                          : 'bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border border-neutral-200 font-medium'
                                      }`}
                                    >
                                      <span>{comm}</span>
                                      {isCommSelected && <span className="font-bold">✓</span>}
                                    </button>
                                  )
                                })}
                              </div>
                              {(answers.north_indian_communities || []).includes('Other North Indian tradition') && (
                                <input
                                  type="text"
                                  value={answers.north_indian_other_custom || ''}
                                  onChange={(e) => updateField('north_indian_other_custom', e.target.value)}
                                  placeholder="Specify other North Indian community..."
                                  className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-900"
                                />
                              )}
                            </div>
                          )}

                          {/* Level 3: South Indian Communities */}
                          {hasSouth && (
                            <div className="p-3.5 bg-white rounded-2xl border border-amber-200/80 space-y-2.5">
                              <div className="text-xs font-bold text-neutral-900">
                                South Indian Traditions:
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {[
                                  'Tamil',
                                  'Telugu',
                                  'Kannada',
                                  'Malayali / Kerala',
                                  'Other South Indian tradition'
                                ].map((comm) => {
                                  const isCommSelected = (answers.south_indian_communities || []).includes(comm)
                                  return (
                                    <button
                                      key={comm}
                                      type="button"
                                      onClick={() => toggleArrayItem('south_indian_communities', comm)}
                                      className={`px-3 py-1.5 rounded-xl text-xs transition cursor-pointer flex items-center gap-1.5 ${
                                        isCommSelected
                                          ? 'bg-white border-2 border-neutral-900 text-neutral-900 font-bold shadow-2xs'
                                          : 'bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border border-neutral-200 font-medium'
                                      }`}
                                    >
                                      <span>{comm}</span>
                                      {isCommSelected && <span className="font-bold">✓</span>}
                                    </button>
                                  )
                                })}
                              </div>
                              {(answers.south_indian_communities || []).includes('Other South Indian tradition') && (
                                <input
                                  type="text"
                                  value={answers.south_indian_other_custom || ''}
                                  onChange={(e) => updateField('south_indian_other_custom', e.target.value)}
                                  placeholder="Specify other South Indian community..."
                                  className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-900"
                                />
                              )}
                            </div>
                          )}

                          {/* Level 3: West Indian Communities */}
                          {hasWest && (
                            <div className="p-3.5 bg-white rounded-2xl border border-amber-200/80 space-y-2.5">
                              <div className="text-xs font-bold text-neutral-900">
                                West Indian Traditions:
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {[
                                  'Marathi',
                                  'Gujarati',
                                  'Goan',
                                  'Sindhi',
                                  'Other West Indian tradition'
                                ].map((comm) => {
                                  const isCommSelected = (answers.west_indian_communities || []).includes(comm)
                                  return (
                                    <button
                                      key={comm}
                                      type="button"
                                      onClick={() => toggleArrayItem('west_indian_communities', comm)}
                                      className={`px-3 py-1.5 rounded-xl text-xs transition cursor-pointer flex items-center gap-1.5 ${
                                        isCommSelected
                                          ? 'bg-white border-2 border-neutral-900 text-neutral-900 font-bold shadow-2xs'
                                          : 'bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border border-neutral-200 font-medium'
                                      }`}
                                    >
                                      <span>{comm}</span>
                                      {isCommSelected && <span className="font-bold">✓</span>}
                                    </button>
                                  )
                                })}
                              </div>
                              {(answers.west_indian_communities || []).includes('Other West Indian tradition') && (
                                <input
                                  type="text"
                                  value={answers.west_indian_other_custom || ''}
                                  onChange={(e) => updateField('west_indian_other_custom', e.target.value)}
                                  placeholder="Specify other West Indian community..."
                                  className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-900"
                                />
                              )}
                            </div>
                          )}

                          {/* Level 3: East Indian Communities */}
                          {hasEast && (
                            <div className="p-3.5 bg-white rounded-2xl border border-amber-200/80 space-y-2.5">
                              <div className="text-xs font-bold text-neutral-900">
                                East Indian Traditions:
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {['Bengali', 'Odia', 'Other East Indian tradition'].map((comm) => {
                                  const isCommSelected = (answers.east_indian_communities || []).includes(comm)
                                  return (
                                    <button
                                      key={comm}
                                      type="button"
                                      onClick={() => toggleArrayItem('east_indian_communities', comm)}
                                      className={`px-3 py-1.5 rounded-xl text-xs transition cursor-pointer flex items-center gap-1.5 ${
                                        isCommSelected
                                          ? 'bg-white border-2 border-neutral-900 text-neutral-900 font-bold shadow-2xs'
                                          : 'bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border border-neutral-200 font-medium'
                                      }`}
                                    >
                                      <span>{comm}</span>
                                      {isCommSelected && <span className="font-bold">✓</span>}
                                    </button>
                                  )
                                })}
                              </div>
                              {(answers.east_indian_communities || []).includes('Other East Indian tradition') && (
                                <input
                                  type="text"
                                  value={answers.east_indian_other_custom || ''}
                                  onChange={(e) => updateField('east_indian_other_custom', e.target.value)}
                                  placeholder="Specify other East Indian community..."
                                  className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-900"
                                />
                              )}
                            </div>
                          )}

                          {/* Level 3: North-East Indian Communities */}
                          {hasNorthEast && (
                            <div className="p-3.5 bg-white rounded-2xl border border-amber-200/80 space-y-2.5">
                              <div className="text-xs font-bold text-neutral-900">
                                North-East Indian Traditions:
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {['Assamese', 'Manipuri', 'Khasi / Meghalaya', 'Other North-East Indian tradition'].map((comm) => {
                                  const isCommSelected = (answers.northeast_indian_communities || []).includes(comm)
                                  return (
                                    <button
                                      key={comm}
                                      type="button"
                                      onClick={() => toggleArrayItem('northeast_indian_communities', comm)}
                                      className={`px-3 py-1.5 rounded-xl text-xs transition cursor-pointer flex items-center gap-1.5 ${
                                        isCommSelected
                                          ? 'bg-white border-2 border-neutral-900 text-neutral-900 font-bold shadow-2xs'
                                          : 'bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border border-neutral-200 font-medium'
                                      }`}
                                    >
                                      <span>{comm}</span>
                                      {isCommSelected && <span className="font-bold">✓</span>}
                                    </button>
                                  )
                                })}
                              </div>
                              {(answers.northeast_indian_communities || []).includes('Other North-East Indian tradition') && (
                                <input
                                  type="text"
                                  value={answers.northeast_indian_other_custom || ''}
                                  onChange={(e) => updateField('northeast_indian_other_custom', e.target.value)}
                                  placeholder="Specify other North-East community..."
                                  className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-900"
                                />
                              )}
                            </div>
                          )}

                          {/* Other Indian community text */}
                          {hasOtherIndianRegion && (
                            <div className="p-3 bg-white rounded-xl border border-neutral-200 space-y-1">
                              <label className="block text-xs font-bold text-neutral-700">Other Indian Community</label>
                              <input
                                type="text"
                                value={answers.other_indian_community_custom || ''}
                                onChange={(e) => updateField('other_indian_community_custom', e.target.value)}
                                placeholder="e.g. Kodava, Parsi, Anglo-Indian..."
                                className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-900"
                              />
                            </div>
                          )}

                          {/* Single Optional Detail Input */}
                          <div className="pt-2 border-t border-neutral-200/60 space-y-1.5">
                            <label className="block text-xs font-bold text-neutral-900">
                              Hindu / Indian Tradition Details (Optional)
                            </label>
                            <input
                              type="text"
                              value={answers.hindu_community || answers.sikh_community || ''}
                              onChange={(e) => {
                                updateField('hindu_community', e.target.value)
                                updateField('sikh_community', e.target.value)
                              }}
                              placeholder="e.g. Punjabi Hindu, Arya Samaji, Anand Karaj, South Indian Brahmin..."
                              className="w-full p-2.5 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:outline-none focus:border-neutral-400"
                            />
                          </div>
                        </div>
                      )}

                      {/* 2. Christian Wedding Extension */}
                      {cat.id === 'Christian wedding' && (
                        <div className="space-y-2 pt-1">
                          <label className="block text-xs font-bold text-neutral-900">
                            Christian Tradition Details (Optional)
                          </label>
                          <p className="text-[11px] text-neutral-500">
                            Let us know your church or ceremony tradition so our team knows what to expect.
                          </p>
                          <input
                            type="text"
                            value={answers.christian_community || ''}
                            onChange={(e) => updateField('christian_community', e.target.value)}
                            placeholder="e.g. Catholic mass & vows, Syrian Christian ceremony, Protestant reception..."
                            className="w-full p-2.5 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:outline-none focus:border-neutral-400"
                          />
                        </div>
                      )}

                      {/* 3. Muslim Wedding Extension */}
                      {cat.id === 'Muslim wedding' && (
                        <div className="space-y-2 pt-1">
                          <label className="block text-xs font-bold text-neutral-900">
                            Muslim Tradition Details (Optional)
                          </label>
                          <p className="text-[11px] text-neutral-500">
                            Let us know your ceremony flow and customs.
                          </p>
                          <input
                            type="text"
                            value={answers.muslim_community || ''}
                            onChange={(e) => updateField('muslim_community', e.target.value)}
                            placeholder="e.g. Nikah ceremony, separate seating flow, Walima reception..."
                            className="w-full p-2.5 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:outline-none focus:border-neutral-400"
                          />
                        </div>
                      )}

                      {/* 4. International / Western Extension */}
                      {cat.id === 'International / Western wedding' && (
                        <div className="space-y-3 pt-1">
                          <div>
                            <span className="text-[10px] font-bold text-blue-800 uppercase tracking-widest bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200/60 inline-block">
                              International & Western Styles
                            </span>
                            <div className="text-xs font-bold text-neutral-900 mt-1">
                              Select any styles or ceremony types you are following:
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {[
                              'Spanish',
                              'European',
                              'Western',
                              'Latin American',
                              'Destination wedding style',
                              'Civil / non-religious ceremony',
                              'Fusion / multicultural wedding',
                              'Other'
                            ].map((style) => {
                              const isStyleSelected = (answers.international_styles || []).includes(style)
                              return (
                                <button
                                  key={style}
                                  type="button"
                                  onClick={() => toggleArrayItem('international_styles', style)}
                                  className={`px-3 py-1.5 rounded-xl text-xs transition cursor-pointer flex items-center gap-1.5 ${
                                    isStyleSelected
                                      ? 'bg-white border-2 border-neutral-900 text-neutral-900 font-bold shadow-2xs'
                                      : 'bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-200 font-medium'
                                  }`}
                                >
                                  <span>{style}</span>
                                  {isStyleSelected && <span className="font-bold">✓</span>}
                                </button>
                              )
                            })}
                          </div>
                          {(answers.international_styles || []).includes('Other') && (
                            <input
                              type="text"
                              value={answers.international_other_custom || ''}
                              onChange={(e) => updateField('international_other_custom', e.target.value)}
                              placeholder="Specify international style..."
                              className="w-full p-2.5 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:outline-none focus:border-neutral-400"
                            />
                          )}
                        </div>
                      )}

                      {/* 5. Multicultural Extension */}
                      {cat.id === 'Multicultural wedding' && (
                        <div className="space-y-3 pt-1">
                          <div>
                            <span className="text-[10px] font-bold text-purple-800 uppercase tracking-widest bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-200/60 inline-block">
                              Multicultural Blend
                            </span>
                            <div className="text-xs font-bold text-neutral-900 mt-1">
                              Which particular multicultural traditions are you blending?
                            </div>
                            <p className="text-[11px] text-neutral-500">
                              Pick a common combination or describe your custom blend below:
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {[
                              'Hindu + Christian',
                              'Hindu + Sikh',
                              'Hindu + Muslim',
                              'Indian + Western',
                              'Christian + Jewish',
                              'South Indian + North Indian'
                            ].map((sug) => (
                              <button
                                key={sug}
                                type="button"
                                onClick={() => updateField('multicultural_details', sug)}
                                className="px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-white border border-purple-200 hover:bg-purple-50 text-purple-900 transition cursor-pointer"
                              >
                                + {sug}
                              </button>
                            ))}
                          </div>

                          <input
                            type="text"
                            value={answers.multicultural_details || ''}
                            onChange={(e) => updateField('multicultural_details', e.target.value)}
                            placeholder="e.g. Hindu + Christian (Two ceremonies: Church and Mandap)..."
                            className="w-full p-3 bg-white border border-purple-200 focus:border-purple-400 focus:outline-none rounded-xl text-xs text-neutral-900 placeholder:text-neutral-400 font-medium transition"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Q2 */}
        <div className="space-y-2 border-t border-neutral-100 pt-6">
          <label className="block text-sm font-bold text-neutral-800">
            Q2. Are there any traditions or cultural details that are particularly important for our photography and film teams to understand?
          </label>
          <textarea
            rows={4}
            value={answers.q7_important_details || ''}
            onChange={(e) => updateField('q7_important_details', e.target.value)}
            placeholder="Key rituals (e.g. Sindoor daan, Saat phere, Kanyadaan, Milni, Ring exchange, Vows), timing nuances, or moments where family expects close coverage..."
            className="w-full p-4 rounded-2xl bg-neutral-50/80 border border-neutral-200 focus:bg-white focus:border-neutral-400 focus:outline-none text-sm text-neutral-900 placeholder:text-neutral-400 transition"
          />
        </div>
      </div>
    </div>
  )
}
