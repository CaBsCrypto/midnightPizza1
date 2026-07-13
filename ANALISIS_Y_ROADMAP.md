# Clash of Pizzas — Análisis técnico, recomendaciones y roadmap de la siguiente fase

_Documento generado el 30 de junio de 2026. Cubre diagnóstico del estado actual, hallazgos priorizados, los fixes aplicados en esta sesión y el plan de fases. Prioridad acordada para la siguiente fase: **multiplayer funcional real**._

---

## 1. Resumen ejecutivo

**Clash of Pizzas: Metropolis of Flavor** es un juego 1v1 competitivo por turnos, estilo *battleship* sobre una grilla 6x6, con temática de pizzería cyberpunk. La arquitectura real es: frontend **React + Vite + TypeScript**, backend de tiempo real en **Go** (WebSockets crudos, sin librería), y una capa on-chain en **Stellar / Soroban** (contrato en Rust) más autenticación con **Privy / Freighter / Passkeys**.

El proyecto tiene una base visual y de arquitectura ambiciosa, pero al auditarlo encontré que **el juego no era jugable en multiplayer** y que **el frontend ni siquiera compilaba**. Ambos eran bloqueantes silenciosos: la narrativa de "duelo cripto auditado por ZK" estaba implementada como *fachada* (efecto de UI), no como lógica real. En esta sesión corregí los dos bloqueantes de nivel P0 y dejé el multiplayer sobre una base **autoritativa en el servidor**, que es el requisito técnico para todo lo demás (anti-trampa, puntajes válidos, fin de partida real).

En una frase: **el proyecto pasó de "demo que se ve como un juego" a "servidor de juego con reglas reales", y quedó listo para construir integridad criptográfica de verdad encima.**

---

## 2. Qué es el proyecto realmente (aclaración de identidad)

Hay una **contradicción de identidad** importante entre la documentación y el código, que conviene resolver antes de seguir:

- El `README.md` y varios textos de la UI ("MIDNIGHT ZK ARENA", "red descentralizada Midnight") describen una implementación sobre **Midnight (Cardano)** con contratos en **Compact** y pruebas **ZK en WASM**. Existe incluso `compact/sim_pizza_dao.cpt`.
- El **código real** no usa nada de eso: usa **Stellar/Soroban** (`soroban/clash_of_pizzas/src/lib.rs`, `src/stellar_*.ts`), Privy y Freighter. El contrato Compact de Midnight está muerto (no se referencia desde el frontend).

Esto no es un detalle cosmético: un inversor, un jurado de hackathon o un nuevo desarrollador que lean el README construirán un modelo mental equivocado del sistema. **Recomendación: elegir una sola narrativa (Stellar/Soroban, que es lo que está construido) y reescribir README + copy de la UI en consecuencia**, archivando lo de Midnight como historia previa.

---

## 3. Diagnóstico del estado actual (antes de esta sesión)

### 3.1 El backend Go era un simple *relay*, no un servidor de juego
El servidor emparejaba jugadores (matchmaking público y salas privadas por preimagen), gestionaba reconexión con periodo de gracia de 15s y heartbeats — todo eso está **bien hecho**. Pero en cuanto a *juego*, sólo reenviaba mensajes de un cliente al otro. **No tenía estado autoritativo**: no conocía los tableros, ni el HP, ni el puntaje, ni de quién era el turno. Toda la "verdad" del juego vivía en el cliente.

Consecuencia desde teoría de juegos: **el modelo de confianza estaba invertido**. Un cliente modificado podía declarar "mi HP subió", "el rival recibió daño", "gané", y el servidor lo reenviaba como verdad. Todo el discurso anti-trampa (commit-reveal, ZK) no tenía ningún punto de aplicación real.

### 3.2 Desajuste de protocolo → el combate multiplayer nunca se propagaba
El frontend enviaba mensajes `bite`, pero el backend sólo entendía `fire_bite` / `bite_result`. Es decir, los mordiscos **caían en el `default` del switch y se descartaban**. Aun con dos jugadores conectados, ninguno veía los ataques del otro. El "multiplayer" que se percibía era, en la práctica, simulación local con turnos por `setTimeout`.

