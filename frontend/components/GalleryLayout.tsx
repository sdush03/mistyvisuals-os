'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

export type GalleryLayoutMode = 'masonry' | 'feed' | 'justified' | 'grid'
export type GalleryDensity = 'compact' | 'comfortable' | 'spacious'

type GalleryLayoutProps<T> = {
  items: T[]
  layout: GalleryLayoutMode
  density: GalleryDensity
  getItemKey: (item: T) => string | number
  getItemSrc: (item: T) => string
  renderItem: (item: T) => React.ReactNode
  renderFeedDetails?: (item: T) => React.ReactNode
  activeFeedId?: string | number | null
  onFeedItemSelect?: (item: T) => void
}

const densityConfig: Record<GalleryDensity, { gap: number; rowHeight: number; minCol: number }> = {
  compact: { gap: 12, rowHeight: 180, minCol: 220 },
  comfortable: { gap: 18, rowHeight: 220, minCol: 260 },
  spacious: { gap: 26, rowHeight: 260, minCol: 320 },
}

const useElementWidth = () => {
  const ref = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    if (!ref.current) return
    const node = ref.current
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(node)
    setWidth(node.getBoundingClientRect().width)
    return () => observer.disconnect()
  }, [])

  return { ref, width }
}

const useImageRatios = <T,>(
  items: T[],
  getItemKey: (item: T) => string | number,
  getItemSrc: (item: T) => string,
) => {
  const [ratios, setRatios] = useState<Record<string, number>>({})

  useEffect(() => {
    let active = true
    const pending = items.filter((item) => {
      const key = String(getItemKey(item))
      return ratios[key] == null
    })

    if (!pending.length) return

    pending.forEach((item) => {
      const key = String(getItemKey(item))
      const src = getItemSrc(item)
      const img = new Image()
      img.onload = () => {
        if (!active) return
        const ratio = img.naturalWidth && img.naturalHeight
          ? img.naturalWidth / img.naturalHeight
          : 4 / 3
        setRatios((prev) => ({ ...prev, [key]: ratio }))
      }
      img.onerror = () => {
        if (!active) return
        setRatios((prev) => ({ ...prev, [key]: 4 / 3 }))
      }
      img.src = src
    })

    return () => {
      active = false
    }
  }, [items, getItemKey, getItemSrc, ratios])

  return ratios
}

const getColumnCount = (width: number, density: GalleryDensity) => {
  if (width <= 0) return 1
  const w = width
  if (density === 'compact') {
    if (w >= 1400) return 5
    if (w >= 1150) return 4
    if (w >= 900) return 3
    if (w >= 640) return 2
    return 1
  }
  if (density === 'spacious') {
    if (w >= 1400) return 3
    if (w >= 1050) return 2
    if (w >= 780) return 2
    return 1
  }
  if (w >= 1400) return 4
  if (w >= 1150) return 3
  if (w >= 900) return 3
  if (w >= 640) return 2
  return 1
}

const buildJustifiedRows = <T,>(
  items: T[],
  ratios: Record<string, number>,
  getKey: (item: T) => string | number,
  containerWidth: number,
  targetHeight: number,
  gap: number,
) => {
  if (!containerWidth) return []
  const rows: Array<{ items: T[]; height: number; widths: number[] }> = []
  let rowItems: T[] = []
  let rowRatios: number[] = []
  let rowWidth = 0

  const flushRow = () => {
    if (!rowItems.length) return
    const totalGap = gap * (rowItems.length - 1)
    const scale = (containerWidth - totalGap) / rowWidth
    const height = Math.round(targetHeight * scale)
    const widths = rowRatios.map((ratio) => Math.round(ratio * height))
    rows.push({ items: rowItems, height, widths })
    rowItems = []
    rowRatios = []
    rowWidth = 0
  }

  items.forEach((item) => {
    const ratio = ratios[String(getKey(item))] || 4 / 3
    const estimatedWidth = ratio * targetHeight
    if (rowItems.length && rowWidth + estimatedWidth + gap * rowItems.length > containerWidth) {
      flushRow()
    }
    rowItems.push(item)
    rowRatios.push(ratio)
    rowWidth += estimatedWidth
  })

  if (rowItems.length) {
    const totalGap = gap * (rowItems.length - 1)
    const height = targetHeight
    const widths = rowRatios.map((ratio) => Math.round(ratio * height))
    rows.push({ items: rowItems, height, widths })
  }

  return rows
}

