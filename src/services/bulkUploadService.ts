import { uploadTweetMedia } from './mediaService'
import { createTweet } from './tweetService'
import type { TweetMedia } from '../types/tweet'

interface BulkScheduleOptions {
  userId: string
  files: File[]
  groupId: string
  accountId: string
  slots: Date[]
}

interface BulkScheduleProgress {
  total: number
  completed: number
  failed: number
  currentFile: string
}

export type ProgressCallback = (progress: BulkScheduleProgress) => void

/**
 * Shuffles an array randomly using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

/**
 * Bulk schedule tweets with uploaded media files
 * Files and slots will be randomly shuffled to ensure random distribution
 */
export async function bulkScheduleTweets(
  options: BulkScheduleOptions,
  onProgress?: ProgressCallback,
): Promise<{ successful: number; failed: number; errors: string[] }> {
  const { userId, files, groupId, accountId, slots } = options

  if (files.length === 0) {
    throw new Error('No files provided')
  }

  if (slots.length < files.length) {
    throw new Error(`Not enough available slots. Need ${files.length}, have ${slots.length}`)
  }

  // Shuffle both files and slots for randomization
  const shuffledFiles = shuffleArray(files)
  const shuffledSlots = shuffleArray(slots.slice(0, files.length))

  let completed = 0
  let failed = 0
  const errors: string[] = []

  for (let i = 0; i < shuffledFiles.length; i++) {
    const file = shuffledFiles[i]
    const scheduledFor = shuffledSlots[i]

    if (onProgress) {
      onProgress({
        total: shuffledFiles.length,
        completed,
        failed,
        currentFile: file.name,
      })
    }

    try {
      // Upload media file
      const media: TweetMedia = await uploadTweetMedia({
        userId,
        file,
      })

      // Create scheduled tweet with the media
      await createTweet(userId, {
        text: '', // Empty text, media-only tweet
        scheduledFor,
        groupId,
        accountId,
        status: 'scheduled',
        media: [media],
      })

      completed++
    } catch (error) {
      failed++
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      errors.push(`${file.name}: ${errorMsg}`)
      console.error(`Failed to schedule tweet for ${file.name}:`, error)
    }
  }

  if (onProgress) {
    onProgress({
      total: shuffledFiles.length,
      completed,
      failed,
      currentFile: '',
    })
  }

  return { successful: completed, failed, errors }
}

/**
 * Validates if files meet the requirements for bulk upload
 */
export function validateBulkUploadFiles(
  files: File[],
  maxCount: number = 60,
  maxSizeBytes: number = 100 * 1024 * 1024,
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (files.length === 0) {
    errors.push('Please select at least one file')
  }

  if (files.length > maxCount) {
    errors.push(`Maximum ${maxCount} files allowed`)
  }

  for (const file of files) {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      errors.push(`${file.name}: Only images and videos are supported`)
      break
    }

    if (file.size > maxSizeBytes) {
      const maxMB = Math.round(maxSizeBytes / (1024 * 1024))
      errors.push(`${file.name}: File exceeds ${maxMB} MB limit`)
      break
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
