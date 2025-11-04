import { useEffect, useMemo, useState } from 'react'
import type { Group } from '../types/group'
import { subscribeToGroups } from '../services/groupService'

interface UseGroupsOptions {
  ownerUid: string | null
}

export function useGroups({ ownerUid }: UseGroupsOptions) {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!ownerUid) {
      setGroups([])
      setLoading(false)
      setError(null)
      return () => {}
    }

    setLoading(true)
    const unsubscribe = subscribeToGroups(
      ownerUid,
      (nextGroups) => {
        setGroups(nextGroups)
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
  }, [ownerUid])

  return useMemo(
    () => ({
      groups,
      loading,
      error,
    }),
    [groups, loading, error],
  )
}
