package main

import (
	"crypto/sha1"
	"crypto/sha256"
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

// JoinLobbyPayload define los datos recibidos al unirse al lobby, con soporte para salas ZK preimage
type JoinLobbyPayload struct {
	PlayerID       string `json:"playerId"`
	Username       string `json:"username"`
	InviteHash     string `json:"inviteHash,omitempty"`     // En caso de hospedar
	InvitePreimage string `json:"invitePreimage,omitempty"` // En caso de unirse
}

// MatchFoundPayload define los datos enviados cuando se encuentra una partida
type MatchFoundPayload struct {
	RoomID           string `json:"roomId"`
	Role             string `json:"role"` // "player_1" o "player_2"
	OpponentID       string `json:"opponentId"`
	OpponentUsername string `json:"opponentUsername"`
	PlayerTurn       bool   `json:"playerTurn"`
}

// SubmitBoardPayload contiene el tablero 6x6 secreto que cada jugador entrega al servidor autoritativo
type SubmitBoardPayload struct {
	Board [][]int `json:"board"`
}

// BitePayload contiene la celda mordida (r, c) enviada por el atacante
type BitePayload struct {
	R int `json:"r"`
	C int `json:"c"`
}

// PlaceCommitmentPayload contiene el tablero o el compromiso criptográfico de los barcos
type PlaceCommitmentPayload struct {
	RoomID     string          `json:"roomId"`
	PlayerID   string          `json:"playerId"`
	Commitment json.RawMessage `json:"commitment"`
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
	PlayerID string `json:"playerId"`
	X        int    `json:"x"`
	Y        int    `json:"y"`
	Result   string `json:"result"`
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
	PlayerID string `json:"playerId"`
}

// LobbyErrorPayload define el payload enviado en caso de error de lobby
type LobbyErrorPayload struct {
	Message string `json:"message"`
}

// WSMessage representa un frame de WebSocket saliente con su opcode
type WSMessage struct {
	opcode  byte
	payload []byte
}

// Client representa un jugador conectado mediante WebSocket
type Client struct {
	conn           net.Conn
	send           chan WSMessage
	playerID       string
	username       string
	inviteHash     string
	invitePreimage string
	room           *Room
	isClosed       bool
	lastSeen       time.Time
	mu             sync.Mutex
}

// PlayerState mantiene el estado de juego autoritativo de un jugador en el servidor.
// El tablero nunca se envía al oponente; solo se revela el valor de cada celda mordida.
type PlayerState struct {
	board    [6][6]int
	boardSet bool
	hp       int
	score    int
	immunity bool             // absorbe la próxima trampa de chile
	bitten   [6][6]bool       // celdas que ESTE jugador ya mordió del tablero rival
}

// Room representa una sala de juego activa con dos jugadores y su estado autoritativo.
type Room struct {
	ID      string
	Player1 *Client
	Player2 *Client
	P1State *PlayerState
	P2State *PlayerState
	turnP1  bool // true = turno del Player1
	started bool // true cuando ambos tableros fueron entregados
	over    bool // true cuando la partida terminó
	mu      sync.Mutex
}

// defaultRival genera un descriptor de chef rival para el cliente (identidad visual).
func defaultRival(username string) map[string]interface{} {
	name := username
	if name == "" {
		name = "Cyber Pizzaiolo"
	}
	return map[string]interface{}{
		"name":       name,
		"emoji":      "🧑‍🍳",
		"title":      "Rival Soroban",
		"aggression": 4,
	}
}

// boolToPlayer traduce "¿gané?" a la etiqueta que espera el frontend.
func boolToPlayer(won bool) string {
	if won {
		return "player"
	}
	return "rival"
}

// applyBite aplica el resultado de morder una celda del tablero del defensor.
// Reglas v1 (autoritativas, ajustables en fase de diseño):
//   0        celda vacía (agua): fallo, sin efecto
//   1-4      rebanada de pizza: el defensor pierde 1 HP, el atacante suma +100 pts
//   5        jalapeño (trampa): el atacante pierde 1 HP (o consume inmunidad)
//   6        habanero (trampa): el atacante pierde 2 HP (o consume inmunidad)
//   7        agua (cura): el atacante recupera +1 HP (máx 5)
//   8        leche (cura): el atacante recupera +2 HP (máx 5)
//   9        trufa de oro: el atacante suma +500 pts y gana inmunidad
func applyBite(attacker, defender *PlayerState, val int) {
	switch {
	case val >= 1 && val <= 4:
		defender.hp -= 1
		attacker.score += 100
	case val == 5:
		if attacker.immunity {
			attacker.immunity = false
		} else {
			attacker.hp -= 1
		}
	case val == 6:
		if attacker.immunity {
			attacker.immunity = false
		} else {
			attacker.hp -= 2
		}
	case val == 7:
		attacker.hp += 1
	case val == 8:
		attacker.hp += 2
	case val == 9:
		attacker.score += 500
		attacker.immunity = true
	}
	if attacker.hp > 5 {
		attacker.hp = 5
	}
	if attacker.hp < 0 {
		attacker.hp = 0
	}
	if defender.hp < 0 {
		defender.hp = 0
	}
}

// Server administra el ciclo de vida del juego, los clientes y las salas
type Server struct {
	rooms              map[string]*Room
	roomsMu            sync.RWMutex
	roomsByPlayer      map[string]*Room // PlayerID -> Room active/paused
	roomsByPlayerMu    sync.RWMutex
	graceDisconnections map[string]*time.Timer // RoomID -> Timer de gracia
	graceMu            sync.Mutex
	pending            []*Client
	pendingMu          sync.Mutex
	inviteLobbies      map[string]*Client // Mapa hash -> Host Client
	inviteMu           sync.Mutex
	clients            map[*Client]bool
	clientsMu          sync.Mutex
	register           chan *Client
	unregister         chan *Client
}

func NewServer() *Server {
	s := &Server{
		rooms:               make(map[string]*Room),
		roomsByPlayer:       make(map[string]*Room),
		graceDisconnections: make(map[string]*time.Timer),
		inviteLobbies:       make(map[string]*Client),
		clients:             make(map[*Client]bool),
		register:            make(chan *Client),
		unregister:          make(chan *Client),
	}
	go s.run()
	s.startHeartbeatTicker()
	return s
}


// run maneja el registro y la desconexión de clientes a nivel global
func (s *Server) run() {
	for {
		select {
		case client := <-s.register:
			log.Printf("Nuevo cliente registrado temporalmente: %s", client.conn.RemoteAddr().String())
			s.clientsMu.Lock()
			s.clients[client] = true
			s.clientsMu.Unlock()

		case client := <-s.unregister:
			log.Printf("Cliente desregistrado: %s (PlayerID: %s)", client.conn.RemoteAddr().String(), client.playerID)
			s.clientsMu.Lock()
			delete(s.clients, client)
			s.clientsMu.Unlock()
			s.removeFromLobby(client)
			s.handleDisconnect(client)
		}
	}
}

// startHeartbeatTicker monitorea periódicamente la salud de las conexiones enviando pings
func (s *Server) startHeartbeatTicker() {
	ticker := time.NewTicker(30 * time.Second)
	go func() {
		for range ticker.C {
			s.clientsMu.Lock()
			now := time.Now()
			var deadClients []*Client
			for client := range s.clients {
				client.mu.Lock()
				// Si no responde en más de 65 segundos, desconectar
				if now.Sub(client.lastSeen) > 65*time.Second {
					deadClients = append(deadClients, client)
				} else {
					go client.sendPing()
				}
				client.mu.Unlock()
			}
			s.clientsMu.Unlock()

			for _, client := range deadClients {
				log.Printf("Desconectando cliente inactivo por Ping Timeout: %s", client.conn.RemoteAddr().String())
				client.conn.Close()
			}
		}
	}()
}

// addToLobby agrega un jugador a la cola del Matchmaker o lo asocia vía ZK Preimage
func (s *Server) addToLobby(client *Client) {
	// Interceptar reconexión si el jugador ya pertenecía a una sala pausada/activa
	s.roomsByPlayerMu.RLock()
	existingRoom, hasRoom := s.roomsByPlayer[client.playerID]
	s.roomsByPlayerMu.RUnlock()

	if hasRoom && existingRoom != nil {
		existingRoom.mu.Lock()
		// Cancelar temporizador de desconexión por gracia
		s.graceMu.Lock()
		if timer, exists := s.graceDisconnections[existingRoom.ID]; exists {
			timer.Stop()
			delete(s.graceDisconnections, existingRoom.ID)
			log.Printf("Temporizador de gracia cancelado para sala %s (Jugador reconectado: %s)", existingRoom.ID, client.username)
		}
		s.graceMu.Unlock()

		var role string
		var opponent *Client
		if existingRoom.Player1.playerID == client.playerID {
			existingRoom.Player1 = client
			role = "player_1"
			opponent = existingRoom.Player2
		} else {
			existingRoom.Player2 = client
			role = "player_2"
			opponent = existingRoom.Player1
		}
		client.room = existingRoom
		existingRoom.mu.Unlock()

		log.Printf("Jugador %s se reconectó exitosamente a sala %s", client.username, existingRoom.ID)

		// Notificar al jugador reconectado (restaurando de quién es el turno)
		reconnectTurn := existingRoom.turnP1
		if role == "player_2" {
			reconnectTurn = !existingRoom.turnP1
		}
		reconnectPayload := MatchFoundPayload{
			RoomID:           existingRoom.ID,
			Role:             role,
			OpponentID:       opponent.playerID,
			OpponentUsername: opponent.username,
			PlayerTurn:       reconnectTurn,
		}
		reconnectMsg, _ := json.Marshal(Event{Type: "match_found", Payload: mustMarshal(reconnectPayload)})
		client.sendBytes(reconnectMsg)

		// Notificar al oponente
		if opponent != nil {
			opponentMsg, _ := json.Marshal(Event{Type: "opponent_reconnected", Payload: mustMarshal(LobbyErrorPayload{Message: fmt.Sprintf("El oponente %s ha regresado a la arena.", client.username)})})
			opponent.sendBytes(opponentMsg)
		}
		return
	}

	// 1. Caso Lobby Privado ZK Preimage (Unirse como Invitado)
	if client.invitePreimage != "" {
		s.inviteMu.Lock()
		h := sha256.Sum256([]byte(client.invitePreimage))
		hashStr := fmt.Sprintf("%x", h)
		host, ok := s.inviteLobbies[hashStr]
		if ok {
			delete(s.inviteLobbies, hashStr)
			s.inviteMu.Unlock()
			log.Printf("Matchmaking ZK Preimage exitoso: Host %s y Guest %s se unen por secreto '%s'", host.username, client.username, client.invitePreimage)
			s.createRoom(host, client)
			return
		}
		s.inviteMu.Unlock()
		// Retornar error si la preimagen no coincide con ninguna sala activa
		errPayload := LobbyErrorPayload{Message: "Código de invitación inválido o sala no encontrada"}
		errEvent, _ := json.Marshal(Event{Type: "lobby_error", Payload: mustMarshal(errPayload)})
		client.sendBytes(errEvent)
		return
	}

	// 2. Caso Lobby Privado ZK Preimage (Hospedar como Host)
	if client.inviteHash != "" {
		s.inviteMu.Lock()
		s.inviteLobbies[client.inviteHash] = client
		s.inviteMu.Unlock()
		log.Printf("Sala privada creada. Esperando invitado con preimage para hash: %s", client.inviteHash)
		return
	}

	// 3. Matchmaker público tradicional
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
	for i, p := range s.pending {
		if p == client {
			s.pending = append(s.pending[:i], s.pending[i+1:]...)
			log.Printf("Jugador %s eliminado del lobby público.", client.playerID)
			break
		}
	}
	s.pendingMu.Unlock()

	// Limpiar lobbies de invitación si aplica
	s.inviteMu.Lock()
	if client.inviteHash != "" {
		delete(s.inviteLobbies, client.inviteHash)
	}
	for hash, host := range s.inviteLobbies {
		if host == client {
			delete(s.inviteLobbies, hash)
		}
	}
	s.inviteMu.Unlock()
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
		P1State: &PlayerState{hp: 5},
		P2State: &PlayerState{hp: 5},
		turnP1:  true,
	}

	s.rooms[roomID] = room
	p1.room = room
	p2.room = room

	s.roomsByPlayerMu.Lock()
	s.roomsByPlayer[p1.playerID] = room
	s.roomsByPlayer[p2.playerID] = room
	s.roomsByPlayerMu.Unlock()

	log.Printf("Partida emparejada: Sala %s creada con %s y %s", roomID, p1.username, p2.username)

	// Notificar a Player 1 (comienza moviendo)
	p1Payload := MatchFoundPayload{
		RoomID:           roomID,
		Role:             "player_1",
		OpponentID:       p2.playerID,
		OpponentUsername: p2.username,
		PlayerTurn:       true,
	}
	p1Msg, _ := json.Marshal(Event{Type: "match_found", Payload: mustMarshal(p1Payload)})
	p1.sendBytes(p1Msg)

	// Notificar a Player 2
	p2Payload := MatchFoundPayload{
		RoomID:           roomID,
		Role:             "player_2",
		OpponentID:       p1.playerID,
		OpponentUsername: p1.username,
		PlayerTurn:       false,
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
		// Notificar desconexión temporal
		disconnectPayload := LobbyErrorPayload{Message: fmt.Sprintf("El oponente %s se ha desconectado temporalmente. Esperando reconexión (15s)...", client.username)}
		msg, _ := json.Marshal(Event{Type: "opponent_disconnected_temporary", Payload: mustMarshal(disconnectPayload)})
		opponent.sendBytes(msg)

		// Configurar timer de gracia de 15 segundos
		s.graceMu.Lock()
		if timer, exists := s.graceDisconnections[room.ID]; exists {
			timer.Stop()
		}
		
		s.graceDisconnections[room.ID] = time.AfterFunc(15*time.Second, func() {
			s.graceMu.Lock()
			delete(s.graceDisconnections, room.ID)
			s.graceMu.Unlock()

			room.mu.Lock()
			var currentOpponent *Client
			if room.Player1 == client {
				currentOpponent = room.Player2
			} else {
				currentOpponent = room.Player1
			}
			room.mu.Unlock()

			if currentOpponent != nil {
				finalMsg, _ := json.Marshal(Event{Type: "opponent_disconnected", Payload: mustMarshal(OpponentDisconnectedPayload{RoomID: room.ID, PlayerID: client.playerID})})
				currentOpponent.sendBytes(finalMsg)
				currentOpponent.room = nil
			}

			s.roomsMu.Lock()
			delete(s.rooms, room.ID)
			s.roomsMu.Unlock()

			s.roomsByPlayerMu.Lock()
			delete(s.roomsByPlayer, room.Player1.playerID)
			delete(s.roomsByPlayer, room.Player2.playerID)
			s.roomsByPlayerMu.Unlock()

			log.Printf("Sala %s eliminada de forma definitiva por tiempo de gracia expirado.", room.ID)
		})
		s.graceMu.Unlock()
	} else {
		// Si ya no queda oponente, limpiar de inmediato
		s.roomsMu.Lock()
		delete(s.rooms, room.ID)
		s.roomsMu.Unlock()

		s.roomsByPlayerMu.Lock()
		delete(s.roomsByPlayer, room.Player1.playerID)
		delete(s.roomsByPlayer, room.Player2.playerID)
		s.roomsByPlayerMu.Unlock()
	}
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
	case c.send <- WSMessage{opcode: 1, payload: msg}:
	default:
		log.Printf("Buffer de escritura lleno para cliente: %s", c.conn.RemoteAddr().String())
		c.conn.Close()
	}
}

