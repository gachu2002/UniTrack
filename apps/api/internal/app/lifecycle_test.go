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
	cfg    config.Config
}

const testTrustedOrigin = "http://localhost:5173"

func newTestApp(t *testing.T) *testApp {
	return newTestAppWithConfig(t, nil)
}

func newTestAppWithConfig(t *testing.T, configure func(*config.Config)) *testApp {
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
	cfg.CORSAllowedOrigins = []string{testTrustedOrigin}
	cfg.UploadStorageBackend = "local"
	cfg.UploadStorageDir = t.TempDir()
	if configure != nil {
		configure(&cfg)
	}
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

	return &testApp{server: server, db: db, client: &http.Client{Jar: jar}, cfg: cfg}
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

func TestLogoutClearsCookieForAlreadyRevokedSession(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	userID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, "", prefix) })

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	if _, err := app.db.Exec(context.Background(), `UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, userID); err != nil {
		t.Fatalf("revoke session: %v", err)
	}

	logout := requestJSON(t, app, http.MethodPost, "/api/v1/auth/logout", map[string]string{})
	if logout.StatusCode != http.StatusOK {
		t.Fatalf("logout revoked session status = %d", logout.StatusCode)
	}
	assertSessionCookieCleared(t, logout, app.cfg.SessionCookieName)

	afterLogout := requestJSON(t, app, http.MethodGet, "/api/v1/auth/me", map[string]string{})
	if afterLogout.StatusCode != http.StatusUnauthorized {
		t.Fatalf("me after revoked-session logout status = %d", afterLogout.StatusCode)
	}
}

func TestSessionCookieFlagsFollowConfig(t *testing.T) {
	app := newTestAppWithConfig(t, func(cfg *config.Config) {
		cfg.SessionSecure = true
		cfg.SessionSameSite = "none"
	})
	prefix := testPrefix()
	createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, "", prefix) })

	loginResponse := requestJSON(t, app, http.MethodPost, "/api/v1/auth/login", map[string]string{"email": prefix + "teacher@unitrack.local", "password": "teacher12345"})
	if loginResponse.StatusCode != http.StatusOK {
		t.Fatalf("login status = %d", loginResponse.StatusCode)
	}
	assertSessionCookieAttrs(t, loginResponse, app.cfg.SessionCookieName, "HttpOnly", "Secure", "SameSite=None")

	logoutResponse := requestJSON(t, app, http.MethodPost, "/api/v1/auth/logout", map[string]string{})
	if logoutResponse.StatusCode != http.StatusOK {
		t.Fatalf("logout status = %d", logoutResponse.StatusCode)
	}
	assertSessionCookieAttrs(t, logoutResponse, app.cfg.SessionCookieName, "HttpOnly", "Secure", "SameSite=None", "Max-Age=0")
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

func TestInvalidLoginResponsesDoNotRevealAccountExistence(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, "", prefix) })

	missingUser := requestJSON(t, app, http.MethodPost, "/api/v1/auth/login", map[string]string{"email": prefix + "missing@unitrack.local", "password": "wrong-password"})
	if missingUser.StatusCode != http.StatusUnauthorized {
		t.Fatalf("missing user login status = %d", missingUser.StatusCode)
	}

	wrongPassword := requestJSON(t, app, http.MethodPost, "/api/v1/auth/login", map[string]string{"email": prefix + "teacher@unitrack.local", "password": "wrong-password"})
	if wrongPassword.StatusCode != http.StatusUnauthorized {
		t.Fatalf("wrong password login status = %d", wrongPassword.StatusCode)
	}
}

func TestJSONDecoderRejectsTrailingValues(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	userID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, "", prefix) })

	status, body := requestRawJSONBody(t, app, http.MethodPost, "/api/v1/auth/login", `{"email":"`+prefix+`teacher@unitrack.local","password":"teacher12345"} {"extra":true}`)
	if status != http.StatusBadRequest {
		t.Fatalf("trailing JSON login status = %d body = %s", status, string(body))
	}
	var sessionCount int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM sessions WHERE user_id = $1`, userID).Scan(&sessionCount); err != nil {
		t.Fatalf("count sessions after trailing JSON: %v", err)
	}
	if sessionCount != 0 {
		t.Fatalf("sessions after trailing JSON = %d, want 0", sessionCount)
	}
}

func TestOriginGuardRejectsUnsafeUntrustedOrigin(t *testing.T) {
	app := newTestApp(t)

	status, body := requestJSONBodyWithOrigin(t, app, http.MethodPost, "/api/v1/auth/login", map[string]string{"email": "nobody@unitrack.local", "password": "wrong-password"}, "https://evil.example")
	if status != http.StatusForbidden {
		t.Fatalf("untrusted origin status = %d body = %s", status, string(body))
	}
}

func TestOriginGuardDoesNotTrustWildcardOrigins(t *testing.T) {
	api := NewServer(config.Config{CORSAllowedOrigins: []string{"*"}, SessionCookieName: "unitrack_session"}, nil, nil)
	request := httptest.NewRequest(http.MethodPost, "https://api.example.test/api/v1/auth/login", nil)
	request.Header.Set("Origin", "https://evil.example.test")
	recorder := httptest.NewRecorder()

	api.requireTrustedOrigin(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})).ServeHTTP(recorder, request)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("wildcard trusted origin status = %d, want %d", recorder.Code, http.StatusForbidden)
	}
}

func TestOriginGuardRejectsMissingOriginOnSessionUnsafeRequest(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, "", prefix) })

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")

	body, err := json.Marshal(map[string]string{"name": prefix + "Origin Guard Project"})
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	request, err := http.NewRequest(http.MethodPost, app.server.URL+"/api/v1/projects", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")

	response, err := app.client.Do(request)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusForbidden {
		responseBody, _ := io.ReadAll(response.Body)
		t.Fatalf("missing origin session request status = %d body = %s", response.StatusCode, string(responseBody))
	}
}

func TestAdminPasswordResetRevokesExistingSessions(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	createTestUser(t, app.db, prefix+"admin@unitrack.local", "admin12345", RoleAdmin, "Admin")
	studentID := createTestUser(t, app.db, prefix+"student@unitrack.local", "student12345", RoleStudent, "Student")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, "", prefix) })

	login(t, app, prefix+"student@unitrack.local", "student12345")
	var activeBefore int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM sessions WHERE user_id = $1 AND revoked_at IS NULL`, studentID).Scan(&activeBefore); err != nil {
		t.Fatalf("count active student sessions: %v", err)
	}
	if activeBefore != 1 {
		t.Fatalf("active student sessions before reset = %d, want 1", activeBefore)
	}

	login(t, app, prefix+"admin@unitrack.local", "admin12345")
	reset := requestJSON(t, app, http.MethodPost, "/api/v1/admin/users/"+studentID+"/password", map[string]string{"password": "student67890"})
	if reset.StatusCode != http.StatusOK {
		t.Fatalf("password reset status = %d", reset.StatusCode)
	}

	var activeAfter, revokedAfter int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM sessions WHERE user_id = $1 AND revoked_at IS NULL`, studentID).Scan(&activeAfter); err != nil {
		t.Fatalf("count active student sessions after reset: %v", err)
	}
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM sessions WHERE user_id = $1 AND revoked_at IS NOT NULL`, studentID).Scan(&revokedAfter); err != nil {
		t.Fatalf("count revoked student sessions after reset: %v", err)
	}
	if activeAfter != 0 || revokedAfter != 1 {
		t.Fatalf("student sessions after reset active=%d revoked=%d, want active=0 revoked=1", activeAfter, revokedAfter)
	}
}

func TestAdminCanManageAccounts(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	adminID := createTestUser(t, app.db, prefix+"admin@unitrack.local", "admin12345", RoleAdmin, "Admin")
	createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	studentID := createTestUser(t, app.db, prefix+"student@unitrack.local", "student12345", RoleStudent, "Student")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, "", prefix) })

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	denied := requestJSON(t, app, http.MethodGet, "/api/v1/admin/users", nil)
	if denied.StatusCode != http.StatusForbidden {
		t.Fatalf("non-admin admin/users status = %d", denied.StatusCode)
	}

	login(t, app, prefix+"student@unitrack.local", "student12345")
	login(t, app, prefix+"admin@unitrack.local", "admin12345")
	status, body := requestJSONBody(t, app, http.MethodPost, "/api/v1/admin/users", map[string]string{
		"fullName": "Created Teacher",
		"email":    prefix + "created.teacher@unitrack.local",
		"password": "created12345",
		"role":     RoleTeacher,
		"status":   "active",
	})
	if status != http.StatusCreated {
		t.Fatalf("create account status = %d body = %s", status, string(body))
	}
	var created UserDTO
	if err := json.Unmarshal(body, &created); err != nil {
		t.Fatalf("decode created user: %v", err)
	}

	status, body = requestJSONBody(t, app, http.MethodGet, "/api/v1/admin/users?search="+prefix+"created.teacher&limit=200", nil)
	if status != http.StatusOK {
		t.Fatalf("list accounts status = %d body = %s", status, string(body))
	}
	var users []UserDTO
	if err := json.Unmarshal(body, &users); err != nil {
		t.Fatalf("decode users: %v", err)
	}
	if !userListContainsEmail(users, prefix+"created.teacher@unitrack.local") {
		t.Fatalf("created account not found in list: %#v", users)
	}

	status, body = requestJSONBody(t, app, http.MethodPatch, "/api/v1/admin/users/"+studentID, map[string]string{"status": "inactive"})
	if status != http.StatusOK {
		t.Fatalf("deactivate student status = %d body = %s", status, string(body))
	}
	var activeStudentSessions int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM sessions WHERE user_id = $1 AND revoked_at IS NULL`, studentID).Scan(&activeStudentSessions); err != nil {
		t.Fatalf("count active student sessions: %v", err)
	}
	if activeStudentSessions != 0 {
		t.Fatalf("active student sessions after deactivation = %d, want 0", activeStudentSessions)
	}

	reset := requestJSON(t, app, http.MethodPost, "/api/v1/admin/users/"+created.ID+"/password", map[string]string{"password": "created67890"})
	if reset.StatusCode != http.StatusOK {
		t.Fatalf("set created password status = %d", reset.StatusCode)
	}

	selfDemotion := requestJSON(t, app, http.MethodPatch, "/api/v1/admin/users/"+adminID, map[string]string{"role": RoleTeacher})
	if selfDemotion.StatusCode != http.StatusConflict {
		t.Fatalf("self demotion status = %d", selfDemotion.StatusCode)
	}

	var logCount int
	if err := app.db.QueryRow(context.Background(), `
		SELECT COUNT(*)
		FROM activity_logs
		WHERE actor_id = $1
		  AND action IN ('admin.user_created', 'admin.user_updated', 'admin.user_password_set')
	`, adminID).Scan(&logCount); err != nil {
		t.Fatalf("count admin activity logs: %v", err)
	}
	if logCount < 3 {
		t.Fatalf("admin activity logs = %d, want at least 3", logCount)
	}
}

