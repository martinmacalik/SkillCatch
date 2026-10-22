// PDFs are generated from docs/learning/*.md; Vite bundles them as hashed assets.
const pdfUrls = import.meta.glob('../../../../docs/learning/pdf/*.pdf', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const markdown = import.meta.glob('../../../../docs/learning/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const baseName = (path: string) => path.split('/').pop()!.replace(/\.(md|pdf)$/, '');

const titles = Object.fromEntries(
  Object.entries(markdown).map(([path, text]) => [
    baseName(path),
    text.match(/^#\s+(.+)$/m)?.[1] ?? baseName(path),
  ]),
);

const notes = Object.entries(pdfUrls)
  .map(([path, url]) => ({ name: baseName(path), url, title: titles[baseName(path)] ?? baseName(path) }))
  .sort((a, b) => a.name.localeCompare(b.name));

export function LearningPage() {
  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl">
      <h1 className="text-white text-xl font-semibold">Learning</h1>

      {notes.length === 0 && (
        <p className="text-neutral-500 text-sm">No learning PDFs yet.</p>
      )}

      {notes.length > 0 && (
        <div className="bg-[#111] border border-neutral-800 rounded-lg divide-y divide-neutral-800">
          {notes.map((n) => (
            <a
              key={n.name}
              href={n.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between px-4 py-3 text-sm text-neutral-300 hover:text-white hover:bg-neutral-900 transition-colors"
            >
              <span>{n.title}</span>
              <span className="shrink-0 ml-3 text-neutral-600 text-xs">PDF</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
