import {
  Timestamp,
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../firebase/app'
import type {
  Group,
  SocialAccount,
  TwitterAccountCredentials,
  TwitterSocialAccount,
} from '../types/group'

type GroupListener = (groups: Group[]) => void

type AccountListener = (accounts: SocialAccount[]) => void

type ErrorListener = (error: Error) => void

type Unsubscribe = () => void

const GROUPS_COLLECTION = 'groups'
const SOCIAL_ACCOUNTS_COLLECTION = 'socialAccounts'

function mapGroupSnapshot(snapshot: QueryDocumentSnapshot<DocumentData>): Group {
  const data = snapshot.data()
  const createdAt = (data.createdAt as Timestamp | undefined)?.toDate() ?? new Date()

  return {
    id: snapshot.id,
    name: (data.name as string) ?? 'Untitled group',
    ownerUid: data.ownerUid as string,
    createdAt,
  }
}

function mapSocialAccountSnapshot(
  snapshot: QueryDocumentSnapshot<DocumentData>,
  groupId: string,
): SocialAccount {
  const data = snapshot.data()
  const createdAt = (data.createdAt as Timestamp | undefined)?.toDate() ?? new Date()
  const provider = (data.provider as string) ?? 'twitter'

  if (provider !== 'twitter') {
    throw new Error(`Unsupported social provider: ${provider}`)
  }

  const twitterData = data.twitter as TwitterAccountCredentials | undefined
  if (!twitterData) {
    throw new Error('Twitter account missing credentials')
  }

  const account: TwitterSocialAccount = {
    id: snapshot.id,
    groupId,
    provider: 'twitter',
    displayName: (data.displayName as string) ?? 'Twitter account',
    handle: (data.handle as string) ?? '',
    createdAt,
    twitter: {
      appKey: twitterData.appKey,
      appSecret: twitterData.appSecret,
      accessToken: twitterData.accessToken,
      accessSecret: twitterData.accessSecret,
    },
  }

  return account
}

export function subscribeToGroups(ownerUid: string | null, listener: GroupListener, onError?: ErrorListener): Unsubscribe {
  if (!ownerUid) {
    listener([])
    return () => {}
  }

  const groupsRef = collection(db, GROUPS_COLLECTION)
  const q = query(groupsRef, where('ownerUid', '==', ownerUid))

  return onSnapshot(
    q,
    (snapshot) => {
      const groups = snapshot.docs
        .map(mapGroupSnapshot)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      listener(groups)
    },
    (error) => {
      if (onError) {
        onError(error)
      }
    },
  )
}

export async function createGroup(ownerUid: string, name: string): Promise<string> {
  const docRef = await addDoc(collection(db, GROUPS_COLLECTION), {
    name,
    ownerUid,
    createdAt: serverTimestamp(),
  })

  return docRef.id
}

export function subscribeToSocialAccounts(
  groupId: string | null,
  listener: AccountListener,
  onError?: ErrorListener,
): Unsubscribe {
  if (!groupId) {
    listener([])
    return () => {}
  }

  const accountsRef = collection(doc(db, GROUPS_COLLECTION, groupId), SOCIAL_ACCOUNTS_COLLECTION)
  const q = query(accountsRef, orderBy('createdAt', 'asc'))

  return onSnapshot(
    q,
    (snapshot) => {
      const accounts = snapshot.docs.map((docSnapshot) => mapSocialAccountSnapshot(docSnapshot, groupId))
      listener(accounts)
    },
    (error) => {
      if (onError) {
        onError(error)
      }
    },
  )
}

interface CreateTwitterAccountInput {
  groupId: string
  displayName: string
  handle: string
  ownerUid: string
  credentials: TwitterAccountCredentials
}

export async function createTwitterAccount({
  groupId,
  displayName,
  handle,
  ownerUid,
  credentials,
}: CreateTwitterAccountInput): Promise<string> {
  const groupRef = doc(db, GROUPS_COLLECTION, groupId)
  const docRef = await addDoc(collection(groupRef, SOCIAL_ACCOUNTS_COLLECTION), {
    provider: 'twitter',
    displayName,
    handle,
    ownerUid,
    createdAt: serverTimestamp(),
    twitter: {
      appKey: credentials.appKey,
      appSecret: credentials.appSecret,
      accessToken: credentials.accessToken,
      accessSecret: credentials.accessSecret,
    },
  })

  return docRef.id
}

interface UpdateTwitterAccountInput {
  groupId: string
  accountId: string
  displayName: string
  handle: string
  credentials: TwitterAccountCredentials
}

export async function updateTwitterAccount({
  groupId,
  accountId,
  displayName,
  handle,
  credentials,
}: UpdateTwitterAccountInput): Promise<void> {
  const accountRef = doc(db, GROUPS_COLLECTION, groupId, SOCIAL_ACCOUNTS_COLLECTION, accountId)
  await updateDoc(accountRef, {
    displayName,
    handle,
    twitter: {
      appKey: credentials.appKey,
      appSecret: credentials.appSecret,
      accessToken: credentials.accessToken,
      accessSecret: credentials.accessSecret,
    },
    updatedAt: serverTimestamp(),
  })
}

interface ProvisionLegacyTwitterAccountInput {
  groupName: string
  accountDisplayName?: string
}

interface ProvisionLegacyTwitterAccountResponse {
  groupId: string
  accountId: string
}

export async function provisionLegacyTwitterAccount({
  groupName,
  accountDisplayName,
}: ProvisionLegacyTwitterAccountInput): Promise<ProvisionLegacyTwitterAccountResponse> {
  const callable = httpsCallable<ProvisionLegacyTwitterAccountInput, ProvisionLegacyTwitterAccountResponse>(
    functions,
    'provisionLegacyTwitterAccount',
  )

  const result = await callable({ groupName, accountDisplayName })
  return result.data
}
