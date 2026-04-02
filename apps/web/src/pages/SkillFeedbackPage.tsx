import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useSubmitRestructureRequest } from '@/hooks/useSubmitRestructureRequest'
import { RestructureForm } from '@/components/skill-feedback/RestructureForm'
import { RestructureSuccess } from '@/components/skill-feedback/RestructureSuccess'

export default function SkillFeedbackPage() {
  const navigate = useNavigate()
  const { state, submit, reset } = useSubmitRestructureRequest()

  if (state.status === 'success') {
    return (
      <RestructureSuccess
        requestId={state.requestId}
        proposal={state.proposal}
        targetNodeName={state.targetNodeName}
        onReset={reset}
      />
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/dashboard/help')}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Skill Structure</h1>
          <p className="mt-1 text-base text-gray-500">Suggest improvements to the skill tree.</p>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6">
        <RestructureForm submitting={state.status === 'submitting'} onSubmit={submit} />
        {state.status === 'error' && (
          <p className="text-red-500 text-sm mt-2">{state.message}</p>
        )}
      </div>
    </div>
  )
}
