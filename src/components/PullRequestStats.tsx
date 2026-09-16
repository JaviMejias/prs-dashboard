import { useQuery } from '@tanstack/react-query'
import { CalendarDays, CircleSlash2, FileCode2, GitCommitHorizontal, MessageCircle, Minus, Plus } from 'lucide-react'
import { getStats } from '../lib/bitbucket'
import { formatDate } from '../lib/dashboard'
import type { PullRequest, Session } from '../types'

export default function PullRequestStats({ pr, session }: { pr: PullRequest; session: Session }) {
  const query = useQuery({
    queryKey: ['stats', pr.id, pr.updated_on],
    queryFn: () => getStats(pr, session),
  })
  const compactCreatedDate = new Date(pr.created_on).toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  return (
    <div className="pr-stats" aria-label="Estadísticas del pull request">
      <span className="stat-item"><CalendarDays size={15} /><span>Creado</span><strong><span className="date-full">{formatDate(pr.created_on)}</span><span className="date-compact">{compactCreatedDate}</span></strong></span>
      <span className="stat-item"><MessageCircle size={15} /><strong>{pr.comment_count || 0}</strong><span>comentarios</span></span>
      {query.isLoading && <span className="stats-state stats-loading" role="status"><span className="inline-loader" /><span>Cargando actividad técnica…</span><span className="stats-loading-bars" aria-hidden="true"><i /><i /><i /><i /></span></span>}
      {query.isError && <span className="stats-state stats-error"><CircleSlash2 size={15} /> No se pudieron cargar los datos técnicos.</span>}
      {query.data && <>
        <span className="stat-item"><GitCommitHorizontal size={15} /><strong>{query.data.commits}</strong><span>commits</span></span>
        <span className="stat-item"><FileCode2 size={15} /><strong>{query.data.files}</strong><span>archivos</span></span>
        <span className="stat-item stat-added"><Plus size={15} /><strong>{query.data.added}</strong><span>añadidos</span></span>
        <span className="stat-item stat-removed"><Minus size={15} /><strong>{query.data.removed}</strong><span>eliminados</span></span>
      </>}
    </div>
  )
}
