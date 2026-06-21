import { CalendarDays, X } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface DatePickerProps {
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  id?: string
  name?: string
  className?: string
}

const displayFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

export function DatePicker({ value = '', onValueChange, placeholder = 'Select date', disabled, id, name, className }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const selectedDate = parseDateValue(value)

  return (
    <div className={cn('w-full', className)}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn('h-10 w-full justify-start bg-card px-3 text-left text-sm font-medium', value ? 'text-foreground' : 'text-muted-foreground')}
          >
            <CalendarDays className="size-4 text-muted-foreground" />
            <span className="truncate">{selectedDate ? displayFormatter.format(selectedDate) : placeholder}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => {
              onValueChange(date ? formatDateValue(date) : '')
              setOpen(false)
            }}
          />
          {value ? (
            <div className="border-t border-border p-2">
              <Button type="button" variant="ghost" size="sm" className="w-full justify-start" onClick={() => { onValueChange(''); setOpen(false) }}>
                <X className="size-3.5" /> Clear
              </Button>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  )
}

function parseDateValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined
  }
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatDateValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