export default function GalleryLayout<T>({
  items,
  layout,
  density,
  getItemKey,
  getItemSrc,
  renderItem,
  renderFeedDetails,
  activeFeedId,
  onFeedItemSelect,
}: GalleryLayoutProps<T>) {
  const { ref, width } = useElementWidth()
  const ratios = useImageRatios(items, getItemKey, getItemSrc)
  const { gap, rowHeight, minCol } = densityConfig[density]

  const thumbnailsRef = useRef<HTMLDivElement>(null)

  const scrollThumbnails = (direction: 'left' | 'right') => {
    if (thumbnailsRef.current) {
      const scrollAmount = 300
      thumbnailsRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      })
    }
  }

  // Add local state to track active image if none is provided via props
  const [localActiveId, setLocalActiveId] = useState<string | number | null>(
    items.length > 0 ? getItemKey(items[0]) : null
  )

  useEffect(() => {
    if (items.length > 0 && !localActiveId && !activeFeedId) {
      setLocalActiveId(getItemKey(items[0]))
    }
  }, [items, localActiveId, activeFeedId, getItemKey])

  const currentActiveId = activeFeedId !== undefined ? activeFeedId : localActiveId
  const activeItem = useMemo(
    () => items.find((item) => getItemKey(item) === currentActiveId) || items[0],
    [items, currentActiveId, getItemKey]
  )

  const handleFeedSelect = (item: T) => {
    if (onFeedItemSelect) {
      onFeedItemSelect(item)
    } else {
      setLocalActiveId(getItemKey(item))
    }
  }

  const columnCount = useMemo(() => getColumnCount(width, density), [width, density])

  const justifiedRows = useMemo(() => {
    if (layout !== 'justified') return []
    return buildJustifiedRows(items, ratios, getItemKey, width, rowHeight, gap)
  }, [items, ratios, getItemKey, width, rowHeight, gap, layout])

  return (
    <div ref={ref} className="w-full">
      {layout === 'masonry' && (
        <div
          style={{ columnCount, columnGap: `${gap}px` }}
          className="w-full"
        >
          {items.map((item) => (
            <div
              key={getItemKey(item)}
              style={{ breakInside: 'avoid', marginBottom: `${gap}px`, display: 'inline-block', width: '100%' }}
              className="w-full min-w-0"
            >
              {renderItem(item)}
            </div>
          ))}
        </div>
      )}

      {layout === 'feed' && activeItem && (
        <div className="flex flex-col min-w-0 w-full mb-8">
          <div className="mx-auto w-full" style={{ maxWidth: '800px' }}>
            {/* Main Active Preview */}
            <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm mb-4">
              <div className="w-full relative h-[60vh] flex flex-col items-center justify-center overflow-hidden rounded-xl bg-neutral-50 px-2 pointer-events-none mb-4">
                 <img
                   src={getItemSrc(activeItem)}
                   className="h-full w-full object-contain"
                   alt="Preview"
                 />
              </div>

              {/* Details (Tags, Actions) inserted directly under the preview */}
              <div className="flex flex-col gap-4">
                {renderFeedDetails ? renderFeedDetails(activeItem) : (
                  <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
                    {/* Fallback to default renderItem if specific details aren't provided */}
                    {renderItem(activeItem)}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Thumbnail Strip with Navigation Arrows */}
          <div className="relative group min-w-0 w-full mt-4">
            <button
              type="button"
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 shadow-sm opacity-0 transition-opacity group-hover:opacity-100 hover:bg-neutral-50 hover:text-neutral-900 shadow-md"
              onClick={() => scrollThumbnails('left')}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            
            <div 
              ref={thumbnailsRef}
              className="flex gap-3 overflow-x-auto pb-4 pt-2 items-center px-2 scrollbar-hide relative min-w-0"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {items.map((item) => {
                const isSelected = getItemKey(item) === currentActiveId
                return (
                  <button
                    key={getItemKey(item)}
                    type="button"
                    onClick={() => handleFeedSelect(item)}
                    title={String(getItemKey(item))}
                    className={`relative flex h-20 w-20 flex-shrink-0 cursor-pointer overflow-hidden rounded-xl border-2 transition-all ${
                      isSelected
                        ? 'border-neutral-900 shadow-md scale-[1.05]'
                        : 'border-transparent opacity-50 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={getItemSrc(item)}
                      alt="Thumbnail"
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </button>
                )
              })}
            </div>

            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 shadow-sm opacity-0 transition-opacity group-hover:opacity-100 hover:bg-neutral-50 hover:text-neutral-900 shadow-md"
              onClick={() => scrollThumbnails('right')}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {layout === 'grid' && (
        <div
          className="grid w-full"
          style={{
            gap: `${gap}px`,
            gridTemplateColumns: `repeat(auto-fit, minmax(min(${minCol}px, 100%), 1fr))`,
          }}
        >
          {items.map((item) => (
            <div key={getItemKey(item)} className="w-full min-w-0">
              {renderItem(item)}
            </div>
          ))}
        </div>
      )}

      {layout === 'justified' && (
        <div className="flex flex-col" style={{ gap }}>
          {justifiedRows.map((row, rowIndex) => (
            <div key={`row-${rowIndex}`} className="flex items-stretch" style={{ gap }}>
              {row.items.map((item, idx) => (
                <div
                  key={getItemKey(item)}
                  style={{ width: row.widths[idx] }}
                  className="flex-shrink-0"
                >
                  {renderItem(item)}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