### 3.3 El frontend estaba **truncado** y no compilaba
`src/App.tsx` terminaba a mitad de un `<button>` dentro del modal de wallet: faltaban el cierre del botón, la pestaña de Google, el cierre de 6 `<div>`, el `return` y el cierre del componente. TypeScript fallaba con errores estructurales (`JSX element 'div' has no corresponding closing tag`). En este estado **`vite build` no puede producir un bundle**: el juego no arrancaba desde una build limpia.

### 3.4 La criptografía era decorativa
- El "compromiso" del tablero se calcula como `boardBytes[i % len] ^ i` — un XOR con el índice. No es un hash, es trivialmente reversible y **el `salt` aleatorio que se genera nunca entra en el cálculo**. No hay ocultamiento real.
- La "prueba ZK" del mordisco es un `SHA-256("bite_r_c_salt")` que se envía como campo `proof` pero **nadie lo verifica**.
- El contrato Soroban `submit_bite` recibe un `zk_proof_hash`, **no lo valida contra ningún compromiso**, emite un evento y devuelve `true`.

Es decir: el patrón commit-reveal descrito en el README no está implementado. Es una decisión legítima para una demo, pero hoy está presentado como si fuera real, lo que es un riesgo de credibilidad.

### 3.5 Seguridad: clave secreta de Stellar en `localStorage`
El código lee `localStorage.getItem('clash_stellar_secret')` para firmar transacciones. Guardar una **secret key** de Stellar en `localStorage` la expone a cualquier XSS y a extensiones del navegador: es la vía directa a que se vacíe la wallet del usuario. Es el hallazgo de seguridad más serio.

### 3.6 Diseño de juego incompleto (colisiones / colocación)
- El tablero por defecto está *hardcodeado* y es **idéntico para el jugador y el rival** (`setPlayerBoard(defaultBoard); setRivalBoard(defaultBoard);`).
- El inventario de piezas (jalapeño, habanero, agua, leche, trufa) existe en el estado pero **la colocación no está conectada**: hacer click en tu tablero sólo escribe un log. El botón "mezclar" también sólo loguea.
- Las reglas hablan de pizzas con **forma** (Margherita 1x1, Pepperoni 1x2, Suprema 2x2, Gigante), pero el tablero es una grilla de enteros sueltos. **No hay validación de colocación de piezas multi-celda ni detección de solapamiento (colisiones)** — que es exactamente el "motor de colisiones" que este tipo de juego necesita.

### 3.7 Calidad de código y repo
`App.tsx` es un monolito de ~1.080 líneas con más de 30 `useState` y una máquina de estados de juego implícita. Hay artefactos de build commiteados (`soroban/.../target/`, `backend/test_main.exe`), no hay tests, y los "amigos" son datos mock.

---

## 4. Qué corregí en esta sesión (fixes P0)

### 4.1 Servidor Go ahora es **autoritativo** (`backend/main.go`)
El servidor mantiene el estado real de cada partida y es la única fuente de verdad:

- Nuevo `PlayerState` por jugador: `board [6][6]`, `hp`, `score`, `immunity`, y `bitten [6][6]` (celdas ya mordidas). El tablero **nunca** se envía al rival; sólo se revela el valor de la celda concreta que se muerde.
- Nuevo estado de `Room`: `P1State`, `P2State`, `turnP1`, `started`, `over`.
- Nuevo mensaje `submit_board`: cada cliente entrega su tablero secreto al emparejarse. Cuando **ambos** tableros están, el servidor emite `match_start` con el turno correcto.
- Mensaje `bite` (¡el que el frontend ya enviaba!) ahora se procesa de forma autoritativa: valida que la partida esté activa, que sea tu turno, que la celda esté en rango y no repetida; aplica el efecto; **avanza el turno en el servidor**; y notifica `bite_result` al atacante y `rival_bite` al defensor, incluyendo HP y score de ambos. Detecta fin de partida y emite `game_over` a los dos con el ganador desde la perspectiva de cada uno.
- Nuevos `cancel_matchmaking` y `forfeit` (rendición) con victoria autoritativa para el rival.
- Se conservó intacto lo que ya funcionaba: matchmaking, salas privadas, reconexión con gracia y heartbeats.

