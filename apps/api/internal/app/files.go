package app

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

const maxUploadBytes int64 = 10 * 1024 * 1024

type uploadedFileRecord struct {
	UploadedFileDTO
	StoragePath string
}

func (s *Server) handleListUploadedFiles(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r)
	projectID := chi.URLParam(r, "projectId")
	allowed, err := s.canViewProject(r.Context(), user, projectID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid project id")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "you do not have access to this project")
		return
	}
	if wantsPaginatedResponse(r.URL.Query()) {
		pagination, err := parsePaginationParams(r.URL.Query(), 100, 500)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid file list pagination")
			return
		}
		files, total, err := s.listUploadedFilesPage(r.Context(), projectID, pagination.Limit, pagination.Offset)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not load files")
			return
		}
		writeJSON(w, http.StatusOK, paginatedResponse[UploadedFileDTO]{Items: files, Page: pagination.Page, Limit: pagination.Limit, Total: total})
		return
	}

	files, err := s.listUploadedFiles(r.Context(), projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load files")
		return
	}
	writeJSON(w, http.StatusOK, files)
}

func (s *Server) handleUploadProgressFile(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r)
	projectID := chi.URLParam(r, "projectId")
	updateID := chi.URLParam(r, "updateId")
	if !requireValidUUIDParam(w, updateID, "invalid progress update id") {
		return
	}
	allowed, err := s.canViewProject(r.Context(), user, projectID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid project id")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "you do not have access to this project")
		return
	}
	if !s.requireProjectLifecycle(w, r.Context(), projectID, "uploading evidence", projectAcceptsStudentSubmissions) {
		return
	}

	submittedBy, err := s.progressUpdateSubmitter(r.Context(), projectID, updateID)
	if isNoRows(err) {
		writeError(w, http.StatusNotFound, "progress update not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not verify progress update")
		return
	}
	canManage, err := s.canManageProject(r.Context(), user, projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not verify upload permission")
		return
	}
	if !canManage && submittedBy != user.ID {
		writeError(w, http.StatusForbidden, "only the progress submitter or supervisor can upload evidence")
		return
	}

	file, ok := s.storeUploadedFileFromRequest(w, r, user, projectID, "progress_update", updateID, func(ctx context.Context, tx pgx.Tx) bool {
		allowed, err := canViewProjectTx(ctx, tx, user, projectID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not verify upload access")
			return false
		}
		if !allowed {
			writeError(w, http.StatusForbidden, "you do not have access to this project")
			return false
		}
		submittedBy, reviewStatus, err := progressUpdateEvidenceTargetTx(ctx, tx, projectID, updateID)
		if isNoRows(err) {
			writeError(w, http.StatusNotFound, "progress update not found")
			return false
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not verify progress update")
			return false
		}
		if reviewStatus != "pending_review" {
			writeError(w, http.StatusConflict, "reviewed submissions cannot change evidence")
			return false
		}
		canManage, err := canManageProjectTx(ctx, tx, user, projectID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not verify upload permission")
			return false
		}
		if !canManage && submittedBy != user.ID {
			writeError(w, http.StatusForbidden, "only the progress submitter or supervisor can upload evidence")
			return false
		}
		return true
	})
	if !ok {
		return
	}
	writeJSON(w, http.StatusCreated, file)
}

