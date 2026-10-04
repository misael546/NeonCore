# NeonCore — Cloudflare multiplayer prototype

Este directorio es un prototipo aislado. NO reemplaza todavía el servidor Render.

## Objetivo

Probar Durable Objects como autoridad de salas WebSocket antes de migrar la lógica completa de NeonCore.

## Endpoints

- /health
- /ws?room=OPEN

## Importante

El protocolo completo de NeonCore todavía vive en server/server.js.
Este prototipo solamente valida:

- WebSocket persistente
- salas por código
- conexión/desconexión
- broadcast
- Durable Object por sala
- respuesta ping/pong

La migración completa debe portar después la lógica de movimiento, combate, mobs, boss, loot, economía, persistencia y reconexión.

El cliente y Render permanecen intactos mientras se prueba este prototipo.