### 4.2 Frontend conectado al servidor autoritativo (`src/App.tsx`)
- Al emparejar, el cliente envía `submit_board` con su tablero.
- Los handlers `bite_result` y `rival_bite` ahora consumen HP y score **de ambos jugadores** que reporta el servidor (antes sólo actualizaban un lado), de modo que el HUD siempre refleja el estado real.
- **Se reconstruyó el final truncado de `App.tsx`**: se completó el botón de passkey, se añadió la pestaña de conexión con Google y se cerró toda la estructura JSX. El archivo ahora **compila** (validado con esbuild, que es el transformador que usa Vite).

### 4.3 Reglas de combate v1 (implementadas en el servidor, y ajustables)
Documento explícito del *ruleset* autoritativo, pensado para ser jugable y con riesgo/recompensa. Cada valor de celda del tablero del defensor, al ser mordido:

| Valor | Contenido | Efecto |
|------:|-----------|--------|
| 0 | Vacío (agua) | Fallo, sin efecto |
| 1–4 | Rebanada de pizza | Defensor −1 HP, atacante +100 pts |
| 5 | Jalapeño (trampa) | Atacante −1 HP (o consume inmunidad) |
| 6 | Habanero (trampa) | Atacante −2 HP (o consume inmunidad) |
| 7 | Agua (cura) | Atacante +1 HP (máx. 5) |
| 8 | Leche (cura) | Atacante +2 HP (máx. 5) |
| 9 | Trufa de oro | Atacante +500 pts + inmunidad a la próxima trampa |

HP inicial: 5. El turno **siempre** pasa tras un mordisco. La partida termina cuando algún HP llega a 0.

> **Decisión de diseño abierta:** este ruleset es coherente y jugable, pero simplifica intencionalmente el concepto de "pizza con forma" del README (comerse una pizza *completa* para dañar). Cuando se implemente la colocación real de piezas multi-celda (ver Fase 3), habrá que decidir si el daño es por rebanada (como ahora) o por pieza completa consumida, y ajustar la curva de HP/score.

---

## 5. Recomendaciones priorizadas

**P0 — bloqueantes (resueltos esta sesión, requieren validación end-to-end):**
1. Servidor autoritativo + protocolo unificado → hecho. Validar con dos navegadores.
2. Frontend que compila → hecho. Validar `pnpm build` en un entorno con dependencias instaladas.

**P0 — seguridad (pendiente, urgente):**
3. **Sacar la secret key de Stellar de `localStorage`.** Usar wallets no-custodiales (Freighter firma sin exponer la clave) o passkeys/enclaves; si hay flujo custodial, la firma debe ocurrir en backend, nunca con la clave en el navegador.

**P1 — integridad y credibilidad:**
4. Implementar commit-reveal **real**: compromiso = `hash(board ‖ salt)` con el salt que ya se genera; al final de la partida, `reveal_board` en Soroban valida el hash y la legalidad del tablero. Que el `submit_bite` on-chain verifique algo real o que se deje de anunciar como ZK.
5. Resolver la identidad Midnight vs Stellar (Sección 2): un solo relato, README y copy de UI alineados.

**P1 — juego jugable de punta a punta:**
6. Fase de colocación funcional: conectar el inventario, permitir edición del tablero, y que cada jugador tenga un tablero **distinto** (hoy son idénticos y hardcodeados).

**P2 — solidez y mantenibilidad:**
7. Refactor de `App.tsx` a una máquina de estados (`lobby → placing → playing → ended`) con `useReducer`/contexto; separar componentes.
8. Motor de colocación/colisiones para piezas multi-celda (Margherita/Pepperoni/Suprema/Gigante) con validación de solapamiento y límites de grilla.
9. Higiene de repo: sacar `target/` y `*.exe` del control de versiones, añadir tests (al menos del ruleset del servidor y del matchmaker), reemplazar amigos mock.

