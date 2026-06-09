package app

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"unitrack/api/internal/config"

	"github.com/jackc/pgx/v5/pgxpool"
)

type testApp struct {
	server *httptest.Server
	db     *pgxpool.Pool
	client *http.Client
}

func newTestApp(t *testing.T) *testApp {
	t.Helper()
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}

	ctx := context.Background()
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("connect test database: %v", err)
	}
	if err := db.Ping(ctx); err != nil {
		t.Fatalf("ping test database: %v", err)
	}

	cfg := config.Load()
	cfg.DatabaseURL = databaseURL
	api := NewServer(cfg, db, nil)
	server := httptest.NewServer(api.Handler())
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatalf("cookie jar: %v", err)
	}

	t.Cleanup(func() {
		server.Close()
		db.Close()
	})

	return &testApp{server: server, db: db, client: &http.Client{Jar: jar}}
}

func TestAuthSessionLifecycle(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	userID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, "", prefix) })

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	me := requestJSON(t, app, http.MethodGet, "/api/v1/auth/me", map[string]string{})
	if me.StatusCode != http.StatusOK {
		t.Fatalf("me status = %d", me.StatusCode)
	}

	logout := requestJSON(t, app, http.MethodPost, "/api/v1/auth/logout", map[string]string{})
	if logout.StatusCode != http.StatusOK {
		t.Fatalf("logout status = %d", logout.StatusCode)
	}

	afterLogout := requestJSON(t, app, http.MethodGet, "/api/v1/auth/me", map[string]string{})
	if afterLogout.StatusCode != http.StatusUnauthorized {
		t.Fatalf("me after logout status = %d", afterLogout.StatusCode)
	}

	var revokedCount int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM sessions WHERE user_id = $1 AND revoked_at IS NOT NULL`, userID).Scan(&revokedCount); err != nil {
		t.Fatalf("count revoked sessions: %v", err)
	}
	if revokedCount != 1 {
		t.Fatalf("revoked sessions = %d, want 1", revokedCount)
	}
}

func TestInactiveUserCannotLogin(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	userID := createTestUserWithStatus(t, app.db, prefix+"inactive.teacher@unitrack.local", "teacher12345", RoleTeacher, "Inactive Teacher", "inactive")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, "", prefix) })

	response := requestJSON(t, app, http.MethodPost, "/api/v1/auth/login", map[string]string{"email": prefix + "inactive.teacher@unitrack.local", "password": "teacher12345"})
	if response.StatusCode != http.StatusForbidden {
		t.Fatalf("inactive login status = %d", response.StatusCode)
	}

	var sessionCount int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM sessions WHERE user_id = $1`, userID).Scan(&sessionCount); err != nil {
		t.Fatalf("count sessions: %v", err)
	}
	if sessionCount != 0 {
		t.Fatalf("inactive user sessions = %d, want 0", sessionCount)
	}
}

func TestProtectedRoutesRequireAuthentication(t *testing.T) {
	app := newTestApp(t)

	response := requestJSON(t, app, http.MethodGet, "/api/v1/dashboard", map[string]string{})
	if response.StatusCode != http.StatusUnauthorized {
		t.Fatalf("unauthenticated dashboard status = %d", response.StatusCode)
	}
}

func TestTeacherDashboardListsOldestPendingReviewsFirst(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	studentID := createTestUser(t, app.db, prefix+"student@unitrack.local", "student12345", RoleStudent, "Student")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Dashboard Review Project")
	taskID := createTestTask(t, app.db, projectID, teacherID, "Dashboard review task")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	newestID := createTestProgressUpdate(t, app.db, projectID, taskID, studentID, "Newest pending review")
	oldestID := createTestProgressUpdate(t, app.db, projectID, taskID, studentID, "Oldest pending review")
	middleID := createTestProgressUpdate(t, app.db, projectID, taskID, studentID, "Middle pending review")
	if _, err := app.db.Exec(context.Background(), `
		UPDATE progress_updates
		SET created_at = CASE id
			WHEN $1 THEN now() - interval '1 hour'
			WHEN $2 THEN now() - interval '3 hours'
			WHEN $3 THEN now() - interval '2 hours'
		END
		WHERE id IN ($1, $2, $3)
	`, newestID, oldestID, middleID); err != nil {
		t.Fatalf("set progress update times: %v", err)
	}

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	status, body := requestJSONBody(t, app, http.MethodGet, "/api/v1/dashboard", nil)
	if status != http.StatusOK {
		t.Fatalf("dashboard status = %d body = %s", status, string(body))
	}
	var dashboard DashboardDTO
	if err := json.Unmarshal(body, &dashboard); err != nil {
		t.Fatalf("decode dashboard: %v", err)
	}
	if len(dashboard.ProgressUpdates) < 3 {
		t.Fatalf("dashboard progress updates = %#v", dashboard.ProgressUpdates)
	}
	if dashboard.ProgressUpdates[0].ID != oldestID || dashboard.ProgressUpdates[1].ID != middleID || dashboard.ProgressUpdates[2].ID != newestID {
		t.Fatalf("dashboard review order = %s, %s, %s; want %s, %s, %s", dashboard.ProgressUpdates[0].ID, dashboard.ProgressUpdates[1].ID, dashboard.ProgressUpdates[2].ID, oldestID, middleID, newestID)
	}
}

func TestTeacherDashboardIncludesAttentionProjectsBeforeRecentProjects(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	urgentProjectID := createTestProject(t, app.db, teacherID, prefix+"Urgent Old Dashboard Project")
	urgentTaskID := createTestTask(t, app.db, urgentProjectID, teacherID, "Overdue official task")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, "", prefix) })

	if _, err := app.db.Exec(context.Background(), `UPDATE tasks SET deadline = current_date - 1 WHERE id = $1`, urgentTaskID); err != nil {
		t.Fatalf("mark urgent task overdue: %v", err)
	}
	if _, err := app.db.Exec(context.Background(), `UPDATE projects SET updated_at = now() - interval '30 days' WHERE id = $1`, urgentProjectID); err != nil {
		t.Fatalf("age urgent project: %v", err)
	}
	for index := 0; index < 8; index++ {
		createTestProject(t, app.db, teacherID, prefix+"Recent Stable Dashboard Project "+strconv.Itoa(index))
	}

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	status, body := requestJSONBody(t, app, http.MethodGet, "/api/v1/dashboard", nil)
	if status != http.StatusOK {
		t.Fatalf("dashboard status = %d body = %s", status, string(body))
	}
	var dashboard DashboardDTO
	if err := json.Unmarshal(body, &dashboard); err != nil {
		t.Fatalf("decode dashboard: %v", err)
	}
	seenUrgent := false
	for _, project := range dashboard.Projects {
		if project.ID == urgentProjectID {
			seenUrgent = true
			break
		}
	}
	if !seenUrgent {
		t.Fatalf("dashboard projects did not include urgent project: %#v", dashboard.Projects)
	}
}

func TestStudentDashboardListsOnlyActionableAssignments(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	studentID := createTestUser(t, app.db, prefix+"student@unitrack.local", "student12345", RoleStudent, "Student")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Student Dashboard Project")
	milestoneID := createTestMilestone(t, app.db, projectID, teacherID, prefix+"Dashboard Milestone", 1)
	actionableTaskID := createTestTaskInMilestone(t, app.db, projectID, teacherID, milestoneID, prefix+"Needs revision task")
	waitingTaskID := createTestTaskInMilestone(t, app.db, projectID, teacherID, milestoneID, prefix+"Waiting review task")
	completedTaskID := createTestTaskInMilestone(t, app.db, projectID, teacherID, milestoneID, prefix+"Completed task")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	assignTask(t, app.db, actionableTaskID, studentID)
	assignTask(t, app.db, waitingTaskID, studentID)
	assignTask(t, app.db, completedTaskID, studentID)
	if _, err := app.db.Exec(context.Background(), `UPDATE tasks SET official_progress_state = 'needs_changes' WHERE id = $1`, actionableTaskID); err != nil {
		t.Fatalf("mark actionable task: %v", err)
	}
	createTestProgressUpdate(t, app.db, projectID, waitingTaskID, studentID, "Waiting for review")
	if _, err := app.db.Exec(context.Background(), `UPDATE tasks SET status = 'done', official_progress_state = 'completed' WHERE id = $1`, completedTaskID); err != nil {
		t.Fatalf("mark completed task: %v", err)
	}

	login(t, app, prefix+"student@unitrack.local", "student12345")
	status, body := requestJSONBody(t, app, http.MethodGet, "/api/v1/dashboard", nil)
	if status != http.StatusOK {
		t.Fatalf("dashboard status = %d body = %s", status, string(body))
	}
	var dashboard DashboardDTO
	if err := json.Unmarshal(body, &dashboard); err != nil {
		t.Fatalf("decode dashboard: %v", err)
	}
	seenActionable := false
	for _, task := range dashboard.Tasks {
		if task.ID == actionableTaskID {
			seenActionable = true
			if task.ProjectName != prefix+"Student Dashboard Project" {
				t.Fatalf("task project name = %q", task.ProjectName)
			}
		}
		if task.ID == waitingTaskID || task.ID == completedTaskID {
			t.Fatalf("dashboard included non-actionable task %#v", task)
		}
	}
	if !seenActionable {
		t.Fatalf("dashboard missing actionable task: %#v", dashboard.Tasks)
	}
}

func TestStudentCannotAccessClasses(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	createTestUser(t, app.db, prefix+"student@unitrack.local", "student12345", RoleStudent, "Student")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, "", prefix) })

	login(t, app, prefix+"student@unitrack.local", "student12345")
	response := requestJSON(t, app, http.MethodGet, "/api/v1/classes", map[string]string{})
	if response.StatusCode != http.StatusForbidden {
		t.Fatalf("student classes status = %d", response.StatusCode)
	}
}

