# PixelForge — repositorio unificado

Este repositorio contiene una sola versión de cada archivo principal de la aplicación:

- `public/index.html`: página principal y los dos manuales educativos integrados.
- `public/style.css`: estilos consolidados de la página, administración, roles, sincronización y manuales.
- `public/script.js`: módulos JavaScript consolidados en el orden de carga original.
- `public/assets/pixelforge-logo-cyan.png`: logotipo.
- `public/data/`: respuestas JSON vacías para respaldos opcionales de APIs; las funciones que consultan servicios externos siguen intentando sus APIs originales.
- `database/pixelforge-supabase-completo.sql`: los tres scripts SQL originales concatenados una sola vez, en orden.
- `netlify.toml`: publica únicamente la carpeta `public`, por lo que la carpeta `database` no se expone en el sitio.

## Subir a GitHub

1. Descarga y descomprime este ZIP.
2. Crea un repositorio nuevo en GitHub.
3. En GitHub, usa **Add file → Upload files** y arrastra el contenido de esta carpeta (incluidas `public`, `database`, `netlify.toml`, `.gitignore` y este README). No subas el ZIP como si fuera el repositorio.
4. Confirma el commit en la rama `main`.

## Publicar desde GitHub en Netlify

1. En Netlify selecciona **Add new site → Import an existing project**.
2. Conecta GitHub y selecciona el repositorio.
3. Netlify leerá `netlify.toml`: directorio de publicación `public`; no requiere comando de compilación.
4. Despliega el sitio.

## Configuración ya integrada

La URL de Supabase y la clave publicable de Supabase están en el bloque `PIXELFORGE_CONFIG` al inicio de `public/script.js`. La clave publicable está diseñada para el navegador, pero debes conservar las políticas RLS correctas en Supabase. Nunca agregues una clave `service_role` al frontend ni al repositorio.

La clave RAWG que ya utilizaba el proyecto original también permanece en el bloque de configuración del navegador para no cambiar el comportamiento actual. Como se entrega al navegador, no debe tratarse como secreto; revisa sus límites y considera pasar las solicitudes a una función de servidor más adelante.

## SQL de Supabase

El archivo SQL está fuera de `public`, así que Netlify no lo publica. Antes de ejecutarlo en Supabase, conserva una copia de seguridad de la base de datos. Los tres bloques mantienen sus transacciones y su orden original.

## Nota sobre los manuales

Los manuales de programación y streaming ahora se abren dentro del mismo `index.html` mediante rutas hash (`#manual-programacion` y `#manual-streaming`). Su avance continúa guardándose en el navegador local, como en la versión original.
