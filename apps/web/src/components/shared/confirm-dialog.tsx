import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  isPending?: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function ConfirmDialog({ open, title, description, confirmLabel, isPending = false, onOpenChange, onConfirm }: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description} className="max-w-md">
      <div className="flex justify-end gap-2 pb-5">
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
        <Button type="button" variant="destructive" onClick={onConfirm} disabled={isPending}>{isPending ? 'Working...' : confirmLabel}</Button>
      </div>
    </Dialog>
  )
}
