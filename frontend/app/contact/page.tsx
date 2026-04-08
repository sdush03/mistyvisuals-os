'use client'

import Link from 'next/link'

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-white text-neutral-900 font-sans selection:bg-neutral-100 selection:text-neutral-900">
      <div className="max-w-3xl mx-auto px-6 py-20 md:py-32">
        <Link href="/login" className="text-xs uppercase tracking-[0.2em] text-neutral-400 hover:text-neutral-900 transition-colors mb-12 inline-block italic">
          ← Back to Login
        </Link>
        
        <header className="mb-16">
          <h1 className="text-4xl md:text-5xl font-light tracking-tight mb-4">Contact Us</h1>
          <p className="text-neutral-500 italic">We are here to help you.</p>
        </header>

        <section className="space-y-12 text-[15px] leading-relaxed text-neutral-700">
          <div>
            <h2 className="text-sm uppercase tracking-[0.1em] font-bold text-neutral-900 mb-4">Get in Touch</h2>
            <p className="mb-8">
              For any support regarding the Studio OS, payment issues, or booking inquiries, please reach out to us via any of the following channels:
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-xs uppercase tracking-[0.1em] text-neutral-400 mb-2">Email</h3>
                <p className="text-neutral-900 font-medium">dushyant@mistyvisuals.com</p>
              </div>
              <div>
                <h3 className="text-xs uppercase tracking-[0.1em] text-neutral-400 mb-2">Phone</h3>
                <p className="text-neutral-900 font-medium">+91 98110 00000</p>
                <p className="text-xs text-neutral-400 mt-1">Mon-Sat, 10am - 7pm IST</p>
              </div>
              <div className="md:col-span-2">
                <h3 className="text-xs uppercase tracking-[0.1em] text-neutral-400 mb-2">Studio Address</h3>
                <p className="text-neutral-900 font-medium leading-relaxed">
                  Misty Visuals Studio<br />
                  Plot No. 42, Sector 18<br />
                  Gurugram, Haryana, 122015<br />
                  India
                </p>
              </div>
            </div>
          </div>

          <div className="pt-8 border-t border-neutral-100">
            <h2 className="text-sm uppercase tracking-[0.1em] font-bold text-neutral-900 mb-4">Grievance Officer</h2>
            <p className="text-neutral-600">
              In accordance with the Information Technology Act 2000, the name and contact details of the Grievance Officer are provided below:
            </p>
            <p className="mt-4 text-neutral-900 font-medium">
              Mr. Dushyant Saini<br />
              Email: dushyant@mistyvisuals.com
            </p>
          </div>
        </section>

        <footer className="mt-20 pt-10 border-t border-neutral-100 flex justify-between items-center text-xs text-neutral-400">
          <div>© 2026 Misty Visuals</div>
          <div className="space-x-4">
            <Link href="/privacy" className="hover:text-neutral-900">Privacy</Link>
            <Link href="/terms" className="hover:text-neutral-900">Terms</Link>
          </div>
        </footer>
      </div>
    </div>
  )
}
