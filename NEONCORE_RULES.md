# NEONCORE — REGLAS MAESTRAS DEL PROYECTO

> Documento de referencia permanente. Antes de modificar NeonCore, revisar este archivo.
> Si una instrucción nueva del usuario contradice una regla anterior, la instrucción nueva y explícita del usuario tiene prioridad.

## 1. Identidad y estructura

- **NeonCore** es el portal/entorno web de desarrollo, diseño y pruebas.
- El juego actual se identifica temporalmente como **proyecto de prueba**; todavía no tiene nombre definitivo.
- El juego ya no debe asumir estética neon, espacial o futurista.
- Repositorio principal: `misael546/NeonCore`.
- Portal principal: `https://misael546.github.io/neoncore/`.
- Sala pública principal: `12345` (Sala #1).
- WebSocket: `/ws`.
- Backend actual: **Belmo**, servicio **NeonCore**.
- URL pública conocida del backend: `https://neoncore-da6f.onbelmo.uk/`.
- Render `neon-core-multiplayer` es legado y no es el backend actual.
- No volver a usar las rutas/estructuras antiguas de `JuegoWeb` salvo que el usuario lo pida expresamente.

## 2. Regla crítica de versiones

- La versión vigente del proyecto es **V76**.
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
- La cuenta debe asociar progreso, inventario, espadas, oro, diamantes y cosméticos.
- La identidad no debe depender únicamente de `localStorage`.

## 6. Jugador y estadísticas

Mostrar como estadísticas principales:
- LV.
- Melee.
- Defensa.

El dominio de **Melee** sustituye a Pistolero/Armero.

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

- Se eliminó el sistema de disparos, pistolas, balas y munición como mecánica del jugador.
- El jugador usa **una espada equipada a la vez**.
- Hay 5 espadas de prueba en Items Venta.
- Cada espada tiene su propia skin/arte visual.
- La skin de la espada **no aumenta estadísticas**.
- El ataque real del jugador = **stat Melee + daño base de la espada equipada**.
- La espada debe tener un golpe cuerpo a cuerpo visible, con buen movimiento y efecto de corte.
- El combate normal debe ser por cuadrícula y selección táctil: al tocar un enemigo, queda seleccionado con un cuadrito; el jugador avanza automáticamente por casillas hasta quedar adyacente, ataca y mantiene el objetivo. Si el mob cambia de casilla, el objetivo se actualiza y el atacante lo sigue.
- El **Destructor Estelar** es la excepción: ataca a distancia y lanza una bola hacia la casilla del jugador.

## 8. Controles

### PC
- Movimiento con teclado configurable.
- No mostrar joystick de movimiento en PC.
- Ataque melee mediante la tecla configurable.

### Móvil

- Chat y botones de UI deben seguir recibiendo toques.
- No usar un manejador táctil global que bloquee accidentalmente botones, chat, inputs o menús.
- En Android el movimiento es exclusivamente por toque de casillas; no usar joystick de movimiento ni joystick derecho de apuntado/ataque.
- El jugador debe permanecer quieto cuando no existe una casilla destino.
- La cuadrícula de movimiento es de **24 px**.
- El mundo debe representarse como **2D pixel art top-down**; no usar fondos fotográficos/ilustrados como terreno.
- Mantener correctamente los identificadores de cada dedo/pointer.
- Cualquier cambio de controles debe probar el toque de casillas, el ataque melee y todos los botones de UI.

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

- Cliente actual: **V76**.
- V76 usa terreno 2D pixel-art por tiles, jugador 2D pixel-art y movimiento por casillas.
- V72 introduce movimiento por cuadrícula invisible, combate melee y el nuevo bioma desértico.
- V72 fue reemplazada y eliminada al publicar V76. V76 es la versión vigente.
- No deben restaurarse esas V.
- La limpieza anterior eliminó referencias de BUILD y de los parámetros legacy de actualización en los archivos auditados.
- Se detectó y eliminó duplicación de `startNeonMusic` y `stopNeonMusic` en V70.
- V70 pasó comprobaciones de sintaxis JS y servidor en la auditoría anterior.
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
Última versión de cliente registrada en este documento: **V76**


## 16. Dirección visual actual
- El juego es un RPG 2D pixel art; no usar como terreno el antiguo mapa neon, rejilla neon ni fondos tipo wallpaper.
- El terreno actual debe ser desértico, legible y ligero, con arena, piedras, cactus y decoración pixel-art original.
- Se puede tomar como referencia la claridad de lectura de RPG/MMORPG 2D clásicos como Rucoy Online, pero no copiar sus sprites, mapas, código ni assets propietarios.
- Los personajes deben leerse como sprites pixel-art, con orientación por dirección y armas visibles en la mano.
- Las espadas deben acompañar la orientación del personaje y tener una animación de ataque/swing claramente visible.
- El NPC de la tienda NO abre automáticamente por proximidad. Solo se abre al tocar/hacer clic directamente sobre el NPC estando suficientemente cerca.


## 20. Combate táctil V76
- En móvil no existe joystick derecho de ataque.
- Tocar un mob lo selecciona y muestra un cuadrito de objetivo.
- El jugador sigue al mob por cuadrícula si este cambia de casilla y ataca cuando queda adyacente.
- El cliente no debe restaurar disparos, apuntado por joystick, munición ni botones de fuego como sistema de combate.
- La espada se dibuja como arma pixel-art cuerpo a cuerpo y acompaña la orientación/animación del personaje.


## 21. Estado V76
- El cliente móvil no muestra ni ejecuta joystick derecho de ataque.
- La configuración móvil solo explica toque de casilla y selección de enemigo.
- La sección Items Venta no muestra munición.
