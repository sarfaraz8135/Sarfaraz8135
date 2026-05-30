import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 via-black to-blue-900/20 pointer-events-none" />

      <main className="z-10 flex flex-col items-center text-center space-y-8 max-w-4xl px-4">
        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-600">
          Autonomous AI Commerce
        </h1>

        <p className="text-xl md:text-2xl text-zinc-400 max-w-2xl">
          Your complete AI Sales Team, Lead Generator, and Business Operator in one platform.
        </p>

        <div className="flex gap-4 pt-8">
          <Link
            href="/dashboard"
            className="px-8 py-4 bg-white text-black rounded-full font-medium hover:bg-zinc-200 transition-colors"
          >
            Go to Dashboard
          </Link>
          <button className="px-8 py-4 bg-zinc-900 border border-zinc-800 rounded-full font-medium hover:bg-zinc-800 transition-colors">
            View Features
          </button>
        </div>
      </main>
    </div>
  );
}
