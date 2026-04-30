'use client'

import { useRef } from 'react'

export function SignaturePad({ onDraw, hasSignature }: { onDraw: (drawn: boolean, dataUrl?: string, darkDataUrl?: string) => void, hasSignature: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    isDrawing.current = true
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    lastPos.current = { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || !lastPos.current) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const newPos = { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }

    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    ctx.beginPath()
    ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(newPos.x, newPos.y)
    ctx.stroke()

    lastPos.current = newPos
    
    if (!hasSignature) {
      onDraw(true)
    }
  }

  const stopDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId)
    isDrawing.current = false
    lastPos.current = null
    const canvas = canvasRef.current
    if (canvas) {
      let darkUrl: string | undefined
      const hidden = document.createElement('canvas')
      hidden.width = canvas.width
      hidden.height = canvas.height
      const hctx = hidden.getContext('2d')
      if (hctx) {
        hctx.drawImage(canvas, 0, 0)
        const imgData = hctx.getImageData(0, 0, canvas.width, canvas.height)
        const data = imgData.data
        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i+3]
          const color = 255 - alpha
          data[i] = color     // R
          data[i+1] = color   // G
          data[i+2] = color   // B
          data[i+3] = 255     // Force fully opaque to prevent PDFKit bugs
        }
        hctx.putImageData(imgData, 0, 0)
        darkUrl = hidden.toDataURL('image/jpeg') // Send as JPEG
      }
      onDraw(true, canvas.toDataURL('image/png'), darkUrl)
    }
  }

  const clear = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    onDraw(false, undefined, undefined)
  }

  return (
    <div 
      className="relative border border-white/10 rounded-xl bg-black/40 overflow-hidden touch-none"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
        <span className="text-[13px] font-serif italic text-white select-none">Draw your signature</span>
      </div>
      <canvas
        ref={canvasRef}
        width={800}
        height={300}
        className="w-full h-[120px] cursor-crosshair touch-none relative z-10 block"
        style={{ touchAction: 'none' }}
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
        onPointerOut={stopDrawing}
      />
      {hasSignature && (
        <button 
          onClick={clear}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute top-2 right-2 text-[10px] text-white bg-white/10 hover:bg-white/20 backdrop-blur px-2.5 py-1 rounded-md z-20 transition"
        >
          Clear
        </button>
      )}
    </div>
  )
}
