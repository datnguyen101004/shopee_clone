'use client';

import { CalendarDays, ChevronDown, ChevronUp } from '@shopee-clone/ui';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;
const MONTHS = [
  'Tháng Một',
  'Tháng Hai',
  'Tháng Ba',
  'Tháng Tư',
  'Tháng Năm',
  'Tháng Sáu',
  'Tháng Bảy',
  'Tháng Tám',
  'Tháng Chín',
  'Tháng Mười',
  'Tháng Mười Một',
  'Tháng Mười Hai',
] as const;
const HOURS_12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const MINUTES = Array.from({ length: 60 }, (_, minute) => minute);

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function parseValue(value: string, mode: 'date' | 'datetime') {
  const match =
    mode === 'date'
      ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
      : /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    mode === 'date' ? 0 : Number(match[4]),
    mode === 'date' ? 0 : Number(match[5]),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function serialize(date: Date, mode: 'date' | 'datetime') {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return mode === 'date' ? day : `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDisplay(date: Date, mode: 'date' | 'datetime') {
  const day = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
  if (mode === 'date') return day;
  const hour24 = date.getHours();
  return `${day} ${pad(hour24 % 12 || 12)}:${pad(date.getMinutes())} ${hour24 < 12 ? 'AM' : 'PM'}`;
}

function startOfCalendar(year: number, monthIndex: number) {
  const first = new Date(year, monthIndex, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  first.setDate(first.getDate() - mondayOffset);
  first.setHours(0, 0, 0, 0);
  return first;
}

function sameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function withDate(base: Date, next: Date) {
  const date = new Date(base);
  date.setFullYear(next.getFullYear(), next.getMonth(), next.getDate());
  return date;
}

function withHour12(base: Date, hour12: number, period: 'AM' | 'PM') {
  const date = new Date(base);
  const normalized = hour12 % 12;
  date.setHours(period === 'AM' ? normalized : normalized + 12, date.getMinutes(), 0, 0);
  return date;
}

function withMinute(base: Date, minute: number) {
  const date = new Date(base);
  date.setMinutes(minute, 0, 0);
  return date;
}

function hour12Of(date: Date) {
  return date.getHours() % 12 || 12;
}

function periodOf(date: Date): 'AM' | 'PM' {
  return date.getHours() < 12 ? 'AM' : 'PM';
}

export function DateTimeLocalPicker({
  value,
  onChange,
  mode = 'datetime',
  showClear = true,
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  mode?: 'date' | 'datetime';
  showClear?: boolean;
  'aria-label'?: string;
}) {
  const labelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLButtonElement>(null);
  const hourRef = useRef<HTMLButtonElement>(null);
  const minuteRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => parseValue(value, mode) ?? new Date());
  const [coords, setCoords] = useState({ top: 0, left: 0, width: mode === 'date' ? 280 : 420 });

  const selected = parseValue(value, mode);
  const draft = selected ?? new Date();
  const placeholder = mode === 'date' ? 'Chọn ngày' : 'Chọn ngày giờ';
  const cells = useMemo(() => {
    const start = startOfCalendar(view.getFullYear(), view.getMonth());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [view]);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = fieldRef.current?.getBoundingClientRect();
      if (!rect) return;
      const preferred = mode === 'date' ? 280 : 420;
      const width = Math.min(preferred, Math.max(260, window.innerWidth - 16));
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
      const top = Math.min(rect.bottom + 4, window.innerHeight - 8);
      setCoords({ top, left, width });
    };
    place();
    hourRef.current?.scrollIntoView?.({ block: 'center' });
    minuteRef.current?.scrollIntoView?.({ block: 'center' });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || fieldRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [mode, open]);

  const commit = (date: Date, close = false) => {
    onChange(serialize(date, mode));
    if (close) setOpen(false);
  };
  const period = periodOf(draft);

  return (
    <div className="datetime-local-picker">
      <button
        ref={fieldRef}
        type="button"
        className="datetime-local-picker__field"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }
          const next = parseValue(value, mode);
          if (next) setView(new Date(next.getFullYear(), next.getMonth(), 1));
          setOpen(true);
        }}
      >
        <span>{selected ? formatDisplay(selected, mode) : placeholder}</span>
        <CalendarDays aria-hidden="true" className="datetime-local-picker__icon" strokeWidth={2} />
      </button>
      {open
        ? createPortal(
            <div
              ref={rootRef}
              className="datetime-local-picker__popover"
              data-mode={mode}
              role="dialog"
              aria-labelledby={labelId}
              style={{ top: coords.top, left: coords.left, width: coords.width }}
            >
              <div className="datetime-local-picker__calendar">
                <div className="datetime-local-picker__month">
                  <strong id={labelId}>
                    {MONTHS[view.getMonth()]} {view.getFullYear()}
                  </strong>
                  <div>
                    <button
                      type="button"
                      aria-label="Tháng trước"
                      onClick={() =>
                        setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))
                      }
                    >
                      <ChevronUp aria-hidden="true" size={16} strokeWidth={2.4} />
                    </button>
                    <button
                      type="button"
                      aria-label="Tháng sau"
                      onClick={() =>
                        setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))
                      }
                    >
                      <ChevronDown aria-hidden="true" size={16} strokeWidth={2.4} />
                    </button>
                  </div>
                </div>
                <div className="datetime-local-picker__weekdays">
                  {WEEKDAYS.map((day) => (
                    <span key={day}>{day}</span>
                  ))}
                </div>
                <div className="datetime-local-picker__grid">
                  {cells.map((date) => {
                    const inMonth = date.getMonth() === view.getMonth();
                    const isSelected = selected ? sameDay(date, selected) : false;
                    return (
                      <button
                        key={date.toISOString()}
                        type="button"
                        className={isSelected ? 'is-selected' : undefined}
                        data-outside={inMonth ? undefined : 'true'}
                        aria-pressed={isSelected}
                        onClick={() => commit(withDate(draft, date), mode === 'date')}
                      >
                        {date.getDate()}
                      </button>
                    );
                  })}
                </div>
                <div className="datetime-local-picker__footer">
                  {showClear ? (
                    <button type="button" onClick={() => onChange('')}>
                      Xóa
                    </button>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      now.setSeconds(0, 0);
                      if (mode === 'date') now.setHours(0, 0, 0, 0);
                      commit(now, mode === 'date');
                      setView(new Date(now.getFullYear(), now.getMonth(), 1));
                    }}
                  >
                    Hôm nay
                  </button>
                </div>
              </div>
              {mode === 'datetime' ? (
                <div className="datetime-local-picker__time" aria-label="Chọn giờ">
                  <div className="datetime-local-picker__column" role="listbox" aria-label="Giờ">
                    {HOURS_12.map((hour) => {
                      const isSelected = hour12Of(draft) === hour;
                      return (
                        <button
                          key={hour}
                          ref={isSelected ? hourRef : undefined}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          className={isSelected ? 'is-selected' : undefined}
                          onClick={() => commit(withHour12(draft, hour, period))}
                        >
                          {pad(hour)}
                        </button>
                      );
                    })}
                  </div>
                  <div className="datetime-local-picker__column" role="listbox" aria-label="Phút">
                    {MINUTES.map((minute) => {
                      const isSelected = draft.getMinutes() === minute;
                      return (
                        <button
                          key={minute}
                          ref={isSelected ? minuteRef : undefined}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          className={isSelected ? 'is-selected' : undefined}
                          onClick={() => commit(withMinute(draft, minute))}
                        >
                          {pad(minute)}
                        </button>
                      );
                    })}
                  </div>
                  <div className="datetime-local-picker__column" role="listbox" aria-label="AM/PM">
                    {(['AM', 'PM'] as const).map((item) => (
                      <button
                        key={item}
                        type="button"
                        role="option"
                        aria-selected={period === item}
                        className={period === item ? 'is-selected' : undefined}
                        onClick={() => commit(withHour12(draft, hour12Of(draft), item))}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
