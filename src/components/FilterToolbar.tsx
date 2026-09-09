import { useCallback, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, ChevronDown, Filter, GitPullRequest, RotateCcw, ShieldCheck, SlidersHorizontal, UserRound, X } from 'lucide-react'
import { useDismissableLayer, useModalDialog } from '../hooks/useDismissableLayer'
import { lifecycleFilterLabels } from '../lib/dashboard'
import type { LifecycleFilter, ReviewFilter } from '../lib/dashboard'
import type { LifecycleStatus, PullRequest, RepoConfig } from '../types'

type FilterOption = { value: string; label: string; count?: number }

function FilterMenu({
  icon: Icon,
  label,
  value,
  valueLabel,
  options,
  onChange,
}: {
  icon: typeof ShieldCheck
  label: string
  value: string
  valueLabel: string
  options: FilterOption[]
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const reduceMotion = useReducedMotion()
  const close = useCallback(() => setOpen(false), [])
  useDismissableLayer(open, menuRef, close, triggerRef)

  return (
    <div className="filter-control">
      <button
        ref={triggerRef}
        className="filter-trigger"
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon size={17} />
        <span><small>{label}</small><strong>{valueLabel}</strong></span>
        <ChevronDown size={16} className={open ? 'rotate' : ''} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            id={menuId}
            className="filter-menu"
            role="group"
            aria-label={`Opciones de ${label}`}
            initial={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
            transition={{ duration: reduceMotion ? 0.08 : 0.16 }}
          >
            {options.map((option) => (
              <button
                type="button"
                className={option.value === value ? 'is-selected' : ''}
                aria-pressed={option.value === value}
                key={option.value}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                  triggerRef.current?.focus()
                }}
              >
                <span>{option.label}</span>
                {option.count !== undefined && <b>{option.count}</b>}
                {option.value === value && <Check size={15} />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function MobileFilterGroup({
  label,
  value,
  options,
  compact = false,
  onChange,
}: {
  label: string
  value: string
  options: FilterOption[]
  compact?: boolean
  onChange: (value: string) => void
}) {
  return (
    <fieldset className={`mobile-filter-group ${compact ? 'is-compact' : ''}`}>
      <legend>{label}</legend>
      <div>
        {options.map((option) => (
          <button
            type="button"
            aria-pressed={value === option.value}
            className={value === option.value ? 'is-selected' : ''}
            key={option.value}
            onClick={() => onChange(option.value)}
          >
            <span>{option.label}</span>
            {option.count !== undefined && <b>{option.count}</b>}
            {value === option.value && <Check size={15} />}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

export default function FilterToolbar({
  filterLifecycle,
  setFilterLifecycle,
  filterRepo,
  setFilterRepo,
  filterReview,
  setFilterReview,
  statusCounts,
  repos,
  allPrs,
  resultCount,
  onReset,
}: {
  filterLifecycle: LifecycleFilter
  setFilterLifecycle: (value: LifecycleFilter) => void
  filterRepo: string
  setFilterRepo: (value: string) => void
  filterReview: ReviewFilter
  setFilterReview: (value: ReviewFilter) => void
  statusCounts: Record<LifecycleFilter, number>
  repos: RepoConfig[]
  allPrs: PullRequest[]
  resultCount: number
  onReset: () => void
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const sheetRef = useRef<HTMLElement>(null)
  const mobileTriggerRef = useRef<HTMLButtonElement>(null)
  const reduceMotion = useReducedMotion()
  const closeMobile = useCallback(() => setMobileOpen(false), [])
  useModalDialog(mobileOpen, sheetRef, closeMobile, mobileTriggerRef)

  const lifecycleOptions = (Object.keys(lifecycleFilterLabels) as LifecycleFilter[]).map((value) => ({
    value,
    label: lifecycleFilterLabels[value],
    count: statusCounts[value],
  }))
  const repositoryOptions: FilterOption[] = [
    { value: 'all', label: 'Todos', count: allPrs.length },
    ...repos.map((repo) => {
      const value = `${repo.workspace}/${repo.repo}`
      return {
        value,
        label: repo.repo,
        count: allPrs.filter((pr) => `${pr.repo.workspace}/${pr.repo.repo}` === value).length,
      }
    }),
  ]
  const reviewOptions: FilterOption[] = [
    { value: 'ALL', label: 'Todos' },
    { value: 'ATTENTION', label: 'Necesitan revisión' },
    { value: 'WAITING', label: 'Esperando al dev' },
    { value: 'REVIEWED', label: 'Revisados' },
  ]
  const lifecycleLabel = lifecycleOptions.find((option) => option.value === filterLifecycle)?.label || 'Todos'
  const repositoryLabel = repositoryOptions.find((option) => option.value === filterRepo)?.label || 'Todos'
  const reviewLabel = reviewOptions.find((option) => option.value === filterReview)?.label || 'Todos'
  const changedFilters = Number(filterLifecycle !== 'OPEN') + Number(filterRepo !== 'all') + Number(filterReview !== 'ATTENTION')

  const mobileSheet = (
    <AnimatePresence>
      {mobileOpen && (
        <motion.div
          className="sheet-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.08 : 0.18 }}
          onMouseDown={(event) => event.target === event.currentTarget && setMobileOpen(false)}
        >
          <motion.section
            ref={sheetRef}
            className="filter-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="filter-sheet-title"
            tabIndex={-1}
            initial={{ y: reduceMotion ? 0 : '100%' }}
            animate={{ y: 0 }}
            exit={{ y: reduceMotion ? 0 : '100%' }}
            transition={{ duration: reduceMotion ? 0.08 : 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="sheet-handle" aria-hidden="true" />
            <header>
              <div><span className="section-kicker">Ajusta la cola</span><h2 id="filter-sheet-title">Filtros</h2></div>
              <button type="button" className="icon-button" aria-label="Cerrar filtros" onClick={() => setMobileOpen(false)}><X size={19} /></button>
            </header>
            <div className="filter-sheet-body">
              <MobileFilterGroup compact label="Estado" value={filterLifecycle} options={lifecycleOptions} onChange={(value) => setFilterLifecycle(value as LifecycleFilter)} />
              <MobileFilterGroup label="Repositorio" value={filterRepo} options={repositoryOptions} onChange={setFilterRepo} />
              <MobileFilterGroup label="QA" value={filterReview} options={reviewOptions} onChange={(value) => setFilterReview(value as ReviewFilter)} />
            </div>
            <footer>
              <button type="button" className="button button-secondary" onClick={onReset}><RotateCcw size={16} /> Restablecer</button>
              <button type="button" className="button button-primary" onClick={() => setMobileOpen(false)}>Ver {resultCount} resultados</button>
            </footer>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )

  return (
    <>
      <section className="filter-toolbar" aria-label="Filtros de la cola">
        <div className="desktop-filters">
          <FilterMenu icon={ShieldCheck} label="Estado" value={filterLifecycle} valueLabel={lifecycleLabel} options={lifecycleOptions} onChange={(value) => setFilterLifecycle(value as LifecycleFilter)} />
          <FilterMenu icon={GitPullRequest} label="Repositorio" value={filterRepo} valueLabel={repositoryLabel} options={repositoryOptions} onChange={setFilterRepo} />
          <FilterMenu icon={UserRound} label="QA" value={filterReview} valueLabel={reviewLabel} options={reviewOptions} onChange={(value) => setFilterReview(value as ReviewFilter)} />
        </div>

        <button
          ref={mobileTriggerRef}
          type="button"
          className="mobile-filter-trigger"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
        >
          <SlidersHorizontal size={18} />
          <span>Filtros</span>
          {changedFilters > 0 && <b aria-label={`${changedFilters} filtros modificados`}>{changedFilters}</b>}
        </button>

        <div className="filter-results" role="status">
          <Filter size={15} />
          <span><strong>{resultCount}</strong> resultados</span>
          <span className="filter-order">Recientes primero</span>
        </div>

        {changedFilters > 0 && <button type="button" className="filter-reset" onClick={onReset}><RotateCcw size={15} /> Limpiar</button>}
      </section>

      {typeof document !== 'undefined' && createPortal(mobileSheet, document.body)}
    </>
  )
}
