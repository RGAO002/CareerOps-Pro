import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-4">CareerOps Pro</h1>
      <p className="text-gray-400 mb-8">AI-Powered Resume Optimization</p>
      <Link
        href="/review"
        className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-medium transition-colors"
      >
        🤖 Multi-LLM Review →
      </Link>
    </main>
  );
}
