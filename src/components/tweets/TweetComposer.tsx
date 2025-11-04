import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { formatSlotHuman } from '../../utils/schedule'
import { MAX_MEDIA_SIZE_BYTES, MAX_TWEET_LENGTH } from '../../constants/tweet'

interface TweetComposerProps {
  onCreate: (input: { text: string; mediaFile?: File | null }) => Promise<void>
  nextSlot: Date | null
  disabled?: boolean
  disabledMessage?: string
}

export function TweetComposer({ onCreate, nextSlot, disabled = false, disabledMessage }: TweetComposerProps) {
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [mediaPreview, setMediaPreview] = useState<string | null>(null)
  const [fileInputKey, setFileInputKey] = useState(0)

  const characterCount = text.length
  const isOverLimit = characterCount > MAX_TWEET_LENGTH
  const nextSlotLabel = nextSlot ? formatSlotHuman(nextSlot) : null

  const resetForm = () => {
    setText('')
    if (mediaPreview) {
      URL.revokeObjectURL(mediaPreview)
    }
    setMediaFile(null)
    setMediaPreview(null)
    setFileInputKey((key) => key + 1)
  }

  const handleMediaChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      if (mediaPreview) {
        URL.revokeObjectURL(mediaPreview)
      }
      setMediaFile(null)
      setMediaPreview(null)
      setFileInputKey((key) => key + 1)
      return
    }

    if (!(file.type.startsWith('image/') || file.type.startsWith('video/'))) {
      setError('Only image or video files are supported')
      event.target.value = ''
      setFileInputKey((key) => key + 1)
      return
    }

    if (file.size > MAX_MEDIA_SIZE_BYTES) {
      setError('Media must be 20 MB or smaller')
      event.target.value = ''
      setFileInputKey((key) => key + 1)
      return
    }

    if (mediaPreview) {
      URL.revokeObjectURL(mediaPreview)
    }

    setError(null)
    setMediaFile(file)
    setMediaPreview(URL.createObjectURL(file))
  }

  const clearMedia = () => {
    if (mediaPreview) {
      URL.revokeObjectURL(mediaPreview)
    }
    setMediaFile(null)
    setMediaPreview(null)
    setFileInputKey((key) => key + 1)
  }

  useEffect(() => {
    return () => {
      if (mediaPreview) {
        URL.revokeObjectURL(mediaPreview)
      }
    }
  }, [mediaPreview])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (disabled) {
      return
    }

    const trimmed = text.trim()

    if (!trimmed) {
      setError('Tweet cannot be empty')
      return
    }

    if (isOverLimit) {
      setError('Tweet exceeds 280 characters')
      return
    }

    if (!nextSlot) {
      setError('All available slots are currently full. Please try again later.')
      return
    }

    try {
      setSubmitting(true)
      setError(null)
      await onCreate({
        text: trimmed,
        mediaFile,
      })
      resetForm()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to schedule tweet'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="tweet-composer" onSubmit={handleSubmit}>
      <div className="composer-header">
        <h2>Compose tweet</h2>
      </div>
      <textarea
        className="tweet-input"
        value={text}
        onChange={(event) => setText(event.target.value)}
        disabled={disabled}
        placeholder="Share something insightful…"
        rows={4}
        required
      />
      <div className="tweet-composer-meta">
        <span className={isOverLimit ? 'char-count char-count--warning' : 'char-count'}>
          {characterCount}/{MAX_TWEET_LENGTH}
        </span>
      </div>
      <div className="media-upload">
        <label className="media-upload-input">
          <span>{mediaFile ? 'Replace attachment' : 'Attach image or video'}</span>
          <input
            type="file"
            accept="image/*,video/*"
            key={fileInputKey}
            onChange={handleMediaChange}
            disabled={disabled}
          />
        </label>
        {mediaFile ? (
          <button type="button" className="ghost-button" onClick={clearMedia}>
            Remove
          </button>
        ) : null}
      </div>
      {mediaPreview ? (
        <div className="media-preview">
          {mediaFile?.type.startsWith('video/') ? (
            <video src={mediaPreview} controls preload="metadata" />
          ) : (
            <img src={mediaPreview} alt="Tweet media preview" />
          )}
        </div>
      ) : null}
      <div className="next-slot-callout">
        <strong>Next slot:</strong> {nextSlotLabel ?? 'All slots filled for now'}
        <p>Slots auto-fill daily from 4:00 AM DXB with 16 tweets per day.</p>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      {disabled && disabledMessage ? <p className="form-hint">{disabledMessage}</p> : null}
      <div className="composer-actions">
        <button
          className="primary-button"
          type="submit"
          disabled={disabled || submitting || text.trim().length === 0 || !nextSlot}
        >
          {submitting ? 'Scheduling…' : 'Schedule tweet'}
        </button>
      </div>
    </form>
  )
}
