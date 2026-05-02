import { Metadata } from 'next'
import ProformaClient from './ProformaClient'

type Props = {
  params: Promise<{ token: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return {
    title: 'Payment Schedule — Misty Visuals',
    description: 'Your payment schedule from Misty Visuals.',
    robots: { index: false, follow: false },
  }
}

export default async function ProformaPage({ params }: Props) {
  const { token } = await params
  return <ProformaClient token={token} />
}
