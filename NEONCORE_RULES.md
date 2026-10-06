# NEONCORE — REGLAS MAESTRAS DEL PROYECTO

> Documento de referencia permanente. Antes de modificar NeonCore, revisar este archivo.
> Si una instrucción nueva del usuario contradice una regla anterior, la instrucción nueva y explícita del usuario tiene prioridad.

## 1. Identidad y estructura

- Juego: **NeonCore / Neon Core**.
- Repositorio principal: `misael546/NeonCore`.
- Portal principal: `https://misael546.github.io/neoncore/`.
- Sala pública principal: `12345` (Sala #1).
- WebSocket: `/ws`.
- Backend actual: **Belmo**, servicio **NeonCore**.
- URL pública conocida del backend: `https://neoncore-da6f.onbelmo.uk/`.
- Render `neon-core-multiplayer` es legado y no es el backend actual.
- No volver a usar las rutas/estructuras antiguas de `JuegoWeb` salvo que el usuario lo pida expresamente.

## 2. Regla crítica de versiones

- La versión vigente del proyecto es **V68**.
- Cada cambio que modifique el cliente/juego debe crear una **nueva V**.
- Nunca modificar una V anterior para introducir una nueva modificación del cliente.
- Después de crear la nueva V, eliminar las V antiguas del cliente para que quede solamente la versión vigente.
- Eliminar también rastros de versiones antiguas cuando corresponda: referencias, launchers, manifests y código obsoleto.
- No crear una nueva V por cambios exclusivamente documentales, auditorías o limpieza que no modifique el cliente.
- No usar etiquetas `BUILD`. La interfaz debe mostrar solamente la V vigente cuando corresponda.
- No dejar referencias de versiones antiguas en launchers o manifests.
- Antes de decir que una V está lista, comprobar sintaxis, referencias, IDs duplicados y coherencia de launcher/manifest.
- Si una actualización requiere backend, mantener sincronizados cliente, servidor y manifest de release.

## 3. Actualización global

Objetivo:
- Detectar una versión nueva.
- Si el jugador está en una versión vieja, sacarlo al menú.
- Al pulsar **Jugar**, cargar la versión nueva limpiamente.
- Evitar bucles infinitos de recarga.

No volver a introducir como sistema principal:
- `neon_release`
- `neon_force`
- `neon_reload`
- recargas automáticas infinitas.

El sistema de release debe ser V-based y usar los manifests actuales.

## 4. Regla de diagnóstico

Cuando el usuario reporte un problema:
1. No corregir únicamente el síntoma.
2. Buscar también causas relacionadas en cliente, servidor, WebSocket, autenticación, controles, UI, versión, launcher, release y persistencia cuando sean relevantes.
3. Buscar regresiones y código duplicado/obsoleto.
4. Comprobar que una corrección no rompa otros controles o sistemas.
5. Probar sintaxis y consistencia antes de afirmar que está arreglado.
6. No afirmar «arreglado» si solamente se modificó código sin verificar la lógica afectada.

## 5. Cuenta e identidad

- El acceso del jugador requiere Google.
- La identidad real del jugador se basa en la cuenta de Google validada por servidor.
- El servidor debe validar el Google ID token.
- No pedir, guardar ni exponer el Google Client Secret.
- El nombre se elige inicialmente y queda bloqueado.
- El nombre debe ser único.
- Cambiar el nombre cuesta exactamente **1,000 diamantes**.
- El servidor valida saldo, disponibilidad del nombre y persistencia.
- La cuenta debe asociar progreso, inventario, armas, oro, diamantes y cosméticos.
- La identidad no debe depender únicamente de `localStorage`.

## 6. Jugador y estadísticas

Mostrar como estadísticas principales:
- LV.
- Pistolero/Armero.
- Defensa.

Está previsto:
- Espadachín como dominio futuro.

No mostrar como filas principales de estadísticas:
- Poder del arma.
- Armadura como fila independiente de equipamiento.
- Kills.
- Munición.

Reglas:
- LV debe aparecer junto al nombre del jugador.
- Los mobs también tienen LV y estadísticas.
- La defensa aumenta cuando el jugador recibe golpes.
- La armadura equipada se muestra visualmente sobre la skin y contribuye al sistema de poder/defensa definido por el juego.
- El arma equipada no debe dar buffs de defensa.

## 7. Combate y armas

- Un arma equipada a la vez.
- La munición pertenece al jugador, no al arma.
- Si la munición llega a 0, el jugador puede comprar munición.
- Los disparos deben tener rango limitado.
- Los proyectiles normales no deben atravesar enemigos si la regla del arma indica impacto por choque.
- El arma debe verse pequeña y orientada correctamente.
- Deben existir skins/partículas de armas.
- Si se necesita distinguir mano izquierda/derecha para orientación visual, hacerlo sin romper el apuntado.
- El disparo debe funcionar en PC y móvil sin dar una ventaja artificial a PC.
- La cadencia/retardo inicial debe ser razonable para todos los dispositivos.

## 8. Controles

### PC
- Movimiento con teclado configurable.
- No mostrar joystick de movimiento en PC.
- Apuntado con mouse.
- Disparo mediante la tecla configurable.

### Móvil
- Joystick izquierdo = movimiento.
- Joystick derecho = cámara/apuntado y disparo.
- El joystick derecho no debe desaparecer en landscape.
- Movimiento y apuntado/disparo deben poder funcionar simultáneamente con diferentes dedos.
- Tocar primero disparo/apuntado no debe bloquear después el movimiento.
- Tocar primero movimiento no debe bloquear después disparo/apuntado.
- Chat y botones de UI deben seguir recibiendo toques.
- No usar un manejador táctil global que bloquee accidentalmente botones, chat, inputs o menús.
- Mantener correctamente los identificadores de cada dedo/pointer.
- Cualquier cambio de controles debe probar ambos joysticks y botones de UI.

## 9. Mundo, enemigos y jefes

- Mundo multijugador autoritativo por servidor.
- Mobs aparecen aleatoriamente dentro de zonas válidas.
- Patrullan, persiguen y desaparecen cuando están demasiado lejos según las reglas del servidor.
- Los mobs tienen LV y estadísticas.
- Zona segura con curación acelerada.
- Los drops de oro deben ser visibles en el suelo.
- Máximo que puede recoger el jugador por **un drop**: 500.
- Ese 500 es el máximo de recogida por drop; **NO significa que todos los mobs deban soltar 500**.
- Un mob puede soltar menos de 500 o más de 500 mediante varios drops.
- El botón de recoger debe aparecer cuando el jugador está cerca de un drop.

### Jefes
- Primer jefe actual: Elite.
- Elite entrega oro, no diamantes.
- Segundo jefe: Destructor Estelar.
- Sus proyectiles deben tener rango finito.
- Los proyectiles no deben atravesar objetivos si la mecánica exige choque.
- Debe tener ataques fuertes y ataques de área.
- Las advertencias de ataque deben corresponder al daño real.

## 10. Inventario y tienda

- El sistema visible se llama **Inventory**, no Mochila.
- El inventario conserva los slots actuales.
- El objeto **Mochila** es un objeto de tienda que duplica la capacidad del inventario.
- Debe haber inicialmente 10 mochilas baratas de prueba en Items Venta.
- Items Venta debe ser una sección separada.
- Items Venta debe contener:
  - 5 espadas de prueba.
  - 5 armas de prueba.
  - 5 armaduras de prueba.
- Cada stack de inventario admite hasta 500 unidades cuando corresponda.
- Al soltar objetos desde inventario, deben generarse drops apropiados.
- Al recoger drops se respeta el límite por drop.
- No duplicar sistemas de inventario/tienda antiguos.

## 11. HUD, chat y UI

- El HUD debe permanecer visible durante el juego.
- El chat aparece en la interfaz/in-world según el diseño vigente y los mensajes desaparecen aproximadamente después de 30 segundos.
- El input de chat debe ser accesible sin quedar bloqueado por controles táctiles.
- El indicador de versión debe ser pequeño y mostrar solamente la V actual.
- Los menús no deben tapar al jugador innecesariamente.
- El shop no debe abrirse encima del jugador de forma que impida jugar.
- El botón de ajustes/general debe servir como entrada universal a controles y estadísticas.
- Debe existir espacio para futura entrada de voz por proximidad.

## 12. Música y audio

- El sistema musical debe evitar funciones duplicadas.
- No dejar dos definiciones de la misma función crítica como `startNeonMusic` o `stopNeonMusic`.
- Los cambios de música deben conservar el estado correcto de menú, exploración, tensión, combate y bonus.
- El audio no debe bloquear la interacción del juego.

## 13. Servidor y persistencia

- El servidor debe ser autoritativo para posición, combate, economía y progreso cuando la mecánica lo requiera.
- Movimiento recibido por WebSocket debe validarse para evitar teletransportes.
- Las colisiones deben resolverse por ejes cuando sea posible para no dejar al jugador completamente inmóvil por una colisión diagonal.
- El progreso debe persistirse en la base de datos/storage configurado.
- Inventario, armas, oro, diamantes, niveles, nombre, cosméticos y equipamiento deben sobrevivir reconexiones.
- No crear cuentas nuevas automáticamente por una credencial inválida.
- No depender únicamente de datos locales para progreso permanente.

## 14. Release/manifests

Los archivos de release relevantes incluyen:
- `release.json` de raíz.
- `server/release.json`.
- launcher de `neoncore/12345/`.
- cliente de la V actual.

Todos deben apuntar coherentemente a la misma V cuando corresponda.

## 15. Despliegue

Flujo deseado:
1. Revisar GitHub.
2. Aplicar cambios.
3. Crear nueva V solamente si el cliente cambió.
4. Eliminar V cliente antiguas.
5. Actualizar manifests/launchers.
6. Si cambió servidor, preparar/revisar backend.
7. Comprobar que Belmo tenga la versión de servidor correspondiente.
8. Como el auto-deploy de Belmo puede estar desactivado, no afirmar que el backend está desplegado sin confirmación.
9. Verificar GitHub y backend después del despliegue cuando las herramientas lo permitan.

## 16. Limpieza obligatoria

No dejar:
- BUILD antiguos.
- launchers apuntando a V eliminadas.
- manifests con versiones contradictorias.
- lógica de actualización antigua.
- funciones JS duplicadas.
- IDs HTML duplicados.
- código muerto que compita con la implementación actual.
- menús antiguos que ya fueron sustituidos.
- clientes V antiguas cuando la regla de versión indique que deben eliminarse.

## 17. URLs y nombres importantes

- GitHub: `misael546/NeonCore`
- Portal: `https://misael546.github.io/neoncore/`
- Backend Belmo: `https://neoncore-da6f.onbelmo.uk/`
- Sala pública: `12345`
- WebSocket: `/ws`

## 18. Estado conocido al crear este documento

- Cliente actual: **V68**.
- V68, V68 y V44 del cliente ya fueron eliminadas durante la limpieza anterior.
- No deben restaurarse esas V.
- La limpieza anterior eliminó referencias de BUILD y de los parámetros legacy de actualización en los archivos auditados.
- Se detectó y eliminó duplicación de `startNeonMusic` y `stopNeonMusic` en V68.
- V68 pasó comprobaciones de sintaxis JS y servidor en la auditoría anterior.
- Este documento no cambia la V del juego.

## 19. Regla de prioridad

Cuando el usuario diga:

**«Revisa las reglas de NeonCore»**

se debe consultar este archivo antes de modificar el proyecto.

Cuando el usuario diga:

**«Revisa este archivo»**

y se refiera a este documento, usarlo como fuente de continuidad del proyecto y cruzarlo con el estado real de GitHub/backend antes de actuar.

Cuando exista una instrucción nueva y explícita del usuario, aplicar la nueva instrucción sin borrar las reglas permanentes que sigan siendo compatibles.

---
Última versión de cliente registrada en este documento: **V68**