func TestLoginWaitsForAccountControlLock(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	studentID := createTestUser(t, app.db, prefix+"student@unitrack.local", "student12345", RoleStudent, "Student")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, "", prefix) })

	newHash, err := hashPassword("student67890")
	if err != nil {
		t.Fatalf("hash replacement password: %v", err)
	}
	tx, err := app.db.Begin(context.Background())
	if err != nil {
		t.Fatalf("begin account-control tx: %v", err)
	}
	defer func() { _ = tx.Rollback(context.Background()) }()
	if _, err := tx.Exec(context.Background(), `UPDATE users SET password_hash = $1 WHERE id = $2`, newHash, studentID); err != nil {
		t.Fatalf("lock and update user password: %v", err)
	}

	resultCh := make(chan asyncHTTPResult, 1)
	go func() {
		status, body, err := requestJSONBodyNoFatal(app, http.MethodPost, "/api/v1/auth/login", map[string]string{"email": prefix + "student@unitrack.local", "password": "student12345"})
		resultCh <- asyncHTTPResult{status: status, body: body, err: err}
	}()

	select {
	case result := <-resultCh:
		t.Fatalf("login returned before account-control transaction committed: status=%d body=%s err=%v", result.status, string(result.body), result.err)
	case <-time.After(200 * time.Millisecond):
	}
	if err := tx.Commit(context.Background()); err != nil {
		t.Fatalf("commit account-control tx: %v", err)
	}

	result := <-resultCh
	if result.err != nil {
		t.Fatalf("login request after account-control commit: %v", result.err)
	}
	if result.status != http.StatusUnauthorized {
		t.Fatalf("old-password login after reset status = %d body = %s", result.status, string(result.body))
	}
	var sessionCount int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM sessions WHERE user_id = $1`, studentID).Scan(&sessionCount); err != nil {
		t.Fatalf("count student sessions: %v", err)
	}
	if sessionCount != 0 {
		t.Fatalf("student sessions after locked reset login = %d, want 0", sessionCount)
	}
}

func TestConcurrentAdminDeactivationKeepsActiveAdmin(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	adminAID := createTestUser(t, app.db, prefix+"admin.a@unitrack.local", "admin12345", RoleAdmin, "Admin A")
	adminBID := createTestUser(t, app.db, prefix+"admin.b@unitrack.local", "admin12345", RoleAdmin, "Admin B")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, "", prefix) })
	deactivateOtherActiveAdmins(t, app.db, prefix)

	clientA := newTestHTTPClient(t)
	clientB := newTestHTTPClient(t)
	loginWithClient(t, app, clientA, prefix+"admin.a@unitrack.local", "admin12345")
	loginWithClient(t, app, clientB, prefix+"admin.b@unitrack.local", "admin12345")

	start := make(chan struct{})
	results := make(chan asyncHTTPResult, 2)
	go func() {
		<-start
		status, body, err := requestJSONBodyWithClientNoFatal(app, clientA, http.MethodPatch, "/api/v1/admin/users/"+adminBID, map[string]string{"status": "inactive"})
		results <- asyncHTTPResult{status: status, body: body, err: err}
	}()
	go func() {
		<-start
		status, body, err := requestJSONBodyWithClientNoFatal(app, clientB, http.MethodPatch, "/api/v1/admin/users/"+adminAID, map[string]string{"status": "inactive"})
		results <- asyncHTTPResult{status: status, body: body, err: err}
	}()
	close(start)

	first := <-results
	second := <-results
	for _, result := range []asyncHTTPResult{first, second} {
		if result.err != nil {
			t.Fatalf("concurrent admin update request failed: %v", result.err)
		}
	}
	okCount := 0
	for _, status := range []int{first.status, second.status} {
		if status == http.StatusOK {
			okCount++
		}
	}
	if okCount != 1 {
		t.Fatalf("concurrent admin deactivation statuses = %d, %d; want exactly one success", first.status, second.status)
	}

	var activeAdmins int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM users WHERE email LIKE $1 AND role = 'admin' AND status = 'active'`, strings.ToLower(prefix)+"%").Scan(&activeAdmins); err != nil {
		t.Fatalf("count active admins: %v", err)
	}
	if activeAdmins != 1 {
		t.Fatalf("active admins after concurrent deactivation = %d, want 1", activeAdmins)
	}
}

func TestBootstrapRejectsExistingNonAdminAccount(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	createTestUser(t, app.db, prefix+"bootstrap@unitrack.local", "teacher12345", RoleTeacher, "Bootstrap Teacher")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, "", prefix) })

	cfg := app.cfg
	cfg.BootstrapAdminEmail = prefix + "bootstrap@unitrack.local"
	cfg.BootstrapAdminPassword = "admin12345"
	api := NewServer(cfg, app.db, nil)
	if err := api.Bootstrap(context.Background()); err == nil {
		t.Fatal("Bootstrap accepted existing non-admin account")
	}
}

func TestAdminRoleChangeRequiresTeacherResponsibilityReassignment(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	adminID := createTestUser(t, app.db, prefix+"admin@unitrack.local", "admin12345", RoleAdmin, "Admin")
	targetTeacherID := createTestUser(t, app.db, prefix+"target.teacher@unitrack.local", "teacher12345", RoleTeacher, "Target Teacher")
	replacementTeacherID := createTestUser(t, app.db, prefix+"replacement.teacher@unitrack.local", "teacher12345", RoleTeacher, "Replacement Teacher")
	projectID := createTestProject(t, app.db, targetTeacherID, prefix+"Transition Project")
	folderID := createTestCourseSection(t, app.db, targetTeacherID, prefix+"Transition Folder")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })
	if _, err := app.db.Exec(context.Background(), `INSERT INTO course_section_projects (course_section_id, project_id, added_by) VALUES ($1, $2, $3)`, folderID, projectID, adminID); err != nil {
		t.Fatalf("link transition project to folder: %v", err)
	}

	login(t, app, prefix+"admin@unitrack.local", "admin12345")
	status, body := requestJSONBody(t, app, http.MethodPatch, "/api/v1/admin/users/"+targetTeacherID, map[string]string{"role": RoleStudent})
	if status != http.StatusConflict {
		t.Fatalf("teacher role change without reassignment status = %d body = %s", status, string(body))
	}
	var transition accountTransitionRequiredResponse
	if err := json.Unmarshal(body, &transition); err != nil {
		t.Fatalf("decode transition response: %v", err)
	}
	if transition.Code != "account_transition_required" || !transition.Impact.RequiresReplacementSupervisor || transition.Impact.OpenProjectCount != 1 || transition.Impact.ActiveFolderCount != 1 {
		t.Fatalf("transition response = %#v", transition)
	}

	var roleAfterBlocked string
	if err := app.db.QueryRow(context.Background(), `SELECT role FROM users WHERE id = $1`, targetTeacherID).Scan(&roleAfterBlocked); err != nil {
		t.Fatalf("load blocked target role: %v", err)
	}
	if roleAfterBlocked != RoleTeacher {
		t.Fatalf("target role after blocked transition = %s, want teacher", roleAfterBlocked)
	}

	status, body = requestJSONBody(t, app, http.MethodPatch, "/api/v1/admin/users/"+targetTeacherID, map[string]any{"role": RoleStudent, "replacementSupervisorId": replacementTeacherID})
	if status != http.StatusOK {
		t.Fatalf("teacher role change with reassignment status = %d body = %s", status, string(body))
	}

	var projectSupervisorID, folderOwnerID, nextRole string
	if err := app.db.QueryRow(context.Background(), `SELECT supervisor_id::text FROM projects WHERE id = $1`, projectID).Scan(&projectSupervisorID); err != nil {
		t.Fatalf("load reassigned project supervisor: %v", err)
	}
	if err := app.db.QueryRow(context.Background(), `SELECT owner_teacher_id::text FROM course_sections WHERE id = $1`, folderID).Scan(&folderOwnerID); err != nil {
		t.Fatalf("load reassigned folder owner: %v", err)
	}
	if err := app.db.QueryRow(context.Background(), `SELECT role FROM users WHERE id = $1`, targetTeacherID).Scan(&nextRole); err != nil {
		t.Fatalf("load reassigned target role: %v", err)
	}
	if projectSupervisorID != replacementTeacherID || folderOwnerID != replacementTeacherID || nextRole != RoleStudent {
		t.Fatalf("transition result projectSupervisor=%s folderOwner=%s role=%s", projectSupervisorID, folderOwnerID, nextRole)
	}

	var logCount int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM activity_logs WHERE actor_id = $1 AND action = 'admin.user_updated' AND metadata->'transition'->>'requiresReplacementSupervisor' = 'true'`, adminID).Scan(&logCount); err != nil {
		t.Fatalf("count transition audit logs: %v", err)
	}
	if logCount != 1 {
		t.Fatalf("transition audit logs = %d, want 1", logCount)
	}
}

func TestAdminStudentDeactivationRequiresCleanupConfirmation(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	adminID := createTestUser(t, app.db, prefix+"admin@unitrack.local", "admin12345", RoleAdmin, "Admin")
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	studentID := createTestUser(t, app.db, prefix+"student@unitrack.local", "student12345", RoleStudent, "Student")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Student Transition Project")
	addProjectMember(t, app.db, projectID, studentID)
	taskID := createTestTask(t, app.db, projectID, teacherID, "Student transition assignment")
	assignTask(t, app.db, taskID, studentID)
	progressID := createTestProgressUpdate(t, app.db, projectID, taskID, studentID, "Historical student work")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	login(t, app, prefix+"student@unitrack.local", "student12345")
	login(t, app, prefix+"admin@unitrack.local", "admin12345")
	status, body := requestJSONBody(t, app, http.MethodPatch, "/api/v1/admin/users/"+studentID, map[string]string{"status": "inactive"})
	if status != http.StatusConflict {
		t.Fatalf("student deactivation without cleanup status = %d body = %s", status, string(body))
	}
	var transition accountTransitionRequiredResponse
	if err := json.Unmarshal(body, &transition); err != nil {
		t.Fatalf("decode student transition response: %v", err)
	}
	if transition.Code != "account_transition_required" || !transition.Impact.RequiresStudentCleanupConfirmation || transition.Impact.ActiveMembershipCount != 1 || transition.Impact.ActiveAssignmentCount != 1 {
		t.Fatalf("student transition response = %#v", transition)
	}

	var membershipCount int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM project_members WHERE project_id = $1 AND student_id = $2`, projectID, studentID).Scan(&membershipCount); err != nil {
		t.Fatalf("count blocked student memberships: %v", err)
	}
	if membershipCount != 1 {
		t.Fatalf("student memberships after blocked transition = %d, want 1", membershipCount)
	}

	status, body = requestJSONBody(t, app, http.MethodPatch, "/api/v1/admin/users/"+studentID, map[string]any{"status": "inactive", "confirmStudentCleanup": true})
	if status != http.StatusOK {
		t.Fatalf("student deactivation with cleanup status = %d body = %s", status, string(body))
	}

	var activeSessions, assignmentCount, progressCount int
	var nextStatus string
	if err := app.db.QueryRow(context.Background(), `SELECT status FROM users WHERE id = $1`, studentID).Scan(&nextStatus); err != nil {
		t.Fatalf("load student status after cleanup: %v", err)
	}
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM sessions WHERE user_id = $1 AND revoked_at IS NULL`, studentID).Scan(&activeSessions); err != nil {
		t.Fatalf("count student sessions after cleanup: %v", err)
	}
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM project_members WHERE project_id = $1 AND student_id = $2`, projectID, studentID).Scan(&membershipCount); err != nil {
		t.Fatalf("count student memberships after cleanup: %v", err)
	}
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM task_assignees WHERE task_id = $1 AND student_id = $2`, taskID, studentID).Scan(&assignmentCount); err != nil {
		t.Fatalf("count task assignments after cleanup: %v", err)
	}
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM progress_updates WHERE id = $1`, progressID).Scan(&progressCount); err != nil {
		t.Fatalf("count historical progress after cleanup: %v", err)
	}
	if nextStatus != "inactive" || activeSessions != 0 || membershipCount != 0 || assignmentCount != 0 || progressCount != 1 {
		t.Fatalf("student transition status=%s sessions=%d memberships=%d assignments=%d progress=%d", nextStatus, activeSessions, membershipCount, assignmentCount, progressCount)
	}

	var logCount int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM activity_logs WHERE actor_id = $1 AND action = 'admin.user_updated' AND metadata->'transition'->>'requiresStudentCleanupConfirmation' = 'true'`, adminID).Scan(&logCount); err != nil {
		t.Fatalf("count student transition audit logs: %v", err)
	}
	if logCount != 1 {
		t.Fatalf("student transition audit logs = %d, want 1", logCount)
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
	addProjectMember(t, app.db, projectID, studentID)
	newestTaskID := createTestTask(t, app.db, projectID, teacherID, "Newest dashboard review task")
	oldestTaskID := createTestTask(t, app.db, projectID, teacherID, "Oldest dashboard review task")
	middleTaskID := createTestTask(t, app.db, projectID, teacherID, "Middle dashboard review task")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	newestID := createTestProgressUpdate(t, app.db, projectID, newestTaskID, studentID, "Newest pending review")
	oldestID := createTestProgressUpdate(t, app.db, projectID, oldestTaskID, studentID, "Oldest pending review")
	middleID := createTestProgressUpdate(t, app.db, projectID, middleTaskID, studentID, "Middle pending review")
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

func TestTeacherDashboardProjectFollowUpsAreNotStarvedByPendingReviews(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	studentID := createTestUser(t, app.db, prefix+"student@unitrack.local", "student12345", RoleStudent, "Student")
	followUpProjectID := createTestProject(t, app.db, teacherID, prefix+"Stale Follow Up Dashboard Project")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, "", prefix) })

	addProjectMember(t, app.db, followUpProjectID, studentID)
	createTestTask(t, app.db, followUpProjectID, teacherID, prefix+"Stale follow up assignment")
	if _, err := app.db.Exec(context.Background(), `UPDATE projects SET updated_at = now() - interval '30 days' WHERE id = $1`, followUpProjectID); err != nil {
		t.Fatalf("age follow-up project: %v", err)
	}

	for index := 0; index < 20; index++ {
		projectID := createTestProject(t, app.db, teacherID, prefix+"Pending Review Dashboard Project "+strconv.Itoa(index))
		addProjectMember(t, app.db, projectID, studentID)
		taskID := createTestTask(t, app.db, projectID, teacherID, prefix+"Pending review assignment "+strconv.Itoa(index))
		createTestProgressUpdate(t, app.db, projectID, taskID, studentID, prefix+"Pending dashboard update "+strconv.Itoa(index))
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

	seenFollowUp := false
	for _, project := range dashboard.Projects {
		if project.PendingReviewCount != 0 {
			t.Fatalf("dashboard project follow-ups included pending-review project: %#v", project)
		}
		if project.ID == followUpProjectID {
			seenFollowUp = true
		}
	}
	if !seenFollowUp {
		t.Fatalf("dashboard project follow-ups did not include stale project: %#v", dashboard.Projects)
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

	addProjectMember(t, app.db, projectID, studentID)
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
	var auditCount int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM activity_logs WHERE actor_id = $1 AND project_id = $2 AND action = 'project.member_added' AND entity_id = $3`, teacherID, projectID, studentID).Scan(&auditCount); err != nil {
		t.Fatalf("count member add audit logs: %v", err)
	}
	if auditCount != 1 {
		t.Fatalf("member add audit logs = %d, want 1", auditCount)
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

func TestAddProjectMemberRechecksStudentAccountAfterLock(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	studentID := createTestUser(t, app.db, prefix+"student@unitrack.local", "student12345", RoleStudent, "Student")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Member Account Race Project")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	tx, err := app.db.Begin(context.Background())
	if err != nil {
		t.Fatalf("begin account lock tx: %v", err)
	}
	defer func() { _ = tx.Rollback(context.Background()) }()
	var lockedStatus string
	if err := tx.QueryRow(context.Background(), `SELECT status FROM users WHERE id = $1 FOR UPDATE`, studentID).Scan(&lockedStatus); err != nil {
		t.Fatalf("lock student account: %v", err)
	}
	if _, err := tx.Exec(context.Background(), `UPDATE users SET status = 'inactive' WHERE id = $1`, studentID); err != nil {
		t.Fatalf("deactivate locked student account: %v", err)
	}

	resultCh := make(chan asyncHTTPResult, 1)
	go func() {
		status, body, err := requestJSONBodyNoFatal(app, http.MethodPost, "/api/v1/projects/"+projectID+"/members", map[string]string{"email": prefix + "student@unitrack.local"})
		resultCh <- asyncHTTPResult{status: status, body: body, err: err}
	}()

	select {
	case result := <-resultCh:
		if result.err != nil {
			t.Fatalf("add member request failed before account lock release: %v", result.err)
		}
		t.Fatalf("add member completed before account lock release with status %d body = %s", result.status, string(result.body))
	case <-time.After(150 * time.Millisecond):
	}

	if err := tx.Commit(context.Background()); err != nil {
		t.Fatalf("commit account deactivation: %v", err)
	}

	select {
	case result := <-resultCh:
		if result.err != nil {
			t.Fatalf("add member request failed: %v", result.err)
		}
		if result.status != http.StatusConflict {
			t.Fatalf("add member after concurrent deactivation status = %d body = %s", result.status, string(result.body))
		}
	case <-time.After(5 * time.Second):
		t.Fatal("add member request did not finish after account lock released")
	}

	var membershipCount int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM project_members WHERE project_id = $1 AND student_id = $2`, projectID, studentID).Scan(&membershipCount); err != nil {
		t.Fatalf("count memberships after account race: %v", err)
	}
	if membershipCount != 0 {
		t.Fatalf("membership count after account race = %d, want 0", membershipCount)
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

func TestLifecycleLockRejectsAssignmentAfterConcurrentCompletion(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Concurrent Completion Project")
	milestoneID := createTestMilestone(t, app.db, projectID, teacherID, "Race checkpoint", 1)
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	tx, err := app.db.Begin(context.Background())
	if err != nil {
		t.Fatalf("begin lifecycle lock tx: %v", err)
	}
	defer func() { _ = tx.Rollback(context.Background()) }()
	var lockedStatus string
	if err := tx.QueryRow(context.Background(), `SELECT status FROM projects WHERE id = $1 FOR UPDATE`, projectID).Scan(&lockedStatus); err != nil {
		t.Fatalf("lock project: %v", err)
	}

	resultCh := make(chan asyncHTTPResult, 1)
	go func() {
		status, body, err := requestJSONBodyNoFatal(app, http.MethodPost, "/api/v1/projects/"+projectID+"/tasks", map[string]string{"title": "Race assignment", "milestoneId": milestoneID})
		resultCh <- asyncHTTPResult{status: status, body: body, err: err}
	}()

	select {
	case result := <-resultCh:
		if result.err != nil {
			t.Fatalf("assignment request failed before lifecycle flip: %v", result.err)
		}
		t.Fatalf("assignment request completed before lifecycle flip with status %d body = %s", result.status, string(result.body))
	case <-time.After(150 * time.Millisecond):
	}

	if _, err := tx.Exec(context.Background(), `UPDATE projects SET status = 'completed' WHERE id = $1`, projectID); err != nil {
		t.Fatalf("complete locked project: %v", err)
	}
	if err := tx.Commit(context.Background()); err != nil {
		t.Fatalf("commit lifecycle flip: %v", err)
	}

	select {
	case result := <-resultCh:
		if result.err != nil {
			t.Fatalf("assignment request failed: %v", result.err)
		}
		if result.status != http.StatusConflict {
			t.Fatalf("assignment after concurrent completion status = %d body = %s", result.status, string(result.body))
		}
	case <-time.After(5 * time.Second):
		t.Fatal("assignment request did not finish after lifecycle lock released")
	}

	var assignmentCount int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM tasks WHERE project_id = $1 AND title = 'Race assignment'`, projectID).Scan(&assignmentCount); err != nil {
		t.Fatalf("count race assignments: %v", err)
	}
	if assignmentCount != 0 {
		t.Fatalf("race assignment count = %d, want 0", assignmentCount)
	}
}

