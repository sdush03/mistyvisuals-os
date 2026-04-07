import { useState } from 'react'

export function ConfirmDialog({
    isOpen,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    onConfirm,
    onClose,
    isDangerous = false,
}: {
    isOpen: boolean
    title: string
    message: React.ReactNode
    confirmText?: string
    cancelText?: string
    onConfirm: () => void
    onClose: () => void
    isDangerous?: boolean
}) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-900/40 p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-sm rounded-[1.5rem] bg-[var(--surface)] p-6 shadow-xl animate-in zoom-in-95 duration-200">
                <h3 className="text-lg font-semibold text-[var(--foreground)]">{title}</h3>
                <div className="mt-2 text-sm text-neutral-600 space-y-2">{message}</div>

                <div className="mt-6 flex justify-end gap-3">
                    <button
                        type="button"
                        className="rounded-full px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 transition focus:outline-none focus:ring-2 focus:ring-neutral-200"
                        onClick={onClose}
                    >
                        {cancelText}
                    </button>
                    <button
                        type="button"
                        className={`btn-pill px-4 py-2 text-sm font-medium shadow-sm transition focus:outline-none focus:ring-2 focus:ring-offset-2 ${isDangerous
                                ? 'bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-500'
                                : 'bg-neutral-900 text-white hover:bg-neutral-800 focus:ring-neutral-900'
                            }`}
                        onClick={() => {
                            onConfirm()
                            onClose()
                        }}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    )
}
