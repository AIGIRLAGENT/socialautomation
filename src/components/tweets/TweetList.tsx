import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import type { Tweet } from '../../types/tweet'
import clsx from 'clsx'
import { formatInTimeZone } from 'date-fns-tz'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { DUBAI_TIMEZONE, formatDayKey } from '../../utils/schedule'
import { MAX_MEDIA_SIZE_BYTES, MAX_TWEET_LENGTH } from '../../constants/tweet'

interface TweetListProps {
  tweets: Tweet[]
  selectedDate: Date | null
  onUpdateStatus: (tweetId: string, status: Tweet['status']) => Promise<void>
  onDelete: (tweet: Tweet) => Promise<void>
  onReorder: (orderedTweets: Tweet[]) => Promise<void> | void
  onRetweet: (tweet: Tweet) => Promise<void>
  onEdit: (tweet: Tweet, payload: TweetEditPayload) => Promise<void>
  onPublishNow: (tweet: Tweet) => Promise<void>
}

interface TweetEditPayload {
  text: string
  replaceMediaFile?: File | null
  removeMedia?: boolean
}

const statusLabels: Record<Tweet['status'], string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  queued: 'Queued',
  manual: 'Manual only',
  processing: 'Processing',
  posted: 'Posted',
  failed: 'Failed',
}

