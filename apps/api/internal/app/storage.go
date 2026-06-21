package app

import (
	"context"
	"errors"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"

	"unitrack/api/internal/config"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go"
)

var errStoredObjectNotFound = errors.New("stored object not found")

type storedObject struct {
	Body        io.ReadCloser
	Size        int64
	ContentType string
}

type uploadFileStore interface {
	ObjectKey(projectID string, storedName string) string
	Put(ctx context.Context, key string, body io.Reader, contentType string, size int64) error
	Open(ctx context.Context, key string) (storedObject, error)
	Delete(ctx context.Context, key string) error
}

func newUploadFileStore(cfg config.Config) uploadFileStore {
	switch strings.ToLower(strings.TrimSpace(cfg.UploadStorageBackend)) {
	case "r2":
		return newR2FileStore(cfg)
	default:
		return localFileStore{baseDir: cfg.UploadStorageDir}
	}
}

type localFileStore struct {
	baseDir string
}

func (s localFileStore) ObjectKey(projectID string, storedName string) string {
	return filepath.Join(s.baseDir, projectID, storedName)
}

func (s localFileStore) Put(_ context.Context, key string, body io.Reader, _ string, _ int64) error {
	if err := os.MkdirAll(filepath.Dir(key), 0o750); err != nil {
		return err
	}
	file, err := os.Create(key)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(file, body)
	closeErr := file.Close()
	if copyErr != nil || closeErr != nil {
		_ = os.Remove(key)
		if copyErr != nil {
			return copyErr
		}
		return closeErr
	}
	return nil
}

func (s localFileStore) Open(_ context.Context, key string) (storedObject, error) {
	file, err := os.Open(key)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return storedObject{}, errStoredObjectNotFound
		}
		return storedObject{}, err
	}
	stat, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return storedObject{}, err
	}
	return storedObject{Body: file, Size: stat.Size()}, nil
}

func (s localFileStore) Delete(_ context.Context, key string) error {
	if err := os.Remove(key); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

type r2FileStore struct {
	client *s3.Client
	bucket string
	prefix string
}

func newR2FileStore(cfg config.Config) r2FileStore {
	awsCfg := aws.Config{
		Region:                     strings.TrimSpace(cfg.R2Region),
		RequestChecksumCalculation: aws.RequestChecksumCalculationWhenRequired,
		ResponseChecksumValidation: aws.ResponseChecksumValidationWhenRequired,
		Credentials: aws.NewCredentialsCache(credentials.NewStaticCredentialsProvider(
			strings.TrimSpace(cfg.R2AccessKeyID),
			strings.TrimSpace(cfg.R2SecretAccessKey),
			"",
		)),
	}
	if awsCfg.Region == "" {
		awsCfg.Region = "auto"
	}
	client := s3.NewFromConfig(awsCfg, func(options *s3.Options) {
		options.BaseEndpoint = aws.String(strings.TrimRight(strings.TrimSpace(cfg.R2Endpoint), "/"))
		options.UsePathStyle = true
	})
	return r2FileStore{client: client, bucket: strings.TrimSpace(cfg.R2Bucket), prefix: strings.Trim(strings.TrimSpace(cfg.R2ObjectPrefix), "/")}
}

func (s r2FileStore) ObjectKey(projectID string, storedName string) string {
	parts := []string{s.prefix, "projects", projectID, storedName}
	clean := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.Trim(part, "/")
		if trimmed != "" {
			clean = append(clean, trimmed)
		}
	}
	return path.Join(clean...)
}

func (s r2FileStore) Put(ctx context.Context, key string, body io.Reader, contentType string, size int64) error {
	input := &s3.PutObjectInput{
		Bucket:        aws.String(s.bucket),
		Key:           aws.String(key),
		Body:          body,
		ContentLength: aws.Int64(size),
	}
	if strings.TrimSpace(contentType) != "" {
		input.ContentType = aws.String(strings.TrimSpace(contentType))
	}
	_, err := s.client.PutObject(ctx, input)
	return err
}

func (s r2FileStore) Open(ctx context.Context, key string) (storedObject, error) {
	output, err := s.client.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(key)})
	if err != nil {
		if isS3NotFound(err) {
			return storedObject{}, errStoredObjectNotFound
		}
		return storedObject{}, err
	}
	size := int64(-1)
	if output.ContentLength != nil {
		size = *output.ContentLength
	}
	return storedObject{Body: output.Body, Size: size, ContentType: aws.ToString(output.ContentType)}, nil
}

func (s r2FileStore) Delete(ctx context.Context, key string) error {
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(key)})
	return err
}

func isS3NotFound(err error) bool {
	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		switch apiErr.ErrorCode() {
		case "NoSuchKey", "NotFound", "404":
			return true
		}
	}
	return false
}
