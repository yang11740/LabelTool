ifneq ($(OS),Windows_NT)
	SHELL := bash
endif

.PHONY: help setup format lint test coverage update_translate
.DEFAULT_GOAL := help

PYTEST_ARGS ?= --numprocesses=auto

define exec
	@uv run --no-sync python -c "print('\033[1;36m$(1)\033[0m')"
	@$(1)
endef

help:
	@uv run --no-sync python -c "import re; lines=open('Makefile').read().splitlines(); print('\033[1;32mAvailable targets:\033[0m'); [print(f'  \033[1;36m{m.group(1):<20s}\033[0m {m.group(2)}') for l in lines if (m:=re.match(r'^([a-zA-Z_-]+):.*?# (.+)$$',l))]"

setup:  # Setup the development environment
	$(call exec,uv sync)

lint: update_translate  # Lint code
	$(call exec,ruff format --check)
	$(call exec,ruff check)
	$(call exec,ty check --no-progress)
	$(call exec,taplo fmt --check $(shell git ls-files "*.toml"))
	$(call exec,mdformat --check $(shell git ls-files "*.md"))
	$(call exec,yamlfix --check $(shell git ls-files "*.yml" "*.yaml"))
	$(call exec,typos)
	$(call exec,git diff --exit-code labelme/translate)
	@if grep -r 'type="unfinished"' labelme/translate/*.ts; then \
		printf '\033[1;31mError: unfinished translations found\033[0m\n'; \
		exit 1; \
	fi

format:  # Format code
	$(call exec,ruff format)
	$(call exec,ruff check --fix)
	$(call exec,taplo fmt $(shell git ls-files "*.toml"))
	$(call exec,mdformat $(shell git ls-files "*.md"))
	$(call exec,yamlfix $(shell git ls-files "*.yml" "*.yaml"))

test:  # Run tests
	$(call exec,pytest -v tests/ $(PYTEST_ARGS))

update_translate:
	$(call exec,tools/update_translate.py)

coverage:  # Run tests with coverage
	$(call exec,pytest -v tests/ --numprocesses=auto --cov=labelme --cov-report=term-missing)
