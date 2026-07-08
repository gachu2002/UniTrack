package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"net"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

const (
	seedDomain   = "demo.unitrack.local"
	seedLabel    = "render-demo-v1"
	seedPassword = "DemoPass123!"
)

type seedUser struct {
	ID       string
	FullName string
	Email    string
	Role     string
	Status   string
}

type seedProject struct {
	ID           string
	Name         string
	Status       string
	SupervisorID string
	MemberIDs    []string
	Milestones   []seedMilestone
}

type seedFolder struct {
	ID             string
	OwnerTeacherID string
}

type seedMilestone struct {
	ID    string
	Title string
	Tasks []seedTask
}

type seedTask struct {
	ID          string
	Title       string
	Status      string
	AssigneeIDs []string
}

type summary struct {
	Admins          int
	Teachers        int
	Students        int
	Folders         int
	Projects        int
	Members         int
	Milestones      int
	Tasks           int
	Assignees       int
	ProgressUpdates int
	Reviews         int
	Resources       int
	ActivityLogs    int
}

func main() {
	teacherCount := flag.Int("teachers", 16, "number of demo teachers to create")
	studentCount := flag.Int("students", 240, "number of demo students to create")
	projectCount := flag.Int("projects", 72, "number of demo projects to create")
	reset := flag.Bool("reset", false, "delete previous UniTrack demo seed data before inserting")
	resetConfirm := flag.String("confirm-reset", "", "required confirmation value for -reset; use demo.unitrack.local")
	allowNonLocal := flag.Bool("allow-non-local", false, "allow seeding a non-local DATABASE_URL; requires DEMO_SEED_PASSWORD")
	flag.Parse()

	if *teacherCount < 4 || *studentCount < 12 || *projectCount < 4 {
		log.Fatal("seed counts are too small; use at least -teachers=4 -students=12 -projects=4")
	}
	if *reset && strings.TrimSpace(*resetConfirm) != seedDomain {
		log.Fatalf("-reset deletes previous demo seed rows; rerun with -reset -confirm-reset=%s", seedDomain)
	}

	databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}
	localDatabase := isLocalDatabaseURL(databaseURL)
	seedPasswordValue := os.Getenv("DEMO_SEED_PASSWORD")
	if !localDatabase {
		if !*allowNonLocal {
			log.Fatal("refusing to seed a non-local DATABASE_URL; rerun with -allow-non-local and DEMO_SEED_PASSWORD after verifying the target database")
		}
		if len(seedPasswordValue) < 12 {
			log.Fatal("DEMO_SEED_PASSWORD must be at least 12 characters for non-local seeding")
		}
	}
	if seedPasswordValue == "" {
		seedPasswordValue = seedPassword
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		log.Fatalf("connect database: %v", err)
	}
	defer db.Close()
	if err := db.Ping(ctx); err != nil {
		log.Fatalf("ping database: %v", err)
	}

	tx, err := db.Begin(ctx)
	if err != nil {
		log.Fatalf("begin transaction: %v", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if *reset {
		if err := cleanupSeed(ctx, tx); err != nil {
			log.Fatalf("cleanup seed data: %v", err)
		}
	}

	rng := rand.New(rand.NewSource(20260609))
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(seedPasswordValue), bcrypt.DefaultCost)
	if err != nil {
		log.Fatalf("hash seed password: %v", err)
	}

	sum, err := seedDatabase(ctx, tx, rng, string(passwordHash), *teacherCount, *studentCount, *projectCount)
	if err != nil {
		log.Fatalf("seed database: %v", err)
	}

	if err := tx.Commit(ctx); err != nil {
		log.Fatalf("commit seed data: %v", err)
	}

	fmt.Printf("UniTrack demo seed complete.\n")
	if seedPasswordValue == seedPassword {
		fmt.Printf("Login password for all demo users: %s\n", seedPassword)
	} else {
		fmt.Printf("Login password for all demo users: value from DEMO_SEED_PASSWORD\n")
	}
	fmt.Printf("Demo admin: demo.admin@%s\n", seedDomain)
	fmt.Printf("Created %d admins, %d teachers, %d students, %d folders, %d projects, %d members, %d milestones, %d assignments, %d assignees, %d submissions, %d reviews, %d resources, %d activity logs.\n",
		sum.Admins,
		sum.Teachers,
		sum.Students,
		sum.Folders,
		sum.Projects,
		sum.Members,
		sum.Milestones,
		sum.Tasks,
		sum.Assignees,
		sum.ProgressUpdates,
		sum.Reviews,
		sum.Resources,
		sum.ActivityLogs,
	)
}

