import * as functions from 'firebase-functions'

function resolveTwitterCredential(envKey: string, configKey: string | undefined) {
  const value = process.env[envKey]
  if (value && value.trim().length > 0) {
    return value.trim()
  }
  if (configKey && configKey.trim().length > 0) {
    return configKey.trim()
  }
  return null
}

export function getTwitterAppConfig() {
  const runtimeConfig = functions.config() ?? {}
  const twitterConfig = (runtimeConfig.twitter ?? {}) as {
    api_key?: string
    api_secret?: string
  }

  const appKey = resolveTwitterCredential('TWITTER_API_KEY', twitterConfig.api_key)
  const appSecret = resolveTwitterCredential('TWITTER_API_SECRET', twitterConfig.api_secret)

  if (!appKey || !appSecret) {
    throw new Error('Missing Twitter API configuration. TWITTER_API_KEY: Required, TWITTER_API_SECRET: Required')
  }

  return {
    appKey,
    appSecret,
  }
}
