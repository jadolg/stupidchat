FROM golang:1.24-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -a -ldflags="-w -s" -o /stupidchat .
FROM scratch
COPY --from=builder /stupidchat /stupidchat
VOLUME /uploads
EXPOSE 8080
ENTRYPOINT ["/stupidchat"]