func TestTeacherCanAddExistingActiveStudentToProject(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	studentID := createTestUser(t, app.db, prefix+"student@unitrack.local", "student12345", RoleStudent, "Student")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Direct Member Project")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	status, body := requestJSONBody(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/members", map[string]string{"email": prefix + "STUDENT@unitrack.local"})
	if status != http.StatusCreated {
		t.Fatalf("add member status = %d body = %s", status, string(body))
	}
	var member ProjectMemberDTO
	if err := json.Unmarshal(body, &member); err != nil {
		t.Fatalf("decode added member: %v", err)
	}
	if member.ID != studentID || member.Email != prefix+"student@unitrack.local" || member.MemberRole != "member" {
		t.Fatalf("added member = %#v", member)
	}

	var membershipCount int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM project_members WHERE project_id = $1 AND student_id = $2`, projectID, studentID).Scan(&membershipCount); err != nil {
		t.Fatalf("count memberships: %v", err)
	}
	if membershipCount != 1 {
		t.Fatalf("membership count = %d, want 1", membershipCount)
	}

	duplicate := requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/members", map[string]string{"email": prefix + "student@unitrack.local"})
	if duplicate.StatusCode != http.StatusConflict {
		t.Fatalf("duplicate add status = %d", duplicate.StatusCode)
	}

	login(t, app, prefix+"student@unitrack.local", "student12345")
	assertStatus(t, requestJSON(t, app, http.MethodGet, "/api/v1/projects/"+projectID, nil), http.StatusOK, "added student project read")
}

func TestAddProjectMemberValidatesStudentAccountState(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	createTestUser(t, app.db, prefix+"other.teacher@unitrack.local", "teacher12345", RoleTeacher, "Other Teacher")
	createTestUserWithStatus(t, app.db, prefix+"inactive.student@unitrack.local", "student12345", RoleStudent, "Inactive Student", "inactive")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Member Validation Project")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	assertStatus(t, requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/members", map[string]string{"email": "not-an-email"}), http.StatusBadRequest, "invalid add email")
	assertStatus(t, requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/members", map[string]string{"email": prefix + "missing.student@unitrack.local"}), http.StatusNotFound, "missing student add")
	assertStatus(t, requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/members", map[string]string{"email": prefix + "other.teacher@unitrack.local"}), http.StatusBadRequest, "non-student add")
	assertStatus(t, requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/members", map[string]string{"email": prefix + "inactive.student@unitrack.local"}), http.StatusConflict, "inactive student add")

	var membershipCount int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM project_members WHERE project_id = $1`, projectID).Scan(&membershipCount); err != nil {
		t.Fatalf("count memberships: %v", err)
	}
	if membershipCount != 0 {
		t.Fatalf("membership count = %d, want 0", membershipCount)
	}
}

func TestAdminCanAddProjectMember(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	createTestUser(t, app.db, prefix+"admin@unitrack.local", "admin12345", RoleAdmin, "Admin")
	studentID := createTestUser(t, app.db, prefix+"student@unitrack.local", "student12345", RoleStudent, "Student")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Admin Member Project")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	login(t, app, prefix+"admin@unitrack.local", "admin12345")
	response := requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/members", map[string]string{"email": prefix + "student@unitrack.local"})
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("admin add member status = %d", response.StatusCode)
	}

	var membershipCount int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM project_members WHERE project_id = $1 AND student_id = $2`, projectID, studentID).Scan(&membershipCount); err != nil {
		t.Fatalf("count memberships: %v", err)
	}
	if membershipCount != 1 {
		t.Fatalf("membership count = %d, want 1", membershipCount)
	}
}

func TestOnHoldProjectBlocksNewWorkButAllowsManagerMaintenance(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	studentID := createTestUser(t, app.db, prefix+"student@unitrack.local", "student12345", RoleStudent, "Student")
	newStudentID := createTestUser(t, app.db, prefix+"new.student@unitrack.local", "student12345", RoleStudent, "New Student")
	projectID := createTestProject(t, app.db, teacherID, prefix+"On Hold Project")
	milestoneID := createTestMilestone(t, app.db, projectID, teacherID, "Paused checkpoint", 1)
	taskID := createTestTaskInMilestone(t, app.db, projectID, teacherID, milestoneID, "Paused assignment")
	addProjectMember(t, app.db, projectID, studentID)
	assignTask(t, app.db, taskID, studentID)
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	if _, err := app.db.Exec(context.Background(), `UPDATE projects SET status = 'on_hold' WHERE id = $1`, projectID); err != nil {
		t.Fatalf("put project on hold: %v", err)
	}

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	assertStatus(t, requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/tasks", map[string]string{"title": "New paused work", "milestoneId": milestoneID}), http.StatusConflict, "on-hold create assignment")
	assertStatus(t, requestJSON(t, app, http.MethodPatch, "/api/v1/projects/"+projectID+"/tasks/"+taskID, map[string]string{"title": "Adjusted paused assignment"}), http.StatusOK, "on-hold update assignment")
	assertStatus(t, requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/members", map[string]string{"email": prefix + "new.student@unitrack.local"}), http.StatusCreated, "on-hold add member")
	assertStatus(t, requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/resource-links", map[string]string{"title": "Pause note", "url": "https://example.com/pause-note"}), http.StatusCreated, "on-hold create resource")

	var newMemberCount int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM project_members WHERE project_id = $1 AND student_id = $2`, projectID, newStudentID).Scan(&newMemberCount); err != nil {
		t.Fatalf("count new on-hold member: %v", err)
	}
	if newMemberCount != 1 {
		t.Fatalf("new on-hold member count = %d, want 1", newMemberCount)
	}

	login(t, app, prefix+"student@unitrack.local", "student12345")
	assertStatus(t, requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/tasks/"+taskID+"/progress-updates", map[string]string{"description": "Work while paused"}), http.StatusConflict, "on-hold submit progress")
}

