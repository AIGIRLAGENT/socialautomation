import { addDays, set, startOfDay } from 'date-fns'
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz'
import type { Tweet } from '../types/tweet'

const TIMEZONE = 'Asia/Dubai'
const SLOT_FORMAT = "yyyy-MM-dd HH:mm"
const SLOT_HOURS = Array.from({ length: 16 }, (_, index) => index + 4)

function getTakenSlotKeys(tweets: Tweet[]) {
  return new Set(
    tweets.map((tweet) => formatInTimeZone(tweet.scheduledFor, TIMEZONE, SLOT_FORMAT)),
  )
}

export function getNextScheduleSlot(tweets: Tweet[], now = new Date()): Date {
  const takenSlots = getTakenSlotKeys(tweets)
  const zonedNow = toZonedTime(now, TIMEZONE)
  const baseDay = startOfDay(zonedNow)

  for (let dayOffset = 0; dayOffset < 365; dayOffset += 1) {
    const day = addDays(baseDay, dayOffset)

    for (const hour of SLOT_HOURS) {
      const slotLocal = set(day, { hours: hour, minutes: 0, seconds: 0, milliseconds: 0 })
      const slotUtc = fromZonedTime(slotLocal, TIMEZONE)

      if (slotUtc <= now) {
        continue
      }

      const slotKey = formatInTimeZone(slotUtc, TIMEZONE, SLOT_FORMAT)
      if (!takenSlots.has(slotKey)) {
        return slotUtc
      }
    }
  }

  throw new Error('Unable to find an available schedule slot within 365 days')
}

export function formatSlotHuman(slot: Date) {
  return formatInTimeZone(slot, TIMEZONE, "MMM d, yyyy 'at' h:mm aaa 'DXB'")
}

export function formatDayKey(date: Date) {
  return formatInTimeZone(date, TIMEZONE, 'yyyy-MM-dd')
}

export const DUBAI_TIMEZONE = TIMEZONE

export function isSameDayInDubai(a: Date, b: Date) {
  return formatDayKey(a) === formatDayKey(b)
}

export function isTodayInDubai(date: Date, now = new Date()) {
  return formatDayKey(date) === formatDayKey(now)
}

export function formatMonthKey(date: Date) {
  return formatInTimeZone(date, TIMEZONE, 'yyyy-MM')
}

export function isSameMonthInDubai(a: Date, b: Date) {
  return formatMonthKey(a) === formatMonthKey(b)
}

/**
 * Get multiple available schedule slots for bulk tweet scheduling
 * @param tweets - existing tweets
 * @param count - number of slots needed
 * @param now - current date/time
 * @returns array of available slot dates
 */
export function getNextScheduleSlots(tweets: Tweet[], count: number, now = new Date()): Date[] {
  const takenSlots = getTakenSlotKeys(tweets)
  const zonedNow = toZonedTime(now, TIMEZONE)
  const baseDay = startOfDay(zonedNow)
  const slots: Date[] = []

  for (let dayOffset = 0; dayOffset < 365 && slots.length < count; dayOffset += 1) {
    const day = addDays(baseDay, dayOffset)

    for (const hour of SLOT_HOURS) {
      if (slots.length >= count) {
        break
      }

      const slotLocal = set(day, { hours: hour, minutes: 0, seconds: 0, milliseconds: 0 })
      const slotUtc = fromZonedTime(slotLocal, TIMEZONE)

      if (slotUtc <= now) {
        continue
      }

      const slotKey = formatInTimeZone(slotUtc, TIMEZONE, SLOT_FORMAT)
      if (!takenSlots.has(slotKey)) {
        slots.push(slotUtc)
      }
    }
  }

  if (slots.length < count) {
    throw new Error(`Unable to find ${count} available schedule slots within 365 days`)
  }

  return slots
}