func (s *Server) storeUploadedFileFromRequest(w http.ResponseWriter, r *http.Request, user User, projectID string, relatedType string, relatedID string, beforeInsert func(context.Context, pgx.Tx) bool) (UploadedFileDTO, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes+1024*1024)
	if err := r.ParseMultipartForm(maxUploadBytes); err != nil {
		writeError(w, http.StatusBadRequest, "file must be multipart form data up to 10 MB")
		return UploadedFileDTO{}, false
	}
	if r.MultipartForm != nil {
		defer func() { _ = r.MultipartForm.RemoveAll() }()
	}
	file, fileHeader, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "file is required")
		return UploadedFileDTO{}, false
	}
	defer file.Close()
	if fileHeader.Size <= 0 {
		writeError(w, http.StatusBadRequest, "file cannot be empty")
		return UploadedFileDTO{}, false
	}
	if fileHeader.Size > maxUploadBytes {
		writeError(w, http.StatusBadRequest, "file must be 10 MB or smaller")
		return UploadedFileDTO{}, false
	}

	originalName := sanitizeFileName(fileHeader.Filename)
	contentType, err := detectMultipartFileType(file, fileHeader.Header.Get("Content-Type"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not read file")
		return UploadedFileDTO{}, false
	}
	data, err := io.ReadAll(io.LimitReader(file, maxUploadBytes+1))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not read file")
		return UploadedFileDTO{}, false
	}
	written := int64(len(data))
	if written <= 0 {
		writeError(w, http.StatusBadRequest, "file cannot be empty")
		return UploadedFileDTO{}, false
	}
	if written > maxUploadBytes {
		writeError(w, http.StatusBadRequest, "file must be 10 MB or smaller")
		return UploadedFileDTO{}, false
	}

	storedName, storageKey, err := s.prepareStoredFile(projectID, originalName)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not prepare file storage")
		return UploadedFileDTO{}, false
	}
	if !s.validateUploadedFileInsert(w, r, projectID, beforeInsert) {
		return UploadedFileDTO{}, false
	}
	cleanupJobID, err := s.enqueueStoredFileCleanup(r.Context(), storageKey, "upload_metadata_rollback")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not prepare file cleanup")
		return UploadedFileDTO{}, false
	}
	if err := s.fileStore.Put(r.Context(), storageKey, bytes.NewReader(data), contentType, written); err != nil {
		_ = s.processStoredFileCleanupJobSoon(cleanupJobID)
		writeError(w, http.StatusInternalServerError, "could not store file")
		return UploadedFileDTO{}, false
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		_ = s.processStoredFileCleanupJobSoon(cleanupJobID)
		writeError(w, http.StatusInternalServerError, "could not save file metadata")
		return UploadedFileDTO{}, false
	}
	defer func() { _ = tx.Rollback(r.Context()) }()
	if !s.requireProjectLifecycleTx(w, r.Context(), tx, projectID, "uploading evidence", projectAcceptsStudentSubmissions) {
		_ = s.processStoredFileCleanupJobSoon(cleanupJobID)
		return UploadedFileDTO{}, false
	}
	if beforeInsert != nil && !beforeInsert(r.Context(), tx) {
		_ = s.processStoredFileCleanupJobSoon(cleanupJobID)
		return UploadedFileDTO{}, false
	}

	var fileID string
	err = tx.QueryRow(r.Context(), `
		INSERT INTO uploaded_files (project_id, related_entity_type, related_entity_id, original_file_name, stored_file_name, storage_path, mime_type, file_size_bytes, uploaded_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id::text
	`, projectID, relatedType, relatedID, originalName, storedName, storageKey, optionalString(contentType), written, user.ID).Scan(&fileID)
	if err != nil {
		_ = s.processStoredFileCleanupJobSoon(cleanupJobID)
		writeError(w, http.StatusInternalServerError, "could not save file metadata")
		return UploadedFileDTO{}, false
	}
	if err := completeStoredFileCleanupTx(r.Context(), tx, cleanupJobID); err != nil {
		_ = s.processStoredFileCleanupJobSoon(cleanupJobID)
		writeError(w, http.StatusInternalServerError, "could not save file metadata")
		return UploadedFileDTO{}, false
	}
	if err := tx.Commit(r.Context()); err != nil {
		_ = s.processStoredFileCleanupJobSoon(cleanupJobID)
		writeError(w, http.StatusInternalServerError, "could not save file metadata")
		return UploadedFileDTO{}, false
	}

	record, err := s.getUploadedFileInProject(r.Context(), projectID, fileID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load file metadata")
		return UploadedFileDTO{}, false
	}
	return record.UploadedFileDTO, true
}

func (s *Server) validateUploadedFileInsert(w http.ResponseWriter, r *http.Request, projectID string, beforeInsert func(context.Context, pgx.Tx) bool) bool {
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not verify file metadata")
		return false
	}
	defer func() { _ = tx.Rollback(r.Context()) }()
	if !s.requireProjectLifecycleTx(w, r.Context(), tx, projectID, "uploading evidence", projectAcceptsStudentSubmissions) {
		return false
	}
	return beforeInsert == nil || beforeInsert(r.Context(), tx)
}

func (s *Server) handleDownloadUploadedFile(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r)
	projectID := chi.URLParam(r, "projectId")
	fileID := chi.URLParam(r, "fileId")
	if !validUUIDParam(fileID) {
		writeError(w, http.StatusBadRequest, "invalid file id")
		return
	}
	allowed, err := s.canViewProject(r.Context(), user, projectID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid project id")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "you do not have access to this project")
		return
	}

	record, err := s.getUploadedFileInProject(r.Context(), projectID, fileID)
	if isNoRows(err) {
		writeError(w, http.StatusNotFound, "file not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load file")
		return
	}
	object, err := s.fileStore.Open(r.Context(), record.StoragePath)
	if errors.Is(err, errStoredObjectNotFound) {
		writeError(w, http.StatusNotFound, "file not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load file")
		return
	}
	defer object.Body.Close()

	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": record.OriginalFileName}))
	if record.MimeType != nil {
		w.Header().Set("Content-Type", *record.MimeType)
	} else if object.ContentType != "" {
		w.Header().Set("Content-Type", object.ContentType)
	}
	if object.Size >= 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(object.Size, 10))
	}
	if _, err := io.Copy(w, object.Body); err != nil && s.logger != nil {
		s.logger.Warn("file download stream failed", "error", err)
	}
}

