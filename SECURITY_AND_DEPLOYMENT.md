# DarkPixel Online: seguridad y despliegue

## Requisitos para abrir partidas

- Usa Node.js 22 o superior.
- Configura un almacén persistente: `DATABASE_URL` para PostgreSQL o `STORAGE_PROVIDER=firebase` con las credenciales de servicio de Firestore.
- Configura `GOOGLE_CLIENT_ID` si los jugadores van a entrar con Google.
- No consideres el modo `memory` un almacén de partidas. El servidor puede responder al health check en ese modo, pero rechaza iniciar partidas hasta que haya almacenamiento persistente.

## Recuperación de cuenta

El código de recuperación debe guardarse fuera del navegador. El endpoint `POST /account/recover` acepta el código y devuelve un token de cuenta nuevo; el cliente lo guarda localmente y puede volver a entrar sin Google usando ese token. Los tokens de cuenta son credenciales de portador: no los publiques ni los compartas.

El endpoint está limitado a 12 intentos por ventana de 10 minutos y restringe el tamaño del cuerpo. Por defecto, el servidor usa la dirección del peer TCP y no confía en `X-Forwarded-For` recibido directamente.

Si el servicio está detrás de un proxy inverso, configura `TRUSTED_PROXY_IPS` con las direcciones IP exactas de los peers que conectan directamente al proceso, separadas por comas. Solo entonces se usará el último valor de `X-Forwarded-For`. Sin esta configuración, los clientes que compartan una única dirección de proxy también compartirán el límite de intentos de recuperación.

## Códigos de prueba de administrador

Los códigos por chat y `NEONMASTER` están desactivados para uso ordinario. Para pruebas controladas, define temporalmente:

- `ENABLE_TEST_REDEEM_CODES=true`
- `DARKPIXEL_ADMIN_ACCOUNT_IDS=acc_...` con los identificadores exactos de las cuentas de prueba, separados por comas.

No añadas esos identificadores, credenciales ni tokens al repositorio. Desactiva el modo de pruebas tras terminar.

## Verificación

`npm test` inicia un proceso aislado del servidor para comprobar que las entradas de sala no autenticadas se rechazan y que el modo sin almacenamiento persistente falla de forma segura. También comprueba contratos básicos de recuperación, protección de códigos y el gate de versión del workflow.

El workflow `DarkPixel Online menu smoke test` verifica el sitio y el servidor publicados; se ejecuta al publicar en `main` o mediante ejecución manual porque depende de los servicios externos actualmente desplegados.
