export default function Dashboard() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <header className="mb-12">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-zinc-400">Welcome to your AI Commerce Control Center.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl">
          <h3 className="font-medium text-zinc-400 mb-2">Total Revenue</h3>
          <p className="text-3xl font-bold">$0.00</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl">
          <h3 className="font-medium text-zinc-400 mb-2">Active Leads</h3>
          <p className="text-3xl font-bold">0</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl">
          <h3 className="font-medium text-zinc-400 mb-2">AI Conversations</h3>
          <p className="text-3xl font-bold">0</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl">
          <h3 className="font-medium text-zinc-400 mb-2">Active Agents</h3>
          <p className="text-3xl font-bold">5</p>
        </div>
      </div>
    </div>
  );
}