func isLocalDatabaseURL(databaseURL string) bool {
	parsed, err := url.Parse(databaseURL)
	if err != nil {
		return false
	}
	host := strings.ToLower(strings.TrimSpace(parsed.Hostname()))
	if host == "localhost" {
		return true
	}
	parsedIP := net.ParseIP(host)
	return parsedIP != nil && parsedIP.IsLoopback()
}

func cleanupSeed(ctx context.Context, tx pgx.Tx) error {
	pattern := "%@" + seedDomain
	if _, err := tx.Exec(ctx, `DELETE FROM activity_logs
		 WHERE metadata->>'seed' = $1
		    OR actor_id IN (SELECT id FROM users WHERE email LIKE $2)
		    OR project_id IN (
		       SELECT id FROM projects
		       WHERE created_by IN (SELECT id FROM users WHERE email LIKE $2)
		          OR supervisor_id IN (SELECT id FROM users WHERE email LIKE $2)
		    )`, seedLabel, pattern); err != nil {
		return err
	}
	statements := []string{
		`DELETE FROM projects
		 WHERE created_by IN (SELECT id FROM users WHERE email LIKE $1)
		    OR supervisor_id IN (SELECT id FROM users WHERE email LIKE $1)`,
		`DELETE FROM course_sections
		 WHERE created_by IN (SELECT id FROM users WHERE email LIKE $1)
		    OR owner_teacher_id IN (SELECT id FROM users WHERE email LIKE $1)`,
		`DELETE FROM users WHERE email LIKE $1`,
	}
	for _, statement := range statements {
		if _, err := tx.Exec(ctx, statement, pattern); err != nil {
			return err
		}
	}
	return nil
}

func seedDatabase(ctx context.Context, tx pgx.Tx, rng *rand.Rand, passwordHash string, teacherCount int, studentCount int, projectCount int) (summary, error) {
	var sum summary
	now := time.Now().UTC().Truncate(time.Second)

	admin, err := insertUser(ctx, tx, "Demo Administrator", "demo.admin@"+seedDomain, "admin", "active", passwordHash, now.AddDate(0, -7, 0))
	if err != nil {
		return sum, err
	}
	sum.Admins++

	teachers, err := seedTeachers(ctx, tx, passwordHash, teacherCount, now)
	if err != nil {
		return sum, err
	}
	sum.Teachers = len(teachers)

	students, err := seedStudents(ctx, tx, passwordHash, studentCount, now)
	if err != nil {
		return sum, err
	}
	sum.Students = len(students)

	folders, err := seedClassFolders(ctx, tx, rng, admin.ID, teachers, now)
	if err != nil {
		return sum, err
	}
	sum.Folders = len(folders)

	projects, err := seedProjects(ctx, tx, rng, admin.ID, teachers, students, folders, projectCount, now, &sum)
	if err != nil {
		return sum, err
	}

	if err := seedProjectDetails(ctx, tx, rng, projects, now, &sum); err != nil {
		return sum, err
	}

	return sum, nil
}

