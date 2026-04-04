import { Link } from 'react-router-dom';
import type { RestructureProposal } from '@/types/restructure';

interface Props {
  requestId: string;
  proposal: RestructureProposal;
  targetNodeName?: string;
  onReset: () => void;
}

export function RestructureSuccess({
  proposal,
  targetNodeName,
  onReset,
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-16 text-center px-6">
      <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
        <svg
          className="w-6 h-6 text-green-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>

      <div className="space-y-2 max-w-sm">
        <h2 className="text-gray-900 text-lg font-semibold">Proposal submitted</h2>
        <p className="text-gray-500 text-sm">
          Your restructure request is pending review. An admin will review it shortly.
        </p>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 text-left text-sm space-y-2 min-w-52">
        <div className="flex justify-between gap-8">
          <span className="text-gray-400">Type</span>
          <span className="text-gray-800 font-mono text-xs">{proposal.type}</span>
        </div>
        {targetNodeName && (
          <div className="flex justify-between gap-8">
            <span className="text-gray-400">Node</span>
            <span className="text-gray-800 text-xs">{targetNodeName}</span>
          </div>
        )}
        <div className="flex justify-between gap-8">
          <span className="text-gray-400">Status</span>
          <span className="text-amber-500 text-xs font-medium">Pending review</span>
        </div>
      </div>

      <div className="flex gap-3">
        <Link
          to="/dashboard/skills"
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors"
        >
          Back to Skills
        </Link>
        <button
          onClick={onReset}
          className="px-4 py-2 text-gray-400 hover:text-gray-700 text-sm transition-colors"
        >
          Submit another
        </button>
      </div>
    </div>
  );
}
