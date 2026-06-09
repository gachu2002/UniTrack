package app

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"unitrack/api/internal/config"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Server struct {
	cfg        config.Config
	db         *pgxpool.Pool
	logger     *slog.Logger
	rateLimits *rateLimitStore
}

func NewServer(cfg config.Config, db *pgxpool.Pool, logger *slog.Logger) *Server {
	return &Server{cfg: cfg, db: db, logger: logger, rateLimits: newRateLimitStore()}
}

func (s *Server) Handler() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   s.cfg.CORSAllowedOrigins,
		AllowedMethods:   []string{http.MethodGet, http.MethodPost, http.MethodPatch, http.MethodDelete, http.MethodOptions},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Get("/", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"service": s.cfg.AppName, "message": "UniTrack API is ready."})
	})

	r.Route("/api/v1", func(api chi.Router) {
		api.Use(s.requireTrustedOrigin)
		api.Get("/health", s.handleHealth)
		api.Get("/ready", s.handleReady)
		api.Post("/auth/login", s.handleLogin)

		api.Group(func(protected chi.Router) {
			protected.Use(s.requireAuth)
			protected.Get("/auth/me", s.handleMe)
			protected.Post("/auth/logout", s.handleLogout)
			protected.Get("/admin/users", s.handleAdminListUsers)
			protected.Post("/admin/users", s.handleAdminCreateUser)
			protected.Patch("/admin/users/{userId}", s.handleAdminUpdateUser)
			protected.Post("/admin/users/{userId}/password", s.handleAdminSetUserPassword)
			protected.Get("/dashboard", s.handleDashboard)
			protected.Get("/projects", s.handleListProjects)
			protected.Post("/projects", s.handleCreateProject)
			protected.Get("/projects/{projectId}", s.handleGetProject)
			protected.Patch("/projects/{projectId}", s.handleUpdateProject)
			protected.Get("/projects/{projectId}/members", s.handleListProjectMembers)
			protected.Post("/projects/{projectId}/members", s.handleAddProjectMember)
			protected.Patch("/projects/{projectId}/members/{memberId}", s.handleUpdateProjectMember)
			protected.Delete("/projects/{projectId}/members/{memberId}", s.handleRemoveProjectMember)
			protected.Get("/projects/{projectId}/milestones", s.handleListMilestones)
			protected.Post("/projects/{projectId}/milestones", s.handleCreateMilestone)
			protected.Patch("/projects/{projectId}/milestones/{milestoneId}", s.handleUpdateMilestone)
			protected.Delete("/projects/{projectId}/milestones/{milestoneId}", s.handleDeleteMilestone)
			protected.Get("/projects/{projectId}/tasks", s.handleListTasks)
			protected.Post("/projects/{projectId}/tasks", s.handleCreateTask)
			protected.Get("/projects/{projectId}/progress-updates", s.handleListProjectProgressUpdates)
			protected.Get("/projects/{projectId}/resource-links", s.handleListResourceLinks)
			protected.Post("/projects/{projectId}/resource-links", s.handleCreateResourceLink)
			protected.Patch("/projects/{projectId}/resource-links/{resourceLinkId}", s.handleUpdateResourceLink)
			protected.Delete("/projects/{projectId}/resource-links/{resourceLinkId}", s.handleDeleteResourceLink)
			protected.Get("/projects/{projectId}/files", s.handleListUploadedFiles)
			protected.Get("/projects/{projectId}/files/{fileId}/download", s.handleDownloadUploadedFile)
			protected.Delete("/projects/{projectId}/files/{fileId}", s.handleDeleteUploadedFile)
			protected.Get("/projects/{projectId}/tasks/{taskId}", s.handleGetTask)
			protected.Patch("/projects/{projectId}/tasks/{taskId}", s.handleUpdateTask)
			protected.Post("/projects/{projectId}/tasks/{taskId}/progress-updates", s.handleCreateProgressUpdate)
			protected.Post("/projects/{projectId}/progress-updates/{updateId}/files", s.handleUploadProgressFile)
			protected.Post("/projects/{projectId}/progress-updates/{updateId}/reviews", s.handleReviewProgressUpdate)
			protected.Get("/classes", s.handleListCourseSections)
			protected.Post("/classes", s.handleCreateCourseSection)
			protected.Get("/classes/{classId}", s.handleGetCourseSection)
			protected.Patch("/classes/{classId}", s.handleUpdateCourseSection)
			protected.Post("/classes/{classId}/projects", s.handleLinkCourseSectionProject)
		})
	})

	return r
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "unitrack-api", "version": s.cfg.AppVersion})
}

func (s *Server) handleReady(w http.ResponseWriter, r *http.Request) {
	if s.db == nil {
		writeError(w, http.StatusServiceUnavailable, "database is not configured")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.db.Ping(ctx); err != nil {
		s.logger.Warn("database readiness check failed", slog.Any("error", err))
		writeError(w, http.StatusServiceUnavailable, "database is unavailable")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

func (s *Server) requireDB(w http.ResponseWriter) bool {
	if s.db == nil {
		writeError(w, http.StatusServiceUnavailable, "database is not configured")
		return false
	}
	return true
}
