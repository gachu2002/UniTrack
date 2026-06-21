import { Plus } from 'lucide-react'
import { useState } from 'react'

import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CreateProjectForm } from '@/features/projects/components/project-forms'
import type { Project } from '@/types/api'

interface CreateProjectDialogProps {
  classId?: string
  label?: string
  onCreated: (project: Project) => void
}

export function CreateProjectDialog({ classId, label = 'New project', onCreated }: CreateProjectDialogProps) {
  const [open, setOpen] = useState(false)
  const description = classId ? 'This project will be created in this folder.' : 'Create the project first. Folder grouping is optional.'

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="New project" description={description} className="max-w-4xl">
        <CreateProjectForm
          classId={classId}
          onCancel={() => setOpen(false)}
          onCreated={(project) => {
            setOpen(false)
            onCreated(project)
          }}
        />
      </Dialog>
    </>
  )
}