func (s *Server) handleDeleteUploadedFile(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r)
	projectID := chi.URLParam(r, "projectId")
	fileID := chi.URLParam(r, "fileId")
	if !validUUIDParam(fileID) {
		writeError(w, http.StatusBadRequest, "invalid file id")
		return
	}
	allowed, err := s.canViewProject(r.Context(), user, projectID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid project id")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "you do not have access to this project")
		return
	}
	if !s.requireProjectLifecycle(w, r.Context(), projectID, "deleting evidence files", projectAcceptsSupportChanges) {
		return
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not delete file")
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()
	canManageProject, ok := s.requireProjectSupportWriteTx(w, r.Context(), tx, user, projectID, "deleting evidence files")
	if !ok {
		return
	}
	allowed, err = canViewProjectTx(r.Context(), tx, user, projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not verify file access")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "you do not have access to this project")
		return
	}

	record, err := scanUploadedFile(tx.QueryRow(r.Context(), uploadedFileSelectSQL("WHERE uf.project_id = $1 AND uf.id = $2", "FOR UPDATE OF uf"), projectID, fileID))
	if isNoRows(err) {
		writeError(w, http.StatusNotFound, "file not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load file")
		return
	}
	switch record.RelatedType {
	case "progress_update":
		_, reviewStatus, err := progressUpdateEvidenceTargetTx(r.Context(), tx, projectID, record.RelatedID)
		if isNoRows(err) {
			writeError(w, http.StatusNotFound, "file not found")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not verify file target")
			return
		}
		if reviewStatus != "pending_review" {
			writeError(w, http.StatusConflict, "reviewed submissions cannot change evidence")
			return
		}
	case "resource_link":
		reviewStatus, ok := s.resourceLinkProgressUpdateReviewStatusTx(w, r.Context(), tx, projectID, record.RelatedID)
		if !ok {
			return
		}
		if reviewStatus != "" && reviewStatus != "pending_review" {
			writeError(w, http.StatusConflict, "reviewed submissions cannot change evidence")
			return
		}
	}
	if !canManageProject && record.UploadedBy != user.ID {
		writeError(w, http.StatusForbidden, "you cannot delete this file")
		return
	}

	result, err := tx.Exec(r.Context(), `DELETE FROM uploaded_files WHERE id = $1 AND project_id = $2`, fileID, projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not delete file")
		return
	}
	if result.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "file not found")
		return
	}
	cleanupJobID, err := enqueueStoredFileCleanupTx(r.Context(), tx, record.StoragePath, "metadata_deleted")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not queue stored file cleanup")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "could not delete file")
		return
	}
	if err := s.processStoredFileCleanupJobSoon(cleanupJobID); err != nil && s.logger != nil {
		s.logger.Warn("stored file cleanup remains queued", "error", err, "jobID", cleanupJobID)
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (s *Server) listUploadedFiles(ctx context.Context, projectID string) ([]UploadedFileDTO, error) {
	rows, err := s.db.Query(ctx, uploadedFileSelectSQL("WHERE uf.project_id = $1", "ORDER BY uf.created_at DESC"), projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	files := []UploadedFileDTO{}
	for rows.Next() {
		record, err := scanUploadedFile(rows)
		if err != nil {
			return nil, err
		}
		files = append(files, record.UploadedFileDTO)
	}
	return files, rows.Err()
}

func (s *Server) listUploadedFilesPage(ctx context.Context, projectID string, limit int, offset int) ([]UploadedFileDTO, int64, error) {
	var total int64
	if err := s.db.QueryRow(ctx, `SELECT COUNT(*)::bigint FROM uploaded_files WHERE project_id = $1`, projectID).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := s.db.Query(ctx, uploadedFileSelectSQL("WHERE uf.project_id = $1", "ORDER BY uf.created_at DESC LIMIT $2 OFFSET $3"), projectID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	files := []UploadedFileDTO{}
	for rows.Next() {
		record, err := scanUploadedFile(rows)
		if err != nil {
			return nil, 0, err
		}
		files = append(files, record.UploadedFileDTO)
	}
	return files, total, rows.Err()
}

func (s *Server) getUploadedFileInProject(ctx context.Context, projectID string, fileID string) (uploadedFileRecord, error) {
	return scanUploadedFile(s.db.QueryRow(ctx, uploadedFileSelectSQL("WHERE uf.project_id = $1 AND uf.id = $2", ""), projectID, fileID))
}

func (s *Server) resourceLinkProgressUpdateReviewStatusTx(w http.ResponseWriter, ctx context.Context, tx pgx.Tx, projectID string, resourceLinkID string) (string, bool) {
	var relatedType, relatedID string
	if err := tx.QueryRow(ctx, `
		SELECT related_entity_type, related_entity_id::text
		FROM resource_links
		WHERE project_id = $1 AND id = $2
		FOR UPDATE
	`, projectID, resourceLinkID).Scan(&relatedType, &relatedID); err != nil {
		if isNoRows(err) {
			writeError(w, http.StatusNotFound, "file not found")
			return "", false
		}
		writeError(w, http.StatusInternalServerError, "could not verify file target")
		return "", false
	}
	if relatedType != "progress_update" {
		return "", true
	}
	_, reviewStatus, err := progressUpdateEvidenceTargetTx(ctx, tx, projectID, relatedID)
	if isNoRows(err) {
		writeError(w, http.StatusNotFound, "file not found")
		return "", false
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not verify file target")
		return "", false
	}
	return reviewStatus, true
}

func uploadedFileSelectSQL(where string, suffix string) string {
	return `
		SELECT
			uf.id::text,
			uf.project_id::text,
			uf.related_entity_type,
			uf.related_entity_id::text,
			uf.original_file_name,
			uf.storage_path,
			uf.mime_type,
			uf.file_size_bytes,
			uf.uploaded_by::text,
			u.full_name,
			uf.created_at
		FROM uploaded_files uf
		JOIN users u ON u.id = uf.uploaded_by
		` + where + `
		` + suffix + `
	`
}

func scanUploadedFile(row pgx.Row) (uploadedFileRecord, error) {
	var record uploadedFileRecord
	var mimeType sql.NullString
	err := row.Scan(
		&record.ID,
		&record.ProjectID,
		&record.RelatedType,
		&record.RelatedID,
		&record.OriginalFileName,
		&record.StoragePath,
		&mimeType,
		&record.FileSizeBytes,
		&record.UploadedBy,
		&record.UploadedByName,
		&record.CreatedAt,
	)
	record.MimeType = nullString(mimeType)
	return record, err
}

func (s *Server) progressUpdateSubmitter(ctx context.Context, projectID string, updateID string) (string, error) {
	var submittedBy string
	err := s.db.QueryRow(ctx, `
		SELECT pu.submitted_by::text
		FROM progress_updates pu
		JOIN tasks t ON t.id = pu.task_id AND t.project_id = pu.project_id
		WHERE pu.project_id = $1 AND pu.id = $2 AND t.parent_task_id IS NULL
	`, projectID, updateID).Scan(&submittedBy)
	return submittedBy, err
}

func progressUpdateEvidenceTargetTx(ctx context.Context, tx pgx.Tx, projectID string, updateID string) (string, string, error) {
	var submittedBy, reviewStatus string
	err := tx.QueryRow(ctx, `
		SELECT pu.submitted_by::text, pu.review_status
		FROM progress_updates pu
		JOIN tasks t ON t.id = pu.task_id AND t.project_id = pu.project_id
		WHERE pu.project_id = $1 AND pu.id = $2 AND t.parent_task_id IS NULL
		FOR UPDATE OF pu
	`, projectID, updateID).Scan(&submittedBy, &reviewStatus)
	return submittedBy, reviewStatus, err
}

func (s *Server) prepareStoredFile(projectID string, originalName string) (string, string, error) {
	token, err := generateToken()
	if err != nil {
		return "", "", err
	}
	storedName := fmt.Sprintf("%s%s", token, filepath.Ext(originalName))
	return storedName, s.fileStore.ObjectKey(projectID, storedName), nil
}

func sanitizeFileName(value string) string {
	name := strings.TrimSpace(filepath.Base(strings.ReplaceAll(value, "\\", "/")))
	if name == "" || name == "." || name == string(filepath.Separator) {
		return "evidence"
	}
	return name
}

func detectMultipartFileType(file io.ReadSeeker, headerType string) (string, error) {
	contentType := strings.TrimSpace(headerType)
	buffer := make([]byte, 512)
	n, err := file.Read(buffer)
	if err != nil && err != io.EOF {
		return "", err
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return "", err
	}
	if contentType == "" || contentType == "application/octet-stream" {
		contentType = http.DetectContentType(buffer[:n])
	}
	return contentType, nil
}

func (s *Server) deleteStoredFile(key string) error {
	if key == "" {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return s.fileStore.Delete(ctx, key)
}

func (s *Server) enqueueStoredFileCleanup(ctx context.Context, storagePath string, reason string) (string, error) {
	if s.db == nil {
		return "", errors.New("database is not configured")
	}
	var jobID string
	err := s.db.QueryRow(ctx, `
		INSERT INTO uploaded_file_object_cleanup_jobs (storage_path, reason)
		VALUES ($1, $2)
		RETURNING id::text
	`, storagePath, reason).Scan(&jobID)
	return jobID, err
}

func enqueueStoredFileCleanupTx(ctx context.Context, tx pgx.Tx, storagePath string, reason string) (string, error) {
	var jobID string
	err := tx.QueryRow(ctx, `
		INSERT INTO uploaded_file_object_cleanup_jobs (storage_path, reason)
		VALUES ($1, $2)
		RETURNING id::text
	`, storagePath, reason).Scan(&jobID)
	return jobID, err
}

func completeStoredFileCleanupTx(ctx context.Context, tx pgx.Tx, jobID string) error {
	if strings.TrimSpace(jobID) == "" {
		return nil
	}
	_, err := tx.Exec(ctx, `
		UPDATE uploaded_file_object_cleanup_jobs
		SET completed_at = COALESCE(completed_at, now()), last_error = NULL, updated_at = now()
		WHERE id = $1
	`, jobID)
	return err
}

func (s *Server) completeStoredFileCleanup(ctx context.Context, jobID string) error {
	if s.db == nil || strings.TrimSpace(jobID) == "" {
		return nil
	}
	_, err := s.db.Exec(ctx, `
		UPDATE uploaded_file_object_cleanup_jobs
		SET completed_at = COALESCE(completed_at, now()), last_error = NULL, updated_at = now()
		WHERE id = $1
	`, jobID)
	return err
}

func (s *Server) processStoredFileCleanupJobSoon(jobID string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return s.processStoredFileCleanupJob(ctx, jobID)
}

func (s *Server) processStoredFileCleanupJob(ctx context.Context, jobID string) error {
	if s.db == nil || strings.TrimSpace(jobID) == "" {
		return nil
	}
	var storagePath string
	err := s.db.QueryRow(ctx, `
		UPDATE uploaded_file_object_cleanup_jobs
		SET attempts = attempts + 1, updated_at = now()
		WHERE id = $1 AND completed_at IS NULL
		RETURNING storage_path
	`, jobID).Scan(&storagePath)
	if isNoRows(err) {
		return nil
	}
	if err != nil {
		return err
	}
	if err := s.fileStore.Delete(ctx, storagePath); err != nil {
		_ = s.recordStoredFileCleanupError(context.Background(), jobID, err)
		return err
	}
	return s.completeStoredFileCleanup(ctx, jobID)
}

func (s *Server) recordStoredFileCleanupError(ctx context.Context, jobID string, cleanupErr error) error {
	if s.db == nil || strings.TrimSpace(jobID) == "" || cleanupErr == nil {
		return nil
	}
	_, err := s.db.Exec(ctx, `
		UPDATE uploaded_file_object_cleanup_jobs
		SET last_error = $2, updated_at = now()
		WHERE id = $1 AND completed_at IS NULL
	`, jobID, truncateStoredFileCleanupError(cleanupErr))
	return err
}

func truncateStoredFileCleanupError(err error) string {
	if err == nil {
		return ""
	}
	value := err.Error()
	if len(value) <= 2000 {
		return value
	}
	return value[:2000]
}

func (s *Server) ProcessPendingStoredFileCleanups(ctx context.Context, limit int) error {
	if s.db == nil {
		return nil
	}
	if limit <= 0 {
		limit = 100
	}
	rows, err := s.db.Query(ctx, `
		SELECT id::text
		FROM uploaded_file_object_cleanup_jobs
		WHERE completed_at IS NULL
		ORDER BY created_at, id
		LIMIT $1
	`, limit)
	if err != nil {
		return err
	}
	defer rows.Close()

	var cleanupErr error
	for rows.Next() {
		var jobID string
		if err := rows.Scan(&jobID); err != nil {
			return err
		}
		if err := s.processStoredFileCleanupJob(ctx, jobID); err != nil {
			cleanupErr = err
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	return cleanupErr
}
