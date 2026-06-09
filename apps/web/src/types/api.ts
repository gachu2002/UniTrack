export type UserRole = 'admin' | 'teacher' | 'student'

export interface User {
  id: string
  fullName: string
  email: string
  role: UserRole
  status: 'active' | 'inactive'
  avatarUrl?: string
  createdAt?: string
  updatedAt?: string
}

export interface Project {
  id: string
  name: string
  description?: string
  topic?: string
  classId?: string
  classTitle?: string
  classColor?: ClassFolderColor
  supervisorId: string
  supervisorName: string
  startDate?: string
  endDate?: string
  status: 'active' | 'on_hold' | 'completed' | 'archived'
  officialProgressState: 'no_progress' | 'in_progress' | 'needs_changes' | 'completed'
  progressSummary?: string
  memberCount: number
  taskCount: number
  completedTaskCount: number
  inProgressTaskCount: number
  needsChangesTaskCount: number
  milestoneCount: number
  completedMilestoneCount: number
  plannedProgressPercent: number
  overdueTaskCount: number
  pendingReviewCount: number
  lastApprovedUpdateAt?: string
  createdAt: string
  updatedAt: string
}

export interface ProjectMember {
  id: string
  fullName: string
  email: string
  role: UserRole
  status: string
  memberRole: 'member' | 'leader'
  joinedAt: string
}

export type ClassFolderColor = 'blue' | 'teal' | 'amber' | 'rose' | 'violet' | 'slate'

export interface ClassFolder {
  id: string
  title: string
  color: ClassFolderColor
  description?: string
  ownerTeacherId: string
  ownerTeacherName: string
  status: 'active' | 'archived'
  projectCount: number
  pendingReviewCount: number
  overdueTaskCount: number
  createdAt: string
  updatedAt: string
}

export type CourseSection = ClassFolder

export interface CourseSectionDetail {
  classFolder: ClassFolder
  projects: Project[]
}

export interface Task {
  id: string
  projectId: string
  projectName: string
  milestoneId?: string
  milestoneTitle?: string
  title: string
  description?: string
  status: 'todo' | 'in_progress' | 'submitted' | 'needs_changes' | 'done'
  priority: 'low' | 'medium' | 'high'
  deadline?: string
  officialProgressState: 'no_progress' | 'in_progress' | 'needs_changes' | 'completed'
  createdBy: string
  createdByName: string
  createdAt: string
  updatedAt: string
  assignees: User[]
  progressUpdateCount: number
  pendingReviewCount: number
  isOverdue: boolean
}

export interface ProjectMilestone {
  id: string
  projectId: string
  title: string
  description?: string
  targetDate?: string
  sortOrder: number
  state: 'empty' | 'planned' | 'in_progress' | 'needs_changes' | 'completed'
  taskCount: number
  completedTaskCount: number
  inProgressTaskCount: number
  needsChangesTaskCount: number
  pendingReviewCount: number
  overdueTaskCount: number
  completionPercent: number
  createdBy: string
  createdByName: string
  createdAt: string
  updatedAt: string
}

export interface ProgressReview {
  id: string
  progressUpdateId: string
  reviewedBy: string
  reviewedByName: string
  reviewStatus: 'approved' | 'needs_changes' | 'rejected'
  reviewComment?: string
  officialProgressState?: 'no_progress' | 'in_progress' | 'needs_changes' | 'completed'
  reviewedAt: string
}

export type ResourceLinkTargetType = 'project' | 'milestone' | 'task' | 'progress_update'
export type ResourceLinkType = 'external_link' | 'github' | 'google_drive' | 'document' | 'design' | 'other'

export interface ResourceLink {
  id: string
  projectId: string
  relatedType: ResourceLinkTargetType
  relatedId: string
  relatedLabel: string
  title: string
  url: string
  type: ResourceLinkType
  description?: string
  addedBy: string
  addedByName: string
  createdAt: string
  updatedAt: string
}

export interface UploadedFile {
  id: string
  projectId: string
  relatedType: 'progress_update'
  relatedId: string
  originalFileName: string
  mimeType?: string
  fileSizeBytes: number
  uploadedBy: string
  uploadedByName: string
  createdAt: string
}

export interface ProgressUpdate {
  id: string
  projectId: string
  projectName: string
  taskId: string
  taskTitle: string
  submittedBy: string
  submittedByName: string
  title?: string
  description: string
  blockers?: string
  reviewStatus: 'pending_review' | 'approved' | 'needs_changes' | 'rejected'
  latestReview?: ProgressReview
  createdAt: string
  updatedAt: string
}

export interface TaskDetail {
  task: Task
  progressUpdates: ProgressUpdate[]
}

export interface DashboardStats {
  projectCount: number
  taskCount: number
  overdueTaskCount: number
  pendingReviews: number
  studentCount?: number
  teacherCount?: number
}

export interface Dashboard {
  role: UserRole
  stats: DashboardStats
  projects: Project[]
  tasks: Task[]
  progressUpdates: ProgressUpdate[]
}
