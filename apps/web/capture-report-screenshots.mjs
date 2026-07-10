import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outputDir = resolve(__dirname, '../../report/assets/screenshots')
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173'

mkdirSync(outputDir, { recursive: true })

const now = '2026-07-08T08:00:00Z'
const teacher = user('u-teacher-01', 'Dr. An Nguyen', 'teacher01@demo.unitrack.local', 'teacher')
const admin = user('u-admin-01', 'Demo Administrator', 'demo.admin@demo.unitrack.local', 'admin')
const studentA = user('u-student-01', 'An Nguyen 001', 'student001@demo.unitrack.local', 'student')
const studentB = user('u-student-02', 'Binh Phan 002', 'student002@demo.unitrack.local', 'student')
const studentC = user('u-student-03', 'Chau Le 003', 'student003@demo.unitrack.local', 'student')

const folder = {
  id: 'folder-ai-2026',
  title: 'AI Capstone 2026',
  color: 'teal',
  description: 'Teacher-supervised project folder with assignment reviews and evidence tracking.',
  ownerTeacherId: teacher.id,
  ownerTeacherName: teacher.fullName,
  status: 'active',
  projectCount: 3,
  pendingReviewCount: 4,
  overdueTaskCount: 2,
  createdAt: now,
  updatedAt: now,
}

const projects = [
  project('project-01', 'Student Research Tracker', 'AI Capstone 2026', 'teal', 4, 1, 2),
  project('project-02', 'Clinic Queue Optimizer', 'AI Capstone 2026', 'teal', 3, 2, 1),
  project('project-03', 'Smart Lab Inventory', 'AI Capstone 2026', 'teal', 5, 1, 0),
  project('project-04', 'Standalone IoT Monitoring', undefined, undefined, 2, 0, 1),
]

const milestones = [
  milestone('milestone-01', 'Research framing', 1, 'completed', 2, 2, 0, 0, 0, 0, 100),
  milestone('milestone-02', 'Prototype implementation', 2, 'in_progress', 3, 1, 2, 0, 1, 1, 45),
  milestone('milestone-03', 'Evaluation and report', 3, 'planned', 2, 0, 0, 0, 0, 0, 0),
]

const tasks = [
  task('task-01', 'Finalize API contract and data model', 'milestone-02', 'Prototype implementation', 'submitted', 'high', '2026-06-20', [studentA, studentB], 2, 1, true),
  task('task-02', 'Build dashboard review queue', 'milestone-02', 'Prototype implementation', 'in_progress', 'medium', '2026-06-25', [studentB], 1, 0, false),
  task('task-03', 'Prepare evidence storage demo', 'milestone-03', 'Evaluation and report', 'todo', 'medium', '2026-07-02', [studentC], 0, 0, false),
  task('task-04', 'Revise project folder workflow', 'milestone-02', 'Prototype implementation', 'needs_changes', 'high', '2026-06-18', [studentA], 2, 0, true),
]

const progressUpdates = [
  progress('progress-01', 'API contract draft with evidence links', 'task-01', 'Finalize API contract and data model', studentA, 'pending_review', 'Database constraints and API DTOs were updated. Evidence includes schema notes, endpoint checklist, and Playwright trace.', 'Need confirmation on final review decision labels.'),
  progress('progress-02', 'First prototype review pass', 'task-04', 'Revise project folder workflow', studentA, 'needs_changes', 'Folder detail and candidate search are implemented.', undefined, {
    id: 'review-01',
    progressUpdateId: 'progress-02',
    reviewedBy: teacher.id,
    reviewedByName: teacher.fullName,
    reviewStatus: 'needs_changes',
    reviewComment: 'Candidate filtering is correct. Please improve empty-state copy and add one stale-candidate regression.',
    officialProgressState: 'needs_changes',
    reviewedAt: '2026-06-19T10:15:00Z',
  }),
]