func seedTeachers(ctx context.Context, tx pgx.Tx, passwordHash string, count int, now time.Time) ([]seedUser, error) {
	firstNames := []string{"An", "Bao", "Chi", "Duc", "Giang", "Hanh", "Khoa", "Lan", "Minh", "Ngoc", "Phuong", "Quan", "Thao", "Trang", "Tuan", "Vy", "Hieu", "Linh"}
	lastNames := []string{"Nguyen", "Tran", "Le", "Pham", "Hoang", "Phan", "Vu", "Dang", "Bui", "Do"}
	teachers := make([]seedUser, 0, count)
	for i := 0; i < count; i++ {
		name := fmt.Sprintf("Dr. %s %s", firstNames[i%len(firstNames)], lastNames[(i*3)%len(lastNames)])
		if i >= len(firstNames) {
			name = fmt.Sprintf("%s %02d", name, i+1)
		}
		status := "active"
		if i%17 == 16 {
			status = "inactive"
		}
		user, err := insertUser(ctx, tx, name, fmt.Sprintf("teacher%02d@%s", i+1, seedDomain), "teacher", status, passwordHash, now.AddDate(0, -6, -i))
		if err != nil {
			return nil, err
		}
		teachers = append(teachers, user)
	}
	return teachers, nil
}

func seedStudents(ctx context.Context, tx pgx.Tx, passwordHash string, count int, now time.Time) ([]seedUser, error) {
	firstNames := []string{"Aiden", "An", "Binh", "Cam", "Chau", "Duy", "Gia", "Hana", "Huy", "Ivy", "Khanh", "Liam", "Mai", "Nam", "Nhi", "Oanh", "Phuc", "Quynh", "Rina", "Son", "Tam", "Uyen", "Viet", "Yen"}
	lastNames := []string{"Nguyen", "Tran", "Le", "Pham", "Hoang", "Phan", "Vu", "Dang", "Bui", "Do", "Vo", "Huynh"}
	students := make([]seedUser, 0, count)
	for i := 0; i < count; i++ {
		name := fmt.Sprintf("%s %s %03d", firstNames[i%len(firstNames)], lastNames[(i*5)%len(lastNames)], i+1)
		status := "active"
		if i%53 == 52 {
			status = "inactive"
		}
		user, err := insertUser(ctx, tx, name, fmt.Sprintf("student%03d@%s", i+1, seedDomain), "student", status, passwordHash, now.AddDate(0, -5, -i%28))
		if err != nil {
			return nil, err
		}
		students = append(students, user)
	}
	return students, nil
}

func seedClassFolders(ctx context.Context, tx pgx.Tx, rng *rand.Rand, adminID string, teachers []seedUser, now time.Time) ([]seedFolder, error) {
	folderTemplates := []string{
		"AI Research Studio", "Capstone Supervision", "Applied Software Lab", "Data Product Clinic", "Human-Centered Systems", "Cloud Engineering Studio",
		"Mobile Product Lab", "Cybersecurity Projects", "IoT Prototype Studio", "Digital Transformation Lab", "Research Methods Cohort", "Graduation Project Board",
	}
	colors := []string{"blue", "teal", "amber", "rose", "violet", "slate"}
	folderCount := min(max(len(teachers), 12), len(teachers)+8)
	folders := make([]seedFolder, 0, folderCount)
	for i := 0; i < folderCount; i++ {
		owner := teachers[i%len(teachers)]
		status := "active"
		if i%11 == 10 {
			status = "archived"
		}
		title := folderTemplates[i%len(folderTemplates)]
		if i >= len(folderTemplates) {
			title = fmt.Sprintf("%s %d", title, i/len(folderTemplates)+1)
		}
		description := fmt.Sprintf("Project folder for supervised teams working with %s on semester-long deliverables.", strings.TrimPrefix(owner.FullName, "Dr. "))
		var id string
		err := tx.QueryRow(ctx, `
			INSERT INTO course_sections (title, description, owner_teacher_id, status, created_by, color, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
			RETURNING id::text
		`, title, description, owner.ID, status, adminID, colors[(i+rng.Intn(len(colors)))%len(colors)], now.AddDate(0, -4, -i)).Scan(&id)
		if err != nil {
			return nil, err
		}
		folders = append(folders, seedFolder{ID: id, OwnerTeacherID: owner.ID})
	}
	return folders, nil
}

