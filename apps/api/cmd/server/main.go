package main

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"unitrack/api/internal/app"
	"unitrack/api/internal/config"
	"unitrack/api/internal/database"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	cfg, err := config.Load()
	if err != nil {
		logger.Error("configuration load failed", slog.Any("error", err))
		os.Exit(1)
	}
	if err := cfg.Validate(); err != nil {
		logger.Error("configuration validation failed", slog.Any("error", err))
		os.Exit(1)
	}

	db, err := database.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("database connection failed", slog.Any("error", err))
		os.Exit(1)
	}
	if db != nil {
		defer db.Close()
	}

	api := app.NewServer(cfg, db, logger)
	if err := api.Bootstrap(ctx); err != nil {
		logger.Error("bootstrap failed", slog.Any("error", err))
		os.Exit(1)
	}
	if err := api.ProcessPendingStoredFileCleanups(ctx, 100); err != nil {
		logger.Warn("stored file cleanup reconciliation failed", slog.Any("error", err))
	}

	server := &http.Server{
		Addr:         net.JoinHostPort(cfg.HTTPHost, cfg.HTTPPort),
		Handler:      api.Handler(),
		ReadTimeout:  cfg.HTTPReadTimeout,
		WriteTimeout: cfg.HTTPWriteTimeout,
		IdleTimeout:  cfg.HTTPIdleTimeout,
	}

	serveErrCh := make(chan error, 1)
	go func() {
		logger.Info("starting http server", slog.String("address", server.Addr))

		if serveErr := server.ListenAndServe(); serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
			logger.Error("http server stopped unexpectedly", slog.Any("error", serveErr))
			serveErrCh <- serveErr
			stop()
		}
	}()

	<-ctx.Done()
	logger.Info("shutting down http server")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.HTTPShutdownTimeout)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("graceful shutdown failed", slog.Any("error", err))
		os.Exit(1)
	}
	select {
	case err := <-serveErrCh:
		logger.Error("http server failed", slog.Any("error", err))
		os.Exit(1)
	default:
	}
}