func TestCompletedProjectAllowsPendingReviewsOnly(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	studentID := createTestUser(t, app.db, prefix+"student@unitrack.local", "student12345", RoleStudent, "Student")
	newStudentID := createTestUser(t, app.db, prefix+"new.student@unitrack.local", "student12345", RoleStudent, "New Student")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Completed Project")
	milestoneID := createTestMilestone(t, app.db, projectID, teacherID, "Completion checkpoint", 1)
	taskID := createTestTaskInMilestone(t, app.db, projectID, teacherID, milestoneID, "Completed assignment")
	addProjectMember(t, app.db, projectID, studentID)
	assignTask(t, app.db, taskID, studentID)
	updateID := createTestProgressUpdate(t, app.db, projectID, taskID, studentID, "Ready before completion")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	if _, err := app.db.Exec(context.Background(), `UPDATE projects SET status = 'completed' WHERE id = $1`, projectID); err != nil {
		t.Fatalf("complete project: %v", err)
	}

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	assertStatus(t, requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/tasks", map[string]string{"title": "Late assignment", "milestoneId": milestoneID}), http.StatusConflict, "completed create assignment")
	assertStatus(t, requestJSON(t, app, http.MethodPatch, "/api/v1/projects/"+projectID+"/tasks/"+taskID, map[string]string{"title": "Late edit"}), http.StatusConflict, "completed update assignment")
	assertStatus(t, requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/members", map[string]string{"email": prefix + "new.student@unitrack.local"}), http.StatusConflict, "completed add member")
	assertStatus(t, requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/resource-links", map[string]string{"title": "Late resource", "url": "https://example.com/late-resource"}), http.StatusConflict, "completed create resource")
	assertStatus(t, requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/progress-updates/"+updateID+"/reviews", map[string]string{"reviewStatus": "approved", "officialProgressState": "in_progress"}), http.StatusOK, "completed review pending submission")

	var newMemberCount int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM project_members WHERE project_id = $1 AND student_id = $2`, projectID, newStudentID).Scan(&newMemberCount); err != nil {
		t.Fatalf("count completed member add: %v", err)
	}
	if newMemberCount != 0 {
		t.Fatalf("completed member add count = %d, want 0", newMemberCount)
	}

	login(t, app, prefix+"student@unitrack.local", "student12345")
	assertStatus(t, requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/tasks/"+taskID+"/progress-updates", map[string]string{"description": "Late work"}), http.StatusConflict, "completed submit progress")
}

func TestArchivedProjectIsReadOnlyExceptStatusChange(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	studentID := createTestUser(t, app.db, prefix+"student@unitrack.local", "student12345", RoleStudent, "Student")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Archived Project")
	taskID := createTestTask(t, app.db, projectID, teacherID, "Archived assignment")
	addProjectMember(t, app.db, projectID, studentID)
	updateID := createTestProgressUpdate(t, app.db, projectID, taskID, studentID, "Archived pending work")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	if _, err := app.db.Exec(context.Background(), `UPDATE projects SET status = 'archived' WHERE id = $1`, projectID); err != nil {
		t.Fatalf("archive project: %v", err)
	}

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	assertStatus(t, requestJSON(t, app, http.MethodGet, "/api/v1/projects/"+projectID, nil), http.StatusOK, "archived project read")
	assertStatus(t, requestJSON(t, app, http.MethodPatch, "/api/v1/projects/"+projectID, map[string]string{"name": "Edited while archived"}), http.StatusConflict, "archived project metadata update")
	assertStatus(t, requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/resource-links", map[string]string{"title": "Archived resource", "url": "https://example.com/archived-resource"}), http.StatusConflict, "archived create resource")
	assertStatus(t, requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/progress-updates/"+updateID+"/reviews", map[string]string{"reviewStatus": "approved", "officialProgressState": "in_progress"}), http.StatusConflict, "archived review pending submission")

	status, body := requestJSONBody(t, app, http.MethodPatch, "/api/v1/projects/"+projectID, map[string]string{"status": "active"})
	if status != http.StatusOK {
		t.Fatalf("archived reactivation status = %d body = %s", status, string(body))
	}
	var project ProjectDTO
	if err := json.Unmarshal(body, &project); err != nil {
		t.Fatalf("decode reactivated project: %v", err)
	}
	if project.Status != "active" {
		t.Fatalf("reactivated project status = %s, want active", project.Status)
	}
}

func TestProjectRoutesEnforceMembershipAndSupervisor(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	otherTeacherID := createTestUser(t, app.db, prefix+"other.teacher@unitrack.local", "teacher12345", RoleTeacher, "Other Teacher")
	createTestUser(t, app.db, prefix+"admin@unitrack.local", "admin12345", RoleAdmin, "Admin")
	studentID := createTestUser(t, app.db, prefix+"student@unitrack.local", "student12345", RoleStudent, "Student")
	createTestUser(t, app.db, prefix+"other.student@unitrack.local", "student12345", RoleStudent, "Other Student")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Authorization Project")
	otherProjectID := createTestProject(t, app.db, otherTeacherID, prefix+"Other Authorization Project")
	addProjectMember(t, app.db, projectID, studentID)
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, "", prefix) })

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	assertProjectList(t, app, []string{projectID}, []string{otherProjectID})
	assertStatus(t, requestJSON(t, app, http.MethodGet, "/api/v1/projects/"+projectID, nil), http.StatusOK, "teacher project read")
	assertStatus(t, requestJSON(t, app, http.MethodGet, "/api/v1/projects/"+projectID+"/members", nil), http.StatusOK, "teacher members read")
	assertStatus(t, requestJSON(t, app, http.MethodPatch, "/api/v1/projects/"+projectID, map[string]string{"name": prefix + "Authorization Project Updated"}), http.StatusOK, "teacher project update")

	login(t, app, prefix+"other.teacher@unitrack.local", "teacher12345")
	assertProjectList(t, app, []string{otherProjectID}, []string{projectID})
	assertStatus(t, requestJSON(t, app, http.MethodGet, "/api/v1/projects/"+projectID, nil), http.StatusForbidden, "other teacher project read")
	assertStatus(t, requestJSON(t, app, http.MethodPatch, "/api/v1/projects/"+projectID, map[string]string{"name": "Forbidden"}), http.StatusForbidden, "other teacher project update")
	assertStatus(t, requestJSON(t, app, http.MethodGet, "/api/v1/projects/"+projectID+"/members", nil), http.StatusForbidden, "other teacher members read")
	assertStatus(t, requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/members", map[string]string{"email": prefix + "candidate@unitrack.local"}), http.StatusForbidden, "other teacher add member")

	login(t, app, prefix+"student@unitrack.local", "student12345")
	assertProjectList(t, app, []string{projectID}, []string{otherProjectID})
	assertStatus(t, requestJSON(t, app, http.MethodGet, "/api/v1/projects/"+projectID, nil), http.StatusOK, "student project read")
	assertStatus(t, requestJSON(t, app, http.MethodGet, "/api/v1/projects/"+projectID+"/members", nil), http.StatusOK, "student members read")
	assertStatus(t, requestJSON(t, app, http.MethodPatch, "/api/v1/projects/"+projectID, map[string]string{"name": "Forbidden"}), http.StatusForbidden, "student project update")
	assertStatus(t, requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/members", map[string]string{"email": prefix + "candidate@unitrack.local"}), http.StatusForbidden, "student add member")

	login(t, app, prefix+"other.student@unitrack.local", "student12345")
	assertProjectList(t, app, []string{}, []string{projectID, otherProjectID})
	assertStatus(t, requestJSON(t, app, http.MethodGet, "/api/v1/projects/"+projectID, nil), http.StatusForbidden, "non-member student project read")
	assertStatus(t, requestJSON(t, app, http.MethodGet, "/api/v1/projects/"+projectID+"/members", nil), http.StatusForbidden, "non-member student members read")

	login(t, app, prefix+"admin@unitrack.local", "admin12345")
	assertProjectList(t, app, []string{projectID, otherProjectID}, []string{})
	assertStatus(t, requestJSON(t, app, http.MethodGet, "/api/v1/projects/"+projectID, nil), http.StatusOK, "admin project read")
	assertStatus(t, requestJSON(t, app, http.MethodPatch, "/api/v1/projects/"+projectID, map[string]string{"name": prefix + "Authorization Project Admin Updated"}), http.StatusOK, "admin project update")
}

func TestProjectMemberRoleLifecycleAndPermissions(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	createTestUser(t, app.db, prefix+"other.teacher@unitrack.local", "teacher12345", RoleTeacher, "Other Teacher")
	createTestUser(t, app.db, prefix+"admin@unitrack.local", "admin12345", RoleAdmin, "Admin")
	studentID := createTestUser(t, app.db, prefix+"student@unitrack.local", "student12345", RoleStudent, "Student")
	otherStudentID := createTestUser(t, app.db, prefix+"other.student@unitrack.local", "student12345", RoleStudent, "Other Student")
	nonMemberStudentID := createTestUser(t, app.db, prefix+"non.member.student@unitrack.local", "student12345", RoleStudent, "Non Member Student")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Member Role Project")
	addProjectMember(t, app.db, projectID, studentID)
	addProjectMember(t, app.db, projectID, otherStudentID)
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	login(t, app, prefix+"student@unitrack.local", "student12345")
	studentPromote := requestJSON(t, app, http.MethodPatch, "/api/v1/projects/"+projectID+"/members/"+studentID, map[string]string{"memberRole": "leader"})
	if studentPromote.StatusCode != http.StatusForbidden {
		t.Fatalf("student member role update status = %d", studentPromote.StatusCode)
	}

	login(t, app, prefix+"other.teacher@unitrack.local", "teacher12345")
	otherTeacherPromote := requestJSON(t, app, http.MethodPatch, "/api/v1/projects/"+projectID+"/members/"+studentID, map[string]string{"memberRole": "leader"})
	if otherTeacherPromote.StatusCode != http.StatusForbidden {
		t.Fatalf("other teacher member role update status = %d", otherTeacherPromote.StatusCode)
	}

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	invalidRole := requestJSON(t, app, http.MethodPatch, "/api/v1/projects/"+projectID+"/members/"+studentID, map[string]string{"memberRole": "owner"})
	if invalidRole.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid member role update status = %d", invalidRole.StatusCode)
	}
	nonMember := requestJSON(t, app, http.MethodPatch, "/api/v1/projects/"+projectID+"/members/"+nonMemberStudentID, map[string]string{"memberRole": "leader"})
	if nonMember.StatusCode != http.StatusNotFound {
		t.Fatalf("non-member role update status = %d", nonMember.StatusCode)
	}

	promoteStatus, promoteBody := requestJSONBody(t, app, http.MethodPatch, "/api/v1/projects/"+projectID+"/members/"+studentID, map[string]string{"memberRole": "leader"})
	if promoteStatus != http.StatusOK {
		t.Fatalf("promote member status = %d body = %s", promoteStatus, string(promoteBody))
	}
	var member ProjectMemberDTO
	if err := json.Unmarshal(promoteBody, &member); err != nil {
		t.Fatalf("decode promoted member: %v", err)
	}
	if member.ID != studentID || member.MemberRole != "leader" {
		t.Fatalf("promoted member = %#v", member)
	}

	status, body := requestJSONBody(t, app, http.MethodGet, "/api/v1/projects/"+projectID+"/members", nil)
	if status != http.StatusOK {
		t.Fatalf("list members after promote status = %d body = %s", status, string(body))
	}
	var members []ProjectMemberDTO
	if err := json.Unmarshal(body, &members); err != nil {
		t.Fatalf("decode members after promote: %v", err)
	}
	if len(members) != 2 || countProjectLeaders(members) != 1 {
		t.Fatalf("members after promote = %#v", members)
	}

	secondPromoteStatus, secondPromoteBody := requestJSONBody(t, app, http.MethodPatch, "/api/v1/projects/"+projectID+"/members/"+otherStudentID, map[string]string{"memberRole": "leader"})
	if secondPromoteStatus != http.StatusOK {
		t.Fatalf("second promote member status = %d body = %s", secondPromoteStatus, string(secondPromoteBody))
	}
	status, body = requestJSONBody(t, app, http.MethodGet, "/api/v1/projects/"+projectID+"/members", nil)
	if status != http.StatusOK {
		t.Fatalf("list members after second promote status = %d body = %s", status, string(body))
	}
	if err := json.Unmarshal(body, &members); err != nil {
		t.Fatalf("decode members after second promote: %v", err)
	}
	if countProjectLeaders(members) != 1 || memberRoleFor(members, otherStudentID) != "leader" || memberRoleFor(members, studentID) != "member" {
		t.Fatalf("members after second promote = %#v", members)
	}

	login(t, app, prefix+"admin@unitrack.local", "admin12345")
	demoteStatus, demoteBody := requestJSONBody(t, app, http.MethodPatch, "/api/v1/projects/"+projectID+"/members/"+otherStudentID, map[string]string{"memberRole": "member"})
	if demoteStatus != http.StatusOK {
		t.Fatalf("admin demote member status = %d body = %s", demoteStatus, string(demoteBody))
	}
	if err := json.Unmarshal(demoteBody, &member); err != nil {
		t.Fatalf("decode demoted member: %v", err)
	}
	if member.ID != otherStudentID || member.MemberRole != "member" {
		t.Fatalf("demoted member = %#v", member)
	}
}

func TestCreateProjectRejectsDirectMembers(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	studentID := createTestUser(t, app.db, prefix+"student@unitrack.local", "student12345", RoleStudent, "Student")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, "", prefix) })

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	projectName := prefix + "Member IDs Rejected Project"
	status, body := requestJSONBody(t, app, http.MethodPost, "/api/v1/projects", map[string]any{
		"name":      projectName,
		"memberIds": []string{studentID},
	})
	if status != http.StatusBadRequest {
		t.Fatalf("create project with memberIds status = %d body = %s", status, string(body))
	}

	var projectCount int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM projects WHERE name = $1`, projectName).Scan(&projectCount); err != nil {
		t.Fatalf("count direct-member projects: %v", err)
	}
	if projectCount != 0 {
		t.Fatalf("direct-member project count = %d, want 0", projectCount)
	}
	var membershipCount int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM project_members WHERE student_id = $1`, studentID).Scan(&membershipCount); err != nil {
		t.Fatalf("count direct memberships: %v", err)
	}
	if membershipCount != 0 {
		t.Fatalf("direct membership count = %d, want 0", membershipCount)
	}
}

func TestProjectCreationAllowsOptionalClass(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	otherTeacherID := createTestUser(t, app.db, prefix+"other.teacher@unitrack.local", "teacher12345", RoleTeacher, "Other Teacher")
	classID := createTestCourseSection(t, app.db, teacherID, prefix+"Project Class")
	archivedClassID := createTestCourseSection(t, app.db, teacherID, prefix+"Archived Project Class")
	otherClassID := createTestCourseSection(t, app.db, otherTeacherID, prefix+"Other Project Class")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, "", prefix) })
	if _, err := app.db.Exec(context.Background(), `UPDATE course_sections SET status = 'archived' WHERE id = $1`, archivedClassID); err != nil {
		t.Fatalf("archive class: %v", err)
	}

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	status, body := requestJSONBody(t, app, http.MethodPost, "/api/v1/projects", map[string]string{"name": prefix + "Standalone Project"})
	if status != http.StatusCreated {
		t.Fatalf("standalone project create status = %d body = %s", status, string(body))
	}
	var standalone ProjectDTO
	if err := json.Unmarshal(body, &standalone); err != nil {
		t.Fatalf("decode standalone project: %v", err)
	}
	if standalone.ClassID != nil || standalone.ClassTitle != nil || standalone.ClassColor != nil {
		t.Fatalf("standalone project has class context = classID:%v classTitle:%v classColor:%v", standalone.ClassID, standalone.ClassTitle, standalone.ClassColor)
	}
	var standaloneLinkedCount int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM course_section_projects WHERE project_id = $1`, standalone.ID).Scan(&standaloneLinkedCount); err != nil {
		t.Fatalf("count standalone class links: %v", err)
	}
	if standaloneLinkedCount != 0 {
		t.Fatalf("standalone class links = %d, want 0", standaloneLinkedCount)
	}
	otherClassProject := requestJSON(t, app, http.MethodPost, "/api/v1/projects", map[string]string{"name": prefix + "Other Class Project", "classId": otherClassID})
	if otherClassProject.StatusCode != http.StatusForbidden {
		t.Fatalf("other class project create status = %d", otherClassProject.StatusCode)
	}
	archivedClassProject := requestJSON(t, app, http.MethodPost, "/api/v1/projects", map[string]string{"name": prefix + "Archived Class Project", "classId": archivedClassID})
	if archivedClassProject.StatusCode != http.StatusForbidden {
		t.Fatalf("archived class project create status = %d", archivedClassProject.StatusCode)
	}

	status, body = requestJSONBody(t, app, http.MethodPost, "/api/v1/projects", map[string]string{"name": prefix + "Class Project", "classId": classID})
	if status != http.StatusCreated {
		t.Fatalf("class project create status = %d body = %s", status, string(body))
	}
	var project ProjectDTO
	if err := json.Unmarshal(body, &project); err != nil {
		t.Fatalf("decode class project: %v", err)
	}
	if project.ClassID == nil || *project.ClassID != classID || project.ClassTitle == nil || *project.ClassTitle != prefix+"Project Class" || project.ClassColor == nil || *project.ClassColor != "blue" {
		t.Fatalf("project class context = classID:%v classTitle:%v classColor:%v", project.ClassID, project.ClassTitle, project.ClassColor)
	}

	var linkedCount int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM course_section_projects WHERE course_section_id = $1 AND project_id = $2`, classID, project.ID).Scan(&linkedCount); err != nil {
		t.Fatalf("count class project link: %v", err)
	}
	if linkedCount != 1 {
		t.Fatalf("class project link count = %d, want 1", linkedCount)
	}

	status, body = requestJSONBody(t, app, http.MethodGet, "/api/v1/projects?unassigned=true&limit=100", nil)
	if status != http.StatusOK {
		t.Fatalf("unassigned project list status = %d body = %s", status, string(body))
	}
	var unassigned []ProjectDTO
	if err := json.Unmarshal(body, &unassigned); err != nil {
		t.Fatalf("decode unassigned projects: %v", err)
	}
	foundStandalone := false
	foundClassProject := false
	for _, item := range unassigned {
		if item.ID == standalone.ID {
			foundStandalone = true
		}
		if item.ID == project.ID {
			foundClassProject = true
		}
	}
	if !foundStandalone || foundClassProject {
		t.Fatalf("unassigned projects standalone=%v classProject=%v list=%#v", foundStandalone, foundClassProject, unassigned)
	}

	status, body = requestJSONBody(t, app, http.MethodGet, "/api/v1/classes/"+classID, nil)
	if status != http.StatusOK {
		t.Fatalf("class detail status = %d body = %s", status, string(body))
	}
	var detail CourseSectionDetailDTO
	if err := json.Unmarshal(body, &detail); err != nil {
		t.Fatalf("decode class detail: %v", err)
	}
	found := false
	for _, item := range detail.Projects {
		if item.ID == project.ID {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("class detail projects missing created project: %#v", detail.Projects)
	}
}

func TestCreateClassReportsUnknownRequestField(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, "", prefix) })

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	status, body := requestJSONBody(t, app, http.MethodPost, "/api/v1/classes", map[string]string{
		"title":   prefix + "Unknown Field Class",
		"classId": "not-accepted",
	})
	if status != http.StatusBadRequest {
		t.Fatalf("create class unknown field status = %d body = %s", status, string(body))
	}
	if !strings.Contains(string(body), `unknown request field \"classId\"`) {
		t.Fatalf("create class unknown field body = %s", string(body))
	}
}

func TestProjectUpdateCanChangeClass(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	createTestUser(t, app.db, prefix+"admin@unitrack.local", "admin12345", RoleAdmin, "Admin")
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	otherTeacherID := createTestUser(t, app.db, prefix+"other.teacher@unitrack.local", "teacher12345", RoleTeacher, "Other Teacher")
	sourceClassID := createTestCourseSection(t, app.db, teacherID, prefix+"Source Class")
	targetClassID := createTestCourseSection(t, app.db, teacherID, prefix+"Target Class")
	archivedClassID := createTestCourseSection(t, app.db, teacherID, prefix+"Archived Target Class")
	otherClassID := createTestCourseSection(t, app.db, otherTeacherID, prefix+"Other Class")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Movable Project")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })
	if _, err := app.db.Exec(context.Background(), `UPDATE course_sections SET status = 'archived' WHERE id = $1`, archivedClassID); err != nil {
		t.Fatalf("archive class: %v", err)
	}

	if _, err := app.db.Exec(context.Background(), `INSERT INTO course_section_projects (course_section_id, project_id, added_by) VALUES ($1, $2, $3)`, sourceClassID, projectID, teacherID); err != nil {
		t.Fatalf("link source class: %v", err)
	}

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	status, body := requestJSONBody(t, app, http.MethodPatch, "/api/v1/projects/"+projectID, map[string]string{"classId": targetClassID})
	if status != http.StatusOK {
		t.Fatalf("move project class status = %d body = %s", status, string(body))
	}
	var project ProjectDTO
	if err := json.Unmarshal(body, &project); err != nil {
		t.Fatalf("decode moved project: %v", err)
	}
	if project.ClassID == nil || *project.ClassID != targetClassID || project.ClassTitle == nil || *project.ClassTitle != prefix+"Target Class" {
		t.Fatalf("moved project class = id:%v title:%v", project.ClassID, project.ClassTitle)
	}

	assertProjectLinkedClass(t, app, projectID, targetClassID)

	archivedClassMove := requestJSON(t, app, http.MethodPatch, "/api/v1/projects/"+projectID, map[string]string{"classId": archivedClassID})
	if archivedClassMove.StatusCode != http.StatusForbidden {
		t.Fatalf("move to archived class status = %d", archivedClassMove.StatusCode)
	}
	assertProjectLinkedClass(t, app, projectID, targetClassID)

	otherClassMove := requestJSON(t, app, http.MethodPatch, "/api/v1/projects/"+projectID, map[string]string{"classId": otherClassID})
	if otherClassMove.StatusCode != http.StatusForbidden {
		t.Fatalf("move to other teacher class status = %d", otherClassMove.StatusCode)
	}
	assertProjectLinkedClass(t, app, projectID, targetClassID)

	login(t, app, prefix+"admin@unitrack.local", "admin12345")
	adminCrossOwnerMove := requestJSON(t, app, http.MethodPatch, "/api/v1/projects/"+projectID, map[string]string{"classId": otherClassID})
	if adminCrossOwnerMove.StatusCode != http.StatusBadRequest {
		t.Fatalf("admin cross-owner move status = %d", adminCrossOwnerMove.StatusCode)
	}
	assertProjectLinkedClass(t, app, projectID, targetClassID)

	status, body = requestJSONBody(t, app, http.MethodPatch, "/api/v1/projects/"+projectID, map[string]string{"classId": ""})
	if status != http.StatusOK {
		t.Fatalf("unlink class status = %d body = %s", status, string(body))
	}
	project = ProjectDTO{}
	if err := json.Unmarshal(body, &project); err != nil {
		t.Fatalf("decode unlinked project: %v", err)
	}
	if project.ClassID != nil || project.ClassTitle != nil || project.ClassColor != nil {
		t.Fatalf("unlinked project context = classID:%v classTitle:%v classColor:%v", project.ClassID, project.ClassTitle, project.ClassColor)
	}
	assertProjectLinkedClass(t, app, projectID, "")

	login(t, app, prefix+"other.teacher@unitrack.local", "teacher12345")
	unrelatedTeacherMove := requestJSON(t, app, http.MethodPatch, "/api/v1/projects/"+projectID, map[string]string{"classId": otherClassID})
	if unrelatedTeacherMove.StatusCode != http.StatusForbidden {
		t.Fatalf("unrelated teacher move status = %d", unrelatedTeacherMove.StatusCode)
	}
	assertProjectLinkedClass(t, app, projectID, "")
}

func TestProjectOverdueCountIgnoresLegacyChildTasks(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Overdue Count Project")
	officialTaskID := createTestTask(t, app.db, projectID, teacherID, "Official task")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	_, err := app.db.Exec(context.Background(), `
		INSERT INTO tasks (project_id, parent_task_id, title, deadline, created_by)
		VALUES ($1, $2, $3, $4, $5)
	`, projectID, officialTaskID, "Overdue child task", time.Now().AddDate(0, 0, -1), teacherID)
	if err != nil {
		t.Fatalf("create overdue child task: %v", err)
	}

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	status, body := requestJSONBody(t, app, http.MethodGet, "/api/v1/projects/"+projectID, nil)
	if status != http.StatusOK {
		t.Fatalf("project read status = %d body = %s", status, string(body))
	}
	var project ProjectDTO
	if err := json.Unmarshal(body, &project); err != nil {
		t.Fatalf("decode project: %v", err)
	}
	if project.OverdueTaskCount != 0 {
		t.Fatalf("overdue task count = %d, want 0", project.OverdueTaskCount)
	}
}

func TestOfficialTaskLifecycleValidationAndPermissions(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	studentID := createTestUser(t, app.db, prefix+"student@unitrack.local", "student12345", RoleStudent, "Student")
	nonMemberID := createTestUser(t, app.db, prefix+"nonmember@unitrack.local", "student12345", RoleStudent, "Non Member")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Official Task Project")
	milestoneID := createTestMilestone(t, app.db, projectID, teacherID, "Prototype checkpoint", 1)
	addProjectMember(t, app.db, projectID, studentID)
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	login(t, app, prefix+"student@unitrack.local", "student12345")
	studentCreate := requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/tasks", map[string]string{"title": "Student official task"})
	if studentCreate.StatusCode != http.StatusForbidden {
		t.Fatalf("student create official task status = %d", studentCreate.StatusCode)
	}

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	missingMilestone := requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/tasks", map[string]string{"title": "Missing milestone"})
	if missingMilestone.StatusCode != http.StatusBadRequest {
		t.Fatalf("missing milestone task status = %d", missingMilestone.StatusCode)
	}
	badDeadline := requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/tasks", map[string]string{"title": "Bad deadline", "deadline": "06/30/2026"})
	if badDeadline.StatusCode != http.StatusBadRequest {
		t.Fatalf("bad deadline task status = %d", badDeadline.StatusCode)
	}
	badAssignee := requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/tasks", map[string]any{"title": "Bad assignee", "assigneeIds": []string{nonMemberID}})
	if badAssignee.StatusCode != http.StatusBadRequest {
		t.Fatalf("bad assignee task status = %d", badAssignee.StatusCode)
	}

	createStatus, createBody := requestJSONBody(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/tasks", map[string]any{
		"title":       "Build prototype",
		"description": "Prepare demo evidence for review.",
		"status":      "in_progress",
		"priority":    "high",
		"deadline":    "2026-06-30",
		"milestoneId": milestoneID,
		"assigneeIds": []string{studentID},
	})
	if createStatus != http.StatusCreated {
		t.Fatalf("create official task status = %d body = %s", createStatus, string(createBody))
	}
	var created TaskDetailDTO
	if err := json.Unmarshal(createBody, &created); err != nil {
		t.Fatalf("decode created task: %v", err)
	}
	if created.Task.Title != "Build prototype" || created.Task.Description == nil || *created.Task.Description != "Prepare demo evidence for review." || created.Task.Status != "in_progress" || created.Task.Priority != "high" || created.Task.Deadline == nil || *created.Task.Deadline != "2026-06-30" || created.Task.MilestoneID == nil || *created.Task.MilestoneID != milestoneID || len(created.Task.Assignees) != 1 || created.Task.Assignees[0].ID != studentID {
		t.Fatalf("created official task = %#v", created.Task)
	}

	login(t, app, prefix+"student@unitrack.local", "student12345")
	studentUpdate := requestJSON(t, app, http.MethodPatch, "/api/v1/projects/"+projectID+"/tasks/"+created.Task.ID, map[string]string{"title": "Student update"})
	if studentUpdate.StatusCode != http.StatusForbidden {
		t.Fatalf("student update official task status = %d", studentUpdate.StatusCode)
	}

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	clearMilestone := requestJSON(t, app, http.MethodPatch, "/api/v1/projects/"+projectID+"/tasks/"+created.Task.ID, map[string]string{"milestoneId": ""})
	if clearMilestone.StatusCode != http.StatusBadRequest {
		t.Fatalf("clear milestone task status = %d", clearMilestone.StatusCode)
	}
	updateStatus, updateBody := requestJSONBody(t, app, http.MethodPatch, "/api/v1/projects/"+projectID+"/tasks/"+created.Task.ID, map[string]any{
		"title":       "Build prototype v2",
		"deadline":    "",
		"milestoneId": milestoneID,
		"assigneeIds": []string{},
	})
	if updateStatus != http.StatusOK {
		t.Fatalf("update official task status = %d body = %s", updateStatus, string(updateBody))
	}
	var updated TaskDetailDTO
	if err := json.Unmarshal(updateBody, &updated); err != nil {
		t.Fatalf("decode updated task: %v", err)
	}
	if updated.Task.Title != "Build prototype v2" || updated.Task.Deadline != nil || updated.Task.MilestoneID == nil || *updated.Task.MilestoneID != milestoneID || len(updated.Task.Assignees) != 0 {
		t.Fatalf("updated official task = %#v", updated.Task)
	}
}