func TestAssignmentCreateRechecksMilestoneAfterLifecycleLock(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Assignment Milestone Race Project")
	milestoneID := createTestMilestone(t, app.db, projectID, teacherID, "Temporary checkpoint", 1)
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	tx, err := app.db.Begin(context.Background())
	if err != nil {
		t.Fatalf("begin milestone removal tx: %v", err)
	}
	defer func() { _ = tx.Rollback(context.Background()) }()
	var lockedStatus string
	if err := tx.QueryRow(context.Background(), `SELECT status FROM projects WHERE id = $1 FOR UPDATE`, projectID).Scan(&lockedStatus); err != nil {
		t.Fatalf("lock project: %v", err)
	}
	if _, err := tx.Exec(context.Background(), `DELETE FROM project_milestones WHERE id = $1`, milestoneID); err != nil {
		t.Fatalf("delete milestone while project lock is held: %v", err)
	}

	resultCh := make(chan asyncHTTPResult, 1)
	go func() {
		status, body, err := requestJSONBodyNoFatal(app, http.MethodPost, "/api/v1/projects/"+projectID+"/tasks", map[string]string{"title": "Race assignment", "milestoneId": milestoneID})
		resultCh <- asyncHTTPResult{status: status, body: body, err: err}
	}()

	select {
	case result := <-resultCh:
		if result.err != nil {
			t.Fatalf("assignment create failed before project lock release: %v", result.err)
		}
		t.Fatalf("assignment create completed before project lock release with status %d body = %s", result.status, string(result.body))
	case <-time.After(150 * time.Millisecond):
	}

	if err := tx.Commit(context.Background()); err != nil {
		t.Fatalf("commit milestone removal: %v", err)
	}

	select {
	case result := <-resultCh:
		if result.err != nil {
			t.Fatalf("assignment create request failed: %v", result.err)
		}
		if result.status != http.StatusBadRequest || !strings.Contains(string(result.body), "invalid milestone id") {
			t.Fatalf("assignment create after milestone removal status = %d body = %s", result.status, string(result.body))
		}
	case <-time.After(5 * time.Second):
		t.Fatal("assignment create request did not finish after project lock released")
	}

	var assignmentCount int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM tasks WHERE project_id = $1 AND title = 'Race assignment'`, projectID).Scan(&assignmentCount); err != nil {
		t.Fatalf("count assignment after milestone removal: %v", err)
	}
	if assignmentCount != 0 {
		t.Fatalf("assignment count after milestone removal = %d, want 0", assignmentCount)
	}
}

func TestAssignmentPartialUpdatePreservesConcurrentMetadataChange(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Assignment Concurrent Project")
	milestoneID := createTestMilestone(t, app.db, projectID, teacherID, "Original checkpoint", 1)
	taskID := createTestTaskInMilestone(t, app.db, projectID, teacherID, milestoneID, "Original assignment")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	tx, err := app.db.Begin(context.Background())
	if err != nil {
		t.Fatalf("begin assignment lock tx: %v", err)
	}
	defer func() { _ = tx.Rollback(context.Background()) }()
	var lockedStatus string
	if err := tx.QueryRow(context.Background(), `SELECT status FROM projects WHERE id = $1 FOR UPDATE`, projectID).Scan(&lockedStatus); err != nil {
		t.Fatalf("lock project: %v", err)
	}
	if _, err := tx.Exec(context.Background(), `UPDATE tasks SET title = 'Concurrent assignment', description = 'Updated while priority waits' WHERE id = $1`, taskID); err != nil {
		t.Fatalf("update assignment while project lock is held: %v", err)
	}

	resultCh := make(chan asyncHTTPResult, 1)
	go func() {
		status, body, err := requestJSONBodyNoFatal(app, http.MethodPatch, "/api/v1/projects/"+projectID+"/tasks/"+taskID, map[string]string{"priority": "high"})
		resultCh <- asyncHTTPResult{status: status, body: body, err: err}
	}()

	select {
	case result := <-resultCh:
		if result.err != nil {
			t.Fatalf("assignment update failed before project lock release: %v", result.err)
		}
		t.Fatalf("assignment update completed before project lock release with status %d body = %s", result.status, string(result.body))
	case <-time.After(150 * time.Millisecond):
	}

	if err := tx.Commit(context.Background()); err != nil {
		t.Fatalf("commit concurrent assignment update: %v", err)
	}

	select {
	case result := <-resultCh:
		if result.err != nil {
			t.Fatalf("assignment update request failed: %v", result.err)
		}
		if result.status != http.StatusOK {
			t.Fatalf("assignment partial update status = %d body = %s", result.status, string(result.body))
		}
	case <-time.After(5 * time.Second):
		t.Fatal("assignment update request did not finish after project lock released")
	}

	var title, description, priority string
	if err := app.db.QueryRow(context.Background(), `SELECT title, description, priority FROM tasks WHERE id = $1`, taskID).Scan(&title, &description, &priority); err != nil {
		t.Fatalf("load assignment after concurrent update: %v", err)
	}
	if title != "Concurrent assignment" || description != "Updated while priority waits" || priority != "high" {
		t.Fatalf("assignment after concurrent update title/description/priority = %q/%q/%q", title, description, priority)
	}
}

func TestLifecycleLockRejectsMetadataUpdateAfterConcurrentArchive(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	projectName := prefix + "Concurrent Archive Project"
	projectID := createTestProject(t, app.db, teacherID, projectName)
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	tx, err := app.db.Begin(context.Background())
	if err != nil {
		t.Fatalf("begin archive lock tx: %v", err)
	}
	defer func() { _ = tx.Rollback(context.Background()) }()
	var lockedStatus string
	if err := tx.QueryRow(context.Background(), `SELECT status FROM projects WHERE id = $1 FOR UPDATE`, projectID).Scan(&lockedStatus); err != nil {
		t.Fatalf("lock project: %v", err)
	}

	resultCh := make(chan asyncHTTPResult, 1)
	go func() {
		status, body, err := requestJSONBodyNoFatal(app, http.MethodPatch, "/api/v1/projects/"+projectID, map[string]string{"name": "Race edited project"})
		resultCh <- asyncHTTPResult{status: status, body: body, err: err}
	}()

	select {
	case result := <-resultCh:
		if result.err != nil {
			t.Fatalf("project update failed before lifecycle flip: %v", result.err)
		}
		t.Fatalf("project update completed before lifecycle flip with status %d body = %s", result.status, string(result.body))
	case <-time.After(150 * time.Millisecond):
	}

	if _, err := tx.Exec(context.Background(), `UPDATE projects SET status = 'archived' WHERE id = $1`, projectID); err != nil {
		t.Fatalf("archive locked project: %v", err)
	}
	if err := tx.Commit(context.Background()); err != nil {
		t.Fatalf("commit archive: %v", err)
	}

	select {
	case result := <-resultCh:
		if result.err != nil {
			t.Fatalf("project update request failed: %v", result.err)
		}
		if result.status != http.StatusConflict {
			t.Fatalf("project metadata update after concurrent archive status = %d body = %s", result.status, string(result.body))
		}
	case <-time.After(5 * time.Second):
		t.Fatal("project update request did not finish after lifecycle lock released")
	}

	var name, status string
	if err := app.db.QueryRow(context.Background(), `SELECT name, status FROM projects WHERE id = $1`, projectID).Scan(&name, &status); err != nil {
		t.Fatalf("load project after archive race: %v", err)
	}
	if name != projectName || status != projectStatusArchived {
		t.Fatalf("project after archive race name/status = %q/%q, want %q/%q", name, status, projectName, projectStatusArchived)
	}
}

func TestMilestoneSortUpdatePreservesConcurrentMetadataChange(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Milestone Concurrent Project")
	milestoneID := createTestMilestone(t, app.db, projectID, teacherID, "Original checkpoint", 1)
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	tx, err := app.db.Begin(context.Background())
	if err != nil {
		t.Fatalf("begin milestone lock tx: %v", err)
	}
	defer func() { _ = tx.Rollback(context.Background()) }()
	var lockedStatus string
	if err := tx.QueryRow(context.Background(), `SELECT status FROM projects WHERE id = $1 FOR UPDATE`, projectID).Scan(&lockedStatus); err != nil {
		t.Fatalf("lock project: %v", err)
	}
	if _, err := tx.Exec(context.Background(), `UPDATE project_milestones SET title = 'Concurrent checkpoint', description = 'Updated while sort waits' WHERE id = $1`, milestoneID); err != nil {
		t.Fatalf("update milestone while locked: %v", err)
	}

	resultCh := make(chan asyncHTTPResult, 1)
	go func() {
		status, body, err := requestJSONBodyNoFatal(app, http.MethodPatch, "/api/v1/projects/"+projectID+"/milestones/"+milestoneID, map[string]int{"sortOrder": 2})
		resultCh <- asyncHTTPResult{status: status, body: body, err: err}
	}()

	select {
	case result := <-resultCh:
		if result.err != nil {
			t.Fatalf("milestone update failed before project lock release: %v", result.err)
		}
		t.Fatalf("milestone update completed before project lock release with status %d body = %s", result.status, string(result.body))
	case <-time.After(150 * time.Millisecond):
	}

	if err := tx.Commit(context.Background()); err != nil {
		t.Fatalf("commit concurrent milestone update: %v", err)
	}

	select {
	case result := <-resultCh:
		if result.err != nil {
			t.Fatalf("milestone update request failed: %v", result.err)
		}
		if result.status != http.StatusOK {
			t.Fatalf("milestone sort update status = %d body = %s", result.status, string(result.body))
		}
	case <-time.After(5 * time.Second):
		t.Fatal("milestone update request did not finish after project lock released")
	}

	var title, description string
	var sortOrder int
	if err := app.db.QueryRow(context.Background(), `SELECT title, description, sort_order FROM project_milestones WHERE id = $1`, milestoneID).Scan(&title, &description, &sortOrder); err != nil {
		t.Fatalf("load milestone after concurrent update: %v", err)
	}
	if title != "Concurrent checkpoint" || description != "Updated while sort waits" || sortOrder != 2 {
		t.Fatalf("milestone after concurrent update title/description/sort = %q/%q/%d", title, description, sortOrder)
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

func TestProtectedRoutesRejectMalformedUUIDParams(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Malformed UUID Project")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	assertStatus(t, requestJSON(t, app, http.MethodGet, "/api/v1/projects/"+projectID+"/tasks/not-a-uuid", nil), http.StatusBadRequest, "malformed task read")
	assertStatus(t, requestJSON(t, app, http.MethodPatch, "/api/v1/projects/"+projectID+"/tasks/not-a-uuid", map[string]string{"title": "Updated"}), http.StatusBadRequest, "malformed task update")
	assertStatus(t, requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/tasks/not-a-uuid/progress-updates", map[string]string{"description": "Progress"}), http.StatusBadRequest, "malformed progress task")

	status, body := requestJSONBody(t, app, http.MethodPatch, "/api/v1/projects/"+projectID+"/milestones/not-a-uuid", map[string]string{"title": "Updated checkpoint"})
	if status != http.StatusBadRequest || !strings.Contains(string(body), "invalid milestone id") || strings.Contains(string(body), "invalid input syntax") {
		t.Fatalf("malformed milestone update status = %d body = %s", status, string(body))
	}
	assertStatus(t, requestJSON(t, app, http.MethodDelete, "/api/v1/projects/"+projectID+"/milestones/not-a-uuid", nil), http.StatusBadRequest, "malformed milestone delete")
	assertStatus(t, requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/progress-updates/not-a-uuid/reviews", map[string]string{"reviewStatus": "approved", "officialProgressState": "in_progress"}), http.StatusBadRequest, "malformed review progress update")

	uploadStatus, uploadBody := requestMultipartFile(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/progress-updates/not-a-uuid/files", "file", "evidence.txt", []byte("evidence"))
	if uploadStatus != http.StatusBadRequest {
		t.Fatalf("malformed evidence upload status = %d body = %s", uploadStatus, string(uploadBody))
	}
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
	invalidMemberID := requestJSON(t, app, http.MethodPatch, "/api/v1/projects/"+projectID+"/members/not-a-uuid", map[string]string{"memberRole": "leader"})
	if invalidMemberID.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid member id role update status = %d", invalidMemberID.StatusCode)
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
	var auditCount int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM activity_logs WHERE actor_id = $1 AND project_id = $2 AND action = 'project.member_role_updated' AND entity_id = $3`, teacherID, projectID, studentID).Scan(&auditCount); err != nil {
		t.Fatalf("count member role audit logs: %v", err)
	}
	if auditCount != 1 {
		t.Fatalf("member role audit logs = %d, want 1", auditCount)
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

func TestDatabaseRejectsCrossProjectChildTasks(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Parent Task Project")
	otherProjectID := createTestProject(t, app.db, teacherID, prefix+"Child Task Project")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, "", prefix) })

	parentTaskID := createTestTask(t, app.db, projectID, teacherID, prefix+"Parent task")
	if _, err := app.db.Exec(context.Background(), `
		INSERT INTO tasks (project_id, parent_task_id, title, created_by)
		VALUES ($1, $2, $3, $4)
	`, otherProjectID, parentTaskID, prefix+"Cross-project child task", teacherID); err == nil {
		t.Fatalf("cross-project child task insert succeeded")
	} else if !strings.Contains(err.Error(), "tasks_project_parent_task_fk") {
		t.Fatalf("cross-project child task error = %v", err)
	}

	if _, err := app.db.Exec(context.Background(), `
		INSERT INTO tasks (project_id, parent_task_id, title, created_by)
		VALUES ($1, $2, $3, $4)
	`, projectID, parentTaskID, prefix+"Same-project child task", teacherID); err != nil {
		t.Fatalf("same-project child task insert: %v", err)
	}
}

