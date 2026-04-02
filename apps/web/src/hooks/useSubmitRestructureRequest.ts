import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { RestructureProposal } from '@/types/restructure';

type SubmitState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | {
      status: 'success';
      requestId: string;
      proposal: RestructureProposal;
      targetNodeName?: string;
    }
  | { status: 'error'; message: string };

interface SubmitOptions {
  proposal: RestructureProposal;
  targetNodeId?: string;
  targetNodeName?: string;
  message?: string;
}

export function useSubmitRestructureRequest() {
  const [state, setState] = useState<SubmitState>({ status: 'idle' });

  const submit = async (opts: SubmitOptions) => {
    setState({ status: 'submitting' });

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setState({
        status: 'error',
        message: 'You must be signed in to submit a request.',
      });
      return;
    }

    const { data, error } = await supabase
      .from('node_restructure_requests')
      .insert({
        requester_user_id: session.user.id,
        target_node_id: opts.targetNodeId ?? null,
        proposal: opts.proposal,
        proposal_version: opts.proposal.version,
        message: opts.message ?? null,
      })
      .select('id')
      .single();

    if (error || !data) {
      setState({
        status: 'error',
        message: error?.message ?? 'Failed to submit request. Please try again.',
      });
      return;
    }

    setState({
      status: 'success',
      requestId: data.id,
      proposal: opts.proposal,
      targetNodeName: opts.targetNodeName,
    });
  };

  const reset = () => setState({ status: 'idle' });

  return { state, submit, reset };
}
