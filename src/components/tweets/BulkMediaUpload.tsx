import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { bulkScheduleTweets, validateBulkUploadFiles, type ProgressCallback } from '../../services/bulkUploadService'
import { getNextScheduleSlots } from '../../utils/schedule'
import type { Tweet } from '../../types/tweet'

interface BulkMediaUploadProps {
  userId: string
  groupId: string
  accountId: string
  existingTweets: Tweet[]
  onComplete: () => void
}

const MAX_FILES = 60

export function BulkMediaUpload({ userId, groupId, accountId, existingTweets, onComplete }: BulkMediaUploadProps) {
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<{ completed: number; total: number; currentFile: string } | null>(null)

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || [])
    
    // Filter for 9:16 aspect ratio videos and images
    const validFiles = selectedFiles.filter(file => {
      return file.type.startsWith('image/') || file.type.startsWith('video/')
    })

    const validation = validateBulkUploadFiles(validFiles, MAX_FILES)
    
    if (!validation.valid) {
      setError(validation.errors.join('. '))
      setFiles([])
      return
    }

    setError(null)
    setFiles(validFiles)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (files.length === 0) {
      setError('Please select at least one file')
      return
    }

    try {
      setUploading(true)
      setError(null)

      // Get available slots
      const slots = getNextScheduleSlots(existingTweets, files.length)

      // Progress callback
      const onProgress: ProgressCallback = (progressData) => {
        setProgress({
          completed: progressData.completed,
          total: progressData.total,
          currentFile: progressData.currentFile,
        })
      }

      // Bulk schedule tweets
      const result = await bulkScheduleTweets(
        {
          userId,
          files,
          groupId,
          accountId,
          slots,
        },
        onProgress,
      )

      if (result.failed > 0) {
        setError(`${result.successful} tweets scheduled successfully. ${result.failed} failed: ${result.errors.join(', ')}`)
      } else {
        setError(null)
      }

      // Reset form
      setFiles([])
      setProgress(null)
      onComplete()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to schedule tweets'
      setError(message)
    } finally {
      setUploading(false)
    }
  }

  const clearFiles = () => {
    setFiles([])
    setError(null)
  }

  return (
    <div className="bulk-media-upload">
      <div className="bulk-upload-header">
        <h2>Bulk Media Upload</h2>
        <p>Upload up to {MAX_FILES} images or videos (9:16 ratio recommended, max 100 MB per file) to schedule randomly.</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="file-input-wrapper">
          <label className="file-input-label">
            <span className="file-input-text">
              {files.length > 0 ? `${files.length} file${files.length > 1 ? 's' : ''} selected` : 'Choose files'}
            </span>
            <input
              type="file"
              multiple
              accept="image/*,video/*"
              onChange={handleFileChange}
              disabled={uploading}
              className="file-input"
            />
          </label>
          {files.length > 0 && !uploading && (
            <button type="button" onClick={clearFiles} className="ghost-button">
              Clear
            </button>
          )}
        </div>

        {files.length > 0 && (
          <div className="file-list">
            <p className="file-list-summary">
              <strong>{files.length}</strong> file{files.length > 1 ? 's' : ''} ready to upload
            </p>
            <ul className="file-names">
              {files.slice(0, 5).map((file, index) => (
                <li key={index}>
                  {file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                </li>
              ))}
              {files.length > 5 && <li>...and {files.length - 5} more</li>}
            </ul>
          </div>
        )}

        {progress && (
          <div className="upload-progress">
            <div className="progress-bar-container">
              <div
                className="progress-bar-fill"
                style={{ width: `${(progress.completed / progress.total) * 100}%` }}
              />
            </div>
            <p className="progress-text">
              Uploading {progress.completed} of {progress.total}
              {progress.currentFile && `: ${progress.currentFile}`}
            </p>
          </div>
        )}

        {error && <p className="form-error">{error}</p>}

        <div className="bulk-upload-actions">
          <button
            type="submit"
            className="primary-button"
            disabled={uploading || files.length === 0}
          >
            {uploading ? 'Uploading...' : `Schedule ${files.length} tweet${files.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </form>

      <style>{`
        .bulk-media-upload {
          background: white;
          border-radius: 8px;
          padding: 24px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          margin-bottom: 24px;
        }

        .bulk-upload-header h2 {
          margin: 0 0 8px 0;
          font-size: 18px;
          font-weight: 600;
        }

        .bulk-upload-header p {
          margin: 0;
          color: #666;
          font-size: 14px;
        }

        .file-input-wrapper {
          margin: 20px 0;
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .file-input-label {
          flex: 1;
          display: block;
          cursor: pointer;
        }

        .file-input {
          display: none;
        }

        .file-input-text {
          display: inline-block;
          padding: 10px 16px;
          background: #f0f0f0;
          border: 2px dashed #ccc;
          border-radius: 6px;
          font-size: 14px;
          color: #333;
          transition: all 0.2s;
          width: 100%;
          text-align: center;
        }

        .file-input-label:hover .file-input-text {
          background: #e8e8e8;
          border-color: #999;
        }

        .file-list {
          background: #f9f9f9;
          padding: 16px;
          border-radius: 6px;
          margin: 16px 0;
        }

        .file-list-summary {
          margin: 0 0 12px 0;
          font-size: 14px;
        }

        .file-names {
          list-style: none;
          padding: 0;
          margin: 0;
          font-size: 13px;
          color: #666;
        }

        .file-names li {
          padding: 4px 0;
        }

        .upload-progress {
          margin: 20px 0;
        }

        .progress-bar-container {
          width: 100%;
          height: 8px;
          background: #e0e0e0;
          border-radius: 4px;
          overflow: hidden;
        }

        .progress-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #4f46e5, #7c3aed);
          transition: width 0.3s ease;
        }

        .progress-text {
          margin: 8px 0 0 0;
          font-size: 13px;
          color: #666;
        }

        .bulk-upload-actions {
          margin-top: 20px;
        }

        .form-error {
          color: #dc2626;
          font-size: 14px;
          margin: 12px 0;
        }

        .ghost-button {
          background: transparent;
          border: 1px solid #ccc;
          padding: 10px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s;
        }

        .ghost-button:hover {
          background: #f5f5f5;
          border-color: #999;
        }

        .primary-button {
          background: linear-gradient(135deg, #4f46e5, #7c3aed);
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: opacity 0.2s;
        }

        .primary-button:hover:not(:disabled) {
          opacity: 0.9;
        }

        .primary-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  )
}
