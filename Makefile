.PHONY: install web-dev web-build web-lint web-test-e2e web-test-e2e-headed web-test-e2e-report api-run api-run-local api-build api-test api-test-unit db-create db-status db-up db-down db-reset db-validate db-local-up db-local-down db-local-reset db-status-local db-up-local diagram report-diagrams report report-watch report-clean report-deps-check report-visual-check

API_DIR := apps/api
GOOSE_VERSION := v3.27.0
DOCKER ?= docker
DB_LOCAL_PORT ?= 55432
DB_LOCAL_URL = postgres://postgres:postgres@localhost:$(DB_LOCAL_PORT)/unitrack?sslmode=disable
COMPOSE_ENV_FILE := /tmp/opencode/unitrack-compose.env
AUTH_LOCAL_ADMIN_EMAIL ?= admin@unitrack.local
AUTH_LOCAL_ADMIN_PASSWORD ?= admin12345
REPORT_DIR := report
REPORT_MAIN := report/main.tex
REPORT_BUILD_DIR := build
PLANTUML ?= plantuml
REPORT_DIAGRAM_SRC_DIR := $(REPORT_DIR)/diagrams
REPORT_DIAGRAM_OUT_DIR := $(REPORT_DIR)/assets/diagrams

install:
	pnpm install

web-dev:
	pnpm --filter @unitrack/web dev

web-build:
	pnpm --filter @unitrack/web build

web-lint:
	pnpm --filter @unitrack/web lint

web-test-e2e:
	pnpm --filter @unitrack/web test:e2e

web-test-e2e-headed:
	pnpm --filter @unitrack/web test:e2e:headed

web-test-e2e-report:
	pnpm --filter @unitrack/web test:e2e:report

api-run:
	go run ./apps/api/cmd/server

api-run-local:
	DATABASE_URL="$(DB_LOCAL_URL)" AUTH_BOOTSTRAP_ADMIN_EMAIL="$(AUTH_LOCAL_ADMIN_EMAIL)" AUTH_BOOTSTRAP_ADMIN_PASSWORD="$(AUTH_LOCAL_ADMIN_PASSWORD)" go run ./apps/api/cmd/server

api-build:
	mkdir -p apps/api/bin
	go build -o ./apps/api/bin/server ./apps/api/cmd/server

api-test:
	@test -n "$(TEST_DATABASE_URL)" || (printf "TEST_DATABASE_URL is required for make api-test so DB lifecycle tests do not skip silently. Use make api-test-unit for non-DB tests.\n" && exit 1)
	cd apps/api && TEST_DATABASE_URL="$(TEST_DATABASE_URL)" go test ./...

api-test-unit:
	cd apps/api && go test ./...

db-create:
	@test -n "$(name)" || (printf "name is required. Usage: make db-create name=add_users_table\n" && exit 1)
	@cd $(API_DIR) && go run github.com/pressly/goose/v3/cmd/goose@$(GOOSE_VERSION) -dir db/migrations -s create "$(name)" sql

db-status:
	@test -n "$(DATABASE_URL)" || (printf "DATABASE_URL is required. Usage: make db-status DATABASE_URL=postgres://...\n" && exit 1)
	@cd $(API_DIR) && go run github.com/pressly/goose/v3/cmd/goose@$(GOOSE_VERSION) -dir db/migrations postgres "$(DATABASE_URL)" status

db-up:
	@test -n "$(DATABASE_URL)" || (printf "DATABASE_URL is required. Usage: make db-up DATABASE_URL=postgres://...\n" && exit 1)
	@cd $(API_DIR) && go run github.com/pressly/goose/v3/cmd/goose@$(GOOSE_VERSION) -dir db/migrations postgres "$(DATABASE_URL)" up

db-down:
	@test -n "$(DATABASE_URL)" || (printf "DATABASE_URL is required. Usage: make db-down DATABASE_URL=postgres://...\n" && exit 1)
	@cd $(API_DIR) && go run github.com/pressly/goose/v3/cmd/goose@$(GOOSE_VERSION) -dir db/migrations postgres "$(DATABASE_URL)" down

