import { useEffect, useMemo, useState } from 'react'
import type { Tweet } from '../types/tweet'
import { subscribeToTweets } from '../services/tweetService'

interface UseTweetsOptions {
  authorUid: string | null
  groupId: string | null
  accountId: string | null
}

export function useTweets({ authorUid, groupId, accountId }: UseTweetsOptions) {
  const [tweets, setTweets] = useState<Tweet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!authorUid || !groupId || !accountId) {
      setTweets([])
      setLoading(false)
      setError(null)
      return () => {}
    }

    setLoading(true)
    const unsubscribe = subscribeToTweets(
      authorUid,
      groupId,
      accountId,
      (nextTweets) => {
        setTweets(nextTweets)
        setLoading(false)
        setError(null)
      },
      (snapshotError) => {
        setError(snapshotError)
        setLoading(false)
      },
    )

    return () => {
      unsubscribe()
    }
  }, [authorUid, groupId, accountId])

  return useMemo(
    () => ({
      tweets,
      loading,
      error,
    }),
    [tweets, loading, error],
  )
}
