package app

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"

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

	file, ok := s.storeUploadedFileFromRequest(w, r, user, projectID, "progress_update", updateID)
	if !ok {
		return
	}
	writeJSON(w, http.StatusCreated, file)
}

func (s *Server) storeUploadedFileFromRequest(w http.ResponseWriter, r *http.Request, user User, projectID string, relatedType string, relatedID string) (UploadedFileDTO, bool) {
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
	storedName, storagePath, err := s.prepareStoredFile(projectID, originalName)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not prepare file storage")
		return UploadedFileDTO{}, false
	}

	storedFile, err := os.Create(storagePath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not store file")
		return UploadedFileDTO{}, false
	}
	written, copyErr := io.Copy(storedFile, io.LimitReader(file, maxUploadBytes+1))
	closeErr := storedFile.Close()
	if copyErr != nil || closeErr != nil {
		_ = os.Remove(storagePath)
		writeError(w, http.StatusInternalServerError, "could not store file")
		return UploadedFileDTO{}, false
	}
	if written > maxUploadBytes {
		_ = os.Remove(storagePath)
		writeError(w, http.StatusBadRequest, "file must be 10 MB or smaller")
		return UploadedFileDTO{}, false
	}

	var fileID string
	err = s.db.QueryRow(r.Context(), `
		INSERT INTO uploaded_files (project_id, related_entity_type, related_entity_id, original_file_name, stored_file_name, storage_path, mime_type, file_size_bytes, uploaded_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id::text
	`, projectID, relatedType, relatedID, originalName, storedName, storagePath, optionalString(contentType), written, user.ID).Scan(&fileID)
	if err != nil {
		_ = os.Remove(storagePath)
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

func (s *Server) handleDownloadUploadedFile(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r)
	projectID := chi.URLParam(r, "projectId")
	fileID := chi.URLParam(r, "fileId")
	allowed, err := s.canViewProject(r.Context(), user, projectID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid project id")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "you do not have access to this project")
		return
	}
	if !s.requireProjectLifecycle(w, r.Context(), projectID, "changing evidence files", projectAcceptsSupportChanges) {
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
	if _, err := os.Stat(record.StoragePath); err != nil {
		writeError(w, http.StatusNotFound, "file not found")
		return
	}

	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": record.OriginalFileName}))
	if record.MimeType != nil {
		w.Header().Set("Content-Type", *record.MimeType)
	}
	http.ServeFile(w, r, record.StoragePath)
}

func (s *Server) handleDeleteUploadedFile(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r)
	projectID := chi.URLParam(r, "projectId")
	fileID := chi.URLParam(r, "fileId")
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
	if !canManageUploadedFile(user, record.UploadedFileDTO) {
		writeError(w, http.StatusForbidden, "you cannot delete this file")
		return
	}

	result, err := s.db.Exec(r.Context(), `DELETE FROM uploaded_files WHERE id = $1 AND project_id = $2`, fileID, projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not delete file")
		return
	}
	if result.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "file not found")
		return
	}
	if err := removeStoredFiles([]string{record.StoragePath}); err != nil {
		writeError(w, http.StatusInternalServerError, "could not remove stored file")
		return
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

func (s *Server) getUploadedFileInProject(ctx context.Context, projectID string, fileID string) (uploadedFileRecord, error) {
	return scanUploadedFile(s.db.QueryRow(ctx, uploadedFileSelectSQL("WHERE uf.project_id = $1 AND uf.id = $2", ""), projectID, fileID))
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
	err := s.db.QueryRow(ctx, `SELECT submitted_by::text FROM progress_updates WHERE project_id = $1 AND id = $2`, projectID, updateID).Scan(&submittedBy)
	return submittedBy, err
}

func (s *Server) prepareStoredFile(projectID string, originalName string) (string, string, error) {
	token, err := generateToken()
	if err != nil {
		return "", "", err
	}
	storedName := fmt.Sprintf("%s%s", token, filepath.Ext(originalName))
	directory := filepath.Join(s.cfg.UploadStorageDir, projectID)
	if err := os.MkdirAll(directory, 0o750); err != nil {
		return "", "", err
	}
	return storedName, filepath.Join(directory, storedName), nil
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

func canManageUploadedFile(user User, file UploadedFileDTO) bool {
	return user.Role == RoleAdmin || user.Role == RoleTeacher || file.UploadedBy == user.ID
}

func removeStoredFiles(paths []string) error {
	for _, path := range paths {
		if path == "" {
			continue
		}
		if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
	}
	return nil
}
