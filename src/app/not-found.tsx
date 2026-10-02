export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold text-brand-dark">Page not found</h1>
      <p className="text-sm text-gray-600">That link doesn&rsquo;t point anywhere in the app.</p>
      <div className="flex flex-wrap justify-center gap-2">
        <a href="/" className="rounded-lg bg-brand-teal px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
          Generator
        </a>
        <a href="/questions" className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-brand-dark hover:bg-gray-50">
          Question bank
        </a>
        <a href="/schedule" className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-brand-dark hover:bg-gray-50">
          Schedule
        </a>
      </div>
    </div>
  );
}
