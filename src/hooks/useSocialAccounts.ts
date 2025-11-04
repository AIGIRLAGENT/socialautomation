import { useEffect, useMemo, useState } from 'react'
import type { SocialAccount } from '../types/group'
import { subscribeToSocialAccounts } from '../services/groupService'

interface UseSocialAccountsOptions {
  groupId: string | null
}

export function useSocialAccounts({ groupId }: UseSocialAccountsOptions) {
  const [accounts, setAccounts] = useState<SocialAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!groupId) {
      setAccounts([])
      setLoading(false)
      setError(null)
      return () => {}
    }

    setLoading(true)
    const unsubscribe = subscribeToSocialAccounts(
      groupId,
      (nextAccounts) => {
        setAccounts(nextAccounts)
        setLoading(false)
        setError(null)
      },
      (subscribeError) => {
        setError(subscribeError)
        setLoading(false)
      },
    )

    return () => {
      unsubscribe()
    }
  }, [groupId])

  return useMemo(
    () => ({
      accounts,
      loading,
      error,
    }),
    [accounts, loading, error],
  )
}
