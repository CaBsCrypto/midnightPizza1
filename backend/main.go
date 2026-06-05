package main

import (
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"sync"
	"time"
)

// HealthResponse define la estructura de respuesta para el health check
type HealthResponse struct {
	Status string `json:"status"`
}

// Event representa la estructura genérica de un mensaje WebSocket
type Event struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

// JoinLobbyPayload define los datos recibidos al unirse al lobby
type JoinLobbyPayload struct {
	PlayerID string `json:"playerId"`
	Username string `json:"username"`
}

// MatchFoundPayload define los datos enviados cuando se encuentra una partida
type MatchFoundPayload struct {
	RoomID           string `json:"roomId"`
	Role             string `json:"role"` // "player_1" o "player_2"
	OpponentID       string `json:"opponentId"`
	OpponentUsername string `json:"opponentUsername"`
}

// PlaceCommitmentPayload contiene el tablero o el compromiso criptográfico de los barcos
type PlaceCommitmentPayload struct {
	RoomID     string          `json:"roomId"`
	PlayerID   string          `json:"playerId"`
	Commitment json.RawMessage `json:"commitment"` // Permite guardar la disposición de barcos
}

// FireBitePayload contiene las coordenadas de un ataque
type FireBitePayload struct {
	RoomID   string `json:"roomId"`
	PlayerID string `json:"playerId"`
	X        int    `json:"x"`
	Y        int    `json:"y"`
}

// BiteResultPayload contiene el resultado de un ataque
type BiteResultPayload struct {
	RoomID   string `json:"roomId"`
	PlayerID string `json:"playerId"` // Quién atacó
	X        int    `json:"x"`
	Y        int    `json:"y"`
	Result   string `json:"result"` // "hit", "miss", "sunk"
}

// RevealBoardPayload contiene la revelación final del tablero para verificación
type RevealBoardPayload struct {
	RoomID   string          `json:"roomId"`
	PlayerID string          `json:"playerId"`
	Board    json.RawMessage `json:"board"`
}

// OpponentDisconnectedPayload notifica si el rival abandona la sala
type OpponentDisconnectedPayload struct {
	RoomID   string `json:"roomId"`
	PlayerID string `json:"playerId"` // Jugador que se desconectó
}

// Client representa un jugador conectado mediante WebSocket
type Client struct {
	conn     net.Conn
	send     chan []byte
	playerID string
	username string
	room     *Room
	isClosed bool
	mu       sync.Mutex
}

// Room representa una sala de juego activa con dos jugadores
type Room struct {
	ID      string
	Player1 *Client
	Player2 *Client
	mu      sync.Mutex
}

// Server administra el ciclo de vida del juego, los clientes y las salas
type Server struct {
	rooms      map[string]*Room
	roomsMu    sync.RWMutex
	pending    []*Client
	pendingMu  sync.Mutex
	register   chan *Client
	unregister chan *Client
}

func NewServer() *Server {
	s := &Server{
		rooms:      make(map[string]*Room),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
	go s.run()
	return s
}

// run maneja el registro y la desconexión de clientes a nivel global
func (s *Server) run() {
	for {
		select {
		case client := <-s.register:
			log.Printf("Nuevo cliente registrado temporalmente: %s", client.conn.RemoteAddr().String())

		case client := <-s.unregister:
			log.Printf("Cliente desregistrado: %s (PlayerID: %s)", client.conn.RemoteAddr().String(), client.playerID)
			s.removeFromLobby(client)
			s.handleDisconnect(client)
		}
	}
}

// addToLobby agrega un jugador a la cola del Matchmaker y busca pareja
func (s *Server) addToLobby(client *Client) {
	s.pendingMu.Lock()
	defer s.pendingMu.Unlock()

	// Evitar duplicados en la cola
	for _, p := range s.pending {
		if p == client || (p.playerID != "" && p.playerID == client.playerID) {
			return
		}
	}

	s.pending = append(s.pending, client)
	log.Printf("Jugador %s (%s) se unió al lobby. Total en espera: %d", client.username, client.playerID, len(s.pending))

	// Matchmaker 1v1 automático
	if len(s.pending) >= 2 {
		p1 := s.pending[0]
		p2 := s.pending[1]
		s.pending = s.pending[2:]

		s.createRoom(p1, p2)
	}
}

// removeFromLobby quita al jugador de la cola del Matchmaker si se desconecta
func (s *Server) removeFromLobby(client *Client) {
	s.pendingMu.Lock()
	defer s.pendingMu.Unlock()

	for i, p := range s.pending {
		if p == client {
			s.pending = append(s.pending[:i], s.pending[i+1:]...)
			log.Printf("Jugador %s eliminado del lobby.", client.playerID)
			break
		}
	}
}

// createRoom genera una nueva sala y notifica a los jugadores
func (s *Server) createRoom(p1, p2 *Client) {
	s.roomsMu.Lock()
	defer s.roomsMu.Unlock()

	roomID := fmt.Sprintf("room_%d", time.Now().UnixNano())
	room := &Room{
		ID:      roomID,
		Player1: p1,
		Player2: p2,
	}

	s.rooms[roomID] = room
	p1.room = room
	p2.room = room

	log.Printf("Partida emparejada: Sala %s creada con %s y %s", roomID, p1.username, p2.username)

	// Notificar a Player 1
	p1Payload := MatchFoundPayload{
		RoomID:           roomID,
		Role:             "player_1",
		OpponentID:       p2.playerID,
		OpponentUsername: p2.username,
	}
	p1Msg, _ := json.Marshal(Event{Type: "match_found", Payload: mustMarshal(p1Payload)})
	p1.sendBytes(p1Msg)

	// Notificar a Player 2
	p2Payload := MatchFoundPayload{
		RoomID:           roomID,
		Role:             "player_2",
		OpponentID:       p1.playerID,
		OpponentUsername: p1.username,
	}
	p2Msg, _ := json.Marshal(Event{Type: "match_found", Payload: mustMarshal(p2Payload)})
	p2.sendBytes(p2Msg)
}

// handleDisconnect gestiona el abandono o desconexión del juego
func (s *Server) handleDisconnect(client *Client) {
	if client.room == nil {
		return
	}

	room := client.room
	room.mu.Lock()
	defer room.mu.Unlock()

	var opponent *Client
	if room.Player1 == client {
		opponent = room.Player2
	} else if room.Player2 == client {
		opponent = room.Player1
	}

	if opponent != nil {
		disconnectPayload := OpponentDisconnectedPayload{
			RoomID:   room.ID,
			PlayerID: client.playerID,
		}
		msg, _ := json.Marshal(Event{Type: "opponent_disconnected", Payload: mustMarshal(disconnectPayload)})
		opponent.sendBytes(msg)
		opponent.room = nil
	}

	s.roomsMu.Lock()
	delete(s.rooms, room.ID)
	s.roomsMu.Unlock()
	log.Printf("Sala %s destruida debido a desconexión.", room.ID)
}

func mustMarshal(v interface{}) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}

