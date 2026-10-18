# Build a small authenticated gateway; upstream image includes Chromium and the scraper binary.
FROM golang:1.24-alpine AS gateway-build
WORKDIR /src
COPY main.go .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /gateway main.go

FROM gosom/google-maps-scraper:latest
COPY --from=gateway-build /gateway /usr/local/bin/scraper-gateway
ENV PORT=10000
EXPOSE 10000
ENTRYPOINT ["/usr/local/bin/scraper-gateway"]
