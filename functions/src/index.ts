import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { createTwitterClient } from './twitterClient'
import { getTwitterAppConfig } from './config'

if (!admin.apps.length) {
  admin.initializeApp()
}

const db = admin.firestore()

type StoredTweetStatus = 'draft' | 'scheduled' | 'queued' | 'manual' | 'processing' | 'posted' | 'failed'

interface TweetMediaDoc {
  id?: string
  storagePath?: string
  contentType?: string
  type?: 'image' | 'video'
}

interface TweetDocData {
  authorUid: string
  groupId: string
  accountId: string
  text: string
  scheduledFor: Timestamp
  status: StoredTweetStatus
  media?: TweetMediaDoc[]
}

interface LegacyTwitterCredentialsDoc {
  handle?: string
  screenName?: string
  displayName?: string
  accessToken: string
  accessSecret: string
}

interface TwitterAccountDoc {
  provider: 'twitter'
  ownerUid: string
  displayName?: string
  handle?: string
  twitter?: {
    appKey: string
    appSecret: string
    accessToken: string
    accessSecret: string
  }
}

async function markTweetFailure(tweetRef: FirebaseFirestore.DocumentReference, message: string) {
  await tweetRef.update({
    status: 'failed',
    lastUpdatedAt: FieldValue.serverTimestamp(),
    lastError: message,
  })
}

async function markTweetPosted(tweetRef: FirebaseFirestore.DocumentReference) {
  await tweetRef.update({
    status: 'posted',
    postedAt: FieldValue.serverTimestamp(),
    lastUpdatedAt: FieldValue.serverTimestamp(),
    lastError: null,
  })
}

type TwitterClient = ReturnType<typeof createTwitterClient>

async function downloadMediaFromStorage(storagePath: string) {
  const bucket = admin.storage().bucket()
  const file = bucket.file(storagePath)
  const [exists] = await file.exists()

  if (!exists) {
    throw new Error(`Media file not found at path ${storagePath}`)
  }

  const [buffer] = await file.download()
  return buffer
}

async function uploadMediaAttachments(
  client: TwitterClient,
  media: TweetMediaDoc[] | undefined,
): Promise<string[]> {
  if (!media || media.length === 0) {
    return []
  }

  const attachments = media.slice(0, 4)
  const mediaIds: string[] = []

  for (const item of attachments) {
    if (!item?.storagePath || !item.contentType) {
      throw new Error('Media attachment missing storage path or content type.')
    }

    try {
      functions.logger.info('Uploading media to Twitter', { storagePath: item.storagePath, contentType: item.contentType })
      const buffer = await downloadMediaFromStorage(item.storagePath)
      const mediaId = await client.v1.uploadMedia(buffer, { mimeType: item.contentType })
      mediaIds.push(mediaId)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error while uploading media.'
      throw new Error(`Unable to upload media ${item.storagePath}: ${message}`)
    }
  }

  return mediaIds
}

function toMediaIdTuple(
  mediaIds: string[],
): [string] | [string, string] | [string, string, string] | [string, string, string, string] {
  switch (mediaIds.length) {
    case 1:
      return [mediaIds[0]]
    case 2:
      return [mediaIds[0], mediaIds[1]]
    case 3:
      return [mediaIds[0], mediaIds[1], mediaIds[2]]
    case 4:
      return [mediaIds[0], mediaIds[1], mediaIds[2], mediaIds[3]]
    default:
      throw new Error('Media IDs must contain between 1 and 4 items.')
  }
}

async function publishTweetWithClient(
  client: TwitterClient,
  tweetRef: FirebaseFirestore.DocumentReference,
  data: TweetDocData,
) {
  const mediaIds = await uploadMediaAttachments(client, data.media)
  if (mediaIds.length > 0) {
    const mediaPayload = toMediaIdTuple(mediaIds)
    await client.v2.tweet({
      text: data.text,
      media: {
        media_ids: mediaPayload,
      },
    })
  } else {
    await client.v2.tweet(data.text)
  }

  await markTweetPosted(tweetRef)
}

