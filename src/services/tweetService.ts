import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type QueryConstraint,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../firebase/app'
import type { Tweet, TweetDraft, TweetMedia } from '../types/tweet'

const TWEETS_COLLECTION = 'tweets'

function mapSnapshotToTweet(snapshot: QueryDocumentSnapshot<DocumentData>): Tweet {
  const data = snapshot.data()
  const scheduledFor = (data.scheduledFor as Timestamp).toDate()
  const createdAt = (data.createdAt as Timestamp | undefined)?.toDate() ?? scheduledFor
  const lastUpdatedAt = (data.lastUpdatedAt as Timestamp | undefined)?.toDate() ?? createdAt
  const postedAt = (data.postedAt as Timestamp | undefined)?.toDate() ?? null
  const media = Array.isArray(data.media) ? (data.media as TweetMedia[]) : []

  return {
    id: snapshot.id,
    authorUid: data.authorUid as string,
    groupId: data.groupId as string,
    accountId: data.accountId as string,
    text: data.text as string,
    scheduledFor,
    status: (data.status as Tweet['status']) ?? 'scheduled',
    createdAt,
    lastUpdatedAt,
    lastError: (data.lastError as string | undefined) ?? null,
    postedAt,
    media,
  }
}

export async function createTweet(authorUid: string, draft: TweetDraft) {
  await addDoc(collection(db, TWEETS_COLLECTION), {
    authorUid,
    groupId: draft.groupId,
    accountId: draft.accountId,
    text: draft.text,
    scheduledFor: Timestamp.fromDate(draft.scheduledFor),
    status: draft.status ?? 'scheduled',
    createdAt: serverTimestamp(),
    lastUpdatedAt: serverTimestamp(),
    lastError: null,
    postedAt: null,
    media: draft.media ?? [],
  })
}

export async function updateTweet(id: string, updates: Partial<Tweet>) {
  const payload: Record<string, unknown> = {
    lastUpdatedAt: serverTimestamp(),
  }

  if (updates.scheduledFor) {
    payload.scheduledFor = Timestamp.fromDate(updates.scheduledFor)
  }

  if (updates.status) {
    payload.status = updates.status
  }

  if (typeof updates.text === 'string') {
    payload.text = updates.text
  }

  if ('lastError' in updates) {
    payload.lastError = updates.lastError ?? null
  }

  if ('postedAt' in updates) {
    payload.postedAt = updates.postedAt ? Timestamp.fromDate(updates.postedAt) : null
  }

  if ('media' in updates) {
    payload.media = updates.media ?? []
  }

  await updateDoc(doc(db, TWEETS_COLLECTION, id), payload)
}

export async function deleteTweet(id: string) {
  await deleteDoc(doc(db, TWEETS_COLLECTION, id))
}

export async function publishTweetNow(tweetId: string) {
  const callable = httpsCallable<{ tweetId: string }, { success: boolean }>(functions, 'publishTweetNow')

  try {
    await callable({ tweetId })
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Unable to publish tweet right now.')
  }
}

type TweetsListener = (tweets: Tweet[]) => void
type ErrorListener = (error: Error) => void

type Unsubscribe = () => void

export function subscribeToTweets(
  authorUid: string,
  groupId: string | null,
  accountId: string | null,
  listener: TweetsListener,
  onError?: ErrorListener,
): Unsubscribe {
  const tweetsRef = collection(db, TWEETS_COLLECTION)

  const constraints: QueryConstraint[] = [where('authorUid', '==', authorUid)]

  if (groupId) {
    constraints.push(where('groupId', '==', groupId))
  }

  if (accountId) {
    constraints.push(where('accountId', '==', accountId))
  }

  constraints.push(orderBy('scheduledFor', 'asc'))

  const q = query(tweetsRef, ...constraints)

  return onSnapshot(
    q,
    (snapshot) => {
      const tweets = snapshot.docs.map(mapSnapshotToTweet)
      listener(tweets)
    },
    (error) => {
      if (onError) {
        onError(error)
      }
    },
  )
}