func TestStudentProgressRequiresAssignedOfficialTask(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	studentID := createTestUser(t, app.db, prefix+"student@unitrack.local", "student12345", RoleStudent, "Student")
	otherStudentID := createTestUser(t, app.db, prefix+"other.student@unitrack.local", "student12345", RoleStudent, "Other Student")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Task Permission Project")
	addProjectMember(t, app.db, projectID, studentID)
	addProjectMember(t, app.db, projectID, otherStudentID)
	taskID := createTestTask(t, app.db, projectID, teacherID, "Official task")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	login(t, app, prefix+"student@unitrack.local", "student12345")
	progressBody := map[string]string{"description": "Progress from student"}
	unassigned := requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/tasks/"+taskID+"/progress-updates", progressBody)
	if unassigned.StatusCode != http.StatusForbidden {
		t.Fatalf("unassigned progress status = %d", unassigned.StatusCode)
	}

	assignTask(t, app.db, taskID, studentID)
	assigned := requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/tasks/"+taskID+"/progress-updates", progressBody)
	if assigned.StatusCode != http.StatusCreated {
		t.Fatalf("assigned progress status = %d", assigned.StatusCode)
	}
	duplicatePending := requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/tasks/"+taskID+"/progress-updates", progressBody)
	if duplicatePending.StatusCode != http.StatusConflict {
		t.Fatalf("duplicate pending progress status = %d", duplicatePending.StatusCode)
	}
	var officialTaskStatus string
	if err := app.db.QueryRow(context.Background(), `SELECT status FROM tasks WHERE id = $1`, taskID).Scan(&officialTaskStatus); err != nil {
		t.Fatalf("load official task status after progress: %v", err)
	}
	if officialTaskStatus != "submitted" {
		t.Fatalf("official task status after progress = %s, want submitted", officialTaskStatus)
	}
	if _, err := app.db.Exec(context.Background(), `UPDATE tasks SET status = 'done', official_progress_state = 'completed' WHERE id = $1`, taskID); err != nil {
		t.Fatalf("mark official task completed: %v", err)
	}
	completedSubmission := requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/tasks/"+taskID+"/progress-updates", progressBody)
	if completedSubmission.StatusCode != http.StatusConflict {
		t.Fatalf("completed task progress status = %d", completedSubmission.StatusCode)
	}
}

