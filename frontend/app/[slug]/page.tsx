import PortalClient from './PortalClient'

export default function ClientPortalRoute({ params }: { params: { slug: string } }) {
  return <PortalClient slug={params.slug} />
}
