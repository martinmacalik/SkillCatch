interface TreeNode {
  id: string;
  originalName: string;
  suggestedName?: string;
  children: TreeNode[];
  newNodes?: NewNode[];
}

interface NewNode {
  name: string;
  isLeaf: boolean;
  children: NewNode[];
}

interface Props {
  proposal: Record<string, unknown>;
  message?: string | null;
}

function NewNodeTree({ nodes, depth }: { nodes: NewNode[]; depth: number }) {
  return (
    <>
      {nodes.map((n, i) => (
        <div key={i}>
          <div className="flex items-center gap-2 py-0.5" style={{ paddingLeft: `${depth * 16}px` }}>
            <span className="text-emerald-400 text-xs">+</span>
            <span className="text-emerald-400 text-xs">{n.name || <span className="italic opacity-50">unnamed</span>}</span>
            <span className="text-emerald-600 text-[10px]">{n.isLeaf ? 'leaf' : 'branch'}</span>
          </div>
          {n.children.length > 0 && <NewNodeTree nodes={n.children} depth={depth + 1} />}
        </div>
      ))}
    </>
  );
}

function TreeDiffNode({ node, depth }: { node: TreeNode; depth: number }) {
  const renamed = node.suggestedName && node.suggestedName !== node.originalName;

  return (
    <div>
      <div className="flex items-center gap-2 py-0.5 flex-wrap" style={{ paddingLeft: `${depth * 16}px` }}>
        {renamed ? (
          <>
            <span className="text-rose-400 line-through text-xs opacity-70">{node.originalName}</span>
            <span className="text-neutral-500 text-xs">→</span>
            <span className="text-emerald-400 text-xs font-medium">{node.suggestedName}</span>
          </>
        ) : (
          <span className="text-neutral-400 text-xs">{node.originalName}</span>
        )}
      </div>
      {node.children.map(child => (
        <TreeDiffNode key={child.id} node={child} depth={depth + 1} />
      ))}
      {node.newNodes && node.newNodes.length > 0 && (
        <NewNodeTree nodes={node.newNodes} depth={depth + 1} />
      )}
    </div>
  );
}

export function ProposalDiff({ proposal, message }: Props) {
  const type = proposal.type as string | undefined;
  const changes = proposal.changes as Record<string, unknown> | undefined;
  const version = proposal.version as number | undefined;

  // Try to parse the tree from changes.notes
  let tree: TreeNode[] | null = null;
  if (typeof changes?.notes === 'string') {
    try {
      tree = JSON.parse(changes.notes) as TreeNode[];
    } catch {
      tree = null;
    }
  }

  return (
    <div className="text-sm space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-neutral-500 text-xs">Type</span>
        <span className="bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded text-xs font-mono">
          {type ?? 'unknown'}
        </span>
        {version != null && (
          <span className="text-neutral-600 text-xs">v{version}</span>
        )}
      </div>

      {tree ? (
        <div className="bg-[#0d0d0d] border border-neutral-800 rounded p-3 space-y-0.5">
          <p className="text-neutral-600 text-[10px] uppercase tracking-wide mb-2">Tree changes</p>
          {tree.map(node => (
            <TreeDiffNode key={node.id} node={node} depth={0} />
          ))}
          <div className="flex gap-4 mt-3 pt-2 border-t border-neutral-800">
            <span className="flex items-center gap-1 text-[10px] text-neutral-600">
              <span className="text-rose-400 line-through">old</span> renamed
            </span>
            <span className="flex items-center gap-1 text-[10px] text-neutral-600">
              <span className="text-emerald-400">+</span> new node
            </span>
            <span className="flex items-center gap-1 text-[10px] text-neutral-600">
              <span className="text-neutral-400">grey</span> unchanged
            </span>
          </div>
        </div>
      ) : changes != null && (
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