func (c *Client) sendBytes(msg []byte) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.isClosed {
		return
	}
	select {
	case c.send <- msg:
	default:
		// Buffer lleno, cerramos conexión
		log.Printf("Buffer de escritura lleno para cliente: %s", c.conn.RemoteAddr().String())
		c.conn.Close()
	}
}

// writePump envía mensajes asíncronamente al WebSocket
func (c *Client) writePump() {
	defer func() {
		c.conn.Close()
	}()
	for {
		msg, ok := <-c.send
		if !ok {
			// El canal fue cerrado
			writeTextMessage(c.conn, []byte{})
			return
		}
		if err := writeTextMessage(c.conn, msg); err != nil {
			log.Printf("Error escribiendo en WebSocket: %v", err)
			return
		}
	}
}

// readPump procesa los mensajes entrantes del WebSocket
func (c *Client) readPump(server *Server) {
	defer func() {
		c.mu.Lock()
		c.isClosed = true
		close(c.send)
		c.mu.Unlock()
		server.unregister <- c
		c.conn.Close()
	}()

	for {
		payload, err := readMessage(c.conn)
		if err != nil {
			if err != io.EOF {
				log.Printf("Error leyendo mensaje de WebSocket: %v", err)
			}
			break
		}

		var ev Event
		if err := json.Unmarshal(payload, &ev); err != nil {
			log.Printf("JSON inválido: %v", err)
			continue
		}

		c.handleEvent(server, ev)
	}
}

// handleEvent procesa eventos específicos del juego
func (c *Client) handleEvent(server *Server, ev Event) {
	switch ev.Type {
	case "join_lobby":
		var p JoinLobbyPayload
		if err := json.Unmarshal(ev.Payload, &p); err != nil {
			log.Printf("Error unmarshaling join_lobby: %v", err)
			return
		}
		c.playerID = p.PlayerID
		c.username = p.Username
		server.addToLobby(c)

	case "place_commitment":
		if c.room == nil {
			return
		}
		// Reenviar el compromiso al oponente
		c.room.mu.Lock()
		opponent := c.getOpponent()
		c.room.mu.Unlock()

		if opponent != nil {
			opponent.sendBytes(mustMarshalEvent("place_commitment", ev.Payload))
		}

	case "fire_bite":
		if c.room == nil {
			return
		}
		// Reenviar el ataque al oponente
		c.room.mu.Lock()
		opponent := c.getOpponent()
		c.room.mu.Unlock()

		if opponent != nil {
			opponent.sendBytes(mustMarshalEvent("fire_bite", ev.Payload))
		}

	case "bite_result":
		if c.room == nil {
			return
		}
		// Reenviar el resultado al oponente
		c.room.mu.Lock()
		opponent := c.getOpponent()
		c.room.mu.Unlock()

		if opponent != nil {
			opponent.sendBytes(mustMarshalEvent("bite_result", ev.Payload))
		}

	case "reveal_board_event":
		if c.room == nil {
			return
		}
		// Reenviar la revelación al oponente
		c.room.mu.Lock()
		opponent := c.getOpponent()
		c.room.mu.Unlock()

		if opponent != nil {
			opponent.sendBytes(mustMarshalEvent("reveal_board_event", ev.Payload))
		}

	default:
		log.Printf("Evento no reconocido: %s", ev.Type)
	}
}