func TestDatabaseRejectsMismatchedFolderProjectLinks(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	otherTeacherID := createTestUser(t, app.db, prefix+"other.teacher@unitrack.local", "teacher12345", RoleTeacher, "Other Teacher")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Folder Integrity Project")
	folderID := createTestCourseSection(t, app.db, teacherID, prefix+"Folder Integrity Folder")
	otherFolderID := createTestCourseSection(t, app.db, otherTeacherID, prefix+"Other Folder Integrity Folder")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, "", prefix) })

	if _, err := app.db.Exec(context.Background(), `
		INSERT INTO course_section_projects (course_section_id, project_id, added_by)
		VALUES ($1, $2, $3)
	`, otherFolderID, projectID, teacherID); err == nil {
		t.Fatalf("mismatched folder link insert succeeded")
	} else if !strings.Contains(err.Error(), "project supervisor must own the folder") {
		t.Fatalf("mismatched folder link error = %v", err)
	}

	if _, err := app.db.Exec(context.Background(), `
		INSERT INTO course_section_projects (course_section_id, project_id, added_by)
		VALUES ($1, $2, $3)
	`, folderID, projectID, teacherID); err != nil {
		t.Fatalf("matching folder link insert: %v", err)
	}

	if _, err := app.db.Exec(context.Background(), `UPDATE projects SET supervisor_id = $1 WHERE id = $2`, otherTeacherID, projectID); err == nil {
		t.Fatalf("mismatched project supervisor update succeeded")
	} else if !strings.Contains(err.Error(), "project supervisor must own the linked folder") {
		t.Fatalf("mismatched project supervisor update error = %v", err)
	}

	if _, err := app.db.Exec(context.Background(), `UPDATE course_sections SET owner_teacher_id = $1 WHERE id = $2`, otherTeacherID, folderID); err == nil {
		t.Fatalf("mismatched folder owner update succeeded")
	} else if !strings.Contains(err.Error(), "folder owner must supervise linked projects") {
		t.Fatalf("mismatched folder owner update error = %v", err)
	}
}

func TestDatabaseRejectsCrossProjectSupportTargets(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	studentID := createTestUser(t, app.db, prefix+"student@unitrack.local", "student12345", RoleStudent, "Student")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Support Integrity Project")
	otherProjectID := createTestProject(t, app.db, teacherID, prefix+"Other Support Integrity Project")
	addProjectMember(t, app.db, projectID, studentID)
	addProjectMember(t, app.db, otherProjectID, studentID)
	taskID := createTestTask(t, app.db, projectID, teacherID, "Support integrity assignment")
	otherTaskID := createTestTask(t, app.db, otherProjectID, teacherID, "Other support integrity assignment")
	milestoneID := createTestMilestone(t, app.db, projectID, teacherID, "Support checkpoint", 10)
	otherMilestoneID := createTestMilestone(t, app.db, otherProjectID, teacherID, "Other support checkpoint", 10)
	updateID := createTestProgressUpdate(t, app.db, projectID, taskID, studentID, "Support integrity submission")
	otherUpdateID := createTestProgressUpdate(t, app.db, otherProjectID, otherTaskID, studentID, "Other support integrity submission")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	var resourceID string
	if err := app.db.QueryRow(context.Background(), `
		INSERT INTO resource_links (project_id, related_entity_type, related_entity_id, title, url, added_by)
		VALUES ($1, 'milestone', $2, $3, 'https://example.com/support-integrity-valid-milestone', $4)
		RETURNING id::text
	`, projectID, milestoneID, prefix+"Valid milestone resource", teacherID).Scan(&resourceID); err != nil {
		t.Fatalf("insert valid milestone resource: %v", err)
	}
	if _, err := app.db.Exec(context.Background(), `
		INSERT INTO uploaded_files (project_id, related_entity_type, related_entity_id, original_file_name, stored_file_name, storage_path, file_size_bytes, uploaded_by)
		VALUES ($1, 'progress_update', $2, 'valid.txt', 'valid.txt', '/tmp/unitrack-valid.txt', 1, $3)
	`, projectID, updateID, studentID); err != nil {
		t.Fatalf("insert valid progress evidence metadata: %v", err)
	}
	if _, err := app.db.Exec(context.Background(), `
		INSERT INTO uploaded_files (project_id, related_entity_type, related_entity_id, original_file_name, stored_file_name, storage_path, file_size_bytes, uploaded_by)
		VALUES ($1, 'resource_link', $2, 'resource.txt', 'resource.txt', '/tmp/unitrack-resource.txt', 1, $3)
	`, projectID, resourceID, studentID); err != nil {
		t.Fatalf("insert valid resource-link file metadata: %v", err)
	}

	if _, err := app.db.Exec(context.Background(), `
		INSERT INTO resource_links (project_id, related_entity_type, related_entity_id, title, url, added_by)
		VALUES ($1, 'milestone', $2, $3, 'https://example.com/support-integrity-wrong-milestone', $4)
	`, projectID, otherMilestoneID, prefix+"Wrong milestone resource", teacherID); err == nil {
		t.Fatalf("cross-project milestone resource insert succeeded")
	} else if !strings.Contains(err.Error(), "resource link target must belong to its project") {
		t.Fatalf("cross-project milestone resource error = %v", err)
	}

	if _, err := app.db.Exec(context.Background(), `
		INSERT INTO resource_links (project_id, related_entity_type, related_entity_id, title, url, added_by)
		VALUES ($1, 'task', $2, $3, 'https://example.com/support-integrity-wrong-task', $4)
	`, projectID, otherTaskID, prefix+"Wrong assignment resource", teacherID); err == nil {
		t.Fatalf("cross-project task resource insert succeeded")
	} else if !strings.Contains(err.Error(), "resource link target must belong to its project") {
		t.Fatalf("cross-project task resource error = %v", err)
	}

	if _, err := app.db.Exec(context.Background(), `
		INSERT INTO resource_links (project_id, related_entity_type, related_entity_id, title, url, added_by)
		VALUES ($1, 'progress_update', $2, $3, 'https://example.com/support-integrity-wrong-progress', $4)
	`, projectID, otherUpdateID, prefix+"Wrong submission resource", teacherID); err == nil {
		t.Fatalf("cross-project progress resource insert succeeded")
	} else if !strings.Contains(err.Error(), "resource link target must belong to its project") {
		t.Fatalf("cross-project progress resource error = %v", err)
	}

	if _, err := app.db.Exec(context.Background(), `
		INSERT INTO uploaded_files (project_id, related_entity_type, related_entity_id, original_file_name, stored_file_name, storage_path, file_size_bytes, uploaded_by)
		VALUES ($1, 'progress_update', $2, 'wrong.txt', 'wrong.txt', '/tmp/unitrack-wrong.txt', 1, $3)
	`, projectID, otherUpdateID, studentID); err == nil {
		t.Fatalf("cross-project evidence metadata insert succeeded")
	} else if !strings.Contains(err.Error(), "uploaded file target must belong to its project") {
		t.Fatalf("cross-project evidence metadata error = %v", err)
	}

	if _, err := app.db.Exec(context.Background(), `UPDATE project_milestones SET project_id = $1 WHERE id = $2`, otherProjectID, milestoneID); err == nil {
		t.Fatalf("resource-backed milestone move succeeded")
	} else if !strings.Contains(err.Error(), "resource link target must belong to its project") {
		t.Fatalf("resource-backed milestone move error = %v", err)
	}

	if _, err := app.db.Exec(context.Background(), `DELETE FROM progress_updates WHERE id = $1`, updateID); err == nil {
		t.Fatalf("evidence-backed progress update delete succeeded")
	} else if !strings.Contains(err.Error(), "uploaded file target must belong to its project") {
		t.Fatalf("evidence-backed progress update delete error = %v", err)
	}

	if _, err := app.db.Exec(context.Background(), `DELETE FROM resource_links WHERE id = $1`, resourceID); err == nil {
		t.Fatalf("file-backed resource link delete succeeded")
	} else if !strings.Contains(err.Error(), "uploaded file target must belong to its project") {
		t.Fatalf("file-backed resource link delete error = %v", err)
	}
}

