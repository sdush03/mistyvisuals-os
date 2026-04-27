/**
 * agreement-terms.js
 * Single source of truth for all Service Agreement terms.
 * Stored as JSON-serializable data so it can be snapshotted
 * into draftDataJson at the time of signing — making past
 * agreements legally immutable even if terms are updated later.
 */

const AGREEMENT_TERMS_VERSION = '2026-04-27'

const AGREEMENT_TERMS = [
  {
    n: '1',
    title: 'Cancellation Policy',
    items: [
      'The advance booking amount secures your date exclusively for you and is non-refundable upon cancellation.',
      'Should we need to cancel due to a severe medical emergency on our end, a full refund will be issued without question.',
      "In the rare event of circumstances beyond anyone's control, we will always work towards a fair resolution together.",
    ],
  },
  {
    n: '2',
    title: 'Rescheduling',
    items: [
      "One reschedule is permitted, provided we receive at least <b>120 days' notice</b> before the original event date and the new date is available with us.",
      'Any previously applied discounts will not carry forward — the pricing applicable at the time of rescheduling will apply.',
    ],
  },
  {
    n: '3',
    title: 'Deliverables & Timeline',
    items: [
      "During the wedding season (Oct–Mar), there may be a slight delay compared to our standard timelines owing to high booking volume. Rest assured, we'll always keep you in the loop.",
      'Raw footage will be handed over only after the final payment has been cleared.',
    ],
  },
  {
    n: '4',
    title: 'Creative Vision',
    items: [
      "Our films are crafted in a signature cinematic style — that's the aesthetic you fell in love with, and that's what we'll bring to your story.",
      "We do not share project files for third-party re-editing. We trust you'll trust us with the creative process.",
      "We may feature your wedding on our portfolio and socials. If you'd prefer to keep things private, please let us know before the event.",
    ],
  },
  {
    n: '5',
    title: 'Editing & Music',
    items: [
      'Up to 2–3 minor revisions are included at no extra cost. Further changes beyond this scope may be chargeable depending on the nature of the request.',
      'The sooner you share revision requests, the sooner we can turn them around. Delays on your end will naturally push timelines.',
      'Music is selected by our editors based on what best complements your story. If you have something in mind, share it with us <b>before</b> editing begins — changes requested after the edit has started may incur additional charges.',
    ],
  },
  {
    n: '6',
    title: 'Equipment & Lasers',
    items: [
      'Laser lights at venues can cause permanent and irreversible damage to camera sensors. If lasers are active during the event, our team will pause coverage to protect the equipment.',
      'Any damage to our equipment caused by lasers or other hazards at the venue will be the financial responsibility of the client.',
    ],
  },
  {
    n: '7',
    title: 'Team & Coverage Hours',
    items: [
      'The team composition will be as per your quotation. Our production house reserves the right to assign specific team members based on availability and event requirements.',
      'Our coverage is planned around your pre-confirmed event schedule. If the event runs beyond the agreed hours, continued coverage will be subject to team availability and will be billed at applicable rates.',
    ],
  },
  {
    n: '8',
    title: 'Client Responsibilities',
    items: [
      '<b>Meals:</b> A well-fed team is a creative team. Kindly ensure our crew is provided hot meals at the venue — the same as your guests.',
      '<b>Outstation Events:</b> For destination weddings, travel and accommodation for our crew are to be arranged and borne by the client.',
      "<b>Drone Permissions:</b> Any permits or authorisations required for drone operation at your venue are the client's responsibility to obtain.",
      '<b>Timing & Coverage Scope:</b> Our coverage includes getting ready, decor, couple portraits, family portraits, event proceedings, baarat, rituals, and scheduled interviews — as per the itinerary shared with us. Late starts, extended makeup sessions, or last-minute schedule changes may limit what we are able to capture. Please share a detailed itinerary in advance. Moments missed due to factors outside our control — venue restrictions, timing shifts, or access limitations — cannot be held against us.',
    ],
  },
  {
    n: '9',
    title: 'Conduct & Safety',
    items: [
      'Our team will always treat you and your family with the utmost respect and warmth. We expect the same in return. Any form of harassment or misconduct towards our team members will result in an immediate halt to the shoot, with no refund obligations.',
      'Any damage to our equipment caused by guests will be charged at MRP.',
    ],
  },
  {
    n: '10',
    title: 'Liability',
    items: [
      'Our production house cannot be held responsible for moments missed due to venue restrictions, access limitations, instructions from officiants at religious ceremonies (temples, gurudwaras, churches, etc.), or situations where family members or guests restrict or obstruct our team from capturing a moment.',
      'In the rare and unfortunate event of technical failure — such as camera malfunction, memory card error, or data loss during processing — our liability shall be limited to the total value of your contract. We maintain backup equipment and follow strict protocols to minimise risk, but cannot guarantee against every unforeseen circumstance.',
      'Once your files have been delivered, we recommend creating personal backups immediately. The production house will not be responsible for any loss after delivery.',
    ],
  },
  {
    n: '11',
    title: 'Colour & Print Variance',
    items: [
      'Photography and videography are influenced by lighting, digital sensor behaviour, and post-processing. As a result, colours may appear slightly different across different photographs or devices — this is natural and expected.',
      'Prints produced at different labs, sizes, or times may vary in colour balance. Images on your monitor may not perfectly match printed output due to screen calibration differences.',
    ],
  },
  {
    n: '12',
    title: 'Data Archival',
    items: [
      'We retain your raw footage for <b>30 days</b> following the delivery of your final films. After this period, files may be permanently deleted.',
      'We strongly encourage you to create your own backups as soon as files are delivered. Indefinite storage is not something we can guarantee.',
    ],
  },
  {
    n: '13',
    title: 'Governing Law',
    items: [
      'This agreement is governed by the laws of India. Any disputes arising from this contract shall fall under the jurisdiction of courts in Gurgaon, Haryana.',
      'This agreement supersedes and replaces all prior verbal or written understandings between the parties.',
    ],
  },
]

module.exports = { AGREEMENT_TERMS, AGREEMENT_TERMS_VERSION }