export function TweetList({
  tweets,
  selectedDate,
  onUpdateStatus,
  onDelete,
  onReorder,
  onRetweet,
  onEdit,
  onPublishNow,
}: TweetListProps) {
  const openMediaInNewTab = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) {
        return
      }

      const oldIndex = tweets.findIndex((tweet) => tweet.id === active.id)
      const newIndex = tweets.findIndex((tweet) => tweet.id === over.id)

      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
        return
      }

      const reordered = arrayMove(tweets, oldIndex, newIndex)
      void onReorder(reordered)
    },
    [tweets, onReorder],
  )

  if (tweets.length === 0) {
    return (
      <div className="empty-state">
        <p>No tweets scheduled yet. Start by composing one on the left.</p>
      </div>
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={tweets.map((tweet) => tweet.id)} strategy={verticalListSortingStrategy}>
        <ul className="tweet-list" aria-live="polite">
          {tweets.map((tweet) => (
            <SortableTweetCard
              key={tweet.id}
              tweet={tweet}
              selectedDate={selectedDate}
              onUpdateStatus={onUpdateStatus}
              onDelete={onDelete}
              openMediaInNewTab={openMediaInNewTab}
              onRetweet={onRetweet}
              onEdit={onEdit}
              onPublishNow={onPublishNow}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

interface SortableTweetCardProps {
  tweet: Tweet
  selectedDate: Date | null
  onUpdateStatus: (tweetId: string, status: Tweet['status']) => Promise<void>
  onDelete: (tweet: Tweet) => Promise<void>
  openMediaInNewTab: (url: string) => void
  onRetweet: (tweet: Tweet) => Promise<void>
  onEdit: (tweet: Tweet, payload: TweetEditPayload) => Promise<void>
  onPublishNow: (tweet: Tweet) => Promise<void>
}

function SortableTweetCard({
  tweet,
  selectedDate,
  onUpdateStatus,
  onDelete,
  openMediaInNewTab,
  onRetweet,
  onEdit,
  onPublishNow,
}: SortableTweetCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tweet.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const isSameDay = selectedDate ? formatDayKey(tweet.scheduledFor) === formatDayKey(selectedDate) : false
  const isProcessing = tweet.status === 'processing'
  const isQueued = tweet.status === 'queued'
  const isManual = tweet.status === 'manual'
  const isPosted = tweet.status === 'posted'
  const scheduledLabel = formatInTimeZone(tweet.scheduledFor, DUBAI_TIMEZONE, "MMM d, yyyy 'at' h:mm aaa 'DXB'")
  const postedLabel = tweet.postedAt
    ? formatInTimeZone(tweet.postedAt, DUBAI_TIMEZONE, "MMM d 'at' h:mm aaa 'DXB'")
    : null

  const [isEditing, setIsEditing] = useState(false)
  const [draftText, setDraftText] = useState(tweet.text)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [replacementFile, setReplacementFile] = useState<File | null>(null)
  const [replacementPreview, setReplacementPreview] = useState<string | null>(null)
  const [removeExistingMedia, setRemoveExistingMedia] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const fileInputId = useMemo(() => `tweet-edit-file-${tweet.id}`, [tweet.id])

  useEffect(() => {
    if (!isEditing) {
      setDraftText(tweet.text)
      setDraftError(null)
      setReplacementFile(null)
      setRemoveExistingMedia(false)
      if (replacementPreview) {
        URL.revokeObjectURL(replacementPreview)
      }
      setReplacementPreview(null)
    }
  }, [isEditing, tweet.text, replacementPreview])

  useEffect(() => {
    return () => {
      if (replacementPreview) {
        URL.revokeObjectURL(replacementPreview)
      }
    }
  }, [replacementPreview])

  const remainingCharacters = MAX_TWEET_LENGTH - draftText.length
  const isOverLimit = remainingCharacters < 0

  const existingMedia = tweet.media
  const hasExistingMedia = existingMedia.length > 0

  const previewMedia = useMemo(() => {
    if (replacementFile) {
      return {
        type: replacementFile.type.startsWith('video/') ? 'video' : 'image',
        url: replacementPreview ?? '',
      }
    }

    if (existingMedia[0]) {
      return {
        type: existingMedia[0].type,
        url: existingMedia[0].downloadUrl,
      }
    }

    return null
  }, [replacementFile, replacementPreview, existingMedia])

  const handleStartEdit = () => {
    setIsEditing(true)
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
  }

  const handleReplacementChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    if (!(file.type.startsWith('image/') || file.type.startsWith('video/'))) {
      setDraftError('Only image or video files are supported')
      return
    }

    if (file.size > MAX_MEDIA_SIZE_BYTES) {
      setDraftError('Media must be 20 MB or smaller')
      return
    }

    if (replacementPreview) {
      URL.revokeObjectURL(replacementPreview)
    }

    setDraftError(null)
    setReplacementFile(file)
    setReplacementPreview(URL.createObjectURL(file))
    setRemoveExistingMedia(false)
  }

  const handleClearReplacement = () => {
    if (replacementPreview) {
      URL.revokeObjectURL(replacementPreview)
    }
    setReplacementFile(null)
    setReplacementPreview(null)
  }

  const handleToggleRemoveExisting = () => {
    setRemoveExistingMedia((prev) => !prev)
    if (replacementPreview) {
      URL.revokeObjectURL(replacementPreview)
    }
    setReplacementFile(null)
    setReplacementPreview(null)
  }

  const handleSave = async () => {
    const trimmed = draftText.trim()
    if (!trimmed) {
      setDraftError('Tweet cannot be empty')
      return
    }

    if (isOverLimit) {
      setDraftError('Tweet exceeds 280 characters')
      return
    }

    setDraftError(null)
    setIsSaving(true)
    try {
      await onEdit(tweet, {
        text: trimmed,
        replaceMediaFile: replacementFile ?? undefined,
        removeMedia: removeExistingMedia && !replacementFile,
      })
      setIsEditing(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update tweet'
      setDraftError(message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleManual = () => {
    const nextStatus: Tweet['status'] = isManual ? 'scheduled' : 'manual'
    void onUpdateStatus(tweet.id, nextStatus)
  }

  const handlePublishNow = async () => {
    setIsPublishing(true)
    try {
      await onPublishNow(tweet)
    } catch (error) {
      console.error('Unable to publish tweet manually', error)
    } finally {
      setIsPublishing(false)
    }
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={clsx('tweet-card', {
        'tweet-card--highlight': isSameDay,
        'tweet-card--dragging': isDragging,
        'tweet-card--editing': isEditing,
      })}
      {...attributes}
    >
      <div className="tweet-card-meta">
        <span className="tweet-scheduled">{scheduledLabel}</span>
        <div className="tweet-card-meta-actions">
          <button
            type="button"
            className="tweet-card-drag-handle"
            aria-label="Drag to reorder tweet"
            {...(isEditing ? {} : listeners)}
            disabled={isEditing}
          >
            <span className="tweet-card-drag-handle-icon" aria-hidden="true" />
          </button>
          <span className={clsx('tweet-status', `tweet-status--${tweet.status}`)}>
            {statusLabels[tweet.status]}
          </span>
        </div>
      </div>
      {postedLabel ? <span className="tweet-meta">Posted {postedLabel}</span> : null}
      {isEditing ? (
        <div className="tweet-edit-form">
          <label className="tweet-edit-label" htmlFor={`tweet-text-${tweet.id}`}>
            Tweet text
          </label>
          <textarea
            id={`tweet-text-${tweet.id}`}
            className="tweet-edit-input"
            value={draftText}
            onChange={(event) => setDraftText(event.target.value)}
            maxLength={MAX_TWEET_LENGTH + 20}
            rows={4}
          />
          <div className="tweet-edit-meta">
            <span className={clsx('tweet-edit-count', { 'tweet-edit-count--warning': isOverLimit })}>
              {draftText.length}/{MAX_TWEET_LENGTH}
            </span>
            {hasExistingMedia ? (
              <button type="button" className="ghost-button" onClick={handleToggleRemoveExisting}>
                {removeExistingMedia ? 'Keep current media' : 'Remove current media'}
              </button>
            ) : null}
          </div>
          <div className="tweet-edit-media">
            <label className="media-upload-input" htmlFor={fileInputId}>
              <span>{replacementFile ? 'Replace attachment' : hasExistingMedia ? 'Replace with new media' : 'Attach image or video'}</span>
              <input id={fileInputId} type="file" accept="image/*,video/*" onChange={handleReplacementChange} />
            </label>
            {replacementFile ? (
              <button type="button" className="ghost-button" onClick={handleClearReplacement}>
                Remove new media
              </button>
            ) : null}
          </div>
          {previewMedia && !removeExistingMedia ? (
            <div className="tweet-edit-preview">
              {previewMedia.type === 'video' ? (
                <video src={previewMedia.url} controls preload="metadata" />
              ) : (
                <img src={previewMedia.url} alt={replacementFile ? 'Updated media preview' : 'Current media preview'} />
              )}
            </div>
          ) : null}
          {draftError ? <p className="form-error">{draftError}</p> : null}
          <div className="tweet-edit-actions">
            <button type="button" className="ghost-button" onClick={handleCancelEdit} disabled={isSaving}>
              Cancel
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="tweet-text">{tweet.text}</p>
          {tweet.media.length > 0 ? (
            <div className="tweet-media-grid">
              {tweet.media.map((media) => (
                <div key={media.id} className="tweet-media-item">
                  <div className="tweet-media-preview">
                    {media.type === 'video' ? (
                      <video src={media.downloadUrl} controls preload="metadata" />
                    ) : (
                      <img src={media.downloadUrl} alt="Tweet media attachment" />
                    )}
                  </div>
                  <button
                    type="button"
                    className="tweet-media-open"
                    onClick={() => {
                      openMediaInNewTab(media.downloadUrl)
                    }}
                  >
                    View full size
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          {tweet.lastError ? <p className="tweet-error">{tweet.lastError}</p> : null}
          <div className="tweet-card-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                void onRetweet(tweet)
              }}
              disabled={isProcessing}
            >
              Retweet
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={handleStartEdit}
              disabled={isProcessing}
            >
              Edit
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={handleToggleManual}
              disabled={isProcessing || isPublishing || isPosted}
            >
              {isManual ? 'Automate' : 'Manual only'}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                void onUpdateStatus(tweet.id, 'queued')
              }}
              disabled={isQueued || isProcessing || isPosted || isManual}
            >
              Queue
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                void handlePublishNow()
              }}
              disabled={!isManual || isProcessing || isPosted || isPublishing}
            >
              {isPublishing ? 'Sending…' : 'Send now'}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                void onUpdateStatus(tweet.id, 'posted')
              }}
              disabled={isPosted || isProcessing}
            >
              Mark posted
            </button>
            <button
              type="button"
              className="ghost-button danger"
              onClick={() => {
                void onDelete(tweet)
              }}
              disabled={isProcessing}
            >
              Delete
            </button>
          </div>
        </>
      )}
    </li>
  )
}
