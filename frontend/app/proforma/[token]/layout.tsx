/**
 * Layout for public proforma invoice pages — forces light color-scheme
 * so the proforma renders identically regardless of the client's
 * OS-level dark/light mode setting.
 */
export const metadata = {
  other: {
    'color-scheme': 'only light',
  },
}

export default function ProformaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="force-light" style={{ colorScheme: 'light' }}>
      {children}
    </div>
  )
}