async function fetchTwitterAccountCredentials(groupId: string, accountId: string) {
  const accountRef = db.collection('groups').doc(groupId).collection('socialAccounts').doc(accountId)
  const snapshot = await accountRef.get()
  if (!snapshot.exists) {
    return null
  }

  const data = snapshot.data() as TwitterAccountDoc | undefined
  if (!data || data.provider !== 'twitter') {
    return null
  }

  const twitter = data.twitter
  if (!twitter?.appKey || !twitter?.appSecret || !twitter?.accessToken || !twitter?.accessSecret) {
    return null
  }

  return {
    ownerUid: data.ownerUid,
    credentials: {
      appKey: twitter.appKey,
      appSecret: twitter.appSecret,
      accessToken: twitter.accessToken,
      accessSecret: twitter.accessSecret,
    },
  }
}

async function processTweetDocument(doc: FirebaseFirestore.QueryDocumentSnapshot<TweetDocData>) {
  const tweetRef = doc.ref
  const data = doc.data()

  const lockAcquired = await db.runTransaction(async (transaction) => {
    const current = await transaction.get(tweetRef)
    const currentStatus = current.get('status') as StoredTweetStatus

    if (currentStatus === 'processing' || currentStatus === 'posted') {
      return false
    }

    transaction.update(tweetRef, {
      status: 'processing',
      lastUpdatedAt: FieldValue.serverTimestamp(),
      lastError: null,
    })

    return true
  })

  if (!lockAcquired) {
    return
  }

  const account = await fetchTwitterAccountCredentials(data.groupId, data.accountId)
  if (!account) {
    await markTweetFailure(tweetRef, 'Twitter account configuration not found for this tweet.')
    return
  }

  if (account.ownerUid !== data.authorUid) {
    await markTweetFailure(tweetRef, 'You do not have permission to post with this social account.')
    return
  }

  let client
  try {
    client = createTwitterClient(account.credentials)
  } catch (error) {
    functions.logger.error('Failed to initialize Twitter client', error)
    const message = error instanceof Error ? error.message : 'Unable to initialize Twitter client'
    await markTweetFailure(tweetRef, message)
    return
  }

  try {
    await publishTweetWithClient(client, tweetRef, data)
  } catch (error) {
    functions.logger.error('Failed to post tweet via publishTweetNow cron flow', error)
    const message = error instanceof Error ? error.message : 'Failed to post tweet'
    await markTweetFailure(tweetRef, message)
  }
}

export const publishTweetNow = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication is required.')
    }

    const tweetId = typeof data?.tweetId === 'string' ? data.tweetId.trim() : ''
    if (!tweetId) {
      throw new functions.https.HttpsError('invalid-argument', 'Tweet ID is required.')
    }

    const tweetRef = db.collection('tweets').doc(tweetId)
    let tweetData: TweetDocData

    try {
      tweetData = await db.runTransaction<TweetDocData>(async (transaction) => {
        const snapshot = await transaction.get(tweetRef)
        if (!snapshot.exists) {
          throw new functions.https.HttpsError('not-found', 'Tweet not found.')
        }

        const currentData = snapshot.data() as TweetDocData
        if (currentData.authorUid !== context.auth!.uid) {
          throw new functions.https.HttpsError('permission-denied', 'You do not have access to this tweet.')
        }

        if (currentData.status === 'processing') {
          throw new functions.https.HttpsError('failed-precondition', 'Tweet is already being processed.')
        }

        if (currentData.status === 'posted') {
          throw new functions.https.HttpsError('failed-precondition', 'Tweet has already been posted.')
        }

        if (currentData.status === 'draft') {
          throw new functions.https.HttpsError('failed-precondition', 'Draft tweets cannot be published.')
        }

        if (currentData.status !== 'manual') {
          throw new functions.https.HttpsError('failed-precondition', 'Tweet must be marked as manual before publishing.')
        }

        transaction.update(tweetRef, {
          status: 'processing',
          lastUpdatedAt: FieldValue.serverTimestamp(),
          lastError: null,
        })

        return currentData
      })
    } catch (error) {
      if (error instanceof functions.https.HttpsError) {
        throw error
      }

      const message = error instanceof Error ? error.message : 'Unable to prepare tweet for publishing.'
      throw new functions.https.HttpsError('internal', message)
    }

    const account = await fetchTwitterAccountCredentials(tweetData.groupId, tweetData.accountId)
    if (!account) {
      await markTweetFailure(tweetRef, 'Twitter account configuration not found for this tweet.')
      throw new functions.https.HttpsError('failed-precondition', 'Twitter account configuration not found for this tweet.')
    }

    if (account.ownerUid !== context.auth.uid) {
      await markTweetFailure(tweetRef, 'You do not have permission to post with this social account.')
      throw new functions.https.HttpsError('permission-denied', 'You do not have permission to post with this social account.')
    }

    let client
    try {
      client = createTwitterClient(account.credentials)
    } catch (error) {
      functions.logger.error('Failed to initialize Twitter client during manual publish', error)
      const message = error instanceof Error ? error.message : 'Unable to initialize Twitter client'
      await markTweetFailure(tweetRef, message)
      throw new functions.https.HttpsError('internal', message)
    }

    try {
      await publishTweetWithClient(client, tweetRef, tweetData)
      return { success: true }
    } catch (error) {
      functions.logger.error('Failed to post tweet during manual publish', error)
      const message = error instanceof Error ? error.message : 'Failed to post tweet'
      await markTweetFailure(tweetRef, message)
      throw new functions.https.HttpsError('internal', message)
    }
  })