const resources = [
  resource('resource-01', 'project', 'project-01', 'Project brief', 'Scope brief', 'https://example.com/project-brief', 'document'),
  resource('resource-02', 'task', 'task-01', 'Assignment spec', 'API contract checklist', 'https://example.com/api-checklist', 'document'),
  resource('resource-03', 'progress_update', 'progress-01', 'Submission resource', 'Schema notes and endpoint evidence', 'https://example.com/schema-notes', 'google_drive'),
]

const files = [
  {
    id: 'file-01',
    projectId: 'project-01',
    relatedType: 'progress_update',
    relatedId: 'progress-01',
    originalFileName: 'api-contract-review.pdf',
    mimeType: 'application/pdf',
    fileSizeBytes: 842_912,
    uploadedBy: studentA.id,
    uploadedByName: studentA.fullName,
    createdAt: '2026-06-21T15:20:00Z',
  },
  {
    id: 'file-02',
    projectId: 'project-01',
    relatedType: 'progress_update',
    relatedId: 'progress-01',
    originalFileName: 'playwright-trace-summary.png',
    mimeType: 'image/png',
    fileSizeBytes: 356_221,
    uploadedBy: studentA.id,
    uploadedByName: studentA.fullName,
    createdAt: '2026-06-21T15:24:00Z',
  },
]

const adminUsers = [
  admin,
  teacher,
  user('u-teacher-02', 'Dr. Bao Tran', 'teacher02@demo.unitrack.local', 'teacher'),
  user('u-teacher-03', 'Dr. Chi Le', 'teacher03@demo.unitrack.local', 'teacher'),
  studentA,
  studentB,
  studentC,
  user('u-student-04', 'Duy Hoang 004', 'student004@demo.unitrack.local', 'student', 'inactive'),
]

let currentUser = admin

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1040 }, deviceScaleFactor: 1 })
await page.route('**/api/v1/**', async (route) => {
  const request = route.request()
  const url = new URL(request.url())
  const path = url.pathname.replace('/api/v1', '')
  const method = request.method()

  if (method !== 'GET' && method !== 'POST') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  }

  if (path === '/auth/me') return json(route, currentUser)
  if (path === '/auth/login') return json(route, currentUser)
  if (path === '/dashboard') return json(route, dashboard())
  if (path === '/classes') return json(route, pageResponse([folder], url))
  if (path === `/classes/${folder.id}`) return json(route, classDetailResponse(projects.slice(0, 3), url))
  if (path === '/admin/users') return json(route, pageResponse(adminUsers, url))
  if (path === '/projects') {
    const unassigned = url.searchParams.get('unassigned') === 'true'
    return json(route, pageResponse(unassigned ? projects.filter((item) => !item.classId) : projects, url))
  }
  if (path === '/projects/project-01') return json(route, projects[0])
  if (path === '/projects/project-01/members') return json(route, pageResponse([
    member(studentA, 'leader'),
    member(studentB, 'member'),
    member(studentC, 'member'),
  ], url))
  if (path === '/projects/project-01/milestones') return json(route, pageResponse(milestones, url))
  if (path === '/projects/project-01/tasks') return json(route, pageResponse(tasks, url))
  if (path === '/projects/project-01/progress-updates') return json(route, pageResponse(progressUpdates, url))
  if (path === '/projects/project-01/resource-links') return json(route, pageResponse(resources, url))
  if (path === '/projects/project-01/files') return json(route, pageResponse(files, url))
  if (path === '/projects/project-01/tasks/task-01') return json(route, { task: tasks[0], progressUpdates })
  if (path === '/projects/project-01/tasks/task-02') return json(route, { task: tasks[1], progressUpdates: [] })

  return json(route, pageResponse([], url))
})