func (c *Client) getOpponent() *Client {
	if c.room == nil {
		return nil
	}
	if c.room.Player1 == c {
		return c.room.Player2
	}
	return c.room.Player1
}

func mustMarshalEvent(t string, payload json.RawMessage) []byte {
	ev := Event{Type: t, Payload: payload}
	b, _ := json.Marshal(ev)
	return b
}

// upgradeToWebSocket convierte la conexión HTTP a WebSocket según el estándar RFC 6455
func upgradeToWebSocket(w http.ResponseWriter, r *http.Request) (net.Conn, error) {
	if r.Header.Get("Upgrade") != "websocket" && r.Header.Get("upgrade") != "websocket" {
		http.Error(w, "Not a websocket handshake", http.StatusBadRequest)
		return nil, fmt.Errorf("not a websocket handshake")
	}
	hj, ok := w.(http.Hijacker)
	if !ok {
		http.Error(w, "Webserver doesn't support hijacking", http.StatusInternalServerError)
		return nil, fmt.Errorf("webserver doesn't support hijacking")
	}
	conn, bufrw, err := hj.Hijack()
	if err != nil {
		return nil, err
	}

	key := r.Header.Get("Sec-WebSocket-Key")
	const websocketGUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
	h := sha1.New()
	h.Write([]byte(key + websocketGUID))
	accept := base64.StdEncoding.EncodeToString(h.Sum(nil))

	bufrw.WriteString("HTTP/1.1 101 Switching Protocols\r\n")
	bufrw.WriteString("Upgrade: websocket\r\n")
	bufrw.WriteString("Connection: Upgrade\r\n")
	bufrw.WriteString("Sec-WebSocket-Accept: " + accept + "\r\n\r\n")
	bufrw.Flush()

	return conn, nil
}

// readMessage analiza un frame de datos WebSocket según el estándar de enmascaramiento
func readMessage(conn net.Conn) ([]byte, error) {
	header := make([]byte, 2)
	_, err := io.ReadFull(conn, header)
	if err != nil {
		return nil, err
	}

	opcode := header[0] & 0x0f
	if opcode == 8 { // Cierre de conexión
		return nil, io.EOF
	}

	masked := (header[1] & 0x80) != 0
	payloadLen := int64(header[1] & 0x7f)

	if payloadLen == 126 {
		lenBuf := make([]byte, 2)
		_, err = io.ReadFull(conn, lenBuf)
		if err != nil {
			return nil, err
		}
		payloadLen = int64(lenBuf[0])<<8 | int64(lenBuf[1])
	} else if payloadLen == 127 {
		lenBuf := make([]byte, 8)
		_, err = io.ReadFull(conn, lenBuf)
		if err != nil {
			return nil, err
		}
		payloadLen = 0
		for i := 0; i < 8; i++ {
			payloadLen = (payloadLen << 8) | int64(lenBuf[i])
		}
	}

	var maskKey []byte
	if masked {
		maskKey = make([]byte, 4)
		_, err = io.ReadFull(conn, maskKey)
		if err != nil {
			return nil, err
		}
	}

	payload := make([]byte, payloadLen)
	_, err = io.ReadFull(conn, payload)
	if err != nil {
		return nil, err
	}

	if masked {
		for i := int64(0); i < payloadLen; i++ {
			payload[i] ^= maskKey[i%4]
		}
	}

	return payload, nil
}

// writeTextMessage empaqueta y envía un frame de texto WebSocket
func writeTextMessage(conn net.Conn, msg []byte) error {
	var header []byte
	header = append(header, 0x81) // FIN = 1, Opcode = 1 (Texto)

	length := len(msg)
	if length <= 125 {
		header = append(header, byte(length))
	} else if length <= 65535 {
		header = append(header, 126)
		header = append(header, byte(length>>8), byte(length&0xff))
	} else {
		header = append(header, 127)
		for i := 7; i >= 0; i-- {
			header = append(header, byte(length>>(i*8)))
		}
	}

	if _, err := conn.Write(header); err != nil {
		return err
	}
	_, err := conn.Write(msg)
	return err
}

func main() {
	server := NewServer()

	// Endpoint para el healthcheck de la app
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(HealthResponse{Status: "ok"})
	})

	// Endpoint WebSocket
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		// Habilitar CORS básico para conexiones de WebSocket si aplica
		conn, err := upgradeToWebSocket(w, r)
		if err != nil {
			log.Printf("Error upgrading connection: %v", err)
			return
		}

		client := &Client{
			conn: conn,
			send: make(chan []byte, 256),
		}

		server.register <- client

		go client.writePump()
		go client.readPump(server)
	})

	log.Println("Server running on port 8080...")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatalf("Server shutdown with error: %v", err)
	}
}
