.PHONY: all backend frontend fmt test

all: backend frontend

backend:
	go build -o irvc .

frontend:
	cd web && npm install && npm run build

fmt:
	goimports -w $$(find . -name '*.go' -not -path './web/node_modules/*')
	cd web && npm run fmt && npm run lint

test:
	go test ./...
	cd web && npm run --if-present test