db-reset:
	@test -n "$(DATABASE_URL)" || (printf "DATABASE_URL is required. Usage: make db-reset DATABASE_URL=postgres://...\n" && exit 1)
	@cd $(API_DIR) && go run github.com/pressly/goose/v3/cmd/goose@$(GOOSE_VERSION) -dir db/migrations postgres "$(DATABASE_URL)" reset

db-validate:
	@cd $(API_DIR) && go run github.com/pressly/goose/v3/cmd/goose@$(GOOSE_VERSION) -dir db/migrations validate

db-local-up:
	@mkdir -p /tmp/opencode
	@printf "POSTGRES_PORT=%s\n" "$(DB_LOCAL_PORT)" > "$(COMPOSE_ENV_FILE)"
	"$(DOCKER)" compose --env-file "$(COMPOSE_ENV_FILE)" up -d postgres
	@"$(DOCKER)" compose --env-file "$(COMPOSE_ENV_FILE)" exec -T postgres sh -lc 'until pg_isready -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" >/dev/null 2>&1; do sleep 1; done'

db-local-down:
	@mkdir -p /tmp/opencode
	@printf "POSTGRES_PORT=%s\n" "$(DB_LOCAL_PORT)" > "$(COMPOSE_ENV_FILE)"
	"$(DOCKER)" compose --env-file "$(COMPOSE_ENV_FILE)" down

db-local-reset:
	@mkdir -p /tmp/opencode
	@printf "POSTGRES_PORT=%s\n" "$(DB_LOCAL_PORT)" > "$(COMPOSE_ENV_FILE)"
	"$(DOCKER)" compose --env-file "$(COMPOSE_ENV_FILE)" down -v

db-status-local:
	@$(MAKE) db-local-up
	@cd $(API_DIR) && go run github.com/pressly/goose/v3/cmd/goose@$(GOOSE_VERSION) -dir db/migrations postgres "$(DB_LOCAL_URL)" status

db-up-local:
	@$(MAKE) db-local-up
	@cd $(API_DIR) && go run github.com/pressly/goose/v3/cmd/goose@$(GOOSE_VERSION) -dir db/migrations postgres "$(DB_LOCAL_URL)" up

diagram:
	@test -n "$(name)" || (printf "name is required. Usage: make diagram name=system-context\n" && exit 1)
	@mkdir -p docs/diagrams
	@test -f "docs/diagrams/$(name).mmd" || printf "flowchart TD\n    A[%s]\n" "$(name)" > "docs/diagrams/$(name).mmd"

report-diagrams:
	@command -v "$(PLANTUML)" >/dev/null || (printf "plantuml is required to render report diagrams. Install PlantUML and Graphviz; see report/README.md.\n" && exit 1)
	@mkdir -p "$(REPORT_DIAGRAM_OUT_DIR)"
	@for file in "$(REPORT_DIAGRAM_SRC_DIR)"/*.puml; do \
		test -e "$$file" || continue; \
		name=$$(basename "$$file" .puml); \
		printf "Rendering %s\n" "$$name"; \
		"$(PLANTUML)" -tpng -o "../assets/diagrams" "$$file"; \
	done

report-deps-check:
	@command -v latexmk >/dev/null || (printf "latexmk is required. Install TeX Live; see report/README.md.\n" && exit 1)
	@command -v xelatex >/dev/null || (printf "xelatex is required. Install TeX Live; see report/README.md.\n" && exit 1)

report: report-deps-check
	@mkdir -p "$(REPORT_DIR)/$(REPORT_BUILD_DIR)"
	latexmk -cd -xelatex -interaction=nonstopmode -file-line-error -outdir="$(REPORT_BUILD_DIR)" "$(REPORT_MAIN)"

report-visual-check: report
	sh "$(REPORT_DIR)/scripts/visual-check.sh"

report-watch: report-deps-check
	@mkdir -p "$(REPORT_DIR)/$(REPORT_BUILD_DIR)"
	latexmk -cd -xelatex -pvc -interaction=nonstopmode -file-line-error -outdir="$(REPORT_BUILD_DIR)" "$(REPORT_MAIN)"

report-clean:
	latexmk -cd -C -outdir="$(REPORT_BUILD_DIR)" "$(REPORT_MAIN)" >/dev/null 2>&1 || true
	rm -rf "$(REPORT_DIR)/$(REPORT_BUILD_DIR)"
