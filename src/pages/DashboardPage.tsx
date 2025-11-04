import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import clsx from 'clsx'
import { AppShell } from '../components/layout/AppShell'
import { MonthCalendar } from '../components/calendar/MonthCalendar'
import { TweetComposer } from '../components/tweets/TweetComposer'
import { TweetList } from '../components/tweets/TweetList'
import { BulkMediaUpload } from '../components/tweets/BulkMediaUpload'
import { useAuth } from '../providers/AuthProvider'
import { useTweets } from '../hooks/useTweets'
import { useGroups } from '../hooks/useGroups'
import { useSocialAccounts } from '../hooks/useSocialAccounts'
import {
  createGroup,
  createTwitterAccount,
  provisionLegacyTwitterAccount,
  updateTwitterAccount,
} from '../services/groupService'
import { createTweet, deleteTweet, publishTweetNow, updateTweet } from '../services/tweetService'
import { uploadTweetMedia, deleteTweetMediaBatch } from '../services/mediaService'
import type { Tweet, TweetDraft } from '../types/tweet'
import { formatDayKey, getNextScheduleSlot, isSameMonthInDubai, DUBAI_TIMEZONE } from '../utils/schedule'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'

interface TweetEditInput {
  text: string
  replaceMediaFile?: File | null
  removeMedia?: boolean
}

