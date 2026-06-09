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

	cfg := config.Load()
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

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

	server := &http.Server{
		Addr:         net.JoinHostPort(cfg.HTTPHost, cfg.HTTPPort),
		Handler:      api.Handler(),
		ReadTimeout:  cfg.HTTPReadTimeout,
		WriteTimeout: cfg.HTTPWriteTimeout,
		IdleTimeout:  cfg.HTTPIdleTimeout,
	}

	go func() {
		logger.Info("starting http server", slog.String("address", server.Addr))

		if serveErr := server.ListenAndServe(); serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
			logger.Error("http server stopped unexpectedly", slog.Any("error", serveErr))
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
}
