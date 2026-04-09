'use client'

import Link from 'next/link'

export default function RefundPage() {
  return (
    <div className="min-h-screen bg-white text-neutral-900 font-sans selection:bg-neutral-100 selection:text-neutral-900">
      <div className="max-w-3xl mx-auto px-6 py-20 md:py-32">
        <a href="/login" className="text-xs uppercase tracking-[0.2em] text-neutral-400 hover:text-neutral-900 transition-colors mb-12 inline-block italic">
          ← Back to Login
        </a>
        
        <header className="mb-16">
          <h1 className="text-4xl md:text-5xl font-light tracking-tight mb-4">Refund & Cancellation</h1>
          <p className="text-neutral-500 italic">Last updated: April 09, 2026</p>
        </header>

        <section className="space-y-12 text-[15px] leading-relaxed text-neutral-700">
          <div>
            <h2 className="text-sm uppercase tracking-[0.1em] font-bold text-neutral-900 mb-4">1. Cancellation by Client</h2>
            <p className="mb-4">
              We understand that event plans can change. Our cancellation policy for photography and videography bookings is as follows:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Advance Payments:</strong> Booking advances are non-refundable as they represent the cost of blocking our dates and turning away other potential clients.</li>
              <li><strong>Cancellation within 30 days of Event:</strong> 50% of the total contract value will be applicable.</li>
              <li><strong>Cancellation within 7 days of Event:</strong> 100% of the total contract value will be applicable.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-sm uppercase tracking-[0.1em] font-bold text-neutral-900 mb-4">2. Postponement</h2>
            <p>
              In the event of a postponement, we will endeavor to accommodate the new date. If our team is available, the advance will be transferred to the new date. 
              If we are not available on the new date, the cancellation terms above will apply.
            </p>
          </div>

          <div>
            <h2 className="text-sm uppercase tracking-[0.1em] font-bold text-neutral-900 mb-4">3. Refunds</h2>
            <p>
              Refunds (if applicable) will be processed to the original payment method within 7-10 working days of the approved cancellation.
            </p>
          </div>

          <div>
            <h2 className="text-sm uppercase tracking-[0.1em] font-bold text-neutral-900 mb-4">4. Shipping & Delivery</h2>
            <p>
              As we provide digital services, there are no physical shipping costs. Final edited photographs and films are delivered digitally via secure galleries within the timelines specified in your contract (standard duration: 6-12 weeks post-production).
            </p>
          </div>

          <div>
            <h2 className="text-sm uppercase tracking-[0.1em] font-bold text-neutral-900 mb-4">5. Dissatisfaction</h2>
            <p>
              While we strive for artistic excellence, photography is subjective. No refunds will be issued once the service has been performed and media has been delivered.
            </p>
          </div>
        </section>

        <footer className="mt-20 pt-10 border-t border-neutral-100 flex justify-between items-center text-xs text-neutral-400">
          <div>© 2026 Misty Visuals</div>
          <div className="space-x-4">
            <Link href="/privacy" className="hover:text-neutral-900">Privacy</a>
            <Link href="/terms" className="hover:text-neutral-900">Terms</a>
          </div>
        </footer>
      </div>
    </div>
  )
}