func TestProgressReviewRejectsContradictionsAndDuplicateReviews(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	studentID := createTestUser(t, app.db, prefix+"student@unitrack.local", "student12345", RoleStudent, "Student")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Review Project")
	addProjectMember(t, app.db, projectID, studentID)
	taskID := createTestTask(t, app.db, projectID, teacherID, "Official task")
	assignTask(t, app.db, taskID, studentID)
	updateID := createTestProgressUpdate(t, app.db, projectID, taskID, studentID, "Ready for review")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	badReview := requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/progress-updates/"+updateID+"/reviews", map[string]string{
		"reviewStatus":          "approved",
		"reviewComment":         "Contradictory decision",
		"officialProgressState": "needs_changes",
	})
	if badReview.StatusCode != http.StatusBadRequest {
		t.Fatalf("contradictory review status = %d", badReview.StatusCode)
	}

	goodReviewBody := map[string]string{
		"reviewStatus":          "approved",
		"reviewComment":         "Looks good",
		"officialProgressState": "completed",
	}
	firstReview := requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/progress-updates/"+updateID+"/reviews", goodReviewBody)
	if firstReview.StatusCode != http.StatusOK {
		t.Fatalf("first review status = %d", firstReview.StatusCode)
	}
	secondReview := requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/progress-updates/"+updateID+"/reviews", goodReviewBody)
	if secondReview.StatusCode != http.StatusConflict {
		t.Fatalf("second review status = %d", secondReview.StatusCode)
	}

	var reviewCount int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM progress_reviews WHERE progress_update_id = $1`, updateID).Scan(&reviewCount); err != nil {
		t.Fatalf("count progress reviews: %v", err)
	}
	if reviewCount != 1 {
		t.Fatalf("progress review count = %d, want 1", reviewCount)
	}
	var taskStatus string
	if err := app.db.QueryRow(context.Background(), `SELECT status FROM tasks WHERE id = $1`, taskID).Scan(&taskStatus); err != nil {
		t.Fatalf("load task status after review: %v", err)
	}
	if taskStatus != "done" {
		t.Fatalf("task status after completed review = %s, want done", taskStatus)
	}

	status, body := requestJSONBody(t, app, http.MethodGet, "/api/v1/projects/"+projectID, nil)
	if status != http.StatusOK {
		t.Fatalf("project read status = %d body = %s", status, string(body))
	}
	var project ProjectDTO
	if err := json.Unmarshal(body, &project); err != nil {
		t.Fatalf("decode project: %v", err)
	}
	if project.OfficialProgressState != "completed" || project.PlannedProgressPercent != 100 {
		t.Fatalf("project progress = %s/%d, want completed/100", project.OfficialProgressState, project.PlannedProgressPercent)
	}
}

func TestProgressEvidenceFileLifecycleAndPermissions(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	studentID := createTestUser(t, app.db, prefix+"student@unitrack.local", "student12345", RoleStudent, "Student")
	otherStudentID := createTestUser(t, app.db, prefix+"other.student@unitrack.local", "student12345", RoleStudent, "Other Student")
	nonMemberID := createTestUser(t, app.db, prefix+"nonmember@unitrack.local", "student12345", RoleStudent, "Non Member")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Evidence Project")
	addProjectMember(t, app.db, projectID, studentID)
	addProjectMember(t, app.db, projectID, otherStudentID)
	taskID := createTestTask(t, app.db, projectID, teacherID, "Official task")
	assignTask(t, app.db, taskID, studentID)
	updateID := createTestProgressUpdate(t, app.db, projectID, taskID, studentID, "Ready for evidence")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	login(t, app, prefix+"other.student@unitrack.local", "student12345")
	forbiddenUploadStatus, _ := requestMultipartFile(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/progress-updates/"+updateID+"/files", "file", "wrong.txt", []byte("wrong student evidence"))
	if forbiddenUploadStatus != http.StatusForbidden {
		t.Fatalf("wrong student evidence upload status = %d", forbiddenUploadStatus)
	}

	login(t, app, prefix+"student@unitrack.local", "student12345")
	uploadStatus, uploadBody := requestMultipartFile(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/progress-updates/"+updateID+"/files", "file", "demo evidence.txt", []byte("demo evidence"))
	if uploadStatus != http.StatusCreated {
		t.Fatalf("evidence upload status = %d body = %s", uploadStatus, string(uploadBody))
	}
	var uploaded UploadedFileDTO
	if err := json.Unmarshal(uploadBody, &uploaded); err != nil {
		t.Fatalf("decode uploaded file: %v", err)
	}
	if uploaded.ProjectID != projectID || uploaded.RelatedType != "progress_update" || uploaded.RelatedID != updateID || uploaded.OriginalFileName != "demo evidence.txt" || uploaded.FileSizeBytes != int64(len("demo evidence")) || uploaded.UploadedBy != studentID {
		t.Fatalf("uploaded file = %#v", uploaded)
	}

	var storagePath string
	if err := app.db.QueryRow(context.Background(), `SELECT storage_path FROM uploaded_files WHERE id = $1`, uploaded.ID).Scan(&storagePath); err != nil {
		t.Fatalf("load storage path: %v", err)
	}
	if _, err := os.Stat(storagePath); err != nil {
		t.Fatalf("stored file missing: %v", err)
	}

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	listStatus, listBody := requestJSONBody(t, app, http.MethodGet, "/api/v1/projects/"+projectID+"/files", nil)
	if listStatus != http.StatusOK {
		t.Fatalf("list files status = %d body = %s", listStatus, string(listBody))
	}
	var files []UploadedFileDTO
	if err := json.Unmarshal(listBody, &files); err != nil {
		t.Fatalf("decode files: %v", err)
	}
	if len(files) != 1 || files[0].ID != uploaded.ID {
		t.Fatalf("project files = %#v", files)
	}
	downloadStatus, downloadBody := requestJSONBody(t, app, http.MethodGet, "/api/v1/projects/"+projectID+"/files/"+uploaded.ID+"/download", nil)
	if downloadStatus != http.StatusOK || string(downloadBody) != "demo evidence" {
		t.Fatalf("download status = %d body = %q", downloadStatus, string(downloadBody))
	}

	login(t, app, prefix+"nonmember@unitrack.local", "student12345")
	nonMemberDownload := requestJSON(t, app, http.MethodGet, "/api/v1/projects/"+projectID+"/files/"+uploaded.ID+"/download", nil)
	if nonMemberDownload.StatusCode != http.StatusForbidden {
		t.Fatalf("non-member download status = %d", nonMemberDownload.StatusCode)
	}
	var nonMemberFileRows int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM uploaded_files WHERE uploaded_by = $1`, nonMemberID).Scan(&nonMemberFileRows); err != nil {
		t.Fatalf("count non-member files: %v", err)
	}
	if nonMemberFileRows != 0 {
		t.Fatalf("non-member uploaded files = %d, want 0", nonMemberFileRows)
	}

	login(t, app, prefix+"other.student@unitrack.local", "student12345")
	forbiddenDelete := requestJSON(t, app, http.MethodDelete, "/api/v1/projects/"+projectID+"/files/"+uploaded.ID, nil)
	if forbiddenDelete.StatusCode != http.StatusForbidden {
		t.Fatalf("wrong student evidence delete status = %d", forbiddenDelete.StatusCode)
	}

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	deleteFile := requestJSON(t, app, http.MethodDelete, "/api/v1/projects/"+projectID+"/files/"+uploaded.ID, nil)
	if deleteFile.StatusCode != http.StatusOK {
		t.Fatalf("delete evidence status = %d", deleteFile.StatusCode)
	}
	var fileCount int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM uploaded_files WHERE id = $1`, uploaded.ID).Scan(&fileCount); err != nil {
		t.Fatalf("count uploaded files: %v", err)
	}
	if fileCount != 0 {
		t.Fatalf("uploaded file count = %d, want 0", fileCount)
	}
	if _, err := os.Stat(storagePath); !os.IsNotExist(err) {
		t.Fatalf("stored file still exists or stat failed unexpectedly: %v", err)
	}
}

func TestMilestoneRollupAndTaskAssignment(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Milestone Project")
	otherProjectID := createTestProject(t, app.db, teacherID, prefix+"Other Milestone Project")
	milestoneID := createTestMilestone(t, app.db, projectID, teacherID, "Prototype checkpoint", 1)
	completedMilestoneID := createTestMilestone(t, app.db, projectID, teacherID, "Report checkpoint", 2)
	otherMilestoneID := createTestMilestone(t, app.db, otherProjectID, teacherID, "Other checkpoint", 1)
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, "", prefix) })

	taskA := createTestTaskInMilestone(t, app.db, projectID, teacherID, milestoneID, "Build prototype")
	taskB := createTestTaskInMilestone(t, app.db, projectID, teacherID, milestoneID, "Test prototype")
	taskC := createTestTaskInMilestone(t, app.db, projectID, teacherID, completedMilestoneID, "Submit report")
	if _, err := app.db.Exec(context.Background(), `UPDATE tasks SET official_progress_state = 'completed' WHERE id IN ($1, $2)`, taskA, taskC); err != nil {
		t.Fatalf("mark completed tasks: %v", err)
	}
	if _, err := app.db.Exec(context.Background(), `UPDATE tasks SET official_progress_state = 'in_progress' WHERE id = $1`, taskB); err != nil {
		t.Fatalf("mark in-progress task: %v", err)
	}

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	badTask := requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/tasks", map[string]string{"title": "Wrong milestone", "milestoneId": otherMilestoneID})
	if badTask.StatusCode != http.StatusBadRequest {
		t.Fatalf("cross-project milestone task status = %d", badTask.StatusCode)
	}

	status, body := requestJSONBody(t, app, http.MethodGet, "/api/v1/projects/"+projectID+"/milestones", nil)
	if status != http.StatusOK {
		t.Fatalf("milestones status = %d body = %s", status, string(body))
	}
	var milestones []MilestoneDTO
	if err := json.Unmarshal(body, &milestones); err != nil {
		t.Fatalf("decode milestones: %v", err)
	}
	if len(milestones) != 2 {
		t.Fatalf("milestone count = %d, want 2", len(milestones))
	}
	if milestones[0].State != "in_progress" || milestones[0].CompletionPercent != 50 {
		t.Fatalf("first milestone state = %s/%d, want in_progress/50", milestones[0].State, milestones[0].CompletionPercent)
	}
	if milestones[1].State != "completed" || milestones[1].CompletionPercent != 100 {
		t.Fatalf("second milestone state = %s/%d, want completed/100", milestones[1].State, milestones[1].CompletionPercent)
	}

	status, body = requestJSONBody(t, app, http.MethodGet, "/api/v1/projects/"+projectID, nil)
	if status != http.StatusOK {
		t.Fatalf("project status = %d body = %s", status, string(body))
	}
	var project ProjectDTO
	if err := json.Unmarshal(body, &project); err != nil {
		t.Fatalf("decode project: %v", err)
	}
	if project.MilestoneCount != 2 || project.CompletedMilestoneCount != 1 || project.PlannedProgressPercent != 50 {
		t.Fatalf("project milestone rollup = %d/%d/%d, want 2/1/50", project.MilestoneCount, project.CompletedMilestoneCount, project.PlannedProgressPercent)
	}
	if project.OfficialProgressState != "in_progress" {
		t.Fatalf("project official progress = %s, want in_progress", project.OfficialProgressState)
	}

	deleteMilestone := requestJSON(t, app, http.MethodDelete, "/api/v1/projects/"+projectID+"/milestones/"+milestoneID, nil)
	if deleteMilestone.StatusCode != http.StatusConflict {
		t.Fatalf("delete milestone with assignments status = %d", deleteMilestone.StatusCode)
	}

	emptyMilestoneID := createTestMilestone(t, app.db, projectID, teacherID, "Empty checkpoint", 3)
	if _, err := app.db.Exec(context.Background(), `INSERT INTO resource_links (project_id, related_entity_type, related_entity_id, title, url, added_by) VALUES ($1, 'milestone', $2, 'Checkpoint notes', 'https://example.com/checkpoint-notes', $3)`, projectID, emptyMilestoneID, teacherID); err != nil {
		t.Fatalf("create milestone resource: %v", err)
	}

	deleteEmptyMilestone := requestJSON(t, app, http.MethodDelete, "/api/v1/projects/"+projectID+"/milestones/"+emptyMilestoneID, nil)
	if deleteEmptyMilestone.StatusCode != http.StatusOK {
		t.Fatalf("delete empty milestone status = %d", deleteEmptyMilestone.StatusCode)
	}
	var milestoneResourceCount int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM resource_links WHERE project_id = $1 AND related_entity_type = 'milestone' AND related_entity_id = $2`, projectID, emptyMilestoneID).Scan(&milestoneResourceCount); err != nil {
		t.Fatalf("count milestone resources: %v", err)
	}
	if milestoneResourceCount != 0 {
		t.Fatalf("milestone resources = %d, want 0", milestoneResourceCount)
	}

	status, body = requestJSONBody(t, app, http.MethodGet, "/api/v1/projects/"+projectID, nil)
	if status != http.StatusOK {
		t.Fatalf("project after delete status = %d body = %s", status, string(body))
	}
	if err := json.Unmarshal(body, &project); err != nil {
		t.Fatalf("decode project after delete: %v", err)
	}
	if project.MilestoneCount != 2 || project.CompletedMilestoneCount != 1 || project.PlannedProgressPercent != 50 {
		t.Fatalf("project milestone rollup after delete = %d/%d/%d, want 2/1/50", project.MilestoneCount, project.CompletedMilestoneCount, project.PlannedProgressPercent)
	}
}

