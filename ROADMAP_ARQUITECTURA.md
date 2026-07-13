# Clash of Pizzas — Roadmap de arquitectura (decisiones tomadas)

_Generado el 1 de julio de 2026. Basado en auditoría previa ([ANALISIS_Y_ROADMAP.md](ANALISIS_Y_ROADMAP.md)) + verificación de código actual + decisiones del propietario del proyecto._

## Decisiones ya tomadas

| Tema | Decisión |
|---|---|
| Chain | **Stellar/Soroban** es la única narrativa. Midnight se retira de README y UI. |
| Confianza | **MVP con servidor autoritativo** (Go). Commit-reveal/ZK real queda para Fase 3, no bloquea. |
| Wallets | **100% no-custodial**: Privy + Passkeys + Freighter/Albedo/etc. Cero secret keys en el cliente. |
| Refactor | **Ahora**, antes de seguir agregando features. `App.tsx` se descompone primero. |

## Estado real verificado (no solo documentado)

- `src/App.tsx`: 1162 líneas, 36 `useState`, 5 `useEffect` — mezcla lobby, wallet, tableros, combate, HUD, modales y logs en un solo componente.
- **Riesgo P0 confirmado y más extendido de lo que decía la auditoría previa**: `localStorage.getItem/setItem('clash_stellar_secret')` aparece en 3 archivos: [App.tsx:174,673](src/App.tsx), [stellar_contract.ts:74,164](src/stellar_contract.ts), y **la escribe** [useStellarWallet.ts:142](src/hooks/useStellarWallet.ts:142). El hook ya integra Privy/Freighter/StellarWalletsKit, pero tiene un **fallback que genera y guarda una keypair local** — esto es exactamente lo opuesto a "no-custodial" y es la causa raíz a eliminar, no un detalle a mitigar.
- `useGameAPI.ts` es un simulador con `setTimeout`; **no habla con el backend Go real**. Esto es una brecha nueva no señalada explícitamente antes: hay dos "verdades" en paralelo (el servidor autoritativo en Go, y un hook de frontend que simula localmente). Hay que confirmar cuál está realmente cableado a la UI.
- README sigue describiendo `window.midnight.mnLace`, Compact y Lace Wallet — nada de eso existe en el código.
- Backend Go (1049 líneas) sí es autoritativo: `PlayerState`/`Room`, maneja `join_lobby`, `submit_board`, `bite`, `cancel_matchmaking`, `forfeit`, `reveal_board_event`.

---

## Fase 0 — Cerrar la brecha crítica de seguridad (bloqueante, esta semana)

**Objetivo:** que sea imposible que una secret key de Stellar toque el navegador.

1. Eliminar por completo el fallback de `useStellarWallet.ts` que genera/guarda `clash_stellar_secret` (línea 142 y usos en 171, 174, 673, y en `stellar_contract.ts:74,164`).
2. Todas las firmas de transacción pasan por el wallet externo (Freighter/Albedo vía StellarWalletsKit) o por Privy embedded wallet (que ya es no-custodial por diseño — Privy nunca expone la clave cruda al código de la app).
3. Para el login "sin wallet" (Google/Passkey vía Privy): usar el **embedded wallet de Privy**, que firma a través de su SDK sin exponer la clave privada al `localStorage` de la app. Confirmar que no se está intentando extraer la clave manualmente en ningún punto.
4. Grep de guardia: que no quede ningún `localStorage.setItem` con datos de wallet en todo `src/`.

**Pregunta abierta para ti:** ¿el login "sin wallet externa" (Google) debe seguir existiendo como puerta de entrada, apoyado 100% en el embedded wallet de Privy? Asumo que sí dado que ya integraste `@privy-io/react-auth`, pero confírmalo porque cambia si mantenemos la pestaña "Google" del selector.

---

## Fase 1 — Refactor de `App.tsx` (antes de seguir con features)

**Objetivo:** pasar de 36 `useState` sueltos a una máquina de estados explícita y componentes con responsabilidad única.

1. **Máquina de estados de alto nivel** con `useReducer`: `lobby → placing → playing → ended`. Esto reemplaza el manejo implícito de `gameState`/`lobbyStatus`/`winner` sueltos.
2. **Separar por dominio en hooks/contexts:**
   - `useWalletSession` (conexión, cuenta activa, balance) — sin ningún dato secreto.
   - `useMatch` (estado de partida: HP, score, turno, tableros) — consumidor puro de eventos del backend Go.
   - `useModals` (rules/claim/universe/wallet modal) — UI-only.
3. **Verificar y resolver la duplicidad backend real vs `useGameAPI.ts` simulado.** Antes de refactorizar hay que decidir: ¿`useGameAPI.ts` se reemplaza completamente por el WebSocket real hacia `backend/main.go`, o convive con algo? Mi lectura del código dice que hoy la UI puede estar jugando contra una simulación de `setTimeout` en vez del servidor autoritativo — esto es más grave que un problema de estilo, es un problema de que el "multiplayer real" de la Fase 1 previa podría no estar conectado end-to-end todavía.
4. Componentizar lo que siga siendo parte de `App.tsx` (extraer JSX grande a subcomponentes ya existentes: `HUD.tsx`, `CombatConsole.tsx`, `Sidebar.tsx`, `GameBoard.tsx` — verificar que reciban props y no estado global implícito).

**Pregunta para ti:** ¿confirmas que quieres que investigue a fondo si `useGameAPI.ts` está realmente cableado al WebSocket de `backend/main.go`, o lo asumes y seguimos? Esto determina si Fase 1 de "multiplayer funcional" (la anterior) realmente terminó o no.

---

## Fase 2 — Identidad y limpieza narrativa (Stellar/Soroban único)

1. Reescribir `README.md`: quitar Midnight, Compact, `window.midnight.mnLace`, Lace Wallet. Documentar el flujo real: Stellar/Soroban + Privy + Freighter.
2. Renombrar/limpiar `contract.ts` (hoy es un "emulador de Midnight ZK SDK" que no se usa realmente) — decidir si se borra o se reescribe como utilidad genuina de Soroban.
3. Actualizar copy de UI (`App.tsx:480` y similares) que dice "auditado en Midnight L2 mediante pruebas ZK" → alinear con lo que el sistema realmente hace hoy (servidor autoritativo, no ZK todavía).

---

## Fase 3 — Integridad criptográfica real (post-refactor)

1. Commit-reveal real: `hash(board ‖ salt)` (hoy es XOR trivial, el salt no se usa).
2. `reveal_board` en Soroban que valide el compromiso y la legalidad del tablero.
3. Recién aquí evaluar si el servidor deja de conocer los tableros en claro (mover hacia menor confianza en el servidor).

---

## Fase 4 — Juego completo y producción

- Motor de colocación/colisiones para piezas multi-celda.
- Tests (ruleset servidor, matchmaker, reconexión) + CI.
- Higiene de repo (`target/`, `*.exe`, `temp_chrome_profile/` fuera de git — ya veo `temp_chrome_profile/` sin trackear, hay que añadirlo a `.gitignore`).
- Despliegue.

---

## Próximo paso inmediato sugerido

Empezar por **Fase 0** (seguridad) porque es el fix de menor superficie y mayor riesgo, y no depende de decisiones de refactor. En paralelo puedo confirmar la pregunta abierta de `useGameAPI.ts` vs backend real, que condiciona cómo planteamos Fase 1.
