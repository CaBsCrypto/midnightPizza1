# --- Etapa de Compilación ---
FROM golang:1.21-alpine AS builder

# Instalar herramientas necesarias (opcional, como git o certificados)
RUN apk update && apk add --no-cache git ca-certificates

# Establecer el directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias y descargarlas
COPY go.mod ./
# Si tuviéramos go.sum, también lo copiaríamos. Al no tenerlo, solo go.mod.
RUN go mod download

# Copiar el código fuente
COPY . .

# Compilar el binario optimizado quitando símbolos de depuración
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o main .

# --- Etapa de Ejecución ---
FROM alpine:latest

# Instalar certificados CA para poder hacer peticiones HTTPS salientes seguras
RUN apk --no-cache add ca-certificates

# Crear un usuario no root para ejecutar la aplicación de forma segura
RUN adduser -D -g '' appuser

WORKDIR /app

# Copiar el binario compilado desde la etapa anterior
COPY --from=builder /app/main .

# Utilizar el usuario no root creado
USER appuser

# Exponer el puerto en el que escucha la aplicación
EXPOSE 8080

# Comando para ejecutar la aplicación
ENTRYPOINT ["./main"]