export const provisionLegacyTwitterAccount = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication is required.')
    }

    const groupName = typeof data?.groupName === 'string' ? data.groupName.trim() : ''
    const accountDisplayName =
      typeof data?.accountDisplayName === 'string' ? data.accountDisplayName.trim() : ''

    if (!groupName) {
      throw new functions.https.HttpsError('invalid-argument', 'Group name is required.')
    }

    const ownerUid = context.auth.uid

    const legacyDoc = await db.collection('twitterCredentials').doc(ownerUid).get()
    if (!legacyDoc.exists) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'No existing Twitter credentials found for this user.',
      )
    }

    const legacyData = legacyDoc.data() as LegacyTwitterCredentialsDoc | undefined
    if (!legacyData?.accessToken || !legacyData?.accessSecret) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Legacy Twitter credentials are incomplete.',
      )
    }

    const appConfig = getTwitterAppConfig()

    let groupRef: FirebaseFirestore.DocumentReference | null = null
    try {
      groupRef = await db.collection('groups').add({
        name: groupName,
        ownerUid,
        createdAt: FieldValue.serverTimestamp(),
      })

      const socialAccountRef = await groupRef.collection('socialAccounts').add({
        provider: 'twitter',
        displayName:
          accountDisplayName || legacyData.displayName || `${groupName} Twitter account`,
        handle: legacyData.handle || legacyData.screenName || '',
        ownerUid,
        createdAt: FieldValue.serverTimestamp(),
        twitter: {
          appKey: appConfig.appKey,
          appSecret: appConfig.appSecret,
          accessToken: legacyData.accessToken,
          accessSecret: legacyData.accessSecret,
        },
      })

      return {
        groupId: groupRef.id,
        accountId: socialAccountRef.id,
      }
    } catch (error) {
      functions.logger.error('Failed to provision legacy Twitter account', error)

      if (groupRef) {
        try {
          await groupRef.delete()
        } catch (cleanupError) {
          functions.logger.error('Unable to rollback group creation', cleanupError)
        }
      }

      const message = error instanceof Error ? error.message : 'Unable to provision group and account.'
      throw new functions.https.HttpsError('internal', message)
    }
  })

export const processScheduledTweets = functions
  .region('us-central1')
  .pubsub.schedule('every 5 minutes')
  .timeZone('America/Los_Angeles')
  .onRun(async () => {
    const now = Timestamp.now()

    const dueTweetsSnapshot = await db
      .collection('tweets')
      .where('status', 'in', ['scheduled', 'queued'])
      .where('scheduledFor', '<=', now)
      .orderBy('scheduledFor', 'asc')
      .limit(25)
      .get()

    if (dueTweetsSnapshot.empty) {
      functions.logger.debug('No tweets ready for publishing.')
      return null
    }

    functions.logger.info(`Processing ${dueTweetsSnapshot.size} scheduled tweets.`)

    for (const doc of dueTweetsSnapshot.docs) {
      await processTweetDocument(doc as FirebaseFirestore.QueryDocumentSnapshot<TweetDocData>)
    }

    return null
  })
