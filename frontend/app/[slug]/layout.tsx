/**
 * Layout for client workspace portal pages — forces light color-scheme
 * so the workspace portal renders cleanly according to the Misty Visuals brand palette
 * regardless of the client's OS-level dark/light mode setting.
 */
export const metadata = {
  other: {
    'color-scheme': 'only light',
  },
}

export default function ClientPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="force-light" style={{ colorScheme: 'light' }}>
      {children}
    </div>
  )
}