func TestUnassignedProjectSearchUsesBackendFilterAndExcludesArchivedCandidates(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	classID := createTestCourseSection(t, app.db, teacherID, prefix+"Candidate Folder")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, "", prefix) })

	for index := 0; index < 205; index++ {
		createTestProject(t, app.db, teacherID, prefix+"Ordinary Candidate Project "+strconv.Itoa(index))
	}
	targetID := createTestProject(t, app.db, teacherID, prefix+"Needle Candidate Project")
	archivedID := createTestProject(t, app.db, teacherID, prefix+"Needle Archived Candidate Project")
	linkedID := createTestProject(t, app.db, teacherID, prefix+"Needle Linked Candidate Project")
	if _, err := app.db.Exec(context.Background(), `UPDATE projects SET status = 'archived' WHERE id = $1`, archivedID); err != nil {
		t.Fatalf("archive candidate project: %v", err)
	}
	if _, err := app.db.Exec(context.Background(), `INSERT INTO course_section_projects (course_section_id, project_id, added_by) VALUES ($1, $2, $3)`, classID, linkedID, teacherID); err != nil {
		t.Fatalf("link candidate project: %v", err)
	}

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	status, body := requestJSONBody(t, app, http.MethodGet, "/api/v1/projects?unassigned=true&excludeArchived=true&limit=10&search=needle", nil)
	if status != http.StatusOK {
		t.Fatalf("unassigned search status = %d body = %s", status, string(body))
	}
	var projects []ProjectDTO
	if err := json.Unmarshal(body, &projects); err != nil {
		t.Fatalf("decode unassigned search projects: %v", err)
	}
	seenTarget := false
	for _, project := range projects {
		if project.ID == targetID {
			seenTarget = true
		}
		if project.ID == archivedID || project.ID == linkedID {
			t.Fatalf("unassigned search returned archived/linked project: %#v", project)
		}
	}
	if !seenTarget {
		t.Fatalf("unassigned search did not include target project beyond broad cap: %#v", projects)
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

func TestStudentProgressRechecksAssignmentAfterLifecycleLock(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	studentID := createTestUser(t, app.db, prefix+"student@unitrack.local", "student12345", RoleStudent, "Student")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Submission Assignment Race Project")
	addProjectMember(t, app.db, projectID, studentID)
	taskID := createTestTask(t, app.db, projectID, teacherID, "Race assignment")
	assignTask(t, app.db, taskID, studentID)
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	login(t, app, prefix+"student@unitrack.local", "student12345")
	tx, err := app.db.Begin(context.Background())
	if err != nil {
		t.Fatalf("begin submission assignment race tx: %v", err)
	}
	defer func() { _ = tx.Rollback(context.Background()) }()
	var lockedStatus string
	if err := tx.QueryRow(context.Background(), `SELECT status FROM projects WHERE id = $1 FOR UPDATE`, projectID).Scan(&lockedStatus); err != nil {
		t.Fatalf("lock project: %v", err)
	}
	if _, err := tx.Exec(context.Background(), `DELETE FROM task_assignees WHERE task_id = $1 AND student_id = $2`, taskID, studentID); err != nil {
		t.Fatalf("delete assignment while project lock is held: %v", err)
	}

	resultCh := make(chan asyncHTTPResult, 1)
	go func() {
		status, body, err := requestJSONBodyNoFatal(app, http.MethodPost, "/api/v1/projects/"+projectID+"/tasks/"+taskID+"/progress-updates", map[string]string{"description": "Racing submission"})
		resultCh <- asyncHTTPResult{status: status, body: body, err: err}
	}()

	select {
	case result := <-resultCh:
		if result.err != nil {
			t.Fatalf("submission request failed before project lock release: %v", result.err)
		}
		t.Fatalf("submission completed before project lock release with status %d body = %s", result.status, string(result.body))
	case <-time.After(150 * time.Millisecond):
	}

	if err := tx.Commit(context.Background()); err != nil {
		t.Fatalf("commit assignment removal: %v", err)
	}

	select {
	case result := <-resultCh:
		if result.err != nil {
			t.Fatalf("submission request failed: %v", result.err)
		}
		if result.status != http.StatusForbidden {
			t.Fatalf("submission after concurrent unassignment status = %d body = %s", result.status, string(result.body))
		}
	case <-time.After(5 * time.Second):
		t.Fatal("submission request did not finish after project lock released")
	}

	var updateCount int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM progress_updates WHERE project_id = $1 AND task_id = $2`, projectID, taskID).Scan(&updateCount); err != nil {
		t.Fatalf("count race submissions: %v", err)
	}
	if updateCount != 0 {
		t.Fatalf("race submission count = %d, want 0", updateCount)
	}
}

func TestDatabaseRejectsUnassignedProgressSubmitter(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	studentID := createTestUser(t, app.db, prefix+"student@unitrack.local", "student12345", RoleStudent, "Student")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Submission Submitter Integrity Project")
	addProjectMember(t, app.db, projectID, studentID)
	taskID := createTestTask(t, app.db, projectID, teacherID, "Submitter integrity assignment")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	_, err := app.db.Exec(context.Background(), `INSERT INTO progress_updates (project_id, task_id, submitted_by, description) VALUES ($1, $2, $3, $4)`, projectID, taskID, studentID, "Unassigned database submission")
	if err == nil {
		t.Fatal("unassigned progress update insert succeeded")
	}
	if !strings.Contains(err.Error(), "progress update submitter must be an active assigned student") {
		t.Fatalf("unassigned progress update error = %v", err)
	}

	assignTask(t, app.db, taskID, studentID)
	if _, err := app.db.Exec(context.Background(), `INSERT INTO progress_updates (project_id, task_id, submitted_by, description) VALUES ($1, $2, $3, $4)`, projectID, taskID, studentID, "Assigned database submission"); err != nil {
		t.Fatalf("assigned progress update insert failed: %v", err)
	}
}

func TestAssignmentCompletionRequiresPendingReviewResolution(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	studentID := createTestUser(t, app.db, prefix+"student@unitrack.local", "student12345", RoleStudent, "Student")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Pending Review Completion Project")
	addProjectMember(t, app.db, projectID, studentID)
	taskID := createTestTask(t, app.db, projectID, teacherID, "Pending assignment")
	assignTask(t, app.db, taskID, studentID)
	updateID := createTestProgressUpdate(t, app.db, projectID, taskID, studentID, "Ready for review")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	complete := requestJSON(t, app, http.MethodPatch, "/api/v1/projects/"+projectID+"/tasks/"+taskID, map[string]string{
		"status":                "done",
		"officialProgressState": "completed",
	})
	if complete.StatusCode != http.StatusConflict {
		t.Fatalf("complete with pending review status = %d", complete.StatusCode)
	}

	review := requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/progress-updates/"+updateID+"/reviews", map[string]string{
		"reviewStatus":          "approved",
		"officialProgressState": "completed",
	})
	if review.StatusCode != http.StatusOK {
		t.Fatalf("review after blocked manual completion status = %d", review.StatusCode)
	}
}

func TestChildTaskProgressIsExcludedFromAssignmentSurfaces(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	studentID := createTestUser(t, app.db, prefix+"student@unitrack.local", "student12345", RoleStudent, "Student")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Legacy Child Task Project")
	addProjectMember(t, app.db, projectID, studentID)
	assignmentID := createTestTask(t, app.db, projectID, teacherID, "Visible assignment")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	var childTaskID string
	if err := app.db.QueryRow(context.Background(), `
		INSERT INTO tasks (project_id, parent_task_id, title, created_by)
		VALUES ($1, $2, $3, $4)
		RETURNING id::text
	`, projectID, assignmentID, "Legacy child task", teacherID).Scan(&childTaskID); err != nil {
		t.Fatalf("create child task: %v", err)
	}
	childUpdateID := createTestProgressUpdate(t, app.db, projectID, childTaskID, studentID, "Legacy child progress")

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	status, body := requestJSONBody(t, app, http.MethodGet, "/api/v1/projects/"+projectID+"/progress-updates", nil)
	if status != http.StatusOK {
		t.Fatalf("project progress status = %d body = %s", status, string(body))
	}
	var updates []ProgressUpdateDTO
	if err := json.Unmarshal(body, &updates); err != nil {
		t.Fatalf("decode project progress: %v", err)
	}
	for _, update := range updates {
		if update.ID == childUpdateID {
			t.Fatalf("child-task progress appeared in assignment progress list: %#v", updates)
		}
	}
	status, body = requestJSONBody(t, app, http.MethodGet, "/api/v1/projects/"+projectID, nil)
	if status != http.StatusOK {
		t.Fatalf("project status = %d body = %s", status, string(body))
	}
	var project ProjectDTO
	if err := json.Unmarshal(body, &project); err != nil {
		t.Fatalf("decode project: %v", err)
	}
	if project.PendingReviewCount != 0 {
		t.Fatalf("project pending reviews = %d, want 0", project.PendingReviewCount)
	}

	status, body = requestJSONBody(t, app, http.MethodGet, "/api/v1/dashboard", nil)
	if status != http.StatusOK {
		t.Fatalf("dashboard status = %d body = %s", status, string(body))
	}
	var dashboard DashboardDTO
	if err := json.Unmarshal(body, &dashboard); err != nil {
		t.Fatalf("decode dashboard: %v", err)
	}
	if dashboard.Stats.PendingReviews != 0 {
		t.Fatalf("dashboard pending reviews = %d, want 0", dashboard.Stats.PendingReviews)
	}
	for _, update := range dashboard.ProgressUpdates {
		if update.ID == childUpdateID {
			t.Fatalf("child-task progress appeared in dashboard: %#v", dashboard.ProgressUpdates)
		}
	}

	reviewChild := requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/progress-updates/"+childUpdateID+"/reviews", map[string]string{
		"reviewStatus":          "approved",
		"officialProgressState": "in_progress",
	})
	if reviewChild.StatusCode != http.StatusNotFound {
		t.Fatalf("child-task progress review status = %d", reviewChild.StatusCode)
	}
	childEvidenceStatus, _ := requestMultipartFile(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/progress-updates/"+childUpdateID+"/files", "file", "legacy.txt", []byte("legacy child evidence"))
	if childEvidenceStatus != http.StatusNotFound {
		t.Fatalf("child-task progress evidence status = %d", childEvidenceStatus)
	}
	childResource := requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/resource-links", map[string]string{
		"relatedType": "progress_update",
		"relatedId":   childUpdateID,
		"title":       "Legacy child resource",
		"url":         "https://example.com/legacy-child-resource",
	})
	if childResource.StatusCode != http.StatusBadRequest {
		t.Fatalf("child-task progress resource status = %d", childResource.StatusCode)
	}
	var reviewCount int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM progress_reviews WHERE progress_update_id = $1`, childUpdateID).Scan(&reviewCount); err != nil {
		t.Fatalf("count child progress reviews: %v", err)
	}
	if reviewCount != 0 {
		t.Fatalf("child progress review count = %d, want 0", reviewCount)
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
	missingGuidanceReview := requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/progress-updates/"+updateID+"/reviews", map[string]string{
		"reviewStatus":          "needs_changes",
		"reviewComment":         "   ",
		"officialProgressState": "needs_changes",
	})
	if missingGuidanceReview.StatusCode != http.StatusBadRequest {
		t.Fatalf("missing guidance review status = %d", missingGuidanceReview.StatusCode)
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

func TestProgressReviewRechecksManagerAfterLifecycleLock(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	otherTeacherID := createTestUser(t, app.db, prefix+"other.teacher@unitrack.local", "teacher12345", RoleTeacher, "Other Teacher")
	studentID := createTestUser(t, app.db, prefix+"student@unitrack.local", "student12345", RoleStudent, "Student")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Review Manager Race Project")
	addProjectMember(t, app.db, projectID, studentID)
	taskID := createTestTask(t, app.db, projectID, teacherID, "Review race assignment")
	assignTask(t, app.db, taskID, studentID)
	updateID := createTestProgressUpdate(t, app.db, projectID, taskID, studentID, "Ready for review")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	tx, err := app.db.Begin(context.Background())
	if err != nil {
		t.Fatalf("begin review manager race tx: %v", err)
	}
	defer func() { _ = tx.Rollback(context.Background()) }()
	var lockedStatus string
	if err := tx.QueryRow(context.Background(), `SELECT status FROM projects WHERE id = $1 FOR UPDATE`, projectID).Scan(&lockedStatus); err != nil {
		t.Fatalf("lock project: %v", err)
	}
	if _, err := tx.Exec(context.Background(), `UPDATE projects SET supervisor_id = $1 WHERE id = $2`, otherTeacherID, projectID); err != nil {
		t.Fatalf("reassign supervisor while project lock is held: %v", err)
	}

	resultCh := make(chan asyncHTTPResult, 1)
	go func() {
		status, body, err := requestJSONBodyNoFatal(app, http.MethodPost, "/api/v1/projects/"+projectID+"/progress-updates/"+updateID+"/reviews", map[string]string{
			"reviewStatus":          "approved",
			"officialProgressState": "in_progress",
		})
		resultCh <- asyncHTTPResult{status: status, body: body, err: err}
	}()

	select {
	case result := <-resultCh:
		if result.err != nil {
			t.Fatalf("review request failed before project lock release: %v", result.err)
		}
		t.Fatalf("review completed before project lock release with status %d body = %s", result.status, string(result.body))
	case <-time.After(150 * time.Millisecond):
	}

	if err := tx.Commit(context.Background()); err != nil {
		t.Fatalf("commit supervisor reassignment: %v", err)
	}

	select {
	case result := <-resultCh:
		if result.err != nil {
			t.Fatalf("review request failed: %v", result.err)
		}
		if result.status != http.StatusForbidden {
			t.Fatalf("review after supervisor reassignment status = %d body = %s", result.status, string(result.body))
		}
	case <-time.After(5 * time.Second):
		t.Fatal("review request did not finish after project lock released")
	}

	var reviewCount int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM progress_reviews WHERE progress_update_id = $1`, updateID).Scan(&reviewCount); err != nil {
		t.Fatalf("count race reviews: %v", err)
	}
	if reviewCount != 0 {
		t.Fatalf("race review count = %d, want 0", reviewCount)
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
	if _, err := app.db.Exec(context.Background(), `UPDATE projects SET status = 'completed' WHERE id = $1`, projectID); err != nil {
		t.Fatalf("complete project: %v", err)
	}
	completedDownloadStatus, completedDownloadBody := requestJSONBody(t, app, http.MethodGet, "/api/v1/projects/"+projectID+"/files/"+uploaded.ID+"/download", nil)
	if completedDownloadStatus != http.StatusOK || string(completedDownloadBody) != "demo evidence" {
		t.Fatalf("completed download status = %d body = %q", completedDownloadStatus, string(completedDownloadBody))
	}
	completedDelete := requestJSON(t, app, http.MethodDelete, "/api/v1/projects/"+projectID+"/files/"+uploaded.ID, nil)
	if completedDelete.StatusCode != http.StatusConflict {
		t.Fatalf("completed delete evidence status = %d", completedDelete.StatusCode)
	}
	if _, err := app.db.Exec(context.Background(), `UPDATE projects SET status = 'archived' WHERE id = $1`, projectID); err != nil {
		t.Fatalf("archive project: %v", err)
	}
	archivedDownloadStatus, archivedDownloadBody := requestJSONBody(t, app, http.MethodGet, "/api/v1/projects/"+projectID+"/files/"+uploaded.ID+"/download", nil)
	if archivedDownloadStatus != http.StatusOK || string(archivedDownloadBody) != "demo evidence" {
		t.Fatalf("archived download status = %d body = %q", archivedDownloadStatus, string(archivedDownloadBody))
	}
	archivedDelete := requestJSON(t, app, http.MethodDelete, "/api/v1/projects/"+projectID+"/files/"+uploaded.ID, nil)
	if archivedDelete.StatusCode != http.StatusConflict {
		t.Fatalf("archived delete evidence status = %d", archivedDelete.StatusCode)
	}
	if _, err := app.db.Exec(context.Background(), `UPDATE projects SET status = 'active' WHERE id = $1`, projectID); err != nil {
		t.Fatalf("reactivate project: %v", err)
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

func TestEvidenceUploadRechecksProjectAccessAfterLifecycleLock(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	studentID := createTestUser(t, app.db, prefix+"student@unitrack.local", "student12345", RoleStudent, "Student")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Evidence Access Race Project")
	addProjectMember(t, app.db, projectID, studentID)
	taskID := createTestTask(t, app.db, projectID, teacherID, "Evidence race assignment")
	assignTask(t, app.db, taskID, studentID)
	updateID := createTestProgressUpdate(t, app.db, projectID, taskID, studentID, "Ready for evidence")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	login(t, app, prefix+"student@unitrack.local", "student12345")
	tx, err := app.db.Begin(context.Background())
	if err != nil {
		t.Fatalf("begin evidence access race tx: %v", err)
	}
	defer func() { _ = tx.Rollback(context.Background()) }()
	var lockedStatus string
	if err := tx.QueryRow(context.Background(), `SELECT status FROM projects WHERE id = $1 FOR UPDATE`, projectID).Scan(&lockedStatus); err != nil {
		t.Fatalf("lock project: %v", err)
	}
	if _, err := tx.Exec(context.Background(), `DELETE FROM task_assignees WHERE project_id = $1 AND task_id = $2 AND student_id = $3`, projectID, taskID, studentID); err != nil {
		t.Fatalf("delete task assignment while project lock is held: %v", err)
	}
	if _, err := tx.Exec(context.Background(), `DELETE FROM project_members WHERE project_id = $1 AND student_id = $2`, projectID, studentID); err != nil {
		t.Fatalf("delete project membership while project lock is held: %v", err)
	}

	resultCh := make(chan asyncHTTPResult, 1)
	go func() {
		status, body, err := requestMultipartFileNoFatal(app, http.MethodPost, "/api/v1/projects/"+projectID+"/progress-updates/"+updateID+"/files", "file", "race.txt", []byte("race evidence"))
		resultCh <- asyncHTTPResult{status: status, body: body, err: err}
	}()

	select {
	case result := <-resultCh:
		if result.err != nil {
			t.Fatalf("evidence upload failed before project lock release: %v", result.err)
		}
		t.Fatalf("evidence upload completed before project lock release with status %d body = %s", result.status, string(result.body))
	case <-time.After(150 * time.Millisecond):
	}

	if err := tx.Commit(context.Background()); err != nil {
		t.Fatalf("commit membership removal: %v", err)
	}

	select {
	case result := <-resultCh:
		if result.err != nil {
			t.Fatalf("evidence upload request failed: %v", result.err)
		}
		if result.status != http.StatusForbidden {
			t.Fatalf("evidence upload after membership removal status = %d body = %s", result.status, string(result.body))
		}
	case <-time.After(5 * time.Second):
		t.Fatal("evidence upload request did not finish after project lock released")
	}

	var fileCount int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM uploaded_files WHERE project_id = $1 AND related_entity_id = $2`, projectID, updateID).Scan(&fileCount); err != nil {
		t.Fatalf("count race evidence files: %v", err)
	}
	if fileCount != 0 {
		t.Fatalf("race evidence file count = %d, want 0", fileCount)
	}
}