export function DashboardPage() {
  const { user } = useAuth()
  const { groups, loading: groupsLoading, error: groupsError } = useGroups({ ownerUid: user?.uid ?? null })
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null)

  const [isGroupFormVisible, setIsGroupFormVisible] = useState(false)
  const [groupNameInput, setGroupNameInput] = useState('')
  const [groupFormError, setGroupFormError] = useState<string | null>(null)
  const [groupSubmitting, setGroupSubmitting] = useState(false)

  const [isAccountFormVisible, setIsAccountFormVisible] = useState(false)
  const [accountForm, setAccountForm] = useState({
    displayName: '',
    handle: '',
    appKey: '',
    appSecret: '',
    accessToken: '',
    accessSecret: '',
  })
  const [accountFormError, setAccountFormError] = useState<string | null>(null)
  const [accountSubmitting, setAccountSubmitting] = useState(false)
  const [accountFormMode, setAccountFormMode] = useState<'create' | 'edit'>('create')
  const [legacyProvisioning, setLegacyProvisioning] = useState(false)
  const [legacyError, setLegacyError] = useState<string | null>(null)

  const resetAccountForm = () => {
    setAccountForm({
      displayName: '',
      handle: '',
      appKey: '',
      appSecret: '',
      accessToken: '',
      accessSecret: '',
    })
    setAccountFormError(null)
  }

  const resetGroupForm = () => {
    setGroupNameInput('')
    setGroupFormError(null)
  }

  const handleGroupClick = (groupId: string) => {
    setActiveGroupId(groupId)
    setActiveAccountId(null)
    setIsAccountFormVisible(false)
    resetAccountForm()
    setLegacyError(null)
  }

  useEffect(() => {
    setActiveGroupId((current) => {
      if (groups.length === 0) {
        return null
      }

      if (current && groups.some((group) => group.id === current)) {
        return current
      }

      return groups[0]?.id ?? null
    })

    if (groups.length === 0) {
      setIsAccountFormVisible(false)
      resetAccountForm()
      setLegacyError(null)
    }
  }, [groups])

  const { accounts, loading: accountsLoading, error: accountsError } = useSocialAccounts({ groupId: activeGroupId })
  const activeAccount = useMemo(
    () => accounts.find((account) => account.id === activeAccountId) ?? null,
    [accounts, activeAccountId],
  )

  useEffect(() => {
    setActiveAccountId((current) => {
      if (accounts.length === 0) {
        return null
      }

      if (current && accounts.some((account) => account.id === current)) {
        return current
      }

      return accounts[0]?.id ?? null
    })
  }, [accounts])

  useEffect(() => {
    if (!activeGroupId) {
      setActiveAccountId(null)
      setIsAccountFormVisible(false)
      resetAccountForm()
      setLegacyError(null)
    }
  }, [activeGroupId])

  const { tweets, loading, error } = useTweets({
    authorUid: user?.uid ?? null,
    groupId: activeGroupId,
    accountId: activeAccountId,
  })
  const [referenceDate, setReferenceDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())

  const scheduledTweets = useMemo(() => {
    if (!selectedDate) return tweets
    const selectedKey = formatDayKey(selectedDate)
    return tweets.filter((tweet) => formatDayKey(tweet.scheduledFor) === selectedKey)
  }, [tweets, selectedDate])

  const selectedSubtitle = useMemo(() => {
    if (groupsLoading || accountsLoading) {
      return 'Loading schedule…'
    }

    if (groupsError) {
      return 'Unable to load brand groups right now.'
    }

    if (accountsError) {
      return 'Unable to load social accounts right now.'
    }

    if (!activeGroupId) {
      return 'Create a brand group to start scheduling.'
    }

    if (!activeAccountId) {
      return 'Add a social account to view the schedule.'
    }

    if (loading) {
      return 'Loading tweets…'
    }

    if (error) {
      return 'Unable to load tweets right now.'
    }

    if (!selectedDate) {
      return `${tweets.length} total`
    }

    const formattedDay = formatInTimeZone(selectedDate, DUBAI_TIMEZONE, 'MMM d, yyyy (EEE)')
    return `${scheduledTweets.length}/16 slots filled for ${formattedDay}`
  }, [
    groupsLoading,
    groupsError,
    accountsError,
    accountsLoading,
    activeGroupId,
    activeAccountId,
    loading,
    error,
    selectedDate,
    scheduledTweets.length,
    tweets.length,
  ])

  const selectedDateInputValue = useMemo(() => {
    return selectedDate ? formatInTimeZone(selectedDate, DUBAI_TIMEZONE, 'yyyy-MM-dd') : ''
  }, [selectedDate])

  const nextSlot = useMemo(() => {
    try {
      return getNextScheduleSlot(tweets)
    } catch (slotError) {
      console.error(slotError)
      return null
    }
  }, [tweets])

  const isAccountFormComplete = useMemo(
    () =>
      accountForm.displayName.trim().length > 0 &&
      accountForm.appKey.trim().length > 0 &&
      accountForm.appSecret.trim().length > 0 &&
      accountForm.accessToken.trim().length > 0 &&
      accountForm.accessSecret.trim().length > 0,
    [accountForm],
  )

  const handleToggleGroupForm = () => {
    if (groupSubmitting) {
      return
    }

    setIsGroupFormVisible((visible) => {
      if (visible) {
        resetGroupForm()
      }
      return !visible
    })
    setLegacyError(null)
  }

  const handleGroupSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!user) {
      setGroupFormError('Sign in to create groups.')
      return
    }

    const trimmedName = groupNameInput.trim()
    if (!trimmedName) {
      setGroupFormError('Group name is required.')
      return
    }

    try {
      setGroupSubmitting(true)
      setGroupFormError(null)
      const newGroupId = await createGroup(user.uid, trimmedName)
      resetGroupForm()
      setIsGroupFormVisible(false)
      handleGroupClick(newGroupId)
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : 'Unable to create brand group.'
      setGroupFormError(message)
    } finally {
      setGroupSubmitting(false)
    }
  }

  const handleAccountSelect = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value
    setActiveAccountId(value || null)
    setAccountFormError(null)
    setLegacyError(null)
  }

  const closeAccountForm = () => {
    setIsAccountFormVisible(false)
    resetAccountForm()
    setAccountFormMode('create')
    setLegacyError(null)
  }

  const handleCreateAccountClick = () => {
    if (accountSubmitting) {
      return
    }

    if (isAccountFormVisible && accountFormMode === 'create') {
      closeAccountForm()
      setAccountFormMode('create')
      return
    }

    setAccountFormMode('create')
    resetAccountForm()
    setIsAccountFormVisible(true)
    setAccountFormError(null)
    setLegacyError(null)
  }

  const handleEditAccountClick = () => {
    if (accountSubmitting || !activeAccount) {
      return
    }

    if (isAccountFormVisible && accountFormMode === 'edit') {
      closeAccountForm()
      return
    }

    setAccountFormMode('edit')
    setAccountForm({
      displayName: activeAccount.displayName,
      handle: activeAccount.handle,
      appKey: activeAccount.twitter.appKey,
      appSecret: activeAccount.twitter.appSecret,
      accessToken: activeAccount.twitter.accessToken,
      accessSecret: activeAccount.twitter.accessSecret,
    })
    setAccountFormError(null)
    setLegacyError(null)
    setIsAccountFormVisible(true)
  }

  const handleAccountSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!user) {
      setAccountFormError('Sign in to add social accounts.')
      return
    }

    if (!activeGroupId) {
      setAccountFormError('Select a brand group before adding accounts.')
      return
    }

    const displayName = accountForm.displayName.trim()
    const handleValue = accountForm.handle.trim().replace(/^@/, '')
    const appKey = accountForm.appKey.trim()
    const appSecret = accountForm.appSecret.trim()
    const accessToken = accountForm.accessToken.trim()
    const accessSecret = accountForm.accessSecret.trim()

    if (!displayName) {
      setAccountFormError('Display name is required.')
      return
    }

    if (!appKey || !appSecret || !accessToken || !accessSecret) {
      setAccountFormError('All credential fields are required.')
      return
    }

    try {
      setAccountSubmitting(true)
      setAccountFormError(null)
      if (accountFormMode === 'create') {
        const newAccountId = await createTwitterAccount({
          groupId: activeGroupId,
          displayName,
          handle: handleValue,
          ownerUid: user.uid,
          credentials: {
            appKey,
            appSecret,
            accessToken,
            accessSecret,
          },
        })
        resetAccountForm()
        setIsAccountFormVisible(false)
        setActiveAccountId(newAccountId)
      } else if (activeAccountId) {
        await updateTwitterAccount({
          groupId: activeGroupId,
          accountId: activeAccountId,
          displayName,
          handle: handleValue,
          credentials: {
            appKey,
            appSecret,
            accessToken,
            accessSecret,
          },
        })
        setIsAccountFormVisible(false)
      }
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : 'Unable to connect this account.'
      setAccountFormError(message)
    } finally {
      setAccountSubmitting(false)
    }
  }

  const handleProvisionLegacy = async () => {
    if (!user) {
      setLegacyError('Sign in to import your existing account.')
      return
    }

    if (groupsError) {
      setLegacyError('Resolve group loading issues before importing.')
      return
    }

    const desiredGroupName = groupNameInput.trim() || 'Group 1'
    const desiredAccountName =
      accountForm.displayName.trim() || `${desiredGroupName} X account`

    try {
      setLegacyProvisioning(true)
      setLegacyError(null)
      const result = await provisionLegacyTwitterAccount({
        groupName: desiredGroupName,
        accountDisplayName: desiredAccountName,
      })
      resetGroupForm()
      resetAccountForm()
      setIsGroupFormVisible(false)
      setIsAccountFormVisible(false)
      setActiveGroupId(result.groupId)
      setActiveAccountId(result.accountId)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to import your existing account.'
      setLegacyError(message)
    } finally {
      setLegacyProvisioning(false)
    }
  }

  const handleCreate = async ({ text, mediaFile }: { text: string; mediaFile?: File | null }) => {
    if (!user || !activeGroupId || !activeAccountId) {
      throw new Error('Select a group and social account before scheduling.')
    }
    const slot = nextSlot ?? getNextScheduleSlot(tweets)
    const draft: TweetDraft = {
      text,
      scheduledFor: slot,
      status: 'scheduled',
      groupId: activeGroupId,
      accountId: activeAccountId,
    }

    if (mediaFile) {
      const uploaded = await uploadTweetMedia({ userId: user.uid, file: mediaFile })
      draft.media = [uploaded]
    }

    await createTweet(user.uid, draft)
    setSelectedDate(slot)
    if (!isSameMonthInDubai(referenceDate, slot)) {
      setReferenceDate(slot)
    }
  }

  const handleUpdateStatus = async (tweetId: string, status: Tweet['status']) => {
    await updateTweet(tweetId, {
      status,
      postedAt: status === 'posted' ? new Date() : null,
    })
  }

  const handleDelete = async (tweet: Tweet) => {
    if (tweet.media.length > 0) {
      const deletablePaths = tweet.media
        .filter((media) => {
          const usageCount = tweets.reduce((count, current) => {
            if (current.media.some((item) => item.storagePath === media.storagePath)) {
              return count + 1
            }
            return count
          }, 0)
          return usageCount <= 1
        })
        .map((item) => item.storagePath)

      if (deletablePaths.length > 0) {
        await deleteTweetMediaBatch(deletablePaths)
      }
    }

    await deleteTweet(tweet.id)
  }

  const handleDateInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value
    if (!value) {
      return
    }

    const zonedDate = fromZonedTime(`${value}T00:00:00`, DUBAI_TIMEZONE)
    setSelectedDate(zonedDate)
    if (!isSameMonthInDubai(referenceDate, zonedDate)) {
      setReferenceDate(zonedDate)
    }
  }

  const handleClearSelectedDate = () => {
    const now = new Date()
    setSelectedDate(now)
    if (!isSameMonthInDubai(referenceDate, now)) {
      setReferenceDate(now)
    }
  }

  const handleReorder = async (orderedTweets: Tweet[]) => {
    if (orderedTweets.length <= 1) {
      return
    }

    const sortedTimes = orderedTweets
      .map((item) => item.scheduledFor.getTime())
      .sort((a, b) => a - b)

    const updates = orderedTweets
      .map((tweet, index) => {
        const targetTime = sortedTimes[index]
        if (tweet.scheduledFor.getTime() === targetTime) {
          return null
        }

        return updateTweet(tweet.id, {
          scheduledFor: new Date(targetTime),
        })
      })
      .filter((item): item is Promise<void> => item !== null)

    if (updates.length === 0) {
      return
    }

    try {
      await Promise.all(updates)
    } catch (reorderError) {
      console.error('Unable to reorder tweets', reorderError)
    }
  }

  const handleRetweet = async (tweet: Tweet) => {
    if (!user) {
      return
    }

    const slot = getNextScheduleSlot(tweets)
    const clonedMedia = tweet.media.map((item) => ({ ...item }))

    const clonedDraft: TweetDraft = {
      text: tweet.text,
      scheduledFor: slot,
      status: 'scheduled',
      media: clonedMedia,
      groupId: tweet.groupId,
      accountId: tweet.accountId,
    }

    await createTweet(user.uid, clonedDraft)

    setSelectedDate(slot)
    if (!isSameMonthInDubai(referenceDate, slot)) {
      setReferenceDate(slot)
    }
  }

  const handleEditTweet = async (tweet: Tweet, input: TweetEditInput) => {
    const trimmed = input.text.trim()
    if (!trimmed) {
      throw new Error('Tweet cannot be empty')
    }

    let nextMedia = tweet.media
    const mediaToDelete: string[] = []

    if (input.replaceMediaFile) {
      if (!user) {
        throw new Error('Sign-in required to update media')
      }

      const uploaded = await uploadTweetMedia({ userId: user.uid, file: input.replaceMediaFile })
      const removable = tweet.media.filter((media) => {
        const usageCount = tweets.reduce((count, current) => {
          if (current.media.some((item) => item.storagePath === media.storagePath)) {
            return count + 1
          }
          return count
        }, 0)
        return usageCount <= 1
      })
      mediaToDelete.push(...removable.map((item) => item.storagePath))
      nextMedia = [uploaded]
    } else if (input.removeMedia) {
      const removable = tweet.media.filter((media) => {
        const usageCount = tweets.reduce((count, current) => {
          if (current.media.some((item) => item.storagePath === media.storagePath)) {
            return count + 1
          }
          return count
        }, 0)
        return usageCount <= 1
      })
      mediaToDelete.push(...removable.map((item) => item.storagePath))
      nextMedia = []
    }

    await updateTweet(tweet.id, {
      text: trimmed,
      media: nextMedia,
    })

    if (mediaToDelete.length > 0) {
      await deleteTweetMediaBatch(mediaToDelete)
    }
  }

  const handlePublishNow = async (tweet: Tweet) => {
    try {
      await publishTweetNow(tweet.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to publish tweet right now.'
      window.alert(message)
    }
  }
  const accountSelectPlaceholder = accountsError
    ? 'Unable to load accounts'
    : !activeGroupId
      ? 'Select a brand to load accounts'
      : accountsLoading
        ? 'Loading accounts…'
        : accounts.length === 0
          ? 'No social accounts found'
          : 'Select a social account'

  const composerDisabledReason = useMemo(() => {
    if (!user) {
      return 'Sign in to schedule tweets.'
    }

    if (groupsError) {
      return 'Unable to load brand groups right now.'
    }

    if (accountsError) {
      return 'Unable to load social accounts right now.'
    }

    if (groupsLoading) {
      return 'Loading your brand groups…'
    }

    if (!activeGroupId) {
      return 'Create a brand group to start scheduling.'
    }

    if (accountsLoading) {
      return 'Loading social accounts…'
    }

    if (!activeAccountId) {
      return 'Add a social account to this group to schedule tweets.'
    }

    return null
  }, [
    user,
    groupsError,
    accountsError,
    groupsLoading,
    activeGroupId,
    accountsLoading,
    activeAccountId,
  ])

  const composerDisabled = composerDisabledReason !== null

  return (
    <AppShell>
      <div className="dashboard-layout">
        <aside className="brand-sidebar">
          <div className="brand-sidebar-header">
            <h2>Your brands</h2>
            <span className="brand-sidebar-subtitle">Pick a group to manage its schedule.</span>
          </div>
          {(() => {
            if (groupsError) {
              return <p className="form-error">Unable to load brand groups right now.</p>
            }

            if (groupsLoading) {
              return <p>Loading your brand groups…</p>
            }

            if (groups.length === 0) {
              return <p className="form-hint">No brand groups yet. Use the button below to create one.</p>
            }

            return (
              <ul className="brand-list">
                {groups.map((group) => (
                  <li key={group.id}>
                    <button
                      type="button"
                      className={clsx('brand-button', {
                        'brand-button--active': group.id === activeGroupId,
                      })}
                      onClick={() => {
                        handleGroupClick(group.id)
                      }}
                    >
                      <span className="brand-name">{group.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          })()}
          <div className="brand-sidebar-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={handleToggleGroupForm}
              disabled={!user || groupsLoading || Boolean(groupsError) || groupSubmitting}
            >
              {isGroupFormVisible ? 'Cancel' : 'New group'}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={handleProvisionLegacy}
              disabled={!user || groupsLoading || Boolean(groupsError) || legacyProvisioning}
            >
              {legacyProvisioning ? 'Importing…' : 'Import existing X account'}
            </button>
          </div>
          {legacyError ? <p className="form-error">{legacyError}</p> : null}
          {isGroupFormVisible ? (
            <form className="inline-form" onSubmit={handleGroupSubmit}>
              <div className="form-control">
                <label htmlFor="new-group-name">Group name</label>
                <input
                  id="new-group-name"
                  type="text"
                  value={groupNameInput}
                  onChange={(event) => {
                    setGroupNameInput(event.target.value)
                  }}
                  placeholder="e.g. Dubai Athletics"
                  autoComplete="off"
                  disabled={groupSubmitting}
                />
              </div>
              {groupFormError ? (
                <p className="form-error">{groupFormError}</p>
              ) : (
                <p className="form-hint">Groups keep each brand separated with its own accounts.</p>
              )}
              <div className="form-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    resetGroupForm()
                    setIsGroupFormVisible(false)
                  }}
                  disabled={groupSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={groupSubmitting || groupNameInput.trim().length === 0}
                >
                  {groupSubmitting ? 'Creating…' : 'Create group'}
                </button>
              </div>
            </form>
          ) : null}
          {!user ? <p className="form-hint">Sign in to add new groups.</p> : null}
        </aside>
        <section className="dashboard-main">
          <div className="dashboard">
            <div className="dashboard-column dashboard-column--wide">
              <div className="panel account-panel">
                <div className="panel-header">
                  <div>
                    <h2>Posting account</h2>
                    <span className="panel-subtitle">Select which social profile to publish from.</span>
                  </div>
                </div>
                <div className="form-control">
                  <label htmlFor="account-select">Social account</label>
                  <select
                    id="account-select"
                    value={activeAccountId ?? ''}
                    onChange={handleAccountSelect}
                    disabled={!activeGroupId || accountsLoading || accounts.length === 0 || Boolean(accountsError)}
                  >
                    <option value="" disabled>
                      {accountSelectPlaceholder}
                    </option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.displayName}
                        {account.handle ? ` (@${account.handle})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                {accountsError ? <p className="form-error">Unable to load social accounts right now.</p> : null}
                {!accountsError && activeGroupId && !accountsLoading && accounts.length === 0 ? (
                  <p className="form-hint">No social accounts yet. Use the button below to connect one.</p>
                ) : null}
                {!activeGroupId && !groupsLoading && !groupsError ? (
                  <p className="form-hint">Choose a brand from the left to load its accounts.</p>
                ) : null}
                <div className="panel-actions account-panel-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={handleCreateAccountClick}
                    disabled={
                      !user ||
                      !activeGroupId ||
                      accountsLoading ||
                      Boolean(accountsError) ||
                      accountSubmitting
                    }
                  >
                    {isAccountFormVisible && accountFormMode === 'create' ? 'Cancel' : 'Add social account'}
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={handleEditAccountClick}
                    disabled={
                      !user ||
                      !activeGroupId ||
                      !activeAccount ||
                      accountsLoading ||
                      Boolean(accountsError) ||
                      accountSubmitting
                    }
                  >
                    {isAccountFormVisible && accountFormMode === 'edit' ? 'Cancel' : 'Edit credentials'}
                  </button>
                </div>
                {isAccountFormVisible ? (
                  <form className="inline-form" onSubmit={handleAccountSubmit}>
                    <div className="form-control">
                      <label htmlFor="account-display-name">Display name</label>
                      <input
                        id="account-display-name"
                        type="text"
                        value={accountForm.displayName}
                        onChange={(event) => {
                          setAccountForm((prev) => ({ ...prev, displayName: event.target.value }))
                        }}
                        placeholder="e.g. Brand Twitter"
                        autoComplete="off"
                        disabled={accountSubmitting}
                      />
                    </div>
                    <div className="form-control">
                      <label htmlFor="account-handle">Handle (optional)</label>
                      <input
                        id="account-handle"
                        type="text"
                        value={accountForm.handle}
                        onChange={(event) => {
                          setAccountForm((prev) => ({ ...prev, handle: event.target.value }))
                        }}
                        placeholder="@brand"
                        autoComplete="off"
                        disabled={accountSubmitting}
                      />
                    </div>
                    <div className="inline-form-grid">
                      <div className="form-control">
                        <label htmlFor="account-app-key">API key</label>
                        <input
                          id="account-app-key"
                          type="text"
                          value={accountForm.appKey}
                          onChange={(event) => {
                            setAccountForm((prev) => ({ ...prev, appKey: event.target.value }))
                          }}
                          placeholder="Twitter app key"
                          autoComplete="off"
                          disabled={accountSubmitting}
                        />
                      </div>
                      <div className="form-control">
                        <label htmlFor="account-app-secret">API secret</label>
                        <input
                          id="account-app-secret"
                          type="text"
                          value={accountForm.appSecret}
                          onChange={(event) => {
                            setAccountForm((prev) => ({ ...prev, appSecret: event.target.value }))
                          }}
                          placeholder="Twitter app secret"
                          autoComplete="off"
                          disabled={accountSubmitting}
                        />
                      </div>
                      <div className="form-control">
                        <label htmlFor="account-access-token">Access token</label>
                        <input
                          id="account-access-token"
                          type="text"
                          value={accountForm.accessToken}
                          onChange={(event) => {
                            setAccountForm((prev) => ({ ...prev, accessToken: event.target.value }))
                          }}
                          placeholder="Twitter access token"
                          autoComplete="off"
                          disabled={accountSubmitting}
                        />
                      </div>
                      <div className="form-control">
                        <label htmlFor="account-access-secret">Access secret</label>
                        <input
                          id="account-access-secret"
                          type="text"
                          value={accountForm.accessSecret}
                          onChange={(event) => {
                            setAccountForm((prev) => ({ ...prev, accessSecret: event.target.value }))
                          }}
                          placeholder="Twitter access secret"
                          autoComplete="off"
                          disabled={accountSubmitting}
                        />
                      </div>
                    </div>
                    {accountFormError ? (
                      <p className="form-error">{accountFormError}</p>
                    ) : (
                      <p className="form-hint">Only Twitter (X) accounts are supported right now.</p>
                    )}
                    <div className="form-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => {
                          closeAccountForm()
                        }}
                        disabled={accountSubmitting}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="primary-button"
                        disabled={
                          accountSubmitting ||
                          !isAccountFormComplete
                        }
                      >
                        {accountSubmitting
                          ? accountFormMode === 'create'
                            ? 'Connecting…'
                            : 'Saving…'
                          : accountFormMode === 'create'
                            ? 'Connect account'
                            : 'Save changes'}
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>
              {!composerDisabled && user && activeGroupId && activeAccountId && (
                <BulkMediaUpload
                  userId={user.uid}
                  groupId={activeGroupId}
                  accountId={activeAccountId}
                  existingTweets={tweets}
                  onComplete={() => {
                    // Refresh will happen automatically via real-time listener
                  }}
                />
              )}
              <TweetComposer
                onCreate={handleCreate}
                nextSlot={nextSlot}
                disabled={composerDisabled}
                disabledMessage={composerDisabledReason ?? undefined}
              />
              <div className="panel">
                <h2>Schedule overview</h2>
                <MonthCalendar
                  referenceDate={referenceDate}
                  tweets={tweets}
                  selectedDate={selectedDate}
                  onChangeMonth={setReferenceDate}
                  onSelectDate={setSelectedDate}
                />
              </div>
            </div>
            <div className="dashboard-column">
              <div className="panel">
                <div className="panel-header panel-header--split">
                  <div>
                    <h2>Scheduled tweets</h2>
                    <span className="panel-subtitle">{selectedSubtitle}</span>
                  </div>
                  <div className="tweet-date-filter">
                    <label htmlFor="scheduled-date-picker">View date</label>
                    <div className="tweet-date-filter-controls">
                      <input
                        id="scheduled-date-picker"
                        type="date"
                        value={selectedDateInputValue}
                        onChange={handleDateInputChange}
                        aria-label="Select scheduled date"
                      />
                      <button type="button" className="ghost-button" onClick={handleClearSelectedDate}>
                        Today
                      </button>
                    </div>
                  </div>
                </div>
                {(() => {
                  if (groupsError) {
                    return <p className="form-error">Unable to load brand groups right now.</p>
                  }

                  if (accountsError) {
                    return <p className="form-error">Unable to load social accounts right now.</p>
                  }

                  if (groupsLoading || accountsLoading) {
                    return <p>Loading schedule…</p>
                  }

                  if (!activeGroupId) {
                    return <p className="form-hint">Choose a brand from the left to get started.</p>
                  }

                  if (!activeAccountId) {
                    return <p className="form-hint">Select a social account to view its schedule.</p>
                  }

                  if (loading) {
                    return <p>Loading tweets…</p>
                  }

                  if (error) {
                    return <p className="form-error">Unable to load tweets right now.</p>
                  }

                  return (
                    <TweetList
                      tweets={scheduledTweets}
                      selectedDate={selectedDate}
                      onUpdateStatus={handleUpdateStatus}
                      onDelete={handleDelete}
                      onReorder={handleReorder}
                      onRetweet={handleRetweet}
                      onEdit={handleEditTweet}
                      onPublishNow={handlePublishNow}
                    />
                  )
                })()}
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  )
}
