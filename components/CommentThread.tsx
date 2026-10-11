'use client'

import { forwardRef, useEffect, useRef, useState } from 'react'
import { Loader2, Reply } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ErrorNotice, EmptyState } from '@/components/states'
import { useComments } from '@/hooks/useIncidents'
import { fetcher, postJson } from '@/hooks/api'
import { useIdentityStore } from '@/lib/store'
import type { CommentDTO, Person } from '@/lib/types'
import { cn, initials, timeAgo } from '@/lib/utils'

/** Threaded discussion (one level of replies) with @mention autocomplete. */
export default function CommentThread({ incidentId, onPosted }: { incidentId: string; onPosted?: () => void }): React.JSX.Element {
  const [page, setPage] = useState(1)
  const { data, error, isLoading, mutate } = useComments(incidentId, page)
  const [replyTo, setReplyTo] = useState<string | null>(null)

  const posted = (): void => {
    setReplyTo(null)
    void mutate()
    onPosted?.()
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <ErrorNotice message={error.message} onRetry={() => void mutate()} />}
      {isLoading && !data && <p className="text-sm text-muted-foreground">Loading comments…</p>}
      {data && data.items.length === 0 && <EmptyState title="No comments yet">Start the discussion — use @ to mention someone.</EmptyState>}

      <ol className="flex flex-col gap-4">
        {data?.items.map(comment => (
          <li key={comment.id} className="flex flex-col gap-3">
            <CommentItem comment={comment} onReply={() => setReplyTo(comment.id)} />
            {(comment.replies.length > 0 || replyTo === comment.id) && (
              <ol className="ml-5 flex flex-col gap-3 border-l-2 border-border pl-4">
                {comment.replies.map(r => <li key={r.id}><CommentItem comment={r} /></li>)}
                {replyTo === comment.id && (
                  <li>
                    <CommentComposer incidentId={incidentId} parentId={comment.id} autoFocus onPosted={posted} onCancel={() => setReplyTo(null)} />
                  </li>
                )}
              </ol>
            )}
          </li>
        ))}
      </ol>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <span className="text-muted-foreground">Page {data.page} of {data.totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}

      <CommentComposer id="new-comment" incidentId={incidentId} onPosted={posted} />
    </div>
  )
}

function CommentItem({ comment, onReply }: { comment: CommentDTO; onReply?: () => void }): React.JSX.Element {
  return (
    <article className="flex gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary-soft text-xs font-semibold text-secondary" aria-hidden="true">
        {initials(comment.author)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-semibold">{comment.author}</span>{' '}
          <time dateTime={comment.createdAt} className="text-xs text-muted-foreground">{timeAgo(comment.createdAt)}</time>
        </p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm"><HighlightMentions text={comment.content} /></p>
        {onReply && (
          <Button variant="ghost" size="sm" className="-ml-2 mt-1 h-7" onClick={onReply}>
            <Reply aria-hidden="true" /> Reply
          </Button>
        )}
      </div>
    </article>
  )
}

function HighlightMentions({ text }: { text: string }): React.JSX.Element {
  const parts = text.split(/(@[\p{L}][\p{L}\p{M}'.-]*(?: [\p{Lu}][\p{L}\p{M}'.-]*)?)/u)
  return <>{parts.map((p, i) => (p.startsWith('@') ? <span key={i} className="font-medium text-primary">{p}</span> : p))}</>
}

interface ComposerProps {
  id?: string
  incidentId: string
  parentId?: string
  autoFocus?: boolean
  onPosted: () => void
  onCancel?: () => void
}