func seedProjects(ctx context.Context, tx pgx.Tx, rng *rand.Rand, adminID string, teachers []seedUser, students []seedUser, folders []seedFolder, count int, now time.Time, summary *summary) ([]seedProject, error) {
	projectTemplates := []struct {
		Name  string
		Topic string
		Desc  string
	}{
		{"Campus Shuttle Occupancy Forecasting", "Machine learning for campus mobility", "Forecast shuttle demand from historical ridership, timetable, and weather data so operations staff can plan capacity."},
		{"Smart Library Seat Finder", "Indoor occupancy and student services", "Prototype a dashboard that estimates open study seats using sensor events and check-in data."},
		{"Thesis Milestone Tracker", "Academic workflow automation", "Build a lightweight workflow for supervisors to monitor proposal, experiment, writing, and defense readiness."},
		{"Lab Equipment Booking System", "Resource scheduling", "Coordinate shared lab devices, approvals, maintenance windows, and usage history for project teams."},
		{"Peer Review Rubric Assistant", "Learning analytics", "Support structured peer feedback with rubric summaries and anomaly detection for instructors."},
		{"Green Campus Energy Dashboard", "Sustainability analytics", "Surface energy consumption patterns by building and recommend actions for facilities teams."},
		{"Internship Matching Portal", "Student career services", "Match students to internship openings using skills, project history, and supervisor recommendations."},
		{"Vietnamese OCR Archive Cleanup", "Document AI", "Clean scanned academic forms and extract structured records for administrative search."},
		{"Mental Wellness Check-in Companion", "Student support technology", "Provide privacy-aware check-ins, resource recommendations, and escalation summaries for advisors."},
		{"Capstone Budget Planner", "Project finance tracking", "Track project expenses, purchase requests, receipts, and supervisor approvals."},
		{"Research Dataset Catalog", "Research data management", "Create a searchable catalog for team datasets with ownership, licensing, and reproducibility notes."},
		{"Emergency Drill Attendance App", "Campus safety operations", "Record attendance and incident notes during safety drills using mobile-first workflows."},
		{"Course Outcome Evidence Mapper", "Accreditation support", "Map student artifacts to course outcomes and identify evidence gaps before audit deadlines."},
		{"Dormitory Maintenance Triage", "Operations workflow", "Prioritize maintenance tickets by severity, repeat history, and available staff capacity."},
		{"Student Club Event Planner", "Campus engagement", "Plan events, volunteers, budgets, approvals, and post-event reports for student organizations."},
		{"Code Review Teaching Bot", "Software engineering education", "Generate guided code review prompts and summarize recurring quality issues for novice developers."},
		{"IoT Air Quality Monitor", "Environmental sensing", "Collect classroom air quality signals and alert staff when comfort or safety thresholds are crossed."},
		{"Scholarship Eligibility Screener", "Administrative decision support", "Help staff screen scholarship applications with transparent criteria and review notes."},
	}

	projects := make([]seedProject, 0, count)
	activeStudents := filterActive(students)
	for i := 0; i < count; i++ {
		template := projectTemplates[i%len(projectTemplates)]
		supervisor := teachers[i%len(teachers)]
		if supervisor.Status != "active" {
			supervisor = teachers[(i+1)%len(teachers)]
		}
		status := projectStatus(i)
		officialState := projectProgressState(status, i)
		start := now.AddDate(0, -rng.Intn(8)-4, -rng.Intn(21))
		end := start.AddDate(0, 4+rng.Intn(4), rng.Intn(14))
		name := template.Name
		if i >= len(projectTemplates) {
			name = fmt.Sprintf("%s Cohort %02d", template.Name, i/len(projectTemplates)+1)
		}
		progressSummary := projectSummary(status, officialState)

		var id string
		err := tx.QueryRow(ctx, `
			INSERT INTO projects (name, description, topic, supervisor_id, start_date, end_date, status, official_progress_state, progress_summary, created_by, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
			RETURNING id::text
		`, name, template.Desc, template.Topic, supervisor.ID, dateString(start), dateString(end), status, officialState, progressSummary, adminID, start, now.AddDate(0, 0, -rng.Intn(12))).Scan(&id)
		if err != nil {
			return nil, err
		}

		if len(folders) > 0 && i%5 != 4 {
			folderID := folderForSupervisor(folders, supervisor.ID, i)
			if _, err := tx.Exec(ctx, `INSERT INTO course_section_projects (course_section_id, project_id, added_by, added_at) VALUES ($1, $2, $3, $4)`, folderID, id, supervisor.ID, start.AddDate(0, 0, 1)); err != nil {
				return nil, err
			}
		}

		memberIDs := make([]string, 0, 5)
		memberCount := 3 + rng.Intn(3)
		base := (i * 5) % len(activeStudents)
		for j := 0; j < memberCount; j++ {
			student := activeStudents[(base+j*7)%len(activeStudents)]
			memberRole := "member"
			if j == 0 {
				memberRole = "leader"
			}
			if _, err := tx.Exec(ctx, `
				INSERT INTO project_members (project_id, student_id, member_role, joined_at)
				VALUES ($1, $2, $3, $4)
			`, id, student.ID, memberRole, start.AddDate(0, 0, 2+j)); err != nil {
				return nil, err
			}
			memberIDs = append(memberIDs, student.ID)
			summary.Members++
		}

		projects = append(projects, seedProject{ID: id, Name: name, Status: status, SupervisorID: supervisor.ID, MemberIDs: memberIDs})
		summary.Projects++
	}
	return projects, nil
}

