export type TweetStatus =
  | 'draft'
  | 'scheduled'
  | 'queued'
  | 'manual'
  | 'processing'
  | 'posted'
  | 'failed'

export type TweetMediaType = 'image' | 'video'

export interface TweetMedia {
  id: string
  storagePath: string
  downloadUrl: string
  contentType: string
  size: number
  type: TweetMediaType
}

export interface Tweet {
  id: string
  authorUid: string
  groupId: string
  accountId: string
  text: string
  scheduledFor: Date
  status: TweetStatus
  createdAt: Date
  lastUpdatedAt: Date
  lastError?: string | null
  postedAt?: Date | null
  media: TweetMedia[]
}

export interface TweetDraft {
  text: string
  scheduledFor: Date
  groupId: string
  accountId: string
  status?: TweetStatus
  media?: TweetMedia[]
}