func TestResourceLinksLifecycleAndOwnership(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	studentID := createTestUser(t, app.db, prefix+"student@unitrack.local", "student12345", RoleStudent, "Student")
	createTestUser(t, app.db, prefix+"other.student@unitrack.local", "student12345", RoleStudent, "Other Student")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Resource Link Project")
	taskID := createTestTask(t, app.db, projectID, teacherID, "Official task")
	addProjectMember(t, app.db, projectID, studentID)
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	projectResourceStatus, projectResourceBody := requestJSONBody(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/resource-links", map[string]string{
		"title": "Project brief",
		"url":   "https://example.com/project-brief",
	})
	if projectResourceStatus != http.StatusCreated {
		t.Fatalf("teacher create resource status = %d body = %s", projectResourceStatus, string(projectResourceBody))
	}
	var projectResource ResourceLinkDTO
	if err := json.Unmarshal(projectResourceBody, &projectResource); err != nil {
		t.Fatalf("decode project resource: %v", err)
	}
	if projectResource.RelatedType != "project" || projectResource.RelatedID != projectID || projectResource.AddedBy != teacherID {
		t.Fatalf("project resource = %#v", projectResource)
	}
	login(t, app, prefix+"student@unitrack.local", "student12345")
	studentResourceStatus, studentResourceBody := requestJSONBody(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/resource-links", map[string]string{
		"relatedType": "task",
		"relatedId":   taskID,
		"title":       "Repository",
		"url":         "https://github.com/unitrack/example",
		"type":        "github",
	})
	if studentResourceStatus != http.StatusCreated {
		t.Fatalf("student create resource status = %d body = %s", studentResourceStatus, string(studentResourceBody))
	}
	var studentResource ResourceLinkDTO
	if err := json.Unmarshal(studentResourceBody, &studentResource); err != nil {
		t.Fatalf("decode student resource: %v", err)
	}
	if studentResource.RelatedType != "task" || studentResource.RelatedID != taskID || studentResource.Type != "github" || studentResource.AddedBy != studentID {
		t.Fatalf("student resource = %#v", studentResource)
	}

	duplicate := requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/resource-links", map[string]string{
		"relatedType": "task",
		"relatedId":   taskID,
		"title":       "Duplicate repository",
		"url":         "https://github.com/unitrack/example",
	})
	if duplicate.StatusCode != http.StatusConflict {
		t.Fatalf("duplicate resource status = %d", duplicate.StatusCode)
	}

	listStatus, listBody := requestJSONBody(t, app, http.MethodGet, "/api/v1/projects/"+projectID+"/resource-links", nil)
	if listStatus != http.StatusOK {
		t.Fatalf("list resources status = %d body = %s", listStatus, string(listBody))
	}
	var resources []ResourceLinkDTO
	if err := json.Unmarshal(listBody, &resources); err != nil {
		t.Fatalf("decode resources: %v", err)
	}
	if len(resources) != 2 {
		t.Fatalf("resource count = %d, want 2", len(resources))
	}

	updateOwn := requestJSON(t, app, http.MethodPatch, "/api/v1/projects/"+projectID+"/resource-links/"+studentResource.ID, map[string]string{"title": "Updated repository"})
	if updateOwn.StatusCode != http.StatusOK {
		t.Fatalf("student update own resource status = %d", updateOwn.StatusCode)
	}
	updateTeacherResource := requestJSON(t, app, http.MethodPatch, "/api/v1/projects/"+projectID+"/resource-links/"+projectResource.ID, map[string]string{"title": "Student edit attempt"})
	if updateTeacherResource.StatusCode != http.StatusForbidden {
		t.Fatalf("student update teacher resource status = %d", updateTeacherResource.StatusCode)
	}
	deleteTeacherResource := requestJSON(t, app, http.MethodDelete, "/api/v1/projects/"+projectID+"/resource-links/"+projectResource.ID, nil)
	if deleteTeacherResource.StatusCode != http.StatusForbidden {
		t.Fatalf("student delete teacher resource status = %d", deleteTeacherResource.StatusCode)
	}

	login(t, app, prefix+"other.student@unitrack.local", "student12345")
	otherList := requestJSON(t, app, http.MethodGet, "/api/v1/projects/"+projectID+"/resource-links", nil)
	if otherList.StatusCode != http.StatusForbidden {
		t.Fatalf("non-member list resources status = %d", otherList.StatusCode)
	}

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	deleteStudentResource := requestJSON(t, app, http.MethodDelete, "/api/v1/projects/"+projectID+"/resource-links/"+studentResource.ID, nil)
	if deleteStudentResource.StatusCode != http.StatusOK {
		t.Fatalf("teacher delete student resource status = %d", deleteStudentResource.StatusCode)
	}
}