---

## 6. Roadmap por fases

### Fase 1 — Multiplayer funcional real _(EN CURSO — prioridad acordada)_
**Objetivo:** dos jugadores juegan una partida completa con estado validado por el servidor.
- [x] Servidor Go autoritativo (estado, turnos, combate, fin de partida).
- [x] Protocolo unificado (`submit_board`, `bite`, `bite_result`, `rival_bite`, `game_over`).
- [x] Frontend reconstruido y conectado al servidor autoritativo.
- [ ] **Validación end-to-end con dos clientes** (ver Sección 7).
- [ ] Temporizador de turno autoritativo (hoy el timer de 15s es visual en el cliente; moverlo al servidor con auto-paso o auto-forfeit).
- [ ] Manejo de bordes: qué pasa si un jugador nunca envía `submit_board`; timeout de colocación.

### Fase 2 — Integridad criptográfica real (anti-trampa)
**Objetivo:** que la promesa de "duelo honesto" sea verdad y verificable.
- Commit-reveal real con `hash(board ‖ salt)`.
- `reveal_board` on-chain que valide compromiso y legalidad del tablero.
- Que el servidor (o el contrato) rechace tableros ilegales (p. ej. exceso de curas).
- Quitar la secret key de `localStorage` (mover aquí si no se hizo antes como P0).

### Fase 3 — UX y diseño de juego
**Objetivo:** que colocar piezas y jugar se sienta bien y sea claro.
- Fase de colocación con inventario funcional y tableros distintos por jugador.
- Motor de colisiones para piezas multi-celda + validación de colocación.
- Limpieza de identidad (Midnight → Stellar) en README y UI.
- Feedback de estados vacíos, errores y turnos; onboarding del landing.

### Fase 4 — Producción y escala
**Objetivo:** desplegar con confianza.
- Refactor de `App.tsx` a máquina de estados; componetización.
- Tests (ruleset del servidor, matchmaker, reconexión) y CI.
- Higiene de repo (artefactos fuera de git), observabilidad/logs, y despliegue (Cloud Run + Vercel) con las variables correctas.

---

## 7. Cómo probar los cambios (validación end-to-end)

1. **Backend:** `cd backend && go run main.go` (necesita Go instalado; el sandbox de esta sesión no lo tenía, por eso el Go se revisó manualmente pero no se compiló aquí).
2. **Frontend:** `pnpm install` y `pnpm dev`; abrir `http://localhost:5173`.
3. Abrir **dos pestañas/navegadores**, entrar al universo y buscar partida pública en ambos. Deberían emparejarse (`match_found`), intercambiar tablero (`submit_board`), iniciar (`match_start`) y poder morder por turnos viendo HP/score sincronizados, hasta un `game_over` real.
4. Probar rendición (`forfeit`) y desconexión/reconexión dentro de los 15s de gracia.

> **Nota de verificación honesta:** en esta sesión validé el **frontend con esbuild** (compila) y el **backend con revisión estructural** (llaves balanceadas 215/215, todas las funciones presentes y sin duplicar, `main()` intacto, switch correcto). **No** pude ejecutar `go build` ni una partida real de dos clientes porque el entorno no tenía Go ni dos navegadores. Ese paso end-to-end es lo primero que queda pendiente en Fase 1.

---

## 8. Riesgos y decisiones abiertas

- **Confianza en el servidor:** hoy el servidor conoce ambos tableros (modelo de confianza en el servidor). Es correcto para un MVP jugable, pero **no** es "trustless". La Fase 2 (commit-reveal + ZK) es lo que convierte esto en un duelo verdaderamente honesto sin confiar en el servidor.
- **Ruleset:** el combate v1 es una propuesta; conviene validarla con playtesting (equilibrio entre trampas, curas y trufa; si el turno debería repetirse al acertar; si las curas deberían beneficiar al defensor en lugar del atacante).
- **Identidad del producto:** decidir Stellar como narrativa única evita confusión y retrabajo.