func folderForSupervisor(folders []seedFolder, supervisorID string, offset int) string {
	for index := range folders {
		folder := folders[(offset+index)%len(folders)]
		if folder.OwnerTeacherID == supervisorID {
			return folder.ID
		}
	}
	return folders[offset%len(folders)].ID
}

func seedProjectDetails(ctx context.Context, tx pgx.Tx, rng *rand.Rand, projects []seedProject, now time.Time, summary *summary) error {
	for i := range projects {
		project := &projects[i]
		milestoneCount := 3 + rng.Intn(3)
		projectStart := now.AddDate(0, -5, i%21)
		for m := 0; m < milestoneCount; m++ {
			milestone, err := insertMilestone(ctx, tx, *project, m, projectStart, now)
			if err != nil {
				return err
			}
			project.Milestones = append(project.Milestones, milestone)
			summary.Milestones++

			taskCount := 2 + rng.Intn(3)
			for t := 0; t < taskCount; t++ {
				task, err := insertTask(ctx, tx, rng, *project, milestone, m, t, projectStart, now, summary)
				if err != nil {
					return err
				}
				project.Milestones[len(project.Milestones)-1].Tasks = append(project.Milestones[len(project.Milestones)-1].Tasks, task)
				if err := seedTaskProgress(ctx, tx, rng, *project, task, now, summary); err != nil {
					return err
				}
			}
		}
		if err := seedResourcesAndLogs(ctx, tx, rng, *project, i, now, summary); err != nil {
			return err
		}
	}
	return nil
}

func insertUser(ctx context.Context, tx pgx.Tx, fullName string, email string, role string, status string, passwordHash string, createdAt time.Time) (seedUser, error) {
	var id string
	err := tx.QueryRow(ctx, `
		INSERT INTO users (full_name, email, password_hash, role, status, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $6)
		ON CONFLICT (email) DO UPDATE
		SET full_name = EXCLUDED.full_name,
		    password_hash = EXCLUDED.password_hash,
		    role = EXCLUDED.role,
		    status = EXCLUDED.status,
		    updated_at = now()
		RETURNING id::text
	`, fullName, strings.ToLower(email), passwordHash, role, status, createdAt).Scan(&id)
	return seedUser{ID: id, FullName: fullName, Email: strings.ToLower(email), Role: role, Status: status}, err
}

func insertMilestone(ctx context.Context, tx pgx.Tx, project seedProject, index int, projectStart time.Time, now time.Time) (seedMilestone, error) {
	titles := []string{"Discovery and scope", "Prototype foundation", "Implementation sprint", "Validation and review", "Final handoff"}
	descriptions := []string{
		"Clarify stakeholders, risks, dataset access, and success criteria.",
		"Build the first usable slice and confirm architecture choices with the supervisor.",
		"Deliver core workflow behavior, integration points, and project documentation.",
		"Run usability checks, fix review findings, and prepare evidence for assessment.",
		"Freeze scope, polish documentation, and prepare the final presentation package.",
	}
	target := projectStart.AddDate(0, index+1, index*3)
	var id string
	err := tx.QueryRow(ctx, `
		INSERT INTO project_milestones (project_id, title, description, target_date, sort_order, created_by, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id::text
	`, project.ID, titles[index%len(titles)], descriptions[index%len(descriptions)], dateString(target), index+1, project.SupervisorID, projectStart.AddDate(0, 0, index*4), now.AddDate(0, 0, -index)).Scan(&id)
	return seedMilestone{ID: id, Title: titles[index%len(titles)]}, err
}