function CommentComposer({ id, incidentId, parentId, autoFocus, onPosted, onCancel }: ComposerProps): React.JSX.Element {
  const signedIn = useIdentityStore(s => s.currentUser !== null)
  const [content, setContent] = useState('')
  const [mentions, setMentions] = useState<Person[]>([])
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Person[]>([])
  const [active, setActive] = useState(0)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)
  const listId = `${id ?? parentId ?? 'composer'}-mentions`

  useEffect(() => {
    if (mentionQuery === null) return
    const timer = setTimeout(() => {
      fetcher<Person[]>(`/api/people?q=${encodeURIComponent(mentionQuery)}`)
        .then(people => { setSuggestions(people); setActive(0) })
        .catch(() => setSuggestions([]))
    }, 150)
    return () => clearTimeout(timer)
  }, [mentionQuery])

  const onChange = (value: string): void => {
    setContent(value)
    const caret = ref.current?.selectionStart ?? value.length
    const match = /(^|\s)@([\p{L}\p{N}._-]{0,30})$/u.exec(value.slice(0, caret))
    setMentionQuery(match ? (match[2] ?? '') : null)
  }

  const pick = (person: Person): void => {
    const el = ref.current
    const caret = el?.selectionStart ?? content.length
    const before = content.slice(0, caret).replace(/@[\p{L}\p{N}._-]*$/u, `@${person.name} `)
    setContent(before + content.slice(caret))
    setMentions(m => (m.some(p => p.email === person.email) ? m : [...m, person]))
    setMentionQuery(null)
    setSuggestions([])
    requestAnimationFrame(() => el?.focus())
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (mentionQuery === null || suggestions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % suggestions.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a - 1 + suggestions.length) % suggestions.length) }
    else if (e.key === 'Enter' || e.key === 'Tab') {
      const person = suggestions[active]
      if (person) { e.preventDefault(); pick(person) }
    } else if (e.key === 'Escape') { setMentionQuery(null) }
  }

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!content.trim()) return
    setPending(true)
    setError(null)
    try {
      // Only keep mentions whose @Name is still in the text
      const kept = mentions.filter(p => content.includes(`@${p.name}`)).map(p => p.email)
      await postJson(`/api/incidents/${incidentId}/comments`, { content, parentId, mentions: kept })
      setContent('')
      setMentions([])
      onPosted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post the comment')
    } finally {
      setPending(false)
    }
  }

  if (!signedIn) {
    return <p className="text-sm text-muted-foreground">Set up your profile in Settings to join the discussion.</p>
  }

  const showList = mentionQuery !== null && suggestions.length > 0
  return (
    <form id={id} onSubmit={submit} className="relative flex flex-col gap-2">
      <label htmlFor={`${listId}-input`} className="sr-only">{parentId ? 'Write a reply' : 'Add a comment'}</label>
      <MentionTextarea
        ref={ref}
        id={`${listId}-input`}
        value={content}
        autoFocus={autoFocus}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={parentId ? 'Write a reply…' : 'Add a comment… use @ to mention someone'}
        rows={parentId ? 2 : 3}
        maxLength={5000}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList ? `${listId}-${active}` : undefined}
      />
      {showList && (
        <ul id={listId} role="listbox" className="absolute left-0 top-full z-10 mt-1 w-72 rounded-md border border-border bg-surface p-1 shadow-lg">
          {suggestions.map((p, i) => (
            <li key={p.email} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              onMouseDown={e => { e.preventDefault(); pick(p) }}
              className={cn('cursor-pointer rounded-sm px-2 py-1.5 text-sm', i === active && 'bg-muted')}>
              <span className="font-medium">{p.name}</span> <span className="text-xs text-muted-foreground">{p.email}</span>
            </li>
          ))}
        </ul>
      )}
      {error && <ErrorNotice message={error} />}
      <div className="flex justify-end gap-2">
        {onCancel && <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" size="sm" disabled={pending || !content.trim()}>
          {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {parentId ? 'Reply' : 'Comment'}
        </Button>
      </div>
    </form>
  )
}

const MentionTextarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>((props, ref) => (
  <Textarea ref={ref} {...props} />
))
MentionTextarea.displayName = 'MentionTextarea'
