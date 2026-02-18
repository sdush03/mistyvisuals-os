export default function Dashboard() {
  return (
    <div>
      <h2 className="text-2xl font-semibold">Dashboard</h2>
      <p className="text-neutral-600 mt-1">
        Welcome to Misty Visuals OS
      </p>

      <div className="grid grid-cols-3 gap-6 mt-8">
        <div className="bg-white border rounded-xl p-6">
          <div className="text-sm text-neutral-500">Leads</div>
          <div className="text-3xl font-semibold mt-2">0</div>
        </div>

        <div className="bg-white border rounded-xl p-6">
          <div className="text-sm text-neutral-500">Active Projects</div>
          <div className="text-3xl font-semibold mt-2">0</div>
        </div>

        <div className="bg-white border rounded-xl p-6">
          <div className="text-sm text-neutral-500">Pending Payments</div>
          <div className="text-3xl font-semibold mt-2">₹0</div>
        </div>
      </div>
    </div>
  )
}