func insertTask(ctx context.Context, tx pgx.Tx, rng *rand.Rand, project seedProject, milestone seedMilestone, milestoneIndex int, taskIndex int, projectStart time.Time, now time.Time, summary *summary) (seedTask, error) {
	taskTemplates := []string{
		"Stakeholder interview notes", "Architecture decision record", "Data model implementation", "API integration slice", "Interactive UI workflow",
		"Supervisor review package", "Usability test report", "Deployment readiness checklist", "Final presentation draft", "Risk and blocker log",
	}
	status := taskStatus(project.Status, milestoneIndex, taskIndex)
	officialState := taskProgressState(status)
	priority := []string{"medium", "high", "low"}[(milestoneIndex+taskIndex+rng.Intn(2))%3]
	deadline := projectStart.AddDate(0, milestoneIndex+1, taskIndex*5+rng.Intn(4))
	description := fmt.Sprintf("Produce a reviewed artifact for %s. Include context, decisions, evidence, and open questions for the next supervision meeting.", milestone.Title)
	title := taskTemplates[(milestoneIndex*3+taskIndex)%len(taskTemplates)]

	var id string
	err := tx.QueryRow(ctx, `
		INSERT INTO tasks (project_id, milestone_id, title, description, status, priority, deadline, official_progress_state, created_by, updated_by, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10, $11)
		RETURNING id::text
	`, project.ID, milestone.ID, title, description, status, priority, dateString(deadline), officialState, project.SupervisorID, projectStart.AddDate(0, 0, milestoneIndex*6+taskIndex), now.AddDate(0, 0, -rng.Intn(10))).Scan(&id)
	if err != nil {
		return seedTask{}, err
	}

	assigneeCount := 1 + rng.Intn(min(3, len(project.MemberIDs)))
	assigneeIDs := make([]string, 0, assigneeCount)
	for i := 0; i < assigneeCount; i++ {
		studentID := project.MemberIDs[(milestoneIndex+taskIndex+i)%len(project.MemberIDs)]
		if _, err := tx.Exec(ctx, `INSERT INTO task_assignees (project_id, task_id, student_id, assigned_at) VALUES ($1, $2, $3, $4)`, project.ID, id, studentID, projectStart.AddDate(0, 0, milestoneIndex*5+taskIndex+i)); err != nil {
			return seedTask{}, err
		}
		assigneeIDs = append(assigneeIDs, studentID)
		summary.Assignees++
	}

	summary.Tasks++
	return seedTask{ID: id, Title: title, Status: status, AssigneeIDs: assigneeIDs}, nil
}

