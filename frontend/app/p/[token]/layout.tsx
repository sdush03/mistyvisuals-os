/**
 * Layout for public proposal pages — forces light color-scheme
 * so the proposal renders identically regardless of the client's
 * OS-level dark/light mode setting.
 */
export const metadata = {
  other: {
    'color-scheme': 'only light',
  },
}

export default function ProposalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="force-light" style={{ colorScheme: 'light' }}>
      {children}
    </div>
  )
}
