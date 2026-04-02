interface Props {
  proposal: Record<string, unknown>;
  message?: string | null;
}

export function ProposalDiff({ proposal, message }: Props) {
  const type = proposal.type as string | undefined;
  const changes = proposal.changes as Record<string, unknown> | undefined;
  const version = proposal.version as number | undefined;

  return (
    <div className="text-sm space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-neutral-500 text-xs">Type</span>
        <span className="bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded text-xs font-mono">
          {type ?? 'unknown'}
        </span>
        {version != null && (
          <span className="text-neutral-600 text-xs">v{version}</span>
        )}
      </div>
      {changes != null && (
        <pre className="bg-[#0d0d0d] border border-neutral-800 rounded p-3 text-xs text-neutral-300 overflow-auto max-h-40 whitespace-pre-wrap">
          {JSON.stringify(changes, null, 2)}
        </pre>
      )}
      {message && (
        <p className="text-neutral-400 italic text-xs">"{message}"</p>
      )}
    </div>
  );
}