func seedTaskProgress(ctx context.Context, tx pgx.Tx, rng *rand.Rand, project seedProject, task seedTask, now time.Time, summary *summary) error {
	if task.Status == "todo" || len(task.AssigneeIDs) == 0 {
		return nil
	}

	reviewPlans := []struct {
		UpdateStatus  string
		ReviewStatus  string
		OfficialState string
		Comment       string
	}{
		{"approved", "approved", "in_progress", "Solid progress. Keep evidence and assumptions attached to the task."},
	}
	switch task.Status {
	case "done":
		reviewPlans = append(reviewPlans, struct {
			UpdateStatus  string
			ReviewStatus  string
			OfficialState string
			Comment       string
		}{"approved", "approved", "completed", "Accepted. The submission is clear enough to close this assignment."})
	case "submitted":
		reviewPlans = []struct {
			UpdateStatus  string
			ReviewStatus  string
			OfficialState string
			Comment       string
		}{{"pending_review", "", "", ""}}
	case "needs_changes":
		reviewPlans = []struct {
			UpdateStatus  string
			ReviewStatus  string
			OfficialState string
			Comment       string
		}{{"needs_changes", "needs_changes", "needs_changes", "Please tighten the acceptance criteria and add evidence for the latest claim."}}
	}

	for i, plan := range reviewPlans {
		submitterID := task.AssigneeIDs[i%len(task.AssigneeIDs)]
		createdAt := now.AddDate(0, 0, -rng.Intn(35)-i*4)
		var updateID string
		blockers := optionalText("Waiting for supervisor feedback on edge cases.", task.Status == "needs_changes" && i == 0)
		err := tx.QueryRow(ctx, `
			INSERT INTO progress_updates (project_id, task_id, submitted_by, title, description, blockers, review_status, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
			RETURNING id::text
		`, project.ID, task.ID, submitterID, fmt.Sprintf("%s update %d", task.Title, i+1), progressDescription(task.Status), blockers, plan.UpdateStatus, createdAt).Scan(&updateID)
		if err != nil {
			return err
		}
		summary.ProgressUpdates++

		if plan.ReviewStatus != "" {
			if _, err := tx.Exec(ctx, `
				INSERT INTO progress_reviews (progress_update_id, reviewed_by, review_status, review_comment, official_progress_state, reviewed_at)
				VALUES ($1, $2, $3, $4, $5, $6)
			`, updateID, project.SupervisorID, plan.ReviewStatus, plan.Comment, plan.OfficialState, createdAt.AddDate(0, 0, 2)); err != nil {
				return err
			}
			summary.Reviews++
		}

		if task.Status == "done" && i == len(reviewPlans)-1 {
			if err := insertResource(ctx, tx, project.ID, "task", task.ID, "Assignment evidence bundle", fmt.Sprintf("https://docs.google.com/document/d/%s-%d", slug(project.Name), i+1), "document", "Evidence summary prepared by the team for the closed assignment.", submitterID, createdAt, summary); err != nil {
				return err
			}
		}
	}
	return nil
}

func seedResourcesAndLogs(ctx context.Context, tx pgx.Tx, rng *rand.Rand, project seedProject, index int, now time.Time, summary *summary) error {
	createdAt := now.AddDate(0, 0, -rng.Intn(60))
	projectSlug := slug(fmt.Sprintf("%s-%02d", project.Name, index+1))
	if err := insertResource(ctx, tx, project.ID, "", "", "Repository", "https://github.com/unitrack-demo/"+projectSlug, "github", "Working repository for source code, issues, and release notes.", project.SupervisorID, createdAt, summary); err != nil {
		return err
	}
	if err := insertResource(ctx, tx, project.ID, "", "", "Project drive", "https://drive.google.com/drive/folders/"+projectSlug, "google_drive", "Shared folder for supervisor meeting notes, assets, and exported reports.", project.SupervisorID, createdAt.AddDate(0, 0, 1), summary); err != nil {
		return err
	}
	if len(project.Milestones) > 0 && index%2 == 0 {
		milestone := project.Milestones[0]
		if err := insertResource(ctx, tx, project.ID, "milestone", milestone.ID, "Milestone plan", "https://notion.so/unitrack-demo/"+projectSlug+"-plan", "document", "Detailed milestone plan and acceptance notes.", project.SupervisorID, createdAt.AddDate(0, 0, 2), summary); err != nil {
			return err
		}
	}
	for _, milestone := range project.Milestones {
		for _, task := range milestone.Tasks {
			if task.Status != "todo" && rng.Intn(5) == 0 {
				if err := insertResource(ctx, tx, project.ID, "task", task.ID, "Task reference", "https://example.edu/resources/"+slug(task.Title)+"-"+projectSlug, "external_link", "Reference material used by the assigned students.", project.SupervisorID, createdAt.AddDate(0, 0, 3), summary); err != nil {
					return err
				}
			}
		}
	}

	metadata := fmt.Sprintf(`{"seed":%q,"source":"cmd/seed","project_status":%q}`, seedLabel, project.Status)
	if _, err := tx.Exec(ctx, `
		INSERT INTO activity_logs (actor_id, project_id, action, entity_type, entity_id, metadata, created_at)
		VALUES ($1, $2, 'seed.project_created', 'project', $2, $3::jsonb, $4)
	`, project.SupervisorID, project.ID, metadata, createdAt); err != nil {
		return err
	}
	summary.ActivityLogs++
	return nil
}