func TestResourceLinkTargetAndURLValidation(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	studentID := createTestUser(t, app.db, prefix+"student@unitrack.local", "student12345", RoleStudent, "Student")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Resource Validation Project")
	otherProjectID := createTestProject(t, app.db, teacherID, prefix+"Other Resource Validation Project")
	otherMilestoneID := createTestMilestone(t, app.db, otherProjectID, teacherID, "Other checkpoint", 1)
	otherTaskID := createTestTask(t, app.db, otherProjectID, teacherID, "Other task")
	otherUpdateID := createTestProgressUpdate(t, app.db, otherProjectID, otherTaskID, studentID, "Other project progress")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, "", prefix) })

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	invalidURL := requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/resource-links", map[string]string{
		"title": "Invalid URL",
		"url":   "ftp://example.com/file",
	})
	if invalidURL.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid URL resource status = %d", invalidURL.StatusCode)
	}

	badMilestone := requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/resource-links", map[string]string{
		"relatedType": "milestone",
		"relatedId":   otherMilestoneID,
		"title":       "Wrong milestone",
		"url":         "https://example.com/wrong-milestone",
	})
	if badMilestone.StatusCode != http.StatusBadRequest {
		t.Fatalf("cross-project milestone resource status = %d", badMilestone.StatusCode)
	}

	badTask := requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/resource-links", map[string]string{
		"relatedType": "task",
		"relatedId":   otherTaskID,
		"title":       "Wrong task",
		"url":         "https://example.com/wrong-task",
	})
	if badTask.StatusCode != http.StatusBadRequest {
		t.Fatalf("cross-project task resource status = %d", badTask.StatusCode)
	}

	badProgress := requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/resource-links", map[string]string{
		"relatedType": "progress_update",
		"relatedId":   otherUpdateID,
		"title":       "Wrong progress",
		"url":         "https://example.com/wrong-progress",
	})
	if badProgress.StatusCode != http.StatusBadRequest {
		t.Fatalf("cross-project progress resource status = %d", badProgress.StatusCode)
	}

}

func TestTeacherCanRemoveProjectMember(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	studentID := createTestUser(t, app.db, prefix+"student@unitrack.local", "student12345", RoleStudent, "Student")
	otherStudentID := createTestUser(t, app.db, prefix+"other.student@unitrack.local", "student12345", RoleStudent, "Other Student")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Member Removal Project")
	addProjectMember(t, app.db, projectID, studentID)
	addProjectMember(t, app.db, projectID, otherStudentID)
	taskID := createTestTask(t, app.db, projectID, teacherID, "Assigned task")
	assignTask(t, app.db, taskID, studentID)
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	login(t, app, prefix+"other.student@unitrack.local", "student12345")
	studentRemove := requestJSON(t, app, http.MethodDelete, "/api/v1/projects/"+projectID+"/members/"+studentID, nil)
	if studentRemove.StatusCode != http.StatusForbidden {
		t.Fatalf("student remove member status = %d", studentRemove.StatusCode)
	}

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	removeSupervisor := requestJSON(t, app, http.MethodDelete, "/api/v1/projects/"+projectID+"/members/"+teacherID, nil)
	if removeSupervisor.StatusCode != http.StatusBadRequest {
		t.Fatalf("remove supervisor status = %d", removeSupervisor.StatusCode)
	}
	removeStudent := requestJSON(t, app, http.MethodDelete, "/api/v1/projects/"+projectID+"/members/"+studentID, nil)
	if removeStudent.StatusCode != http.StatusOK {
		t.Fatalf("remove student status = %d", removeStudent.StatusCode)
	}

	var membershipCount int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM project_members WHERE project_id = $1 AND student_id = $2`, projectID, studentID).Scan(&membershipCount); err != nil {
		t.Fatalf("count membership: %v", err)
	}
	if membershipCount != 0 {
		t.Fatalf("removed membership count = %d, want 0", membershipCount)
	}
	var assignmentCount int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM task_assignees WHERE task_id = $1 AND student_id = $2`, taskID, studentID).Scan(&assignmentCount); err != nil {
		t.Fatalf("count assignment: %v", err)
	}
	if assignmentCount != 0 {
		t.Fatalf("removed assignment count = %d, want 0", assignmentCount)
	}
}

func TestCourseSectionRoutesEnforceTeacherOwnership(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	otherTeacherID := createTestUser(t, app.db, prefix+"other.teacher@unitrack.local", "teacher12345", RoleTeacher, "Other Teacher")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Class Project")
	otherProjectID := createTestProject(t, app.db, otherTeacherID, prefix+"Other Class Project")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	classTitle := prefix + "Folder Class"
	created := requestJSON(t, app, http.MethodPost, "/api/v1/classes", map[string]string{
		"title":       classTitle,
		"color":       "teal",
		"description": "Folder-based class",
	})
	if created.StatusCode != http.StatusCreated {
		t.Fatalf("create class status = %d", created.StatusCode)
	}
	movedTarget := requestJSON(t, app, http.MethodPost, "/api/v1/classes", map[string]string{"title": prefix + "Move Target Folder", "color": "amber"})
	if movedTarget.StatusCode != http.StatusCreated {
		t.Fatalf("create move target class status = %d", movedTarget.StatusCode)
	}
	invalidColor := requestJSON(t, app, http.MethodPost, "/api/v1/classes", map[string]string{"title": prefix + "Invalid Color Folder", "color": "neon"})
	if invalidColor.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid color class status = %d", invalidColor.StatusCode)
	}

	var classID string
	if err := app.db.QueryRow(context.Background(), `SELECT id::text FROM course_sections WHERE title = $1`, classTitle).Scan(&classID); err != nil {
		t.Fatalf("load created class: %v", err)
	}
	var moveTargetClassID string
	if err := app.db.QueryRow(context.Background(), `SELECT id::text FROM course_sections WHERE title = $1`, prefix+"Move Target Folder").Scan(&moveTargetClassID); err != nil {
		t.Fatalf("load move target class: %v", err)
	}

	linked := requestJSON(t, app, http.MethodPost, "/api/v1/classes/"+classID+"/projects", map[string]string{"projectId": projectID})
	if linked.StatusCode != http.StatusOK {
		t.Fatalf("link owned project status = %d", linked.StatusCode)
	}
	moved := requestJSON(t, app, http.MethodPost, "/api/v1/classes/"+moveTargetClassID+"/projects", map[string]string{"projectId": projectID})
	if moved.StatusCode != http.StatusOK {
		t.Fatalf("move linked project through class endpoint status = %d", moved.StatusCode)
	}
	assertProjectLinkedClass(t, app, projectID, moveTargetClassID)
	otherLink := requestJSON(t, app, http.MethodPost, "/api/v1/classes/"+classID+"/projects", map[string]string{"projectId": otherProjectID})
	if otherLink.StatusCode != http.StatusForbidden {
		t.Fatalf("link other teacher project status = %d", otherLink.StatusCode)
	}

	login(t, app, prefix+"other.teacher@unitrack.local", "teacher12345")
	otherTeacherRead := requestJSON(t, app, http.MethodGet, "/api/v1/classes/"+classID, map[string]string{})
	if otherTeacherRead.StatusCode != http.StatusForbidden {
		t.Fatalf("other teacher class read status = %d", otherTeacherRead.StatusCode)
	}
}