func (c *Client) sendPing() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.isClosed {
		return
	}
	select {
	case c.send <- WSMessage{opcode: 9, payload: nil}:
	default:
		c.conn.Close()
	}
}

func (c *Client) sendPong(payload []byte) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.isClosed {
		return
	}
	select {
	case c.send <- WSMessage{opcode: 10, payload: payload}:
	default:
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
			writeFrame(c.conn, 8, []byte{}) // Close frame
			return
		}
		if err := writeFrame(c.conn, msg.opcode, msg.payload); err != nil {
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

	c.mu.Lock()
	c.lastSeen = time.Now()
	c.mu.Unlock()

	for {
		payload, opcode, err := readMessage(c.conn)
		if err != nil {
			if err != io.EOF {
				log.Printf("Error leyendo mensaje de WebSocket: %v", err)
			}
			break
		}

		c.mu.Lock()
		c.lastSeen = time.Now()
		c.mu.Unlock()

		if opcode == 9 { // Ping
			c.sendPong(payload)
			continue
		}
		if opcode == 10 { // Pong
			continue
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
		c.inviteHash = p.InviteHash
		c.invitePreimage = p.InvitePreimage
		server.addToLobby(c)

	case "submit_board":
		c.handleSubmitBoard(ev)

	case "bite":
		c.handleBite(ev)

	case "cancel_matchmaking":
		server.removeFromLobby(c)

	case "forfeit":
		c.handleForfeit()

	case "reveal_board_event":
		// Relay legado para la fase de revelado ZK final (aún no autoritativo).
		if c.room == nil {
			return
		}
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

// handleSubmitBoard almacena el tablero secreto del jugador. Cuando ambos
// tableros están presentes, inicia la partida notificando a ambos clientes.
func (c *Client) handleSubmitBoard(ev Event) {
	if c.room == nil {
		return
	}
	room := c.room
	room.mu.Lock()
	defer room.mu.Unlock()

	if room.started {
		// No se permite cambiar el tablero una vez iniciada la partida.
		return
	}

	var p SubmitBoardPayload
	if err := json.Unmarshal(ev.Payload, &p); err != nil {
		log.Printf("submit_board inválido: %v", err)
		return
	}
	if len(p.Board) != 6 {
		return
	}

	var st *PlayerState
	if room.Player1 == c {
		st = room.P1State
	} else if room.Player2 == c {
		st = room.P2State
	} else {
		return
	}
	if st == nil {
		return
	}

	for i := 0; i < 6; i++ {
		if len(p.Board[i]) != 6 {
			return
		}
		for j := 0; j < 6; j++ {
			st.board[i][j] = p.Board[i][j]
		}
	}
	st.boardSet = true
	log.Printf("Tablero recibido de %s en sala %s", c.username, room.ID)

	// Iniciar cuando ambos tableros estén listos.
	if room.P1State.boardSet && room.P2State.boardSet && !room.started {
		room.started = true
		room.turnP1 = true
		room.Player1.sendBytes(mustMarshalEvent("match_start", mustMarshal(map[string]interface{}{
			"playerTurn": true,
			"rivalChef":  defaultRival(room.Player2.username),
		})))
		room.Player2.sendBytes(mustMarshalEvent("match_start", mustMarshal(map[string]interface{}{
			"playerTurn": false,
			"rivalChef":  defaultRival(room.Player1.username),
		})))
		log.Printf("Partida iniciada en sala %s (ambos tableros comprometidos)", room.ID)
	}
}

// handleBite procesa un mordisco de forma autoritativa: valida turno y celda,
// aplica reglas de combate, avanza el turno y notifica el resultado a ambos.
func (c *Client) handleBite(ev Event) {
	if c.room == nil {
		return
	}
	room := c.room
	room.mu.Lock()
	defer room.mu.Unlock()

	if !room.started || room.over {
		c.sendBytes(mustMarshalEvent("error", mustMarshal(LobbyErrorPayload{Message: "La partida no está activa."})))
		return
	}

	isP1 := room.Player1 == c
	if (isP1 && !room.turnP1) || (!isP1 && room.turnP1) {
		c.sendBytes(mustMarshalEvent("error", mustMarshal(LobbyErrorPayload{Message: "No es tu turno."})))
		return
	}

	var p BitePayload
	if err := json.Unmarshal(ev.Payload, &p); err != nil {
		return
	}
	if p.R < 0 || p.R > 5 || p.C < 0 || p.C > 5 {
		c.sendBytes(mustMarshalEvent("error", mustMarshal(LobbyErrorPayload{Message: "Celda fuera de rango."})))
		return
	}

	var attacker, defender *PlayerState
	var defenderClient *Client
	if isP1 {
		attacker, defender, defenderClient = room.P1State, room.P2State, room.Player2
	} else {
		attacker, defender, defenderClient = room.P2State, room.P1State, room.Player1
	}

	if attacker.bitten[p.R][p.C] {
		c.sendBytes(mustMarshalEvent("error", mustMarshal(LobbyErrorPayload{Message: "Ya mordiste esa casilla."})))
		return
	}
	attacker.bitten[p.R][p.C] = true

	val := defender.board[p.R][p.C]
	applyBite(attacker, defender, val)

	// El turno siempre pasa al oponente tras un mordisco.
	room.turnP1 = !room.turnP1

	// Evaluar fin de partida.
	over := false
	attackerWon := false
	if attacker.hp <= 0 {
		over, attackerWon = true, false
	} else if defender.hp <= 0 {
		over, attackerWon = true, true
	}
	if over {
		room.over = true
	}

	attackerTurn := (isP1 && room.turnP1) || (!isP1 && !room.turnP1)

	// Resultado para el atacante (su vista del tablero rival).
	c.sendBytes(mustMarshalEvent("bite_result", mustMarshal(map[string]interface{}{
		"r": p.R, "c": p.C, "val": val,
		"playerHP": attacker.hp, "playerScore": attacker.score,
		"rivalHP": defender.hp, "rivalScore": defender.score,
		"playerTurn": attackerTurn,
	})))

	// Notificación para el defensor (su tablero fue mordido).
	// sendBytes solo toma el mutex del cliente (no el de la sala), por lo que
	// es seguro emitir mientras se mantiene room.mu.
	if defenderClient != nil {
		defenderClient.sendBytes(mustMarshalEvent("rival_bite", mustMarshal(map[string]interface{}{
			"r": p.R, "c": p.C, "val": val,
			"playerHP": defender.hp, "playerScore": defender.score,
			"rivalHP": attacker.hp, "rivalScore": attacker.score,
			"playerTurn": !attackerTurn,
		})))
	}

	if over {
		c.sendBytes(mustMarshalEvent("game_over", mustMarshal(map[string]interface{}{"winner": boolToPlayer(attackerWon)})))
		if defenderClient != nil {
			defenderClient.sendBytes(mustMarshalEvent("game_over", mustMarshal(map[string]interface{}{"winner": boolToPlayer(!attackerWon)})))
		}
	}
}

// handleForfeit marca la partida como terminada y otorga la victoria al oponente.
func (c *Client) handleForfeit() {
	if c.room == nil {
		return
	}
	room := c.room
	room.mu.Lock()
	defer room.mu.Unlock()
	if room.over {
		return
	}
	room.over = true
	opponent := c.getOpponent()
	c.sendBytes(mustMarshalEvent("game_over", mustMarshal(map[string]interface{}{"winner": boolToPlayer(false)})))
	if opponent != nil {
		opponent.sendBytes(mustMarshalEvent("game_over", mustMarshal(map[string]interface{}{"winner": boolToPlayer(true)})))
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
func readMessage(conn net.Conn) ([]byte, byte, error) {
	header := make([]byte, 2)
	_, err := io.ReadFull(conn, header)
	if err != nil {
		return nil, 0, err
	}

	opcode := header[0] & 0x0f
	if opcode == 8 {
		return nil, 0, io.EOF
	}

	masked := (header[1] & 0x80) != 0
	payloadLen := int64(header[1] & 0x7f)

	if payloadLen == 126 {
		lenBuf := make([]byte, 2)
		_, err = io.ReadFull(conn, lenBuf)
		if err != nil {
			return nil, 0, err
		}
		payloadLen = int64(lenBuf[0])<<8 | int64(lenBuf[1])
	} else if payloadLen == 127 {
		lenBuf := make([]byte, 8)
		_, err = io.ReadFull(conn, lenBuf)
		if err != nil {
			return nil, 0, err
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
			return nil, 0, err
		}
	}

	payload := make([]byte, payloadLen)
	if payloadLen > 0 {
		_, err = io.ReadFull(conn, payload)
		if err != nil {
			return nil, 0, err
		}
	}

	if masked && payloadLen > 0 {
		for i := int64(0); i < payloadLen; i++ {
			payload[i] ^= maskKey[i%4]
		}
	}

	return payload, opcode, nil
}

// writeFrame empaqueta y envía un frame WebSocket con FIN bit y el opcode respectivo
func writeFrame(conn net.Conn, opcode byte, msg []byte) error {
	var header []byte
	header = append(header, 0x80|opcode) // FIN bit set + opcode

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
	if length > 0 {
		_, err := conn.Write(msg)
		return err
	}
	return nil
}

func main() {
	server := NewServer()

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(HealthResponse{Status: "ok"})
	})

	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgradeToWebSocket(w, r)
		if err != nil {
			log.Printf("Error upgrading connection: %v", err)
			return
		}

		client := &Client{
			conn: conn,
			send: make(chan WSMessage, 256),
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