func insertResource(ctx context.Context, tx pgx.Tx, projectID string, relatedType string, relatedID string, title string, url string, resourceType string, description string, addedBy string, createdAt time.Time, summary *summary) error {
	var typeArg any
	var idArg any
	if relatedType != "" {
		typeArg = relatedType
		idArg = relatedID
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO resource_links (project_id, related_entity_type, related_entity_id, title, url, type, description, added_by, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
	`, projectID, typeArg, idArg, title, url, resourceType, description, addedBy, createdAt)
	if err == nil {
		summary.Resources++
	}
	return err
}

func projectStatus(index int) string {
	switch {
	case index%17 == 0:
		return "archived"
	case index%11 == 0:
		return "on_hold"
	case index%7 == 0:
		return "completed"
	default:
		return "active"
	}
}

func projectProgressState(status string, index int) string {
	switch status {
	case "completed", "archived":
		return "completed"
	case "on_hold":
		if index%2 == 0 {
			return "needs_changes"
		}
		return "in_progress"
	default:
		states := []string{"in_progress", "in_progress", "needs_changes", "no_progress"}
		return states[index%len(states)]
	}
}

func projectSummary(status string, officialState string) string {
	switch status {
	case "completed":
		return "Final review accepted; team is preserving artifacts for handoff and audit evidence."
	case "archived":
		return "Historical project retained for supervision records. No active work is expected."
	case "on_hold":
		return "Work paused while the team resolves scope, access, or stakeholder availability constraints."
	default:
		if officialState == "needs_changes" {
			return "Team has usable progress but needs to address supervisor review notes before the next checkpoint."
		}
		return "Team is moving through planned checkpoints with regular submissions and supervisor review."
	}
}

func taskStatus(projectStatus string, milestoneIndex int, taskIndex int) string {
	if projectStatus == "completed" || projectStatus == "archived" {
		if (milestoneIndex+taskIndex)%6 == 0 && projectStatus == "archived" {
			return "needs_changes"
		}
		return "done"
	}
	statuses := []string{"todo", "in_progress", "submitted", "needs_changes", "done", "in_progress", "submitted"}
	return statuses[(milestoneIndex*2+taskIndex)%len(statuses)]
}

func taskProgressState(status string) string {
	switch status {
	case "todo":
		return "no_progress"
	case "needs_changes":
		return "needs_changes"
	case "done":
		return "completed"
	default:
		return "in_progress"
	}
}

func progressDescription(status string) string {
	switch status {
	case "done":
		return "Completed the agreed scope, attached supporting links, and documented the tradeoffs that shaped the final decision."
	case "needs_changes":
		return "Submitted a working slice, but the team has identified unclear acceptance criteria and needs another review cycle."
	case "submitted":
		return "Submitted the current artifact for supervisor review with notes about assumptions, evidence, and remaining uncertainty."
	default:
		return "Implemented the core path and recorded follow-up questions for the next supervision discussion."
	}
}

func filterActive(users []seedUser) []seedUser {
	active := make([]seedUser, 0, len(users))
	for _, user := range users {
		if user.Status == "active" {
			active = append(active, user)
		}
	}
	if len(active) == 0 {
		return users
	}
	return active
}

func optionalText(value string, include bool) any {
	if !include {
		return nil
	}
	return value
}

func dateString(value time.Time) string {
	return value.Format("2006-01-02")
}

func slug(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	re := regexp.MustCompile(`[^a-z0-9]+`)
	value = strings.Trim(re.ReplaceAllString(value, "-"), "-")
	if value == "" {
		return "unitrack-demo"
	}
	return value
}

func min(a int, b int) int {
	if a < b {
		return a
	}
	return b
}

func max(a int, b int) int {
	if a > b {
		return a
	}
	return b
}