func TestReviewedSubmissionSupportRecordsAreImmutable(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	studentID := createTestUser(t, app.db, prefix+"student@unitrack.local", "student12345", RoleStudent, "Student")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Reviewed Support Project")
	addProjectMember(t, app.db, projectID, studentID)
	taskID := createTestTask(t, app.db, projectID, teacherID, "Reviewed support assignment")
	assignTask(t, app.db, taskID, studentID)
	updateID := createTestProgressUpdate(t, app.db, projectID, taskID, studentID, "Ready for support")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	login(t, app, prefix+"student@unitrack.local", "student12345")
	resourceStatus, resourceBody := requestJSONBody(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/resource-links", map[string]string{
		"relatedType": "progress_update",
		"relatedId":   updateID,
		"title":       "Submission notes",
		"url":         "https://example.com/submission-notes",
	})
	if resourceStatus != http.StatusCreated {
		t.Fatalf("create pending submission resource status = %d body = %s", resourceStatus, string(resourceBody))
	}
	var resource ResourceLinkDTO
	if err := json.Unmarshal(resourceBody, &resource); err != nil {
		t.Fatalf("decode submission resource: %v", err)
	}
	uploadStatus, uploadBody := requestMultipartFile(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/progress-updates/"+updateID+"/files", "file", "reviewed.txt", []byte("reviewed evidence"))
	if uploadStatus != http.StatusCreated {
		t.Fatalf("upload pending evidence status = %d body = %s", uploadStatus, string(uploadBody))
	}
	var uploaded UploadedFileDTO
	if err := json.Unmarshal(uploadBody, &uploaded); err != nil {
		t.Fatalf("decode uploaded evidence: %v", err)
	}

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	review := requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/progress-updates/"+updateID+"/reviews", map[string]string{
		"reviewStatus":          "approved",
		"officialProgressState": "in_progress",
	})
	if review.StatusCode != http.StatusOK {
		t.Fatalf("review support submission status = %d", review.StatusCode)
	}

	newResource := requestJSON(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/resource-links", map[string]string{
		"relatedType": "progress_update",
		"relatedId":   updateID,
		"title":       "Late notes",
		"url":         "https://example.com/late-notes",
	})
	if newResource.StatusCode != http.StatusConflict {
		t.Fatalf("create reviewed submission resource status = %d", newResource.StatusCode)
	}
	updateResource := requestJSON(t, app, http.MethodPatch, "/api/v1/projects/"+projectID+"/resource-links/"+resource.ID, map[string]string{"title": "Changed after review"})
	if updateResource.StatusCode != http.StatusConflict {
		t.Fatalf("update reviewed submission resource status = %d", updateResource.StatusCode)
	}
	deleteResource := requestJSON(t, app, http.MethodDelete, "/api/v1/projects/"+projectID+"/resource-links/"+resource.ID, nil)
	if deleteResource.StatusCode != http.StatusConflict {
		t.Fatalf("delete reviewed submission resource status = %d", deleteResource.StatusCode)
	}
	lateUploadStatus, _ := requestMultipartFile(t, app, http.MethodPost, "/api/v1/projects/"+projectID+"/progress-updates/"+updateID+"/files", "file", "late.txt", []byte("late evidence"))
	if lateUploadStatus != http.StatusConflict {
		t.Fatalf("upload reviewed evidence status = %d", lateUploadStatus)
	}
	deleteFile := requestJSON(t, app, http.MethodDelete, "/api/v1/projects/"+projectID+"/files/"+uploaded.ID, nil)
	if deleteFile.StatusCode != http.StatusConflict {
		t.Fatalf("delete reviewed evidence status = %d", deleteFile.StatusCode)
	}
	downloadStatus, downloadBody := requestJSONBody(t, app, http.MethodGet, "/api/v1/projects/"+projectID+"/files/"+uploaded.ID+"/download", nil)
	if downloadStatus != http.StatusOK || string(downloadBody) != "reviewed evidence" {
		t.Fatalf("download reviewed evidence status = %d body = %q", downloadStatus, string(downloadBody))
	}
}

