'use client'

import React from 'react'

export interface TraditionsAnswers {
  main_traditions?: string[]
  main_other_custom?: string
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
  const hasIndian = mainTraditions.includes('Indian wedding')
  const hasHindu = mainTraditions.includes('Hindu wedding')
  const hasSikh = mainTraditions.includes('Sikh wedding')
  const hasMuslim = mainTraditions.includes('Muslim wedding')
  const hasChristian = mainTraditions.includes('Christian wedding')
  const hasInternational = mainTraditions.includes('International / Western wedding')
  const hasOtherMain = mainTraditions.includes('Other')

  const indianRegions = answers.indian_regions || []
  const hasNorth = indianRegions.includes('North Indian')
  const hasSouth = indianRegions.includes('South Indian')
  const hasWest = indianRegions.includes('West Indian')
  const hasEast = indianRegions.includes('East Indian')
  const hasNorthEast = indianRegions.includes('North-East Indian')
  const hasOtherIndianRegion = indianRegions.includes('Other Indian region / community')

  return (
    <div className="space-y-8 max-w-3xl mx-auto py-2">
      {/* Section Header */}
      <div className="space-y-2 border-b border-neutral-100 pb-5">
        <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest bg-neutral-100 px-2.5 py-1 rounded-full">
          Section 02 of 08
        </span>
        <h2 className="text-2xl md:text-3xl font-extrabold text-neutral-900 tracking-tight">
          Your Traditions & Celebrations
        </h2>
        <p className="text-sm text-neutral-500 italic">
          &ldquo;Every wedding has its own traditions, cultural influences and personality. Help us understand yours.&rdquo;
        </p>
      </div>

      <div className="space-y-8 text-left">
        {/* Q6 Header */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-neutral-900">
              Q6. Which cultural, religious or regional wedding traditions are you following?
            </label>
            <p className="text-xs text-neutral-500 mt-1">
              Select all that apply to your celebrations. You can select multiple traditions if you are blending cultures.
            </p>
          </div>

          {/* Level 1: Main Selection Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {[
              'Indian wedding',
              'Hindu wedding',
              'Sikh wedding',
              'Muslim wedding',
              'Christian wedding',
              'Interfaith / multicultural wedding',
              'International / Western wedding',
              'Other'
            ].map((trad) => {
              const selected = mainTraditions.includes(trad)
              return (
                <button
                  key={trad}
                  type="button"
                  onClick={() => toggleArrayItem('main_traditions', trad)}
                  className={`p-3 rounded-2xl border text-xs font-semibold transition text-left cursor-pointer flex items-center justify-between ${
                    selected
                      ? 'bg-neutral-900 text-white border-neutral-900 shadow-sm'
                      : 'bg-neutral-50/70 hover:bg-white text-neutral-700 border-neutral-200'
                  }`}
                >
                  <span>{trad}</span>
                  {selected && <span className="text-[11px] font-bold">✓</span>}
                </button>
              )
            })}
          </div>

          {/* Level 1 Other Custom input */}
          {hasOtherMain && (
            <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 space-y-2 animate-fade-in">
              <label className="block text-xs font-bold text-neutral-700">
                Please specify other tradition:
              </label>
              <input
                type="text"
                value={answers.main_other_custom || ''}
                onChange={(e) => updateField('main_other_custom', e.target.value)}
                placeholder="e.g. Traditional Persian ceremony, Japanese Shinto rituals..."
                className="w-full p-3 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:outline-none focus:border-neutral-400"
              />
            </div>
          )}

          {/* Level 2: Indian Wedding Selection */}
          {hasIndian && (
            <div className="p-5 rounded-3xl bg-amber-50/40 border border-amber-200/60 space-y-4 animate-fade-in">
              <div>
                <span className="text-[10px] font-bold text-amber-800 uppercase tracking-widest bg-amber-100/70 px-2.5 py-0.5 rounded-full">
                  Indian Regional Traditions
                </span>
                <h3 className="text-sm font-bold text-neutral-900 mt-1">
                  Which Indian regions or communities best represent your celebrations?
                </h3>
                <p className="text-xs text-neutral-600 mt-0.5">
                  Select region(s) to view specific community options, or choose a general mix.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  'North Indian',
                  'South Indian',
                  'West Indian',
                  'East Indian',
                  'North-East Indian',
                  'Other Indian region / community'
                ].map((region) => {
                  const selected = indianRegions.includes(region)
                  return (
                    <button
                      key={region}
                      type="button"
                      onClick={() => toggleArrayItem('indian_regions', region)}
                      className={`p-2.5 rounded-xl border text-xs font-medium transition text-left cursor-pointer flex items-center justify-between ${
                        selected
                          ? 'bg-amber-900 text-white border-amber-900'
                          : 'bg-white hover:bg-amber-50/50 text-neutral-800 border-amber-200/70'
                      }`}
                    >
                      <span>{region}</span>
                      {selected && <span className="text-[10px]">✓</span>}
                    </button>
                  )
                })}
              </div>

              {/* Level 3: North Indian Communities */}
              {hasNorth && (
                <div className="p-4 bg-white rounded-2xl border border-amber-200/80 space-y-3">
                  <div className="text-xs font-bold text-neutral-900">
                    North Indian Traditions & Communities:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      'Punjabi',
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
                      const selected = (answers.north_indian_communities || []).includes(comm)
                      return (
                        <button
                          key={comm}
                          type="button"
                          onClick={() => toggleArrayItem('north_indian_communities', comm)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition cursor-pointer ${
                            selected
                              ? 'bg-neutral-900 text-white border-neutral-900'
                              : 'bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border-neutral-200'
                          }`}
                        >
                          {comm} {selected && '✓'}
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
                      className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs"
                    />
                  )}
                </div>
              )}

              {/* Level 3: South Indian Communities */}
              {hasSouth && (
                <div className="p-4 bg-white rounded-2xl border border-amber-200/80 space-y-3">
                  <div className="text-xs font-bold text-neutral-900">
                    South Indian Traditions:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      'Tamil',
                      'Telugu',
                      'Kannada',
                      'Malayali / Kerala',
                      'Other South Indian tradition'
                    ].map((comm) => {
                      const selected = (answers.south_indian_communities || []).includes(comm)
                      return (
                        <button
                          key={comm}
                          type="button"
                          onClick={() => toggleArrayItem('south_indian_communities', comm)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition cursor-pointer ${
                            selected
                              ? 'bg-neutral-900 text-white border-neutral-900'
                              : 'bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border-neutral-200'
                          }`}
                        >
                          {comm} {selected && '✓'}
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
                      className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs"
                    />
                  )}
                </div>
              )}

              {/* Level 3: West Indian Communities */}
              {hasWest && (
                <div className="p-4 bg-white rounded-2xl border border-amber-200/80 space-y-3">
                  <div className="text-xs font-bold text-neutral-900">
                    West Indian Traditions:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      'Marathi',
                      'Gujarati',
                      'Goan',
                      'Sindhi',
                      'Other West Indian tradition'
                    ].map((comm) => {
                      const selected = (answers.west_indian_communities || []).includes(comm)
                      return (
                        <button
                          key={comm}
                          type="button"
                          onClick={() => toggleArrayItem('west_indian_communities', comm)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition cursor-pointer ${
                            selected
                              ? 'bg-neutral-900 text-white border-neutral-900'
                              : 'bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border-neutral-200'
                          }`}
                        >
                          {comm} {selected && '✓'}
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
                      className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs"
                    />
                  )}
                </div>
              )}

              {/* Level 3: East Indian Communities */}
              {hasEast && (
                <div className="p-4 bg-white rounded-2xl border border-amber-200/80 space-y-3">
                  <div className="text-xs font-bold text-neutral-900">
                    East Indian Traditions:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {['Bengali', 'Odia', 'Other East Indian tradition'].map((comm) => {
                      const selected = (answers.east_indian_communities || []).includes(comm)
                      return (
                        <button
                          key={comm}
                          type="button"
                          onClick={() => toggleArrayItem('east_indian_communities', comm)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition cursor-pointer ${
                            selected
                              ? 'bg-neutral-900 text-white border-neutral-900'
                              : 'bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border-neutral-200'
                          }`}
                        >
                          {comm} {selected && '✓'}
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
                      className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs"
                    />
                  )}
                </div>
              )}

              {/* Level 3: North-East Indian Communities */}
              {hasNorthEast && (
                <div className="p-4 bg-white rounded-2xl border border-amber-200/80 space-y-3">
                  <div className="text-xs font-bold text-neutral-900">
                    North-East Indian Traditions:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {['Assamese', 'Manipuri', 'Khasi / Meghalaya', 'Other North-East Indian tradition'].map((comm) => {
                      const selected = (answers.northeast_indian_communities || []).includes(comm)
                      return (
                        <button
                          key={comm}
                          type="button"
                          onClick={() => toggleArrayItem('northeast_indian_communities', comm)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition cursor-pointer ${
                            selected
                              ? 'bg-neutral-900 text-white border-neutral-900'
                              : 'bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border-neutral-200'
                          }`}
                        >
                          {comm} {selected && '✓'}
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
                      className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs"
                    />
                  )}
                </div>
              )}

              {/* Other Indian community text */}
              {hasOtherIndianRegion && (
                <div className="p-3 bg-white rounded-xl border border-amber-200/80 space-y-1">
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
            </div>
          )}

          {/* Optional Community Selections for Sikh, Hindu, Muslim, Christian */}
          {(hasSikh || hasHindu || hasChristian || hasMuslim) && (
            <div className="p-5 rounded-3xl bg-neutral-100/60 border border-neutral-200 space-y-4">
              <div className="text-xs font-bold text-neutral-800 uppercase tracking-wider">
                Optional Community / Tradition Details
              </div>

              {hasSikh && (
                <div className="space-y-1.5">
                  <label className="block text-xs text-neutral-700 font-semibold">Sikh Tradition Details (Optional)</label>
                  <input
                    type="text"
                    value={answers.sikh_community || ''}
                    onChange={(e) => updateField('sikh_community', e.target.value)}
                    placeholder="e.g. Anand Karaj / Punjabi Sikh, Gurdwara ceremony..."
                    className="w-full p-2.5 bg-white border border-neutral-200 rounded-xl text-xs"
                  />
                </div>
              )}

              {hasHindu && (
                <div className="space-y-1.5">
                  <label className="block text-xs text-neutral-700 font-semibold">Hindu Tradition Details (Optional)</label>
                  <input
                    type="text"
                    value={answers.hindu_community || ''}
                    onChange={(e) => updateField('hindu_community', e.target.value)}
                    placeholder="e.g. Punjabi Hindu, Arya Samaji, South Indian Brahmin..."
                    className="w-full p-2.5 bg-white border border-neutral-200 rounded-xl text-xs"
                  />
                </div>
              )}

              {hasChristian && (
                <div className="space-y-1.5">
                  <label className="block text-xs text-neutral-700 font-semibold">Christian Tradition Details (Optional)</label>
                  <input
                    type="text"
                    value={answers.christian_community || ''}
                    onChange={(e) => updateField('christian_community', e.target.value)}
                    placeholder="e.g. Catholic, Syrian Christian, Protestant, Orthodox..."
                    className="w-full p-2.5 bg-white border border-neutral-200 rounded-xl text-xs"
                  />
                </div>
              )}

              {hasMuslim && (
                <div className="space-y-1.5">
                  <label className="block text-xs text-neutral-700 font-semibold">Muslim Tradition Details (Optional)</label>
                  <input
                    type="text"
                    value={answers.muslim_community || ''}
                    onChange={(e) => updateField('muslim_community', e.target.value)}
                    placeholder="e.g. Nikah, Walima, regional Muslim tradition..."
                    className="w-full p-2.5 bg-white border border-neutral-200 rounded-xl text-xs"
                  />
                </div>
              )}
            </div>
          )}

          {/* International / Western Selection */}
          {hasInternational && (
            <div className="p-5 rounded-3xl bg-blue-50/40 border border-blue-200/60 space-y-3 animate-fade-in">
              <span className="text-[10px] font-bold text-blue-800 uppercase tracking-widest bg-blue-100/70 px-2.5 py-0.5 rounded-full">
                International & Western Styles
              </span>
              <div className="flex flex-wrap gap-2 pt-1">
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
                  const selected = (answers.international_styles || []).includes(style)
                  return (
                    <button
                      key={style}
                      type="button"
                      onClick={() => toggleArrayItem('international_styles', style)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition cursor-pointer ${
                        selected
                          ? 'bg-blue-900 text-white border-blue-900'
                          : 'bg-white hover:bg-blue-50/50 text-neutral-800 border-blue-200/70'
                      }`}
                    >
                      {style} {selected && '✓'}
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
                  className="w-full p-2.5 bg-white border border-blue-200 rounded-xl text-xs"
                />
              )}
            </div>
          )}
        </div>

        {/* Q7 */}
        <div className="space-y-2 border-t border-neutral-100 pt-6">
          <label className="block text-sm font-bold text-neutral-800">
            Q7. Are there any traditions or cultural details that are particularly important for our photography and film teams to understand?
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