func assertStatus(t *testing.T, response *http.Response, expected int, label string) {
	t.Helper()
	if response.StatusCode != expected {
		t.Fatalf("%s status = %d, want %d", label, response.StatusCode, expected)
	}
}

func assertProjectList(t *testing.T, app *testApp, mustContain []string, mustNotContain []string) {
	t.Helper()
	status, body := requestJSONBody(t, app, http.MethodGet, "/api/v1/projects", nil)
	if status != http.StatusOK {
		t.Fatalf("project list status = %d body = %s", status, string(body))
	}

	var projects []ProjectDTO
	if err := json.Unmarshal(body, &projects); err != nil {
		t.Fatalf("decode project list: %v", err)
	}
	seen := map[string]bool{}
	for _, project := range projects {
		seen[project.ID] = true
	}
	for _, projectID := range mustContain {
		if !seen[projectID] {
			t.Fatalf("project list missing %s: %#v", projectID, projects)
		}
	}
	for _, projectID := range mustNotContain {
		if seen[projectID] {
			t.Fatalf("project list unexpectedly included %s: %#v", projectID, projects)
		}
	}
}

func assertProjectLinkedClass(t *testing.T, app *testApp, projectID string, classID string) {
	t.Helper()
	if classID == "" {
		var count int
		if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM course_section_projects WHERE project_id = $1`, projectID).Scan(&count); err != nil {
			t.Fatalf("count linked classes: %v", err)
		}
		if count != 0 {
			t.Fatalf("linked classes = %d, want 0", count)
		}
		return
	}
	var linkedClassID string
	if err := app.db.QueryRow(context.Background(), `SELECT course_section_id::text FROM course_section_projects WHERE project_id = $1`, projectID).Scan(&linkedClassID); err != nil {
		t.Fatalf("load linked class: %v", err)
	}
	if linkedClassID != classID {
		t.Fatalf("linked class = %s, want %s", linkedClassID, classID)
	}
}

func testPrefix() string {
	return "test" + time.Now().Format("20060102150405.000000") + "."
}

func createTestUser(t *testing.T, db *pgxpool.Pool, email string, password string, role string, fullName string) string {
	t.Helper()
	return createTestUserWithStatus(t, db, email, password, role, fullName, "active")
}

func createTestUserWithStatus(t *testing.T, db *pgxpool.Pool, email string, password string, role string, fullName string, status string) string {
	t.Helper()
	hash, err := hashPassword(password)
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	var id string
	if err := db.QueryRow(context.Background(), `INSERT INTO users (email, full_name, password_hash, role, status) VALUES ($1, $2, $3, $4, $5) RETURNING id::text`, strings.ToLower(email), fullName, hash, role, status).Scan(&id); err != nil {
		t.Fatalf("create user: %v", err)
	}
	return id
}

func createTestProject(t *testing.T, db *pgxpool.Pool, teacherID string, name string) string {
	t.Helper()
	var id string
	if err := db.QueryRow(context.Background(), `INSERT INTO projects (name, supervisor_id, created_by) VALUES ($1, $2, $2) RETURNING id::text`, name, teacherID).Scan(&id); err != nil {
		t.Fatalf("create project: %v", err)
	}
	return id
}

func createTestCourse(t *testing.T, db *pgxpool.Pool, createdBy string, code string, title string) string {
	t.Helper()
	var id string
	if err := db.QueryRow(context.Background(), `INSERT INTO courses (code, title, created_by) VALUES ($1, $2, $3) RETURNING id::text`, code, title, createdBy).Scan(&id); err != nil {
		t.Fatalf("create course: %v", err)
	}
	return id
}

func createTestCourseSection(t *testing.T, db *pgxpool.Pool, ownerTeacherID string, title string) string {
	t.Helper()
	var id string
	if err := db.QueryRow(context.Background(), `INSERT INTO course_sections (title, color, owner_teacher_id, created_by) VALUES ($1, 'blue', $2, $2) RETURNING id::text`, title, ownerTeacherID).Scan(&id); err != nil {
		t.Fatalf("create class: %v", err)
	}
	return id
}

func addProjectMember(t *testing.T, db *pgxpool.Pool, projectID string, studentID string) {
	t.Helper()
	if _, err := db.Exec(context.Background(), `INSERT INTO project_members (project_id, student_id) VALUES ($1, $2)`, projectID, studentID); err != nil {
		t.Fatalf("add member: %v", err)
	}
}

func countProjectLeaders(members []ProjectMemberDTO) int {
	leaders := 0
	for _, member := range members {
		if member.MemberRole == "leader" {
			leaders++
		}
	}
	return leaders
}

func memberRoleFor(members []ProjectMemberDTO, memberID string) string {
	for _, member := range members {
		if member.ID == memberID {
			return member.MemberRole
		}
	}
	return ""
}

func createTestTask(t *testing.T, db *pgxpool.Pool, projectID string, teacherID string, title string) string {
	t.Helper()
	milestoneID := createTestMilestone(t, db, projectID, teacherID, title+" milestone", 1)
	return createTestTaskInMilestone(t, db, projectID, teacherID, milestoneID, title)
}

func createTestTaskInMilestone(t *testing.T, db *pgxpool.Pool, projectID string, teacherID string, milestoneID string, title string) string {
	t.Helper()
	var id string
	if err := db.QueryRow(context.Background(), `INSERT INTO tasks (project_id, milestone_id, title, created_by) VALUES ($1, $2, $3, $4) RETURNING id::text`, projectID, milestoneID, title, teacherID).Scan(&id); err != nil {
		t.Fatalf("create milestone task: %v", err)
	}
	return id
}

func createTestMilestone(t *testing.T, db *pgxpool.Pool, projectID string, teacherID string, title string, sortOrder int) string {
	t.Helper()
	var id string
	if err := db.QueryRow(context.Background(), `INSERT INTO project_milestones (project_id, title, sort_order, created_by) VALUES ($1, $2, $3, $4) RETURNING id::text`, projectID, title, sortOrder, teacherID).Scan(&id); err != nil {
		t.Fatalf("create milestone: %v", err)
	}
	return id
}

func assignTask(t *testing.T, db *pgxpool.Pool, taskID string, studentID string) {
	t.Helper()
	if _, err := db.Exec(context.Background(), `INSERT INTO task_assignees (task_id, student_id) VALUES ($1, $2)`, taskID, studentID); err != nil {
		t.Fatalf("assign task: %v", err)
	}
}

func createTestProgressUpdate(t *testing.T, db *pgxpool.Pool, projectID string, taskID string, studentID string, description string) string {
	t.Helper()
	var id string
	if err := db.QueryRow(context.Background(), `INSERT INTO progress_updates (project_id, task_id, submitted_by, description) VALUES ($1, $2, $3, $4) RETURNING id::text`, projectID, taskID, studentID, description).Scan(&id); err != nil {
		t.Fatalf("create progress update: %v", err)
	}
	return id
}

func login(t *testing.T, app *testApp, email string, password string) {
	t.Helper()
	response := requestJSON(t, app, http.MethodPost, "/api/v1/auth/login", map[string]string{"email": email, "password": password})
	if response.StatusCode != http.StatusOK {
		t.Fatalf("login status = %d", response.StatusCode)
	}
}

func requestJSON(t *testing.T, app *testApp, method string, path string, payload any) *http.Response {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	request, err := http.NewRequest(method, app.server.URL+path, bytes.NewReader(body))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := app.client.Do(request)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	defer response.Body.Close()
	return response
}

func requestJSONBody(t *testing.T, app *testApp, method string, path string, payload any) (int, []byte) {
	t.Helper()
	var bodyReader *bytes.Reader
	if payload == nil {
		bodyReader = bytes.NewReader(nil)
	} else {
		body, err := json.Marshal(payload)
		if err != nil {
			t.Fatalf("marshal payload: %v", err)
		}
		bodyReader = bytes.NewReader(body)
	}
	request, err := http.NewRequest(method, app.server.URL+path, bodyReader)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := app.client.Do(request)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read response body: %v", err)
	}
	return response.StatusCode, body
}

func requestJSONBodyWithOrigin(t *testing.T, app *testApp, method string, path string, payload any, origin string) (int, []byte) {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	request, err := http.NewRequest(method, app.server.URL+path, bytes.NewReader(body))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", origin)
	response, err := app.client.Do(request)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read response body: %v", err)
	}
	return response.StatusCode, responseBody
}

func requestMultipartFile(t *testing.T, app *testApp, method string, path string, fieldName string, fileName string, contents []byte) (int, []byte) {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile(fieldName, fileName)
	if err != nil {
		t.Fatalf("create multipart file: %v", err)
	}
	if _, err := part.Write(contents); err != nil {
		t.Fatalf("write multipart file: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}
	request, err := http.NewRequest(method, app.server.URL+path, &body)
	if err != nil {
		t.Fatalf("new multipart request: %v", err)
	}
	request.Header.Set("Content-Type", writer.FormDataContentType())
	response, err := app.client.Do(request)
	if err != nil {
		t.Fatalf("do multipart request: %v", err)
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read multipart response: %v", err)
	}
	return response.StatusCode, responseBody
}

func cleanupProjectAndUsers(t *testing.T, db *pgxpool.Pool, projectID string, emailPrefix string) {
	t.Helper()
	ctx := context.Background()
	_, _ = db.Exec(ctx, `DELETE FROM activity_logs WHERE actor_id IN (SELECT id FROM users WHERE email LIKE $1)`, strings.ToLower(emailPrefix)+"%")
	_, _ = db.Exec(ctx, `DELETE FROM course_sections WHERE title LIKE $1 OR owner_teacher_id IN (SELECT id FROM users WHERE email LIKE $2)`, emailPrefix+"%", strings.ToLower(emailPrefix)+"%")
	_, _ = db.Exec(ctx, `DELETE FROM courses WHERE code LIKE $1 OR title LIKE $1 OR created_by IN (SELECT id FROM users WHERE email LIKE $2)`, emailPrefix+"%", strings.ToLower(emailPrefix)+"%")
	if projectID != "" {
		_, _ = db.Exec(ctx, `DELETE FROM projects WHERE id = $1 OR name LIKE $2`, projectID, emailPrefix+"%")
	} else {
		_, _ = db.Exec(ctx, `DELETE FROM projects WHERE name LIKE $1`, emailPrefix+"%")
	}
	_, _ = db.Exec(ctx, `DELETE FROM users WHERE email LIKE $1`, strings.ToLower(emailPrefix)+"%")
}
