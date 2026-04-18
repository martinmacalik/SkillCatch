import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

interface TreeNode {
  id: string;
  originalName: string;
  suggestedName?: string;
  deleted?: boolean;
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
          <div
            className="flex items-center gap-2 py-1 px-2 rounded bg-emerald-500/10 border-l-2 border-emerald-500/50 my-0.5"
            style={{ marginLeft: `${depth * 20}px` }}
          >
            <span className="text-emerald-400 text-xs font-bold">+</span>
            <span className="text-emerald-300 text-xs font-medium">
              {n.name || <span className="italic opacity-50">unnamed</span>}
            </span>
            <span className="ml-auto text-emerald-700 text-[10px] uppercase tracking-wide">
              {n.isLeaf ? 'leaf' : 'branch'}
            </span>
          </div>
          {n.children.length > 0 && <NewNodeTree nodes={n.children} depth={depth + 1} />}
        </div>
      ))}
    </>
  );
}

function hasAnyChange(node: TreeNode): boolean {
  if (node.deleted) return true;
  const selfRenamed = !!(node.suggestedName && node.suggestedName !== node.originalName);
  const hasNewNodes = !!(node.newNodes && node.newNodes.length > 0);
  return selfRenamed || hasNewNodes || node.children.some(hasAnyChange);
}

function TreeDiffNode({ node, depth }: { node: TreeNode; depth: number }) {
  const renamed = node.suggestedName && node.suggestedName !== node.originalName;
  const changed = hasAnyChange(node);

  if (node.deleted) {
    return (
      <div
        className="flex items-center gap-2 py-1 px-2 rounded my-0.5 bg-rose-500/10 border-l-2 border-rose-500/50"
        style={{ marginLeft: `${depth * 20}px` }}
      >
        <span className="text-[10px] uppercase tracking-wide text-rose-500/70 font-semibold shrink-0">
          delete
        </span>
        <span className="text-rose-400 line-through text-xs opacity-80">{node.originalName}</span>
      </div>
    );
  }

  return (
    <div>
      <div
        className={[
          'flex items-center gap-2 py-1 px-2 rounded my-0.5',
          renamed
            ? 'bg-amber-500/10 border-l-2 border-amber-500/50'
            : changed
            ? 'bg-neutral-800/60'
            : '',
        ].join(' ')}
        style={{ marginLeft: `${depth * 20}px` }}
      >
        {renamed ? (
          <>
            <span className="text-[10px] uppercase tracking-wide text-amber-500/70 font-semibold shrink-0">
              rename
            </span>
            <span className="text-rose-400 line-through text-xs opacity-80">{node.originalName}</span>
            <span className="text-neutral-500 text-xs">→</span>
            <span className="text-emerald-400 text-xs font-semibold">{node.suggestedName}</span>
          </>
        ) : (
          <span className={changed ? 'text-neutral-300 text-xs' : 'text-neutral-600 text-xs'}>
            {node.originalName}
          </span>
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

function collectDeletedIds(nodes: TreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.deleted) {
      ids.push(node.id);
    } else {
      ids.push(...collectDeletedIds(node.children));
    }
  }
  return ids;
}

export function ProposalDiff({ proposal, message }: Props) {
  const type = proposal.type as string | undefined;
  const changes = proposal.changes as Record<string, unknown> | undefined;
  const version = proposal.version as number | undefined;

  let tree: TreeNode[] | null = null;
  if (typeof changes?.notes === 'string') {
    try {
      tree = JSON.parse(changes.notes) as TreeNode[];
    } catch {
      tree = null;
    }
  }

  const [descendants, setDescendants] = useState<Record<string, { id: string; name: string }[]>>({});

  useEffect(() => {
    if (!tree) return;
    const deletedIds = collectDeletedIds(tree);
    if (deletedIds.length === 0) return;

    Promise.all(
      deletedIds.map(id =>
        supabase
          .rpc('get_node_descendants', { p_node_id: id })
          .then(({ data }) => ({ id, rows: (data ?? []) as { id: string; name: string }[] }))
      )
    ).then(results => {
      const map: Record<string, { id: string; name: string }[]> = {};
      for (const { id, rows } of results) map[id] = rows;
      setDescendants(map);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changes?.notes]);

  const deletedIds = tree ? collectDeletedIds(tree) : [];
  const cascadeNames = deletedIds.flatMap(id => (descendants[id] ?? []).map(d => d.name));

  return (
    <div className="text-sm space-y-3">
      {/* User's reason — top priority for the admin */}
      {message && (
        <div className="bg-indigo-500/10 border border-indigo-500/25 rounded-lg p-3">
          <p className="text-indigo-400 text-[10px] uppercase tracking-wide font-semibold mb-1.5">
            User's reason
          </p>
          <p className="text-neutral-200 text-sm leading-relaxed">"{message}"</p>
        </div>
      )}

      {/* Proposal metadata */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-neutral-500 text-xs">Type</span>
        <span className="bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded text-xs font-mono">
          {type ?? 'unknown'}
        </span>
        {version != null && (
          <span className="text-neutral-600 text-xs">v{version}</span>
        )}
      </div>

      {/* Cascade delete warning */}
      {cascadeNames.length > 0 && (
        <div className="bg-rose-500/10 border border-rose-500/25 rounded-lg p-3">
          <p className="text-rose-400 text-[10px] uppercase tracking-wide font-semibold mb-1.5">
            Cascade deletion — also removes {cascadeNames.length} descendant{cascadeNames.length !== 1 ? 's' : ''}
          </p>
          <ul className="space-y-0.5">
            {cascadeNames.map(name => (
              <li key={name} className="text-rose-300 text-xs line-through opacity-70">{name}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Tree diff or raw fallback */}
      {tree ? (
        <div className="bg-[#0d0d0d] border border-neutral-800 rounded-lg p-3 space-y-0.5">
          <p className="text-neutral-600 text-[10px] uppercase tracking-wide mb-2">Proposed changes</p>
          {tree.map(node => (
            <TreeDiffNode key={node.id} node={node} depth={0} />
          ))}
          <div className="flex gap-4 mt-3 pt-2 border-t border-neutral-800 flex-wrap">
            <span className="flex items-center gap-1.5 text-[10px] text-neutral-500">
              <span className="inline-block w-2 h-2 rounded-sm bg-amber-500/40 border-l border-amber-500" />
              rename
            </span>
            <span className="flex items-center gap-1.5 text-[10px] text-neutral-500">
              <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500/40 border-l border-emerald-500" />
              new node
            </span>
            <span className="flex items-center gap-1.5 text-[10px] text-neutral-500">
              <span className="inline-block w-2 h-2 rounded-sm bg-rose-500/40 border-l border-rose-500" />
              delete
            </span>
            <span className="flex items-center gap-1.5 text-[10px] text-neutral-500">
              <span className="text-neutral-600">─</span> unchanged (context)
            </span>
          </div>
        </div>
      ) : changes != null && (
        <pre className="bg-[#0d0d0d] border border-neutral-800 rounded p-3 text-xs text-neutral-300 overflow-auto max-h-40 whitespace-pre-wrap">
          {JSON.stringify(changes, null, 2)}
        </pre>
      )}
    </div>
  );
}
