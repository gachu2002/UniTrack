package app

import "time"

const (
	RoleAdmin   = "admin"
	RoleTeacher = "teacher"
	RoleStudent = "student"
)

type User struct {
	ID           string
	FullName     string
	Email        string
	PasswordHash string
	Role         string
	Status       string
	AvatarURL    *string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type UserDTO struct {
	ID        string     `json:"id"`
	FullName  string     `json:"fullName"`
	Email     string     `json:"email"`
	Role      string     `json:"role"`
	Status    string     `json:"status"`
	AvatarURL *string    `json:"avatarUrl,omitempty"`
	CreatedAt *time.Time `json:"createdAt,omitempty"`
	UpdatedAt *time.Time `json:"updatedAt,omitempty"`
}

type ProjectDTO struct {
	ID                      string     `json:"id"`
	Name                    string     `json:"name"`
	Description             *string    `json:"description,omitempty"`
	Topic                   *string    `json:"topic,omitempty"`
	ClassID                 *string    `json:"classId,omitempty"`
	ClassTitle              *string    `json:"classTitle,omitempty"`
	ClassColor              *string    `json:"classColor,omitempty"`
	SupervisorID            string     `json:"supervisorId"`
	SupervisorName          string     `json:"supervisorName"`
	StartDate               *string    `json:"startDate,omitempty"`
	EndDate                 *string    `json:"endDate,omitempty"`
	Status                  string     `json:"status"`
	OfficialProgressState   string     `json:"officialProgressState"`
	ProgressSummary         *string    `json:"progressSummary,omitempty"`
	MemberCount             int64      `json:"memberCount"`
	TaskCount               int64      `json:"taskCount"`
	CompletedTaskCount      int64      `json:"completedTaskCount"`
	InProgressTaskCount     int64      `json:"inProgressTaskCount"`
	NeedsChangesTaskCount   int64      `json:"needsChangesTaskCount"`
	MilestoneCount          int64      `json:"milestoneCount"`
	CompletedMilestoneCount int64      `json:"completedMilestoneCount"`
	PlannedProgressPercent  int64      `json:"plannedProgressPercent"`
	OverdueTaskCount        int64      `json:"overdueTaskCount"`
	PendingReviewCount      int64      `json:"pendingReviewCount"`
	LastApprovedUpdateAt    *time.Time `json:"lastApprovedUpdateAt,omitempty"`
	CreatedAt               time.Time  `json:"createdAt"`
	UpdatedAt               time.Time  `json:"updatedAt"`
}

type ProjectMemberDTO struct {
	ID         string    `json:"id"`
	FullName   string    `json:"fullName"`
	Email      string    `json:"email"`
	Role       string    `json:"role"`
	Status     string    `json:"status"`
	MemberRole string    `json:"memberRole"`
	JoinedAt   time.Time `json:"joinedAt"`
}

type TaskDTO struct {
	ID                    string    `json:"id"`
	ProjectID             string    `json:"projectId"`
	ProjectName           string    `json:"projectName"`
	MilestoneID           *string   `json:"milestoneId,omitempty"`
	MilestoneTitle        *string   `json:"milestoneTitle,omitempty"`
	Title                 string    `json:"title"`
	Description           *string   `json:"description,omitempty"`
	Status                string    `json:"status"`
	Priority              string    `json:"priority"`
	Deadline              *string   `json:"deadline,omitempty"`
	OfficialProgressState string    `json:"officialProgressState"`
	CreatedBy             string    `json:"createdBy"`
	CreatedByName         string    `json:"createdByName"`
	CreatedAt             time.Time `json:"createdAt"`
	UpdatedAt             time.Time `json:"updatedAt"`
	Assignees             []UserDTO `json:"assignees"`
	ProgressUpdateCount   int64     `json:"progressUpdateCount"`
	PendingReviewCount    int64     `json:"pendingReviewCount"`
	IsOverdue             bool      `json:"isOverdue"`
}

type MilestoneDTO struct {
	ID                    string    `json:"id"`
	ProjectID             string    `json:"projectId"`
	Title                 string    `json:"title"`
	Description           *string   `json:"description,omitempty"`
	TargetDate            *string   `json:"targetDate,omitempty"`
	SortOrder             int       `json:"sortOrder"`
	State                 string    `json:"state"`
	TaskCount             int64     `json:"taskCount"`
	CompletedTaskCount    int64     `json:"completedTaskCount"`
	InProgressTaskCount   int64     `json:"inProgressTaskCount"`
	NeedsChangesTaskCount int64     `json:"needsChangesTaskCount"`
	PendingReviewCount    int64     `json:"pendingReviewCount"`
	OverdueTaskCount      int64     `json:"overdueTaskCount"`
	CompletionPercent     int64     `json:"completionPercent"`
	CreatedBy             string    `json:"createdBy"`
	CreatedByName         string    `json:"createdByName"`
	CreatedAt             time.Time `json:"createdAt"`
	UpdatedAt             time.Time `json:"updatedAt"`
}

type TaskDetailDTO struct {
	Task            TaskDTO             `json:"task"`
	ProgressUpdates []ProgressUpdateDTO `json:"progressUpdates"`
}

type ProgressUpdateDTO struct {
	ID              string             `json:"id"`
	ProjectID       string             `json:"projectId"`
	ProjectName     string             `json:"projectName"`
	TaskID          string             `json:"taskId"`
	TaskTitle       string             `json:"taskTitle"`
	SubmittedBy     string             `json:"submittedBy"`
	SubmittedByName string             `json:"submittedByName"`
	Title           *string            `json:"title,omitempty"`
	Description     string             `json:"description"`
	Blockers        *string            `json:"blockers,omitempty"`
	ReviewStatus    string             `json:"reviewStatus"`
	LatestReview    *ProgressReviewDTO `json:"latestReview,omitempty"`
	CreatedAt       time.Time          `json:"createdAt"`
	UpdatedAt       time.Time          `json:"updatedAt"`
}

type ProgressReviewDTO struct {
	ID                    string    `json:"id"`
	ProgressUpdateID      string    `json:"progressUpdateId"`
	ReviewedBy            string    `json:"reviewedBy"`
	ReviewedByName        string    `json:"reviewedByName"`
	ReviewStatus          string    `json:"reviewStatus"`
	ReviewComment         *string   `json:"reviewComment,omitempty"`
	OfficialProgressState *string   `json:"officialProgressState,omitempty"`
	ReviewedAt            time.Time `json:"reviewedAt"`
}

type ResourceLinkDTO struct {
	ID           string    `json:"id"`
	ProjectID    string    `json:"projectId"`
	RelatedType  string    `json:"relatedType"`
	RelatedID    string    `json:"relatedId"`
	RelatedLabel string    `json:"relatedLabel"`
	Title        string    `json:"title"`
	URL          string    `json:"url"`
	Type         string    `json:"type"`
	Description  *string   `json:"description,omitempty"`
	AddedBy      string    `json:"addedBy"`
	AddedByName  string    `json:"addedByName"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type UploadedFileDTO struct {
	ID               string    `json:"id"`
	ProjectID        string    `json:"projectId"`
	RelatedType      string    `json:"relatedType"`
	RelatedID        string    `json:"relatedId"`
	OriginalFileName string    `json:"originalFileName"`
	MimeType         *string   `json:"mimeType,omitempty"`
	FileSizeBytes    int64     `json:"fileSizeBytes"`
	UploadedBy       string    `json:"uploadedBy"`
	UploadedByName   string    `json:"uploadedByName"`
	CreatedAt        time.Time `json:"createdAt"`
}

type CourseSectionDTO struct {
	ID                 string    `json:"id"`
	Title              string    `json:"title"`
	Color              string    `json:"color"`
	Description        *string   `json:"description,omitempty"`
	OwnerTeacherID     string    `json:"ownerTeacherId"`
	OwnerTeacherName   string    `json:"ownerTeacherName"`
	Status             string    `json:"status"`
	ProjectCount       int64     `json:"projectCount"`
	PendingReviewCount int64     `json:"pendingReviewCount"`
	OverdueTaskCount   int64     `json:"overdueTaskCount"`
	CreatedAt          time.Time `json:"createdAt"`
	UpdatedAt          time.Time `json:"updatedAt"`
}

type CourseSectionDetailDTO struct {
	ClassFolder CourseSectionDTO `json:"classFolder"`
	Projects    []ProjectDTO     `json:"projects"`
}

type DashboardDTO struct {
	Role            string              `json:"role"`
	Stats           DashboardStats      `json:"stats"`
	Projects        []ProjectDTO        `json:"projects"`
	Tasks           []TaskDTO           `json:"tasks"`
	ProgressUpdates []ProgressUpdateDTO `json:"progressUpdates"`
}

type DashboardStats struct {
	ProjectCount     int64 `json:"projectCount"`
	TaskCount        int64 `json:"taskCount"`
	OverdueTaskCount int64 `json:"overdueTaskCount"`
	PendingReviews   int64 `json:"pendingReviews"`
	StudentCount     int64 `json:"studentCount,omitempty"`
	TeacherCount     int64 `json:"teacherCount,omitempty"`
}