func TestDatabasePreservesReviewedSubmissionSupport(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	studentID := createTestUser(t, app.db, prefix+"student@unitrack.local", "student12345", RoleStudent, "Student")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Reviewed DB Support Project")
	addProjectMember(t, app.db, projectID, studentID)
	taskID := createTestTask(t, app.db, projectID, teacherID, "Reviewed DB support assignment")
	assignTask(t, app.db, taskID, studentID)
	updateID := createTestProgressUpdate(t, app.db, projectID, taskID, studentID, "Reviewed DB support submission")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	var resourceID string
	if err := app.db.QueryRow(context.Background(), `
		INSERT INTO resource_links (project_id, related_entity_type, related_entity_id, title, url, added_by)
		VALUES ($1, 'progress_update', $2, $3, 'https://example.com/reviewed-db-support', $4)
		RETURNING id::text
	`, projectID, updateID, prefix+"Reviewed submission resource", studentID).Scan(&resourceID); err != nil {
		t.Fatalf("insert pending submission resource: %v", err)
	}

	var projectResourceID string
	if err := app.db.QueryRow(context.Background(), `
		INSERT INTO resource_links (project_id, related_entity_type, related_entity_id, title, url, added_by)
		VALUES ($1, 'project', $1, $2, 'https://example.com/project-db-support', $3)
		RETURNING id::text
	`, projectID, prefix+"Project resource", studentID).Scan(&projectResourceID); err != nil {
		t.Fatalf("insert project resource: %v", err)
	}

	var fileID string
	if err := app.db.QueryRow(context.Background(), `
		INSERT INTO uploaded_files (project_id, related_entity_type, related_entity_id, original_file_name, stored_file_name, storage_path, file_size_bytes, uploaded_by)
		VALUES ($1, 'progress_update', $2, 'reviewed.txt', 'reviewed.txt', '/tmp/unitrack-reviewed.txt', 1, $3)
		RETURNING id::text
	`, projectID, updateID, studentID).Scan(&fileID); err != nil {
		t.Fatalf("insert pending submission evidence metadata: %v", err)
	}

	if _, err := app.db.Exec(context.Background(), `INSERT INTO progress_reviews (progress_update_id, reviewed_by, review_status) VALUES ($1, $2, 'approved')`, updateID, teacherID); err != nil {
		t.Fatalf("insert review row: %v", err)
	}
	if _, err := app.db.Exec(context.Background(), `UPDATE progress_updates SET review_status = 'approved' WHERE id = $1`, updateID); err != nil {
		t.Fatalf("mark submission reviewed: %v", err)
	}

	if _, err := app.db.Exec(context.Background(), `
		INSERT INTO resource_links (project_id, related_entity_type, related_entity_id, title, url, added_by)
		VALUES ($1, 'progress_update', $2, $3, 'https://example.com/reviewed-db-support-late', $4)
	`, projectID, updateID, prefix+"Late reviewed resource", studentID); err == nil {
		t.Fatalf("late reviewed submission resource insert succeeded")
	} else if !strings.Contains(err.Error(), "reviewed submission resource links are immutable") {
		t.Fatalf("late reviewed submission resource insert error = %v", err)
	}

	if _, err := app.db.Exec(context.Background(), `UPDATE resource_links SET title = $1 WHERE id = $2`, prefix+"Changed reviewed resource", resourceID); err == nil {
		t.Fatalf("reviewed submission resource update succeeded")
	} else if !strings.Contains(err.Error(), "reviewed submission resource links are immutable") {
		t.Fatalf("reviewed submission resource update error = %v", err)
	}

	if _, err := app.db.Exec(context.Background(), `UPDATE resource_links SET related_entity_type = 'progress_update', related_entity_id = $1 WHERE id = $2`, updateID, projectResourceID); err == nil {
		t.Fatalf("project resource retarget to reviewed submission succeeded")
	} else if !strings.Contains(err.Error(), "reviewed submission resource links are immutable") {
		t.Fatalf("project resource retarget error = %v", err)
	}

	if _, err := app.db.Exec(context.Background(), `DELETE FROM resource_links WHERE id = $1`, resourceID); err == nil {
		t.Fatalf("reviewed submission resource delete succeeded")
	} else if !strings.Contains(err.Error(), "reviewed submission resource links are immutable") {
		t.Fatalf("reviewed submission resource delete error = %v", err)
	}

	if _, err := app.db.Exec(context.Background(), `
		INSERT INTO uploaded_files (project_id, related_entity_type, related_entity_id, original_file_name, stored_file_name, storage_path, file_size_bytes, uploaded_by)
		VALUES ($1, 'progress_update', $2, 'late.txt', 'late.txt', '/tmp/unitrack-reviewed-late.txt', 1, $3)
	`, projectID, updateID, studentID); err == nil {
		t.Fatalf("late reviewed evidence metadata insert succeeded")
	} else if !strings.Contains(err.Error(), "reviewed submission evidence files are immutable") {
		t.Fatalf("late reviewed evidence metadata insert error = %v", err)
	}

	if _, err := app.db.Exec(context.Background(), `UPDATE uploaded_files SET original_file_name = 'changed.txt' WHERE id = $1`, fileID); err == nil {
		t.Fatalf("reviewed evidence metadata update succeeded")
	} else if !strings.Contains(err.Error(), "reviewed submission evidence files are immutable") {
		t.Fatalf("reviewed evidence metadata update error = %v", err)
	}

	if _, err := app.db.Exec(context.Background(), `DELETE FROM uploaded_files WHERE id = $1`, fileID); err == nil {
		t.Fatalf("reviewed evidence metadata delete succeeded")
	} else if !strings.Contains(err.Error(), "reviewed submission evidence files are immutable") {
		t.Fatalf("reviewed evidence metadata delete error = %v", err)
	}

	if _, err := app.db.Exec(context.Background(), `UPDATE progress_updates SET review_status = 'pending_review' WHERE id = $1`, updateID); err == nil {
		t.Fatalf("reviewed submission status revert succeeded")
	} else if !strings.Contains(err.Error(), "reviewed submission review status is immutable") {
		t.Fatalf("reviewed submission status revert error = %v", err)
	}

	tx, err := app.db.Begin(context.Background())
	if err != nil {
		t.Fatalf("begin reviewed support cleanup tx: %v", err)
	}
	if _, err := tx.Exec(context.Background(), `DELETE FROM progress_updates WHERE id = $1`, updateID); err != nil {
		_ = tx.Rollback(context.Background())
		t.Fatalf("delete reviewed parent submission in cleanup tx: %v", err)
	}
	if _, err := tx.Exec(context.Background(), `DELETE FROM uploaded_files WHERE id = $1`, fileID); err != nil {
		_ = tx.Rollback(context.Background())
		t.Fatalf("delete reviewed evidence metadata in cleanup tx: %v", err)
	}
	if _, err := tx.Exec(context.Background(), `DELETE FROM resource_links WHERE id = $1`, resourceID); err != nil {
		_ = tx.Rollback(context.Background())
		t.Fatalf("delete reviewed resource in cleanup tx: %v", err)
	}
	if err := tx.Commit(context.Background()); err != nil {
		t.Fatalf("commit reviewed support cleanup tx: %v", err)
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

func TestMilestoneReorderRequiresCompleteProjectOrder(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Milestone Reorder Project")
	otherProjectID := createTestProject(t, app.db, teacherID, prefix+"Other Milestone Reorder Project")
	firstID := createTestMilestone(t, app.db, projectID, teacherID, "First checkpoint", 1)
	secondID := createTestMilestone(t, app.db, projectID, teacherID, "Second checkpoint", 2)
	thirdID := createTestMilestone(t, app.db, projectID, teacherID, "Third checkpoint", 3)
	otherID := createTestMilestone(t, app.db, otherProjectID, teacherID, "Other checkpoint", 1)
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, "", prefix) })

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	partialOrder := requestJSON(t, app, http.MethodPatch, "/api/v1/projects/"+projectID+"/milestones/reorder", map[string]any{"milestoneIds": []string{thirdID, firstID}})
	if partialOrder.StatusCode != http.StatusBadRequest {
		t.Fatalf("partial milestone reorder status = %d", partialOrder.StatusCode)
	}
	crossProjectOrder := requestJSON(t, app, http.MethodPatch, "/api/v1/projects/"+projectID+"/milestones/reorder", map[string]any{"milestoneIds": []string{thirdID, otherID, firstID}})
	if crossProjectOrder.StatusCode != http.StatusBadRequest {
		t.Fatalf("cross-project milestone reorder status = %d", crossProjectOrder.StatusCode)
	}
	duplicateOrder := requestJSON(t, app, http.MethodPatch, "/api/v1/projects/"+projectID+"/milestones/reorder", map[string]any{"milestoneIds": []string{thirdID, thirdID, firstID}})
	if duplicateOrder.StatusCode != http.StatusBadRequest {
		t.Fatalf("duplicate milestone reorder status = %d", duplicateOrder.StatusCode)
	}

	status, body := requestJSONBody(t, app, http.MethodPatch, "/api/v1/projects/"+projectID+"/milestones/reorder", map[string]any{"milestoneIds": []string{thirdID, firstID, secondID}})
	if status != http.StatusOK {
		t.Fatalf("milestone reorder status = %d body = %s", status, string(body))
	}
	var milestones []MilestoneDTO
	if err := json.Unmarshal(body, &milestones); err != nil {
		t.Fatalf("decode reordered milestones: %v", err)
	}
	if len(milestones) != 3 || milestones[0].ID != thirdID || milestones[1].ID != firstID || milestones[2].ID != secondID {
		t.Fatalf("reordered milestones = %#v", milestones)
	}
	assertMilestoneOrder(t, app, projectID, []string{thirdID, firstID, secondID})
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