await capture('/login', 'login.png', 'Welcome back')
await capture('/dashboard', 'dashboard-admin.png', 'Review work')
await capture('/workspace', 'workspace.png', 'Workspace', { hideSidebar: true, fullPage: false })
await capture(`/workspace/classes/${folder.id}`, 'folder-detail.png', folder.title)
await capture('/workspace/projects/project-01', 'project-detail.png', projects[0].name, { hideSidebar: true, fullPage: false })
await capture('/workspace/projects/project-01', 'project-team-popover.png', projects[0].name, {
  hideSidebar: true,
  fullPage: false,
  beforeScreenshot: async () => {
    await page.getByRole('button', { name: /Open project team/i }).click()
    await page.getByRole('region', { name: 'Project team' }).waitFor()
  },
})
await capture('/workspace/projects/project-01', 'project-manage-plan.png', projects[0].name, {
  hideSidebar: true,
  fullPage: false,
  beforeScreenshot: async () => {
    await page.getByRole('button', { name: /Open checkpoint actions for Research framing/i }).click()
    await page.getByRole('button', { name: 'Edit checkpoint' }).waitFor()
  },
})
await capture('/workspace/projects/project-01', 'project-resource-dialog.png', projects[0].name, {
  hideSidebar: true,
  fullPage: false,
  beforeScreenshot: async () => {
    await page.getByText('Research framing', { exact: false }).first().waitFor()
    await page.getByRole('button', { name: /Open checkpoint actions for Research framing/i }).click()
    await page.getByRole('button', { name: 'Manage resources', exact: true }).click()
    await page.getByText('Checkpoint resources', { exact: false }).first().waitFor()
  },
})
await capture('/workspace/projects/project-01/tasks/task-01', 'assignment-review-desk.png', 'Review outcome')
await capture('/workspace/projects/project-01/tasks/task-01', 'assignment-resource-dialog.png', 'Review outcome', {
  beforeScreenshot: async () => {
    await page.getByRole('button', { name: /Manage resources for submission/i }).click()
    await page.getByText('Submission resources', { exact: false }).first().waitFor()
  },
})
await capture('/workspace/projects/project-01/tasks/task-02', 'assignment-submit-work.png', 'Submit work when ready', {
  user: studentB,
  beforeScreenshot: async () => {
    await page.getByRole('button', { name: 'Submit work' }).first().click()
    await page.getByText('Share completed work or blockers', { exact: false }).first().waitFor()
  },
})
await capture('/admin/users', 'admin-accounts.png', 'Accounts')

await browser.close()

async function capture(path, fileName, visibleText, options = {}) {
  currentUser = options.user || admin
  await page.goto(`${baseURL}${path}`, { waitUntil: 'networkidle' })
  await page.getByText(visibleText, { exact: false }).first().waitFor({ timeout: 15_000 })
  const screenshotStyle = options.hideSidebar ? await hideDesktopSidebar() : null
  if (options.beforeScreenshot) {
    await options.beforeScreenshot()
  }
  await page.screenshot({ path: resolve(outputDir, fileName), fullPage: options.fullPage ?? true })
  if (screenshotStyle) {
    await screenshotStyle.evaluate((node) => node.remove())
  }
}

async function hideDesktopSidebar() {
  return page.addStyleTag({
    content: `
      @media (min-width: 1024px) {
        aside.fixed.inset-y-0.left-0 { display: none !important; }
        #main-content { padding-left: 0 !important; }
      }
    `,
  })
}

function json(route, body) {
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
}

function pageResponse(items, url) {
  const page = Math.max(1, Number(url.searchParams.get('page') || 1))
  const limit = Math.max(1, Number(url.searchParams.get('limit') || items.length || 1))
  const start = (page - 1) * limit
  return { items: items.slice(start, start + limit), page, limit, total: items.length }
}

function classDetailResponse(classProjects, url) {
  const projectsPage = pageResponse(classProjects, url)
  return { classFolder: folder, projects: projectsPage.items, projectsPage }
}

function user(id, fullName, email, role, status = 'active') {
  return { id, fullName, email, role, status, createdAt: '2026-01-10T08:00:00Z', updatedAt: now }
}

function member(account, memberRole) {
  return { ...account, memberRole, joinedAt: '2026-06-01T08:00:00Z' }
}

