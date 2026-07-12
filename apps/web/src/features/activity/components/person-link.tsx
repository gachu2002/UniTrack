import { Link } from 'react-router-dom'

import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

interface PersonLinkProps {
  id: string
  name: string
  role: 'student' | 'teacher'
  className?: string
}

export function PersonLink({ id, name, role, className }: PersonLinkProps) {
  const currentUser = useAuthStore((state) => state.user)
  if (role === 'student' && currentUser?.role === 'student') {
    return <span className={className}>{name}</span>
  }
  const parameter = role === 'student' ? 'studentId' : 'teacherId'
  return <Link className={cn('underline-offset-4 hover:text-primary hover:underline', className)} to={`/work?${parameter}=${id}`}>{name}</Link>
}