func TestResourceCreateRechecksProjectAccessAfterLifecycleLock(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	studentID := createTestUser(t, app.db, prefix+"student@unitrack.local", "student12345", RoleStudent, "Student")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Resource Access Race Project")
	addProjectMember(t, app.db, projectID, studentID)
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	login(t, app, prefix+"student@unitrack.local", "student12345")
	tx, err := app.db.Begin(context.Background())
	if err != nil {
		t.Fatalf("begin resource access race tx: %v", err)
	}
	defer func() { _ = tx.Rollback(context.Background()) }()
	var lockedStatus string
	if err := tx.QueryRow(context.Background(), `SELECT status FROM projects WHERE id = $1 FOR UPDATE`, projectID).Scan(&lockedStatus); err != nil {
		t.Fatalf("lock project: %v", err)
	}
	if _, err := tx.Exec(context.Background(), `DELETE FROM project_members WHERE project_id = $1 AND student_id = $2`, projectID, studentID); err != nil {
		t.Fatalf("delete project membership while project lock is held: %v", err)
	}

	resultCh := make(chan asyncHTTPResult, 1)
	go func() {
		status, body, err := requestJSONBodyNoFatal(app, http.MethodPost, "/api/v1/projects/"+projectID+"/resource-links", map[string]string{
			"title": "Race resource",
			"url":   "https://example.com/race-resource",
		})
		resultCh <- asyncHTTPResult{status: status, body: body, err: err}
	}()

	select {
	case result := <-resultCh:
		if result.err != nil {
			t.Fatalf("resource create failed before project lock release: %v", result.err)
		}
		t.Fatalf("resource create completed before project lock release with status %d body = %s", result.status, string(result.body))
	case <-time.After(150 * time.Millisecond):
	}

	if err := tx.Commit(context.Background()); err != nil {
		t.Fatalf("commit membership removal: %v", err)
	}

	select {
	case result := <-resultCh:
		if result.err != nil {
			t.Fatalf("resource create request failed: %v", result.err)
		}
		if result.status != http.StatusForbidden {
			t.Fatalf("resource create after membership removal status = %d body = %s", result.status, string(result.body))
		}
	case <-time.After(5 * time.Second):
		t.Fatal("resource create request did not finish after project lock released")
	}

	var resourceCount int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM resource_links WHERE project_id = $1 AND title = 'Race resource'`, projectID).Scan(&resourceCount); err != nil {
		t.Fatalf("count race resources: %v", err)
	}
	if resourceCount != 0 {
		t.Fatalf("race resource count = %d, want 0", resourceCount)
	}
}

func TestResourcePartialUpdatePreservesConcurrentMetadataChange(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Resource Concurrent Project")
	t.Cleanup(func() { cleanupProjectAndUsers(t, app.db, projectID, prefix) })

	var resourceID string
	if err := app.db.QueryRow(context.Background(), `
		INSERT INTO resource_links (project_id, related_entity_type, related_entity_id, title, url, type, description, added_by)
		VALUES ($1, 'project', $1, 'Original resource', 'https://example.com/original', 'external_link', 'Original description', $2)
		RETURNING id::text
	`, projectID, teacherID).Scan(&resourceID); err != nil {
		t.Fatalf("create resource: %v", err)
	}

	login(t, app, prefix+"teacher@unitrack.local", "teacher12345")
	tx, err := app.db.Begin(context.Background())
	if err != nil {
		t.Fatalf("begin resource update race tx: %v", err)
	}
	defer func() { _ = tx.Rollback(context.Background()) }()
	var lockedStatus string
	if err := tx.QueryRow(context.Background(), `SELECT status FROM projects WHERE id = $1 FOR UPDATE`, projectID).Scan(&lockedStatus); err != nil {
		t.Fatalf("lock project: %v", err)
	}
	if _, err := tx.Exec(context.Background(), `UPDATE resource_links SET title = 'Concurrent resource', description = 'Concurrent description' WHERE id = $1`, resourceID); err != nil {
		t.Fatalf("update resource while project lock is held: %v", err)
	}

	resultCh := make(chan asyncHTTPResult, 1)
	go func() {
		status, body, err := requestJSONBodyNoFatal(app, http.MethodPatch, "/api/v1/projects/"+projectID+"/resource-links/"+resourceID, map[string]string{"type": "document"})
		resultCh <- asyncHTTPResult{status: status, body: body, err: err}
	}()

	select {
	case result := <-resultCh:
		if result.err != nil {
			t.Fatalf("resource update failed before project lock release: %v", result.err)
		}
		t.Fatalf("resource update completed before project lock release with status %d body = %s", result.status, string(result.body))
	case <-time.After(150 * time.Millisecond):
	}

	if err := tx.Commit(context.Background()); err != nil {
		t.Fatalf("commit concurrent resource update: %v", err)
	}

	select {
	case result := <-resultCh:
		if result.err != nil {
			t.Fatalf("resource update request failed: %v", result.err)
		}
		if result.status != http.StatusOK {
			t.Fatalf("resource partial update status = %d body = %s", result.status, string(result.body))
		}
	case <-time.After(5 * time.Second):
		t.Fatal("resource update request did not finish after project lock released")
	}

	var title, linkType, description string
	if err := app.db.QueryRow(context.Background(), `SELECT title, type, description FROM resource_links WHERE id = $1`, resourceID).Scan(&title, &linkType, &description); err != nil {
		t.Fatalf("load resource after concurrent update: %v", err)
	}
	if title != "Concurrent resource" || description != "Concurrent description" || linkType != "document" {
		t.Fatalf("resource after concurrent update title/description/type = %q/%q/%q", title, description, linkType)
	}
}

func TestResourceLinkTargetAndURLValidation(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	teacherID := createTestUser(t, app.db, prefix+"teacher@unitrack.local", "teacher12345", RoleTeacher, "Teacher")
	studentID := createTestUser(t, app.db, prefix+"student@unitrack.local", "student12345", RoleStudent, "Student")
	projectID := createTestProject(t, app.db, teacherID, prefix+"Resource Validation Project")
	otherProjectID := createTestProject(t, app.db, teacherID, prefix+"Other Resource Validation Project")
	addProjectMember(t, app.db, otherProjectID, studentID)
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
	invalidMemberID := requestJSON(t, app, http.MethodDelete, "/api/v1/projects/"+projectID+"/members/not-a-uuid", nil)
	if invalidMemberID.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid member id remove status = %d", invalidMemberID.StatusCode)
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
	var auditCount int
	if err := app.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM activity_logs WHERE actor_id = $1 AND project_id = $2 AND action = 'project.member_removed' AND entity_id = $3`, teacherID, projectID, studentID).Scan(&auditCount); err != nil {
		t.Fatalf("count member remove audit logs: %v", err)
	}
	if auditCount != 1 {
		t.Fatalf("member remove audit logs = %d, want 1", auditCount)
	}
	var removedAssignmentLinks string
	if err := app.db.QueryRow(context.Background(), `SELECT metadata->>'taskAssigneeLinksRemoved' FROM activity_logs WHERE actor_id = $1 AND project_id = $2 AND action = 'project.member_removed' AND entity_id = $3`, teacherID, projectID, studentID).Scan(&removedAssignmentLinks); err != nil {
		t.Fatalf("load member remove audit metadata: %v", err)
	}
	if removedAssignmentLinks != "1" {
		t.Fatalf("member remove assignment cleanup metadata = %q, want 1", removedAssignmentLinks)
	}
}

func TestCourseSectionRoutesEnforceTeacherOwnership(t *testing.T) {
	app := newTestApp(t)
	prefix := testPrefix()
	createTestUser(t, app.db, prefix+"admin@unitrack.local", "admin12345", RoleAdmin, "Admin")
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
	if _, err := app.db.Exec(context.Background(), `UPDATE course_sections SET status = 'archived' WHERE id = $1`, classID); err != nil {
		t.Fatalf("archive class: %v", err)
	}
	archivedLink := requestJSON(t, app, http.MethodPost, "/api/v1/classes/"+classID+"/projects", map[string]string{"projectId": projectID})
	if archivedLink.StatusCode != http.StatusForbidden {
		t.Fatalf("link archived class status = %d", archivedLink.StatusCode)
	}
	assertProjectLinkedClass(t, app, projectID, moveTargetClassID)

	login(t, app, prefix+"admin@unitrack.local", "admin12345")
	adminCrossOwnerLink := requestJSON(t, app, http.MethodPost, "/api/v1/classes/"+classID+"/projects", map[string]string{"projectId": otherProjectID})
	if adminCrossOwnerLink.StatusCode != http.StatusForbidden {
		t.Fatalf("admin archived cross-owner link status = %d", adminCrossOwnerLink.StatusCode)
	}
	activeCrossOwnerLink := requestJSON(t, app, http.MethodPost, "/api/v1/classes/"+moveTargetClassID+"/projects", map[string]string{"projectId": otherProjectID})
	if activeCrossOwnerLink.StatusCode != http.StatusBadRequest {
		t.Fatalf("admin cross-owner link status = %d", activeCrossOwnerLink.StatusCode)
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

func assertMilestoneOrder(t *testing.T, app *testApp, projectID string, want []string) {
	t.Helper()
	rows, err := app.db.Query(context.Background(), `SELECT id::text FROM project_milestones WHERE project_id = $1 ORDER BY sort_order ASC, target_date ASC NULLS LAST, created_at ASC`, projectID)
	if err != nil {
		t.Fatalf("load milestone order: %v", err)
	}
	defer rows.Close()

	got := []string{}
	for rows.Next() {
		var milestoneID string
		if err := rows.Scan(&milestoneID); err != nil {
			t.Fatalf("scan milestone order: %v", err)
		}
		got = append(got, milestoneID)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("read milestone order: %v", err)
	}
	if len(got) != len(want) {
		t.Fatalf("milestone order length = %d, want %d: got %#v", len(got), len(want), got)
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("milestone order = %#v, want %#v", got, want)
		}
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
	if _, err := db.Exec(context.Background(), `
		INSERT INTO task_assignees (project_id, task_id, student_id)
		SELECT project_id, id, $2
		FROM tasks
		WHERE id = $1
	`, taskID, studentID); err != nil {
		t.Fatalf("assign task: %v", err)
	}
}

func createTestProgressUpdate(t *testing.T, db *pgxpool.Pool, projectID string, taskID string, studentID string, description string) string {
	t.Helper()
	if _, err := db.Exec(context.Background(), `
		INSERT INTO task_assignees (project_id, task_id, student_id)
		VALUES ($1, $2, $3)
		ON CONFLICT (task_id, student_id) DO NOTHING
	`, projectID, taskID, studentID); err != nil {
		t.Fatalf("ensure progress assignee: %v", err)
	}
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

func newTestHTTPClient(t *testing.T) *http.Client {
	t.Helper()
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatalf("cookie jar: %v", err)
	}
	return &http.Client{Jar: jar}
}

func loginWithClient(t *testing.T, app *testApp, client *http.Client, email string, password string) {
	t.Helper()
	status, body, err := requestJSONBodyWithClientNoFatal(app, client, http.MethodPost, "/api/v1/auth/login", map[string]string{"email": email, "password": password})
	if err != nil {
		t.Fatalf("login request: %v", err)
	}
	if status != http.StatusOK {
		t.Fatalf("login status = %d body = %s", status, string(body))
	}
}

func userListContainsEmail(users []UserDTO, email string) bool {
	for _, user := range users {
		if strings.EqualFold(user.Email, email) {
			return true
		}
	}
	return false
}

func deactivateOtherActiveAdmins(t *testing.T, db *pgxpool.Pool, emailPrefix string) {
	t.Helper()
	ctx := context.Background()
	rows, err := db.Query(ctx, `SELECT id::text FROM users WHERE role = 'admin' AND status = 'active' AND email NOT LIKE $1`, strings.ToLower(emailPrefix)+"%")
	if err != nil {
		t.Fatalf("list existing active admins: %v", err)
	}
	defer rows.Close()
	adminIDs := []string{}
	for rows.Next() {
		var adminID string
		if err := rows.Scan(&adminID); err != nil {
			t.Fatalf("scan existing active admin: %v", err)
		}
		adminIDs = append(adminIDs, adminID)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("list existing active admins: %v", err)
	}
	for _, adminID := range adminIDs {
		if _, err := db.Exec(ctx, `UPDATE users SET status = 'inactive' WHERE id = $1`, adminID); err != nil {
			t.Fatalf("temporarily deactivate existing admin: %v", err)
		}
	}
	t.Cleanup(func() {
		for _, adminID := range adminIDs {
			_, _ = db.Exec(context.Background(), `UPDATE users SET status = 'active' WHERE id = $1`, adminID)
		}
	})
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
	setTrustedOriginForUnsafeRequest(request)
	response, err := app.client.Do(request)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	defer response.Body.Close()
	return response
}

func requestRawJSONBody(t *testing.T, app *testApp, method string, path string, body string) (int, []byte) {
	t.Helper()
	request, err := http.NewRequest(method, app.server.URL+path, strings.NewReader(body))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	setTrustedOriginForUnsafeRequest(request)
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

func assertSessionCookieCleared(t *testing.T, response *http.Response, cookieName string) {
	t.Helper()
	assertSessionCookieAttrs(t, response, cookieName, cookieName+"=;", "Max-Age=0")
}

func assertSessionCookieAttrs(t *testing.T, response *http.Response, cookieName string, attrs ...string) {
	t.Helper()
	header := sessionSetCookieHeader(response, cookieName)
	if header == "" {
		t.Fatalf("missing Set-Cookie for %s; headers = %#v", cookieName, response.Header.Values("Set-Cookie"))
	}
	for _, attr := range attrs {
		if !strings.Contains(header, attr) {
			t.Fatalf("Set-Cookie %q missing %q", header, attr)
		}
	}
}

func sessionSetCookieHeader(response *http.Response, cookieName string) string {
	for _, header := range response.Header.Values("Set-Cookie") {
		if strings.HasPrefix(header, cookieName+"=") {
			return header
		}
	}
	return ""
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
	setTrustedOriginForUnsafeRequest(request)
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

type asyncHTTPResult struct {
	status int
	body   []byte
	err    error
}

func requestJSONBodyNoFatal(app *testApp, method string, path string, payload any) (int, []byte, error) {
	return requestJSONBodyWithClientNoFatal(app, app.client, method, path, payload)
}

func requestJSONBodyWithClientNoFatal(app *testApp, client *http.Client, method string, path string, payload any) (int, []byte, error) {
	var bodyReader *bytes.Reader
	if payload == nil {
		bodyReader = bytes.NewReader(nil)
	} else {
		body, err := json.Marshal(payload)
		if err != nil {
			return 0, nil, err
		}
		bodyReader = bytes.NewReader(body)
	}
	request, err := http.NewRequest(method, app.server.URL+path, bodyReader)
	if err != nil {
		return 0, nil, err
	}
	request.Header.Set("Content-Type", "application/json")
	setTrustedOriginForUnsafeRequest(request)
	response, err := client.Do(request)
	if err != nil {
		return 0, nil, err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		return response.StatusCode, nil, err
	}
	return response.StatusCode, body, nil
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
	status, responseBody, err := requestMultipartFileNoFatal(app, method, path, fieldName, fileName, contents)
	if err != nil {
		t.Fatalf("multipart request: %v", err)
	}
	return status, responseBody
}

func requestMultipartFileNoFatal(app *testApp, method string, path string, fieldName string, fileName string, contents []byte) (int, []byte, error) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile(fieldName, fileName)
	if err != nil {
		return 0, nil, err
	}
	if _, err := part.Write(contents); err != nil {
		return 0, nil, err
	}
	if err := writer.Close(); err != nil {
		return 0, nil, err
	}
	request, err := http.NewRequest(method, app.server.URL+path, &body)
	if err != nil {
		return 0, nil, err
	}
	request.Header.Set("Content-Type", writer.FormDataContentType())
	setTrustedOriginForUnsafeRequest(request)
	response, err := app.client.Do(request)
	if err != nil {
		return 0, nil, err
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(response.Body)
	if err != nil {
		return response.StatusCode, nil, err
	}
	return response.StatusCode, responseBody, nil
}

func setTrustedOriginForUnsafeRequest(request *http.Request) {
	if !isSafeHTTPMethod(request.Method) {
		request.Header.Set("Origin", testTrustedOrigin)
	}
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
