import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { HiOutlineCalendar } from "react-icons/hi";
import { Button } from "#/components/ui/button";
import { Calendar } from "#/components/ui/calendar";
import { Input } from "#/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import {
  DEFAULT_TIME_RANGE,
  TIME_RANGE_PRESETS,
  formatTimeRangeLabel,
  resolveTimeWindow,
  type TimeRangePreset,
  type TimeRangeValue,
} from "#/lib/time-range";
import { cn } from "#/lib/utils";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function timeOfDayFromDate(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function combineDateAndTime(day: Date, hhmm: string): Date | undefined {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return undefined;
  }
  const out = new Date(day);
  out.setHours(hours, minutes, 0, 0);
  return out;
}

function defaultCustomWindow(): { range: DateRange; sinceTime: string; untilTime: string } {
  const until = new Date();
  const since = new Date(until.getTime() - 24 * 60 * 60 * 1000);
  return {
    range: { from: since, to: until },
    sinceTime: timeOfDayFromDate(since),
    untilTime: timeOfDayFromDate(until),
  };
}

export function TimeRangeSelect({
  value,
  onChange,
  className,
}: {
  value: TimeRangeValue;
  onChange: (next: TimeRangeValue) => void;
  className?: string;
}) {
  const range: TimeRangePreset = value.range ?? DEFAULT_TIME_RANGE;
  const resolved = resolveTimeWindow(value);

  const [customOpen, setCustomOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [sinceTime, setSinceTime] = useState("00:00");
  const [untilTime, setUntilTime] = useState("23:59");
  const [customError, setCustomError] = useState<string | null>(null);

  const initCustomDraft = () => {
    const sinceIso = range === "custom" ? value.since : resolved.since;
    const untilIso = range === "custom" ? value.until : resolved.until;
    if (sinceIso && untilIso) {
      const since = new Date(sinceIso);
      const until = new Date(untilIso);
      if (!Number.isNaN(since.getTime()) && !Number.isNaN(until.getTime())) {
        setDateRange({ from: since, to: until });
        setSinceTime(timeOfDayFromDate(since));
        setUntilTime(timeOfDayFromDate(until));
        setCustomError(null);
        return;
      }
    }
    const defaults = defaultCustomWindow();
    setDateRange(defaults.range);
    setSinceTime(defaults.sinceTime);
    setUntilTime(defaults.untilTime);
    setCustomError(null);
  };

  const applyCustom = () => {
    if (!dateRange?.from || !dateRange.to) {
      setCustomError("Select a start and end date");
      return;
    }
    const sinceDate = combineDateAndTime(dateRange.from, sinceTime);
    const untilDate = combineDateAndTime(dateRange.to, untilTime);
    if (!sinceDate || !untilDate) {
      setCustomError("Invalid time");
      return;
    }
    const start = sinceDate.getTime();
    const end = untilDate.getTime();
    if (!(end > start)) {
      setCustomError("End must be after start");
      return;
    }
    if (end - start < 60_000) {
      setCustomError("Range must be at least 1 minute");
      return;
    }
    if (end - start > 90 * 24 * 60 * 60 * 1000) {
      setCustomError("Range cannot exceed 90 days");
      return;
    }
    setCustomError(null);
    onChange({
      range: "custom",
      since: sinceDate.toISOString(),
      until: untilDate.toISOString(),
    });
    setCustomOpen(false);
  };

  const buttonSince = range === "custom" ? value.since : resolved.since;
  const buttonUntil = range === "custom" ? value.until : resolved.until;

  return (
    <div className={cn("flex flex-wrap items-center justify-end gap-2", className)}>
      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={0}
        value={range === "custom" ? [] : [range]}
        onValueChange={(values) => {
          const next = values[0] as Exclude<TimeRangePreset, "custom"> | undefined;
          if (!next) return;
          onChange({ range: next });
        }}
        aria-label="Time range presets"
        className="border-border bg-card h-9 items-center border p-0.5"
      >
        {TIME_RANGE_PRESETS.map((preset) => (
          <ToggleGroupItem
            key={preset.value}
            value={preset.value}
            className={cn(
              "text-muted-foreground h-full min-w-9 px-2.5 text-xs font-medium",
              "data-[pressed]:bg-muted data-[pressed]:text-foreground",
              "aria-pressed:bg-muted aria-pressed:text-foreground",
            )}
          >
            {preset.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <Popover
        open={customOpen}
        onOpenChange={(open) => {
          setCustomOpen(open);
          if (open) initCustomDraft();
        }}
      >
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-9 max-w-[min(100vw-2rem,22rem)] gap-1.5 font-normal",
                range === "custom" && "border-foreground/20 bg-muted",
              )}
              aria-label="Custom date range"
            >
              <HiOutlineCalendar className="size-3.5 shrink-0" />
              <span className="truncate">{formatTimeRangeLabel(buttonSince, buttonUntil)}</span>
            </Button>
          }
        />
        <PopoverContent align="end" className="w-auto max-w-[calc(100vw-1.5rem)] p-0">
          <div className="flex flex-col">
            <Calendar
              mode="range"
              numberOfMonths={2}
              selected={dateRange}
              onSelect={setDateRange}
              defaultMonth={dateRange?.from}
              className="border-0 p-2"
            />
            <div className="border-border flex flex-col gap-3 border-t p-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <p className="text-muted-foreground text-xs">Start time</p>
                  <Input
                    type="time"
                    value={sinceTime}
                    onChange={(event) => setSinceTime(event.currentTarget.value)}
                    aria-label="Range start time"
                  />
                </div>
                <div className="space-y-1.5">
                  <p className="text-muted-foreground text-xs">End time</p>
                  <Input
                    type="time"
                    value={untilTime}
                    onChange={(event) => setUntilTime(event.currentTarget.value)}
                    aria-label="Range end time"
                  />
                </div>
              </div>
              {customError ? <p className="text-destructive text-xs">{customError}</p> : null}
              <div className="flex items-center justify-between gap-2">
                <p className="text-muted-foreground text-[0.7rem]">Times use your local timezone</p>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setCustomOpen(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={applyCustom}>
                    Apply
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