function project(id, name, classTitle, classColor, memberCount, pendingReviewCount, overdueTaskCount) {
  return {
    id,
    name,
    description: 'A supervised student project with weekly official assignments, submission evidence, and teacher review checkpoints.',
    topic: 'Project supervision, evidence tracking, and review workflow',
    classId: classTitle ? folder.id : undefined,
    classTitle,
    classColor,
    supervisorId: teacher.id,
    supervisorName: teacher.fullName,
    startDate: '2026-07-01',
    endDate: '2026-08-20',
    status: 'active',
    officialProgressState: pendingReviewCount > 0 ? 'in_progress' : 'needs_changes',
    progressSummary: 'Prototype implemented; review queue and evidence workflow need final pass.',
    memberCount,
    taskCount: 7,
    completedTaskCount: 3,
    inProgressTaskCount: 2,
    needsChangesTaskCount: 1,
    milestoneCount: 3,
    completedMilestoneCount: 1,
    plannedProgressPercent: 54,
    overdueTaskCount,
    pendingReviewCount,
    lastApprovedUpdateAt: '2026-07-05T09:00:00Z',
    createdAt: '2026-06-25T09:00:00Z',
    updatedAt: now,
  }
}

function milestone(id, title, sortOrder, state, taskCount, completedTaskCount, inProgressTaskCount, needsChangesTaskCount, pendingReviewCount, overdueTaskCount, completionPercent) {
  return {
    id,
    projectId: 'project-01',
    title,
    description: `${title} checkpoint for supervised progress tracking.`,
    targetDate: sortOrder === 1 ? '2026-07-12' : sortOrder === 2 ? '2026-07-28' : '2026-08-15',
    sortOrder,
    state,
    taskCount,
    completedTaskCount,
    inProgressTaskCount,
    needsChangesTaskCount,
    pendingReviewCount,
    overdueTaskCount,
    completionPercent,
    createdBy: teacher.id,
    createdByName: teacher.fullName,
    createdAt: '2026-07-01T08:00:00Z',
    updatedAt: now,
  }
}

function task(id, title, milestoneId, milestoneTitle, status, priority, deadline, assignees, progressUpdateCount, pendingReviewCount, isOverdue) {
  return {
    id,
    projectId: 'project-01',
    projectName: 'Student Research Tracker',
    milestoneId,
    milestoneTitle,
    title,
    description: 'Deliver a reviewable increment with notes, blockers, references, and evidence files.',
    status,
    priority,
    deadline,
    officialProgressState: status === 'needs_changes' ? 'needs_changes' : status === 'done' ? 'completed' : 'in_progress',
    createdBy: teacher.id,
    createdByName: teacher.fullName,
    createdAt: '2026-07-02T08:00:00Z',
    updatedAt: now,
    assignees,
    progressUpdateCount,
    pendingReviewCount,
    isOverdue,
  }
}

function progress(id, title, taskId, taskTitle, submittedBy, reviewStatus, description, blockers, latestReview) {
  return {
    id,
    projectId: 'project-01',
    projectName: 'Student Research Tracker',
    taskId,
    taskTitle,
    submittedBy: submittedBy.id,
    submittedByName: submittedBy.fullName,
    title,
    description,
    blockers,
    reviewStatus,
    latestReview,
    createdAt: id === 'progress-01' ? '2026-07-07T14:30:00Z' : '2026-07-04T09:30:00Z',
    updatedAt: now,
  }
}

function resource(id, relatedType, relatedId, relatedLabel, title, url, type) {
  return {
    id,
    projectId: 'project-01',
    relatedType,
    relatedId,
    relatedLabel,
    title,
    url,
    type,
    description: 'Report evidence artifact used by the review workflow.',
    addedBy: teacher.id,
    addedByName: teacher.fullName,
    createdAt: '2026-07-06T08:00:00Z',
    updatedAt: now,
  }
}

function dashboard() {
  return {
    role: 'admin',
    stats: { projectCount: 72, taskCount: 318, overdueTaskCount: 12, pendingReviews: 18, teacherCount: 16, studentCount: 240 },
    projects,
    tasks: tasks.filter((item) => item.isOverdue),
    progressUpdates,
  }
}
