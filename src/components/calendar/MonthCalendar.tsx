import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, startOfMonth, startOfWeek, subMonths } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import type { Tweet } from '../../types/tweet'
import clsx from 'clsx'
import { useMemo } from 'react'
import {
  DUBAI_TIMEZONE,
  formatDayKey,
  formatMonthKey,
  isSameDayInDubai,
  isTodayInDubai,
} from '../../utils/schedule'

interface MonthCalendarProps {
  referenceDate: Date
  tweets: Tweet[]
  selectedDate: Date
  onChangeMonth: (date: Date) => void
  onSelectDate: (date: Date) => void
}

export function MonthCalendar({ referenceDate, tweets, selectedDate, onChangeMonth, onSelectDate }: MonthCalendarProps) {
  const monthRange = useMemo(() => {
    const start = startOfWeek(startOfMonth(referenceDate), { weekStartsOn: 0 })
    const end = endOfWeek(endOfMonth(referenceDate), { weekStartsOn: 0 })
    return eachDayOfInterval({ start, end })
  }, [referenceDate])

  const tweetCountByDay = useMemo(() => {
    return tweets.reduce<Record<string, number>>((acc, tweet) => {
      const key = formatDayKey(tweet.scheduledFor)
      acc[key] = (acc[key] ?? 0) + 1
      return acc
    }, {})
  }, [tweets])

  const handlePrev = () => onChangeMonth(subMonths(referenceDate, 1))
  const handleNext = () => onChangeMonth(addMonths(referenceDate, 1))

  return (
    <div className="calendar">
      <div className="calendar-header">
        <button className="ghost-button" onClick={handlePrev} aria-label="Previous month">
          ←
        </button>
        <div>
          <h2>{formatInTimeZone(referenceDate, DUBAI_TIMEZONE, 'MMMM yyyy')}</h2>
          <p>{formatInTimeZone(referenceDate, DUBAI_TIMEZONE, "EEEE, MMM d")}</p>
        </div>
        <button className="ghost-button" onClick={handleNext} aria-label="Next month">
          →
        </button>
      </div>
      <div className="calendar-grid">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div key={day} className="calendar-cell calendar-day-of-week">
            {day}
          </div>
        ))}
        {monthRange.map((day) => {
          const key = formatInTimeZone(day, DUBAI_TIMEZONE, 'yyyy-MM-dd')
          const count = tweetCountByDay[key] ?? 0
          const isCurrentMonth = formatMonthKey(day) === formatMonthKey(referenceDate)
          const isSelected = isSameDayInDubai(day, selectedDate)

          return (
            <button
              key={key}
              type="button"
              className={clsx('calendar-cell calendar-date', {
                'calendar-date--muted': !isCurrentMonth,
                'calendar-date--today': isTodayInDubai(day),
                'calendar-date--selected': isSelected,
              })}
              onClick={() => onSelectDate(day)}
            >
              <span className="calendar-date-number">
                {formatInTimeZone(day, DUBAI_TIMEZONE, 'd')}
              </span>
              {count > 0 && <span className="calendar-date-count">{count}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
