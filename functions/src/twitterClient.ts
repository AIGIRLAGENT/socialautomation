import { TwitterApi } from 'twitter-api-v2'

export interface TwitterClientCredentials {
  appKey: string
  appSecret: string
  accessToken: string
  accessSecret: string
}

export function createTwitterClient(credentials: TwitterClientCredentials) {
  return new TwitterApi({
    appKey: credentials.appKey,
    appSecret: credentials.appSecret,
    accessToken: credentials.accessToken,
    accessSecret: credentials.accessSecret,
  })
}
