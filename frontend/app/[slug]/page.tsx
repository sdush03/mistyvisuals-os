import PortalClient from './PortalClient'

export default async function ClientPortalRoute({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params
  return <PortalClient slug={resolvedParams.slug} />
}
