export type SocialProvider = 'twitter'

export interface Group {
  id: string
  name: string
  ownerUid: string
  createdAt: Date
}

export interface SocialAccountBase {
  id: string
  groupId: string
  provider: SocialProvider
  displayName: string
  handle: string
  createdAt: Date
}

export interface TwitterAccountCredentials {
  appKey: string
  appSecret: string
  accessToken: string
  accessSecret: string
}

export interface TwitterSocialAccount extends SocialAccountBase {
  provider: 'twitter'
  twitter: TwitterAccountCredentials
}

export type SocialAccount = TwitterSocialAccount
