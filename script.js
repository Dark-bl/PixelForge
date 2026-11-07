/* CONFIGURACIÓN PÚBLICA DE PIXELFORGE
 * SUPABASE_URL y SUPABASE_PUBLIC_KEY son valores publicables, pero requieren políticas RLS.
 * Nunca agregues aquí una clave service_role ni contraseñas privadas.
 * RAWG_API_KEY queda expuesta al navegador; para ocultarla hay que migrar sus solicitudes a una Function.
 */
window.PIXELFORGE_CONFIG = Object.freeze({
  rawgApiKey: "fe8e7d9ee89e4e4705b3764a8b40978acb",
  supabaseUrl: "https://ofeiovlpkmwtqpwdfurj.supabase.co",
  supabasePublicKey: "sb_publishable_DbCzzF0nXqAyPI6uHB3C5Q_G2BuU54_",
  contactEmail: "leonardocima9@gmail.com",
  whatsapp: "+52 9991198157",
  social: "Leonardo Cima",
  applicationEmail: "leonardocima9@gmail.com",
  creatorRecoveryFeeMinMxn: 20,
  creatorRecoveryFeeMaxMxn: 50,
  featuredStreams: []
});


/* ===== Módulo consolidado: core.js ===== */
(() => {
    "use strict";

const PF_CONFIG = window.PIXELFORGE_CONFIG || {};
const SUPABASE_URL = String(PF_CONFIG.supabaseUrl || "").trim();
const SUPABASE_KEY = String(PF_CONFIG.supabasePublicKey || "").trim();

const configurado =
    /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(SUPABASE_URL) &&
    typeof SUPABASE_KEY === "string" &&
    SUPABASE_KEY.length > 20 &&
    !SUPABASE_KEY.includes("PEGA_AQUI_TU_CLAVE");

const $ = (id) => document.getElementById(id);
let supabase = null;
let usuario = null;
let juegoEnEdicion = null;
let soloFavoritos = false;

function mensaje(id, texto) {
    const elemento = $(id);
    if (elemento) elemento.textContent = texto;
}


// Copia local de respaldo por cuenta. Nunca borra filas de Supabase automáticamente.
const PF_BIBLIOTECA_CACHE_PREFIX = "pixelforge_biblioteca_respaldo_v1:";
function pfClaveCacheBiblioteca() {
    return usuario?.id ? PF_BIBLIOTECA_CACHE_PREFIX + usuario.id : null;
}
function pfLeerCacheBiblioteca() {
    const clave = pfClaveCacheBiblioteca();
    if (!clave) return [];
    try {
        const lista = JSON.parse(localStorage.getItem(clave) || "[]");
        return Array.isArray(lista) ? lista : [];
    } catch (error) {
        console.warn("No se pudo leer la copia local de la biblioteca:", error);
        return [];
    }
}
function pfGuardarCacheBiblioteca(lista) {
    const clave = pfClaveCacheBiblioteca();
    if (!clave) return;
    try {
        const segura = (Array.isArray(lista) ? lista : []).map(({ __cacheOnly, ...juego }) => juego);
        localStorage.setItem(clave, JSON.stringify(segura));
    } catch (error) {
        console.warn("No se pudo actualizar la copia local de la biblioteca:", error);
    }
}
function pfGuardarCopiaJuego(juego, esNuevo = false) {
    if (!usuario?.id || !juego?.nombre) return;
    const lista = pfLeerCacheBiblioteca();
    const copia = {
        id: juego.id || `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        usuario_id: usuario.id,
        nombre: String(juego.nombre).trim(),
        plataforma: juego.plataforma || "PC",
        genero: juego.genero || "Otro",
        estado: juego.estado || "Pendiente",
        valoracion: Number(juego.valoracion) || 0,
        notas: juego.notas || "",
        creado_en: juego.creado_en || new Date().toISOString(),
        __localOnly: Boolean(esNuevo && !juego.id)
    };
    const indice = lista.findIndex(item => (copia.id && item.id === copia.id) || (esNuevo && item.__localOnly && String(item.nombre).toLocaleLowerCase("es-MX") === copia.nombre.toLocaleLowerCase("es-MX") && (item.plataforma || "PC") === copia.plataforma));
    if (indice >= 0) lista[indice] = { ...lista[indice], ...copia };
    else lista.push(copia);
    pfGuardarCacheBiblioteca(lista);
}
function pfQuitarCopiaJuego(id) {
    const lista = pfLeerCacheBiblioteca().filter(item => String(item.id) !== String(id));
    pfGuardarCacheBiblioteca(lista);
}
function pfNormalizarBusqueda(texto) {
    return String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-MX").trim();
}


function explicarErrorSupabase(error, contexto = "") {
    const detalle = String(error?.message || error?.code || "Error desconocido");
    const normalizado = detalle.toLowerCase();
    if (/email address not authorized|email_not_authorized/.test(normalizado)) {
        return "Supabase no está autorizado a enviar correo a esta dirección con el SMTP predeterminado. Para pruebas usa un correo autorizado del equipo o configura un SMTP propio en Authentication. El código no puede habilitar el envío desde el navegador.";
    }
    if (/signup_disabled|signups? (are )?disabled|new user signups.*disabled/.test(normalizado)) {
        return "El registro de cuentas está deshabilitado en Supabase. Activa Allow new users to sign up / Enable email signups en Authentication y en el proveedor Email.";
    }
    if (/redirect.*not allowed|redirect_to.*not allowed|url not allowed/.test(normalizado)) {
        return "Supabase rechazó la URL de regreso. Añade la URL actual de Live Server a Authentication > URL Configuration > Redirect URLs e inténtalo otra vez.";
    }
    if (/rate limit|email rate limit/.test(normalizado)) {
        return "Supabase limitó temporalmente los correos de registro. Espera antes de solicitar otro o configura SMTP propio.";
    }
    if (/user already registered|already registered|already exists/.test(normalizado)) {
        return "Ese correo ya está registrado. Inicia sesión con esa cuenta o usa otro correo.";
    }
    if (/email not confirmed|email_not_confirmed/.test(normalizado)) {
        return "Tu correo todavía no está confirmado. Abre el mensaje de confirmación de Supabase (revisa spam) y después vuelve a iniciar sesión.";
    }
    if (/invalid login credentials/.test(normalizado)) {
        return "El correo o la contraseña no coinciden. Si acabas de registrarte, confirma el correo primero.";
    }
    if (/invalid api key|no api key found|invalid jwt/.test(normalizado)) {
        return "Supabase rechazó la clave pública. Copia la anon/publishable key del mismo proyecto que coincide con SUPABASE_URL; nunca uses service_role en el navegador.";
    }
    if (/row-level security|permission denied|violates row-level/.test(normalizado)) {
        return "Supabase denegó la operación por permisos o políticas RLS. Ejecuta el SQL de configuración incluido con este proyecto.";
    }
    if (/could not find the table|schema cache|relation .* does not exist|42p01/.test(normalizado)) {
        return "No se pudo cargar esta función desde la base de datos. El catálogo principal sigue disponible; revisa la configuración de Supabase si el problema continúa.";
    }
    if (/failed to fetch|networkerror|fetch failed/.test(normalizado)) {
        return "No se pudo conectar con Supabase. Comprueba internet, la URL del proyecto y que la página se abra con Live Server.";
    }
    return detalle;
}

function mostrarAcceso() {
    if ($("zonaAcceso")) $("zonaAcceso").hidden = false;
    if ($("zonaBiblioteca")) $("zonaBiblioteca").hidden = true;
    if ($("correo")) $("correo").focus();
}

function mostrarBiblioteca() {
    if ($("zonaAcceso")) $("zonaAcceso").hidden = true;
    if ($("zonaBiblioteca")) $("zonaBiblioteca").hidden = false;
    if ($("correoUsuario")) $("correoUsuario").textContent = usuario?.email || "";
    window.PIXELFORGE_PROFILE?.load?.();
    cargarJuegos();
    cargarComunidad();
    window.dispatchEvent(new Event("pixelforge:auth"));
}

function botonCargando(boton, cargando, textoCargando) {
    if (!boton) return;
    if (cargando) {
        boton.dataset.textoOriginal = boton.textContent;
        boton.textContent = textoCargando;
        boton.disabled = true;
    } else {
        boton.textContent = boton.dataset.textoOriginal || boton.textContent;
        boton.disabled = false;
    }
}

const formAcceso = $("formAcceso");
if (formAcceso) {
    formAcceso.addEventListener("submit", async (evento) => {
        evento.preventDefault();
        if (!supabase) {
            mensaje("mensajeAcceso", "Supabase no se ha conectado. Comprueba que script.js se cargue después de la librería.");
            return;
        }

        const email = $("correo").value.trim();
        const password = $("clave").value;
        const boton = formAcceso.querySelector('button[type="submit"]');
        if (!email || !$("correo").checkValidity()) {
            mensaje("mensajeAcceso", "Escribe un correo electrónico válido.");
            $("correo").focus();
            return;
        }
        if (password.length < 8) {
            mensaje("mensajeAcceso", "La contraseña debe tener al menos 8 caracteres.");
            $("clave").focus();
            return;
        }

        botonCargando(boton, true, "Iniciando sesión...");
        mensaje("mensajeAcceso", "");
        try {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
            if (!data?.session?.user) {
                usuario = null;
                mensaje("mensajeAcceso", "Supabase no devolvió una sesión activa. Si tu correo requiere confirmación, confírmalo y vuelve a iniciar sesión.");
                return;
            }
            usuario = data.session.user;
            localStorage.setItem("pixelforge_usuario_activo", JSON.stringify({ id: usuario.id, email: usuario.email }));
            mensaje("mensajeAcceso", "Sesión iniciada correctamente.");
            mostrarBiblioteca();
        } catch (error) {
            console.error("Error al iniciar sesión:", error);
            console.warn("Detalle de inicio de sesión:", explicarErrorSupabase(error, "login"));
            mensaje("mensajeAcceso", "No se pudo iniciar sesión. Comprueba el correo y la contraseña e inténtalo de nuevo.");
        } finally {
            botonCargando(boton, false);
        }
    });
}

const botonCrearCuenta = $("crearCuenta");
if (botonCrearCuenta) {
    botonCrearCuenta.addEventListener("click", async () => {
        if (!supabase) {
            mensaje("mensajeAcceso", "Supabase no se ha conectado. Revisa la URL, la clave pública y que cargue la librería.");
            return;
        }

        const email = $("correo").value.trim();
        const password = $("clave").value;
        if (!email || !$("correo").checkValidity()) {
            mensaje("mensajeAcceso", "Escribe un correo electrónico válido.");
            $("correo").focus();
            return;
        }
        if (password.length < 8) {
            mensaje("mensajeAcceso", "La contraseña debe tener al menos 8 caracteres.");
            $("clave").focus();
            return;
        }

        botonCargando(botonCrearCuenta, true, "Creando cuenta...");
        mensaje("mensajeAcceso", "Creando tu cuenta en PixelForge...");
        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: { emailRedirectTo: window.location.origin }
            });
            
            if (error) throw error;
            if (data?.session?.user) {
                usuario = data.session.user;
                localStorage.setItem("pixelforge_usuario_activo", JSON.stringify({ id: usuario.id, email: usuario.email }));
                mensaje("mensajeAcceso", "Cuenta creada y sesión iniciada correctamente.");
                mostrarBiblioteca();
            } else if (data?.user) {
                usuario = null;
                mensaje("mensajeAcceso", "¡Cuenta creada! Revisa tu correo para activarla y después inicia sesión. Tu biblioteca se sincronizará automáticamente al entrar.");
            } else {
                throw new Error("Supabase no devolvió datos de la cuenta. Comprueba la configuración de Authentication.");
            }
        } catch (error) {
            console.error("Error al crear cuenta:", error);
            // Si el correo ya existe, intentamos iniciar sesión o le avisamos
            if ((error.message || "").toLowerCase().includes("already registered")) {
                mensaje("mensajeAcceso", "Ese correo ya está registrado. Pulsa 'Iniciar sesión' para ingresar.");
            } else {
                mensaje("mensajeAcceso", "No se pudo completar el registro. Revisa los datos e inténtalo de nuevo.");
            }
        } finally {
            botonCargando(botonCrearCuenta, false);
        }
    });
}

const botonModoInvitado = $("modoInvitado");
if (botonModoInvitado) {
    botonModoInvitado.addEventListener("click", () => {
        usuario = { id: "invitado-local", email: "invitado@pixelforge.local" };
        mensaje("mensajeAcceso", "Has ingresado en modo local. Tus juegos se guardan de forma segura en este navegador.");
        mostrarBiblioteca();
    });
}

const botonCerrarSesion = $("cerrarSesion");
if (botonCerrarSesion) {
    botonCerrarSesion.addEventListener("click", async () => {
        if (!supabase) return;
        botonCargando(botonCerrarSesion, true, "Cerrando sesión...");
        try {
            if (supabase) {
                try { await supabase.auth.signOut(); } catch (e) { console.warn("Supabase signOut:", e); }
            }
            usuario = null;
            juegoEnEdicion = null;
            localStorage.removeItem("pixelforge_usuario_activo");
            if ($("listaJuegos")) $("listaJuegos").replaceChildren();
            if ($("listaPublicaciones")) $("listaPublicaciones").replaceChildren();
            resetearFormularioJuego();
            mostrarAcceso();
            window.dispatchEvent(new Event("pixelforge:auth"));
            mensaje("mensajeAcceso", "Sesión cerrada.");
        } catch (error) {
            console.error("Error al cerrar sesión:", error);
            mensaje("mensajeJuego", "No se pudo cerrar sesión: " + (error.message || "error desconocido"));
        } finally {
            botonCargando(botonCerrarSesion, false);
        }
    });
}

const formJuego = $("formJuego");
if (formJuego) {
    formJuego.addEventListener("submit", async (evento) => {
        evento.preventDefault();
        if (!supabase || !usuario) {
            mensaje("mensajeJuego", "Inicia sesión para guardar videojuegos.");
            return;
        }

        const videojuego = {
            usuario_id: usuario.id,
            nombre: $("nombreJuego").value.trim(),
            plataforma: $("plataforma").value,
            genero: $("generoJuego").value,
            estado: $("estadoJuego").value,
            valoracion: Number.parseInt($("valoracionJuego").value, 10) || 0,
            notas: $("notasJuego").value.trim()
        };
        if (!videojuego.nombre) {
            mensaje("mensajeJuego", "Escribe el nombre del videojuego.");
            return;
        }

        const edicionAntesDeGuardar = juegoEnEdicion;
        const botonGuardar = $("guardarJuego");
        botonCargando(botonGuardar, true, juegoEnEdicion ? "Guardando cambios..." : "Guardando...");
        mensaje("mensajeJuego", "");

        if (usuario.id === "invitado-local") {
            if (edicionAntesDeGuardar) {
                pfGuardarCopiaJuego({ ...videojuego, id: edicionAntesDeGuardar.id, creado_en: edicionAntesDeGuardar.creado_en }, false);
            } else {
                pfGuardarCopiaJuego(videojuego, true);
            }
            const estabaEditando = Boolean(juegoEnEdicion);
            resetearFormularioJuego();
            mensaje("mensajeJuego", estabaEditando ? "Cambios guardados localmente." : "Videojuego guardado en tu biblioteca.");
            await cargarJuegos();
            botonCargando(botonGuardar, false);
            return;
        }

        try {
            let respuesta;
            if (juegoEnEdicion) {
                respuesta = await supabase
                    .from("videojuegos")
                    .update({
                        nombre: videojuego.nombre,
                        plataforma: videojuego.plataforma,
                        genero: videojuego.genero,
                        estado: videojuego.estado,
                        valoracion: videojuego.valoracion,
                        notas: videojuego.notas,
                        actualizado_en: new Date().toISOString()
                    })
                    .eq("id", juegoEnEdicion.id)
                    .eq("usuario_id", usuario.id)
                    .select("id")
                    .maybeSingle();
            } else {
                respuesta = await supabase.from("videojuegos").insert(videojuego);
            }
            if (respuesta.error) throw respuesta.error;
            if (edicionAntesDeGuardar && !respuesta.data?.id) {
                throw new Error("Supabase no confirmó la edición. No reemplacé tu copia local; revisa la política RLS de UPDATE.");
            }

            // Respaldo local inmediato; la siguiente lectura confirma si Supabase devolvió la fila.
            if (edicionAntesDeGuardar) {
                pfGuardarCopiaJuego({ ...videojuego, id: edicionAntesDeGuardar.id, creado_en: edicionAntesDeGuardar.creado_en }, false);
            } else {
                pfGuardarCopiaJuego(videojuego, true);
            }
            const estabaEditando = Boolean(juegoEnEdicion);
            resetearFormularioJuego();
            mensaje("mensajeJuego", estabaEditando ? "Cambios guardados correctamente." : "Videojuego guardado correctamente.");
            await cargarJuegos();
        } catch (error) {
            console.error("Error al guardar videojuego:", error);
            mensaje("mensajeJuego", "No se pudo guardar: " + (error.message || "revisa las columnas y políticas de Supabase"));
        } finally {
            botonCargando(botonGuardar, false);
        }
    });
}

function resetearFormularioJuego() {
    juegoEnEdicion = null;
    if (formJuego) formJuego.reset();
    if ($("tituloFormularioJuego")) $("tituloFormularioJuego").textContent = "Agregar videojuego";
    if ($("guardarJuego")) $("guardarJuego").textContent = "Guardar videojuego";
    if ($("cancelarEdicion")) $("cancelarEdicion").hidden = true;
}

const botonCancelarEdicion = $("cancelarEdicion");
if (botonCancelarEdicion) {
    botonCancelarEdicion.addEventListener("click", resetearFormularioJuego);
}

async function pfSincronizarCopiasLocales() {
    if (!supabase || !usuario?.id || usuario.id === "invitado-local") return;
    const copias = pfLeerCacheBiblioteca();
    const pendientes = copias.filter(j => j && (j.__localOnly || String(j.id || "").startsWith("local-")));
    if (!pendientes.length) return;
    try {
        const { data: existentes, error: errorLectura } = await supabase
            .from("videojuegos")
            .select("id,nombre,plataforma")
            .eq("usuario_id", usuario.id);
        if (errorLectura) throw errorLectura;
        const filas = Array.isArray(existentes) ? existentes : [];
        const cacheActualizada = [...copias];
        for (const copia of pendientes) {
            const duplicado = filas.find(f =>
                pfNormalizarBusqueda(f.nombre) === pfNormalizarBusqueda(copia.nombre) &&
                (f.plataforma || "PC") === (copia.plataforma || "PC")
            );
            if (duplicado) {
                const i = cacheActualizada.findIndex(x => String(x.id) === String(copia.id));
                if (i >= 0) cacheActualizada[i] = { ...cacheActualizada[i], ...duplicado, usuario_id: usuario.id, __localOnly: false };
                continue;
            }
            const nuevo = {
                usuario_id: usuario.id,
                nombre: String(copia.nombre || "").trim(),
                plataforma: copia.plataforma || "PC",
                genero: copia.genero || "Otro",
                estado: copia.estado || "Pendiente",
                valoracion: Number(copia.valoracion) || 0,
                notas: copia.notas || ""
            };
            if (!nuevo.nombre) continue;
            const { data: insertado, error: errorInsertar } = await supabase
                .from("videojuegos").insert(nuevo).select("id,usuario_id,nombre,plataforma,genero,estado,valoracion,notas,creado_en").single();
            if (errorInsertar) throw errorInsertar;
            const i = cacheActualizada.findIndex(x => String(x.id) === String(copia.id));
            if (i >= 0) cacheActualizada[i] = { ...insertado, __localOnly: false };
            filas.push(insertado);
        }
        pfGuardarCacheBiblioteca(cacheActualizada);
    } catch (error) {
        // Silencioso en la interfaz; el error queda disponible en la consola para diagnóstico.
        console.warn("PixelForge: la sincronización automática de registros locales se reintentará más tarde.", error);
    }
}

async function cargarJuegos() {
    if (!usuario || !$("listaJuegos")) return;
    const contenedor = $("listaJuegos");
    contenedor.replaceChildren();
    const cachePrevia = pfLeerCacheBiblioteca();

    function pintar(lista, modoRespaldo = false) {
        contenedor.replaceChildren();
        if (!lista.length) {
            const vacio = document.createElement("p");
            vacio.textContent = "Todavía no has agregado videojuegos a tu biblioteca.";
            contenedor.appendChild(vacio);
            return;
        }
        lista.forEach((juego) => {
            const tarjeta = document.createElement("article");
            tarjeta.className = "tarjeta-biblioteca";
            const titulo = document.createElement("h4");
            titulo.textContent = juego.nombre || "Videojuego sin nombre";
            const plataforma = document.createElement("p");
            plataforma.textContent = "Plataforma: " + (juego.plataforma || "PC");
            const genero = document.createElement("p");
            genero.textContent = "Género: " + (juego.genero || "Otro");
            const estado = document.createElement("p");
            estado.textContent = "Estado: " + (juego.estado || "Pendiente");
            const valoracion = document.createElement("p");
            valoracion.className = "calificacion";
            const puntos = Number(juego.valoracion) || 0;
            valoracion.textContent = puntos ? `Calificación: ${"★".repeat(puntos)}${"☆".repeat(5 - puntos)} (${puntos}/5)` : "Calificación: sin calificar";
            const notas = document.createElement("p");
            notas.textContent = juego.notas || "Observaciones: sin notas.";
            tarjeta.append(titulo, plataforma, genero, estado, valoracion, notas);

            const esSoloRespaldo = modoRespaldo || Boolean(juego.__cacheOnly) || (Boolean(juego.__localOnly) && usuario?.id !== "invitado-local") || (String(juego.id || "").startsWith("local-") && usuario?.id !== "invitado-local");
            if (esSoloRespaldo) {
                // Los registros locales no confirmados se conservan sin mostrar mensajes técnicos.
                // No se habilitan edición/eliminación hasta que el servidor confirme el registro.
                tarjeta.dataset.estadoLocal = "pendiente-sincronizacion";
            } else {
                const acciones = document.createElement("div");
                acciones.className = "acciones-tarjeta";
                const editar = document.createElement("button");
                editar.type = "button";
                editar.textContent = "Editar";
                editar.addEventListener("click", () => prepararEdicion(juego));
                const eliminar = document.createElement("button");
                eliminar.type = "button";
                eliminar.className = "eliminar-juego";
                eliminar.textContent = "Eliminar";
                eliminar.addEventListener("click", () => eliminarJuego(juego));
                acciones.append(editar, eliminar);
                tarjeta.appendChild(acciones);
            }
            contenedor.appendChild(tarjeta);
        });
    }

    if (usuario.id === "invitado-local") {
        pintar(cachePrevia);
        mensaje("mensajeJuego", "Biblioteca local (sin cuenta). Tus registros se guardan en este dispositivo.");
        return;
    }

    mensaje("mensajeJuego", "");

    try {
        await pfSincronizarCopiasLocales();
        const { data, error } = await supabase
            .from("videojuegos")
            .select("id, usuario_id, nombre, plataforma, genero, estado, valoracion, notas, creado_en")
            .eq("usuario_id", usuario.id)
            .order("creado_en", { ascending: false });
        if (error) throw error;

        const remotos = Array.isArray(data) ? data : [];
        const combinados = remotos.map(juego => ({ ...juego, __cacheOnly: false }));
        let conservados = 0;
        for (const copia of cachePrevia) {
            const coincidePorId = copia.id && !String(copia.id).startsWith("local-") && remotos.some(juego => String(juego.id) === String(copia.id));
            const coincideNuevoPorNombre = copia.__localOnly && remotos.some(juego =>
                pfNormalizarBusqueda(juego.nombre) === pfNormalizarBusqueda(copia.nombre) && (juego.plataforma || "PC") === (copia.plataforma || "PC")
            );
            if (!coincidePorId && !coincideNuevoPorNombre) {
                combinados.push({ ...copia, __cacheOnly: true });
                conservados++;
            }
        }
        // Guardar primero lo que Supabase confirmó y conservar las copias no confirmadas por separado.
        pfGuardarCacheBiblioteca(combinados);
        pintar(combinados);

        if (conservados > 0) {
            mensaje("mensajeJuego", "Tu biblioteca está disponible. Algunos cambios pueden tardar en actualizarse; vuelve a intentarlo más tarde si notas que falta algo.");
        } else if (remotos.length === 0 && cachePrevia.length === 0) {
            mensaje("mensajeJuego", "¡Tu biblioteca está lista! Agrega tu primer videojuego cuando quieras.");
        } else {
            mensaje("mensajeJuego", "Biblioteca actualizada.");
        }
    } catch (error) {
        console.error("Error al cargar videojuegos:", error);
        if (cachePrevia.length > 0) {
            pintar(cachePrevia.map(juego => ({ ...juego, __cacheOnly: true })), true);
            mensaje("mensajeJuego", "Tu biblioteca sigue disponible en este dispositivo. La actualización automática se volverá a intentar cuando haya conexión.");
        } else {
            const aviso = document.createElement("p");
            aviso.textContent = "No se pudo actualizar la biblioteca en este momento. Comprueba tu conexión e inténtalo de nuevo.";
            contenedor.replaceChildren(aviso);
            mensaje("mensajeJuego", "La biblioteca no está disponible temporalmente. Inténtalo de nuevo en unos momentos.");
        }
    }
}
function prepararEdicion(juego) {
    juegoEnEdicion = juego;
    $("nombreJuego").value = juego.nombre || "";
    $("plataforma").value = juego.plataforma || "PC";
    $("generoJuego").value = juego.genero || "Otro";
    $("estadoJuego").value = juego.estado || "Pendiente";
    $("valoracionJuego").value = String(Number(juego.valoracion) || 0);
    $("notasJuego").value = juego.notas || "";
    $("tituloFormularioJuego").textContent = "Editar videojuego";
    $("guardarJuego").textContent = "Guardar cambios";
    $("cancelarEdicion").hidden = false;
    $("nombreJuego").focus();
    $("formJuego").scrollIntoView({ behavior: "smooth", block: "center" });
}

async function eliminarJuego(juego) {
    if (!usuario) return;
    if (usuario.id === "invitado-local") {
        if (!confirm(`¿Eliminar "${juego.nombre}" de tu biblioteca?`)) return;
        pfQuitarCopiaJuego(juego.id);
        mensaje("mensajeJuego", "Videojuego eliminado.");
        if (juegoEnEdicion && juegoEnEdicion.id === juego.id) resetearFormularioJuego();
        await cargarJuegos();
        return;
    }
    if (!supabase) return;
    if (juego.__cacheOnly || juego.__localOnly || String(juego.id || "").startsWith("local-")) {
        mensaje("mensajeJuego", "Este videojuego todavía se está actualizando. Inténtalo de nuevo en unos momentos.");
        return;
    }
    if (!confirm(`¿Eliminar "${juego.nombre}" de tu biblioteca? Esta acción solo se ejecuta porque la confirmas aquí.`)) return;
    try {
        const { data, error } = await supabase
            .from("videojuegos")
            .delete()
            .eq("id", juego.id)
            .eq("usuario_id", usuario.id)
            .select("id");
        if (error) throw error;
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error("Supabase no confirmó la eliminación. Conservé el videojuego y su copia local; revisa la política RLS de DELETE.");
        }
        pfQuitarCopiaJuego(juego.id);
        mensaje("mensajeJuego", "Videojuego eliminado tras confirmación de Supabase.");
        if (juegoEnEdicion && juegoEnEdicion.id === juego.id) resetearFormularioJuego();
        await cargarJuegos();
    } catch (error) {
        console.error("Error al eliminar videojuego:", error);
        mensaje("mensajeJuego", "No se pudo completar la acción. Inténtalo de nuevo en unos momentos.");
    }
}
const CLAVE_FAVORITOS = "pixelforge_favoritos_v1";
function leerFavoritos() {
    try {
        const valor = JSON.parse(localStorage.getItem(CLAVE_FAVORITOS) || "[]");
        return Array.isArray(valor) ? valor : [];
    } catch {
        return [];
    }
}
function guardarFavoritos(lista) {
    try { localStorage.setItem(CLAVE_FAVORITOS, JSON.stringify(lista)); }
    catch (error) { console.warn("No fue posible guardar favoritos en este navegador:", error); }
}
function aplicarFiltroJuegos() {
    const busqueda = pfNormalizarBusqueda($("buscadorJuegos")?.value || "");
    const favoritos = leerFavoritos();
    const generoFiltro = pfNormalizarBusqueda($("filtroGeneroCatalogo")?.value || "");
    const edadFiltro = $("filtroEdadCatalogo")?.value || "";
    document.querySelectorAll(".contenedor-juegos .juego").forEach((tarjeta) => {
        const id = tarjeta.dataset.juego;
        const texto = pfNormalizarBusqueda(tarjeta.textContent);
        const genero = tarjeta.dataset.genero || tarjeta.textContent;
        const edadTarjeta = tarjeta.dataset.edad || "";
        const infantilTarjeta = ["3+", "7+"].includes(edadTarjeta);
        const coincideTexto = !busqueda || texto.includes(busqueda);
        const coincideGenero = pfGeneroCoincide(genero, generoFiltro, { edad: edadTarjeta, infantil: infantilTarjeta });
        const coincideEdad = !edadFiltro || edadTarjeta === edadFiltro;
        const coincideFavorito = !soloFavoritos || favoritos.includes(id);
        tarjeta.hidden = !(coincideTexto && coincideGenero && coincideEdad && coincideFavorito);
    });
    const botonFiltro = $("mostrarFavoritos");
    if (botonFiltro) {
        botonFiltro.setAttribute("aria-pressed", String(soloFavoritos));
        botonFiltro.textContent = soloFavoritos ? "★ Mostrar todos" : "☆ Ver favoritos";
    }
}
function actualizarBotonesFavoritos() {
    const favoritos = leerFavoritos();
    document.querySelectorAll("[data-favorito]").forEach((boton) => {
        const guardado = favoritos.includes(boton.dataset.favorito);
        boton.setAttribute("aria-pressed", String(guardado));
        boton.textContent = guardado ? "★ En favoritos" : "☆ Añadir a favoritos";
    });
    aplicarFiltroJuegos();
}
document.querySelectorAll("[data-favorito]").forEach((boton) => {
    boton.addEventListener("click", () => {
        const id = boton.dataset.favorito;
        const favoritos = leerFavoritos();
        const siguiente = favoritos.includes(id) ? favoritos.filter((x) => x !== id) : [...favoritos, id];
        guardarFavoritos(siguiente);
        if (typeof guardarFavoritoNube === "function") void guardarFavoritoNube(id, siguiente.includes(id));
        actualizarBotonesFavoritos();
        if (pfCatalogoInicializado) pfFiltrosActualizados();
    });
});
if ($("mostrarFavoritos")) {
    $("mostrarFavoritos").addEventListener("click", () => {
        soloFavoritos = !soloFavoritos;
        aplicarFiltroJuegos();
        if (pfCatalogoInicializado) pfFiltrosActualizados();
    });
}
actualizarBotonesFavoritos();

const formPublicacion = $("formPublicacion");
if (formPublicacion) {
    formPublicacion.addEventListener("submit", async (evento) => {
        evento.preventDefault();
        if (!supabase || !usuario) {
            mensaje("mensajeComunidad", "Inicia sesión para publicar.");
            document.querySelector("#biblioteca")?.scrollIntoView({ behavior: "smooth" });
            return;
        }
        const titulo = $("tituloPublicacion").value.trim();
        const contenido = $("textoPublicacion").value.trim();
        if (!titulo || !contenido) {
            mensaje("mensajeComunidad", "Completa el título y el contenido.");
            return;
        }

        const boton = formPublicacion.querySelector('button[type="submit"]');
        botonCargando(boton, true, "Publicando...");
        try {
            const { error } = await supabase.from("comunidad_publicaciones").insert({
                usuario_id: usuario.id,
                autor_nombre: (usuario.email || "Jugador").split("@")[0],
                titulo,
                contenido
            });
            if (error) throw error;
            formPublicacion.reset();
            mensaje("mensajeComunidad", "¡Publicación creada!");
            await cargarComunidad();
        } catch (error) {
            console.error("Error al publicar:", error);
            mensaje("mensajeComunidad", "No se pudo publicar: " + explicarErrorSupabase(error, "community"));
        } finally {
            botonCargando(boton, false);
        }
    });
}

const botonAlternarClave =
    document.getElementById("alternarClave");

const campoClave = document.getElementById("clave");

if (botonAlternarClave && campoClave) {
    botonAlternarClave.addEventListener("click", () => {
        const mostrar = campoClave.type === "password";

        campoClave.type = mostrar ? "text" : "password";

        botonAlternarClave.textContent =
            mostrar ? "Ocultar" : "Mostrar";

        botonAlternarClave.setAttribute(
            "aria-pressed",
            String(mostrar)
        );
    });
}

async function cargarComunidad() {
    const contenedor = $("listaPublicaciones");
    if (!contenedor) return;
    if (!supabase || !usuario) {
        contenedor.replaceChildren();
        const aviso = document.createElement("p");
        aviso.textContent = "Inicia sesión para consultar la comunidad.";
        contenedor.appendChild(aviso);
        return;
    }

    try {
        const { data, error } = await supabase
            .from("comunidad_publicaciones")
            .select("id, usuario_id, autor_nombre, titulo, contenido, creado_en")
            .order("creado_en", { ascending: false })
            .limit(40);
        if (error) throw error;
        contenedor.replaceChildren();
        if (!data || data.length === 0) {
            const aviso = document.createElement("p");
            aviso.textContent = "Todavía no hay publicaciones. ¡Sé el primero en compartir!";
            contenedor.appendChild(aviso);
            return;
        }
        data.forEach((publicacion) => {
            const tarjeta = document.createElement("article");
            tarjeta.className = "tarjeta-publicacion";
            const titulo = document.createElement("h4");
            titulo.textContent = publicacion.titulo;
            const contenido = document.createElement("p");
            contenido.textContent = publicacion.contenido;
            const fecha = document.createElement("small");
            fecha.textContent = "Publicado: " + new Date(publicacion.creado_en).toLocaleString("es-MX");
            const autor = document.createElement("small");
            autor.className = "autor-publicacion";
            autor.textContent = "Publicado por: " + (publicacion.autor_nombre || "Jugador de PixelForge");
            tarjeta.append(autor, titulo, contenido, fecha);

            if (publicacion.usuario_id === usuario.id) {
                const editar = document.createElement("button");
                editar.type = "button";
                editar.className = "boton boton-secundario";
                editar.textContent = "Editar publicación";
                editar.addEventListener("click", async () => {
                    const nuevoTitulo = prompt("Editar título:", publicacion.titulo);
                    if (nuevoTitulo === null) return;
                    const nuevoContenido = prompt("Editar publicación:", publicacion.contenido);
                    if (nuevoContenido === null) return;
                    const tituloLimpio = nuevoTitulo.trim(); const contenidoLimpio = nuevoContenido.trim();
                    if (!tituloLimpio || !contenidoLimpio || tituloLimpio.length > 80 || contenidoLimpio.length > 500) {
                        mensaje("mensajeComunidad", "El título debe tener entre 1 y 80 caracteres y el contenido entre 1 y 500."); return;
                    }
                    try {
                        const { error: errorEditar } = await supabase.from("comunidad_publicaciones")
                            .update({ titulo: tituloLimpio, contenido: contenidoLimpio })
                            .eq("id", publicacion.id).eq("usuario_id", usuario.id);
                        if (errorEditar) throw errorEditar;
                        mensaje("mensajeComunidad", "Publicación actualizada."); await cargarComunidad();
                    } catch (errorEditar) { mensaje("mensajeComunidad", "No se pudo editar: " + explicarErrorSupabase(errorEditar, "community")); }
                });
                tarjeta.appendChild(editar);
                const eliminar = document.createElement("button");
                eliminar.type = "button";
                eliminar.className = "boton boton-secundario";
                eliminar.textContent = "Eliminar publicación";
                eliminar.addEventListener("click", async () => {
                    if (!confirm("¿Quieres eliminar esta publicación?")) return;
                    try {
                        const { error: errorEliminar } = await supabase
                            .from("comunidad_publicaciones")
                            .delete()
                            .eq("id", publicacion.id)
                            .eq("usuario_id", usuario.id);
                        if (errorEliminar) throw errorEliminar;
                        mensaje("mensajeComunidad", "Publicación eliminada.");
                        await cargarComunidad();
                    } catch (errorEliminar) {
                        console.error("Error al eliminar publicación:", errorEliminar);
                        mensaje("mensajeComunidad", "No se pudo eliminar: " + explicarErrorSupabase(errorEliminar, "community"));
                    }
                });
                tarjeta.appendChild(eliminar);
            }
            contenedor.appendChild(tarjeta);
        });
        mensaje("mensajeComunidad", "");
    } catch (error) {
        console.error("Error al cargar la comunidad:", error);
        mensaje("mensajeComunidad", "No se pudo cargar la comunidad: " + explicarErrorSupabase(error, "community"));
    }
}

async function iniciarPixelForge() {
    const anio = $("anioActual");
    if (anio) anio.textContent = String(new Date().getFullYear());

    if (!configurado) {
        mensaje("mensajeAcceso", "Revisa la URL y la clave pública de Supabase en scrip.js.");
        mostrarAcceso();
        return;
    }
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
        mensaje("mensajeAcceso", "No se cargó la librería de Supabase. Revisa la conexión a internet y las etiquetas script al final de index.html.");
        mostrarAcceso();
        return;
    }

    try {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        const { data } = await supabase.auth.getSession().catch(() => ({ data: {} }));
        
        if (data?.session?.user) {
            usuario = data.session.user;
            localStorage.setItem("pixelforge_usuario_activo", JSON.stringify({ id: usuario.id, email: usuario.email }));
            mostrarBiblioteca();
            window.dispatchEvent(new Event("pixelforge:auth"));
        } else {
            usuario = null;
            localStorage.removeItem("pixelforge_usuario_activo");
            mostrarAcceso();
            cargarComunidad();
            window.dispatchEvent(new Event("pixelforge:auth"));
        }
    } catch (error) {
        console.error("Error al iniciar PixelForge:", error);
        let usuarioGuardado = null;
        try {
            const raw = localStorage.getItem("pixelforge_usuario_activo");
            if (raw) usuarioGuardado = JSON.parse(raw);
        } catch {}

        if (usuarioGuardado?.email) {
            usuario = usuarioGuardado;
            mostrarBiblioteca();
        } else {
            mostrarAcceso();
        }
    }
}

iniciarPixelForge().then(() => iniciarCatalogoExtendido());

/* ================= PIXELFORGE: CATÁLOGO, FAVORITOS, CALIFICACIONES Y PROPUESTAS ================= */
window.PIXELFORGE_CATALOGO = [
    {
        nombre: "The Legend of Zelda: Tears of the Kingdom",
        genero: "Aventura",
        edad: "10+",
        descripcion: "Una aventura épica por las tierras y los vastos cielos de Hyrule, construyendo artilugios y explorando sin límites.",
        url: "https://www.zelda.com/tears-of-the-kingdom/",
        imagen: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&auto=format&fit=crop&q=80",
        streamers: "IlloJuan / Rubius",
        infantil: false
    },
    {
        nombre: "Super Mario Odyssey",
        genero: "Familiar",
        edad: "3+",
        descripcion: "Únete a Mario en una aventura 3D a través de reinos coloridos y usa los increíbles poderes de Cappy.",
        url: "https://www.nintendo.com/store/products/super-mario-odyssey-switch/",
        imagen: "https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=600&auto=format&fit=crop&q=80",
        streamers: "Nintendo / Creadores familiares",
        infantil: true
    },
    {
        nombre: "Rocket League",
        genero: "Deportes",
        edad: "3+",
        descripcion: "Fútbol acrobático impulsado por cohetes. Conduce a toda velocidad, vuela y marca goles con tu equipo.",
        url: "https://www.rocketleague.com",
        imagen: "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=600&auto=format&fit=crop&q=80",
        streamers: "SquishyMuffinz / SunlessKhan",
        infantil: true
    },
    {
        nombre: "Stardew Valley",
        genero: "Simulación",
        edad: "7+",
        descripcion: "Has heredado la vieja granja de tu abuelo. Aprende a vivir de la tierra y haz prosperar el pueblo.",
        url: "https://www.stardewvalley.net",
        imagen: "https://images.unsplash.com/photo-1500651230702-0e2d8a49d4ad?w=600&auto=format&fit=crop&q=80",
        streamers: "Comunidad granjera",
        infantil: true
    },
    {
        nombre: "Hollow Knight",
        genero: "Acción",
        edad: "7+",
        descripcion: "Desciende al oscuro y fascinante reino de Hallownest, derrota criaturas feroces y desentraña misterios.",
        url: "https://www.teamcherry.com.au",
        imagen: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80",
        streamers: "Fireb0rn / Skurry",
        infantil: false
    },
    {
        nombre: "Elden Ring",
        genero: "RPG",
        edad: "16+",
        descripcion: "Levántate, Sinluz, y déjate guiar por la gracia para blandir el poder del Círculo de Elden en las Tierras Intermedias.",
        url: "https://www.bandainamcoent.com/games/elden-ring",
        imagen: "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=600&auto=format&fit=crop&q=80",
        streamers: "ElXokas / Asmongold",
        infantil: false
    },
    {
        nombre: "Among Us",
        genero: "Cooperativo",
        edad: "7+",
        descripcion: "Prepara tu nave espacial mientras intentas descubrir a los impostores antes de que saboteen la tripulación.",
        url: "https://innersloth.com/games/among-us/",
        imagen: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80",
        streamers: "Ibai / Valkyrae / Disguised Toast",
        infantil: true
    },
    {
        nombre: "Forza Horizon 5",
        genero: "Carreras",
        edad: "3+",
        descripcion: "Explora los vibrantes paisajes en constante evolución de México en los mejores bólidos del mundo.",
        url: "https://forza.net/horizon",
        imagen: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=600&auto=format&fit=crop&q=80",
        streamers: "AR12Gaming / BlackPanthaa",
        infantil: true
    }
];

const PF_CLAVE_CALIFICACIONES_LOCAL = "pixelforge_calificaciones_local_v1";
const PF_CLAVE_FAVORITOS = "pixelforge_favoritos_v1";
let pfJuegosBD = [];
let pfCalificacionesResumen = {};
let pfCalificacionesUsuario = {};
let pfEsAdmin = false;
let pfCatalogoInicializado = false;
let pfResultadosWikidata = [];
let pfTerminoWikidata = "";
let pfWikidataCargando = false;
let pfWikidataError = false;
let pfWikidataTimer = null;
let pfWikidataController = null;
const pfCacheWikidata = new Map();

function pfLeerJSONLocal(clave, predeterminado) {
    try {
        const dato = JSON.parse(localStorage.getItem(clave) || "null");
        return dato ?? predeterminado;
    } catch { return predeterminado; }
}
function pfGuardarJSONLocal(clave, dato) {
    try { localStorage.setItem(clave, JSON.stringify(dato)); } catch (error) { console.warn("PixelForge no pudo guardar en este navegador:", error); }
}
function pfEscaparTexto(value) { return String(value ?? ""); }

// Streamers sugeridos por juego. Los enlaces abren resultados de Twitch; no afirman que estén en directo.
const PF_STREAMERS_POR_JUEGO = {
    "minecraft": ["Auronplay", "Vegetta777", "Rubius"],
    "fortnite": ["Ninja", "SypherPK", "TheGrefg"],
    "grand theft auto v": ["TheProfessional", "Caylus", "xQc"],
    "gta v": ["TheProfessional", "Caylus", "xQc"],
    "rocket league": ["SquishyMuffinz", "ApparentlyJack", "SunlessKhan"],
    "stardew valley": ["ConcernedApe", "ezlilyy", "Fuzzireno"],
    "hollow knight": ["Fireb0rn", "Skurry", "Mossbag"],
    "elden ring": ["LobosJr", "MissMikkaa", "Asmongold"],
    "among us": ["Valkyrae", "DisguisedToast", "Hafu"],
    "forza horizon 5": ["AR12Gaming", "BlackPanthaa", "DonJoewonSong"],
    "super mario odyssey": ["SmallAnt", "GrandPooBear", "PointCrow"],
    "the legend of zelda tears of the kingdom": ["PointCrow", "ZeldaDungeon", "SmallAnt"]
};
function pfTwitchBuscar(termino) {
    return `https://www.twitch.tv/search?term=${encodeURIComponent(String(termino || "videojuegos"))}`;
}
function pfNombresStreamers(juego) {
    const nombre = String(juego?.nombre || "").trim();
    const clave = pfNormalizarBusqueda(nombre).replace(/[^a-z0-9]+/g, " ").trim();
    const exacto = PF_STREAMERS_POR_JUEGO[clave];
    // Los datos antiguos del catálogo base tenían nombres genéricos o mezclados; usar la lista por título.
    if (juego?.deBase && exacto) return exacto;
    const guardados = String(juego?.streamers || "").trim();
    const esTextoGenerico = !guardados || /busca (streamers|creadores)|explora creadores|comunidad granjera|nintendo \/ creadores familiares/i.test(guardados);
    if (!esTextoGenerico) {
        return [...new Set(guardados.split(/[,;/|]+/).map(x => x.trim()).filter(x => x && !/pendiente|no disponible/i.test(x)))].slice(0, 5);
    }
    if (exacto) return exacto;
    const parcial = Object.keys(PF_STREAMERS_POR_JUEGO).find(k => clave.includes(k) || k.includes(clave));
    return parcial ? PF_STREAMERS_POR_JUEGO[parcial] : [];
}
function pfSlug(texto) {
    return String(texto || "juego").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "juego";
}
function pfImagenMarcador(nombre) {
    const seguro = String(nombre || "PixelForge").replace(/[<>&"']/g, "").slice(0, 50);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#101827"/><stop offset="1" stop-color="#153d58"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/><path d="M0 280L220 80 360 210 475 115 640 280V360H0Z" fill="#00e5ff" opacity=".10"/><text x="32" y="55" fill="#00e5ff" font-size="17" font-family="Arial" font-weight="bold">PIXELFORGE · VIDEOJUEGO</text><text x="32" y="185" fill="#ffffff" font-size="34" font-family="Arial" font-weight="bold">${seguro}</text><text x="32" y="230" fill="#aab3c6" font-size="18" font-family="Arial">Portada ilustrativa</text></svg>`;
    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}
function pfNormalizarJuego(j) {
    const nombre = j.nombre || j.title || "Videojuego";
    return {
        slug: j.slug || pfSlug(nombre), nombre,
        genero: j.genero || "Otro",
        edad: j.edad || j.clasificacion_edad || "Pendiente de verificar",
        descripcion: j.descripcion || "Descubre este videojuego.",
        url: j.url || j.sitio_oficial || "",
        imagen: j.imagen || j.imagen_url || "",
        streamers: j.streamers || "",
        url_streamers: j.url_streamers || pfTwitchBuscar(nombre),
        infantil: Boolean(j.infantil ?? j.es_infantil),
        deBase: Boolean(j.deBase),
        fuenteWikidata: Boolean(j.fuenteWikidata),
        url_wikidata: j.url_wikidata || "",
        requisitos_minimos: j.requisitos_minimos || j.requisitosMinimos || "",
        requisitos_recomendados: j.requisitos_recomendados || j.requisitosRecomendados || "",
        fuenteRawg: Boolean(j.fuenteRawg), rawgId: j.rawgId || null, rawgSlug: j.rawgSlug || ""
    };
}
function pfCrearEnlace(url, texto, clase = "enlace-juego") {
    const a = document.createElement("a");
    a.className = clase; a.textContent = texto; a.href = url || "#";
    if (url && /^https:\/\//i.test(url)) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
    else { a.removeAttribute("href"); a.setAttribute("aria-disabled", "true"); }
    return a;
}
function pfCrearTarjetaJuego(juego) {
    const articulo = document.createElement("article");
    articulo.className = "juego tarjeta-catalogo-extra";
    articulo.dataset.juego = juego.slug;
    articulo.dataset.genero = juego.genero;
    articulo.dataset.edad = juego.edad;
    articulo.dataset.infantil = String(juego.infantil);
    const figura = document.createElement("div"); figura.className = "imagen-juego-contenedor";
    const imagen = document.createElement("img"); imagen.loading = "lazy"; imagen.alt = `Portada de ${juego.nombre}`;
    imagen.src = juego.imagen || pfImagenMarcador(juego.nombre);
    imagen.addEventListener("error", () => { if (!imagen.dataset.fallback) { imagen.dataset.fallback = "1"; imagen.src = pfImagenMarcador(juego.nombre); } }, { once: true });
    figura.appendChild(imagen);
    const info = document.createElement("div"); info.className = "informacion";
    const genero = document.createElement("span"); genero.textContent = juego.genero.toUpperCase();
    const titulo = document.createElement("h3"); titulo.textContent = juego.nombre;
    const desc = document.createElement("p"); desc.textContent = juego.descripcion;
    const edad = document.createElement("p"); edad.className = "etiqueta-edad"; edad.textContent = `Edad sugerida: ${juego.edad}`;
    const requisitos = document.createElement("details"); requisitos.className = "pf-requisitos-juego";
    const requisitosTitulo = document.createElement("summary"); requisitosTitulo.textContent = "Requisitos de PC";
    const requisitosTexto = document.createElement("p");
    requisitosTexto.textContent = juego.requisitos_recomendados ? `Recomendados: ${juego.requisitos_recomendados}` : (juego.requisitos_minimos ? `Mínimos: ${juego.requisitos_minimos}` : "No hay requisitos verificados disponibles todavía.");
    requisitos.append(requisitosTitulo, requisitosTexto);
    if (juego.fuenteRawg && juego.rawgId && !juego.requisitos_recomendados && !juego.requisitos_minimos) {
        const cargarReq = document.createElement("button"); cargarReq.type = "button"; cargarReq.className = "boton-mini"; cargarReq.textContent = "Consultar requisitos en RAWG";
        cargarReq.addEventListener("click", async () => {
            cargarReq.disabled = true; cargarReq.textContent = "Consultando…";
            try {
                const key = window.PIXELFORGE_CONFIG?.rawgApiKey?.trim();
                if (!key) throw new Error("Configura la clave RAWG en api-config.js.");
                const response = await fetch(`https://api.rawg.io/api/games/${encodeURIComponent(juego.rawgId)}?key=${encodeURIComponent(key)}`);
                if (!response.ok) throw new Error(`RAWG respondió HTTP ${response.status}.`);
                const detail = await response.json();
                const platforms = (detail.platforms || []).map(x => ({ name: x.platform?.name || "PC", req: x.requirements || {} }));
                const recommended = platforms.find(x => /pc|windows/i.test(x.name) && x.req.recommended)?.req.recommended;
                const minimum = platforms.find(x => /pc|windows/i.test(x.name) && x.req.minimum)?.req.minimum;
                requisitosTexto.textContent = recommended ? `Requisitos recomendados: ${recommended}` : minimum ? `Requisitos mínimos: ${minimum}` : "RAWG no proporciona requisitos de PC para este juego.";
                requisitos.open = true;
                if (detail.website) { const link = pfCrearEnlace(detail.website, "Sitio oficial", "enlace-juego enlace-secundario"); requisitos.appendChild(link); }
                cargarReq.remove();
            } catch (err) { requisitosTexto.textContent = err.message || "No se pudieron consultar los requisitos."; cargarReq.disabled = false; cargarReq.textContent = "Reintentar consulta"; }
        });
        requisitos.appendChild(cargarReq);
    }
    if (juego.fuenteRawg) { const fuente = pfCrearEnlace(`https://rawg.io/games/${encodeURIComponent(juego.rawgSlug || juego.slug)}`, "Datos e imagen: RAWG", "enlace-juego enlace-secundario"); requisitos.appendChild(fuente); }
    const bloqueStreamers = document.createElement("section");
    bloqueStreamers.className = "pf-streamers-juego";
    const tituloStreamers = document.createElement("p");
    tituloStreamers.className = "streamers-juego";
    tituloStreamers.textContent = "Streamers de este juego en Twitch";
    bloqueStreamers.appendChild(tituloStreamers);
    const listaStreamers = document.createElement("div");
    listaStreamers.className = "pf-lista-streamers";
    const streamers = pfNombresStreamers(juego);
    if (streamers.length) {
        streamers.forEach(nombreStreamer => {
            listaStreamers.appendChild(pfCrearEnlace(pfTwitchBuscar(nombreStreamer), `Buscar ${nombreStreamer}`, "enlace-juego enlace-secundario pf-enlace-streamer"));
        });
    } else {
        const avisoStreamers = document.createElement("span");
        avisoStreamers.className = "pf-streamers-sin-lista";
        avisoStreamers.textContent = "No hay nombres verificados guardados para este juego.";
        listaStreamers.appendChild(avisoStreamers);
    }
    listaStreamers.appendChild(pfCrearEnlace(pfTwitchBuscar(juego.nombre), `Ver directos de ${juego.nombre}`, "enlace-juego pf-enlace-directos"));
    bloqueStreamers.appendChild(listaStreamers);
    const enlaces = document.createElement("div"); enlaces.className = "acciones-catalogo";
    if (juego.url) enlaces.appendChild(pfCrearEnlace(juego.url, "Página oficial"));
    if (juego.url_wikidata) enlaces.appendChild(pfCrearEnlace(juego.url_wikidata, "Ficha Wikidata", "enlace-juego enlace-secundario"));
    if (!juego.url && !juego.url_wikidata) {
        const sinPagina = document.createElement("span");
        sinPagina.className = "enlace-juego enlace-secundario";
        sinPagina.textContent = "Página oficial no disponible";
        enlaces.appendChild(sinPagina);
    }
    if (juego.fuenteRawg) {
        const importar = document.createElement("button"); importar.type = "button"; importar.className = "boton-mini"; importar.textContent = "Preparar para editar categoría";
        importar.addEventListener("click", async () => {
            if (!pfEsAdmin || !supabase || !$("pfEditorCatalogoForm")) {
                mensaje("mensajeBusqueda", "Inicia sesión con una cuenta administradora para importar y editar este juego."); return;
            }
            const key = window.PIXELFORGE_CONFIG?.rawgApiKey?.trim();
            let detalle = {};
            if (key && juego.rawgId) {
                try { const r = await fetch(`https://api.rawg.io/api/games/${encodeURIComponent(juego.rawgId)}?key=${encodeURIComponent(key)}`); if (r.ok) detalle = await r.json(); } catch (e) { console.warn("No se pudo ampliar el juego RAWG:", e); }
            }
            const nombre = juego.nombre || detalle.name || "";
            const form = $("pfEditorCatalogoForm");
            $("pfEditorSlug").readOnly = false; $("pfEditorSlug").value = pfSlug(nombre); $("pfEditorNombre").value = nombre;
            const categoria = pfNormalizarGeneroApi((detalle.genres || []).map(x => x.name).join(", ") || juego.genero);
            const generoSelect = $("pfEditorGenero");
            if (![...generoSelect.options].some(o => o.value === categoria || o.textContent === categoria)) { const op = document.createElement("option"); op.value = categoria; op.textContent = categoria; generoSelect.appendChild(op); }
            generoSelect.value = categoria;
            $("pfEditorEdad").value = "Pendiente de verificar";
            $("pfEditorUrl").value = detalle.website && /^https:\/\//i.test(detalle.website) ? detalle.website : `https://rawg.io/games/${encodeURIComponent(juego.rawgSlug || juego.slug)}`;
            $("pfEditorImagen").value = juego.imagen || "";
            $("pfEditorStreamers").value = "";
            $("pfEditorDescripcion").value = (detalle.description_raw || juego.descripcion || "").replace(/<[^>]*>/g, " ").slice(0, 1000);
            const pc = (detalle.platforms || []).find(x => /pc|windows/i.test(x.platform?.name || ""))?.requirements || {};
            $("pfEditorReqMin").value = pc.minimum || juego.requisitos_minimos || "";
            $("pfEditorReqRec").value = pc.recommended || juego.requisitos_recomendados || "";
            $("pfEditorInfantil").checked = false; $("pfEditorAprobado").checked = false;
            $("pfEditorGuardar").textContent = "Guardar juego";
            $("pfEditorMensaje").textContent = detalle.website ? "Datos importados de RAWG. Revisa la categoría, edad y requisitos antes de publicar." : "Datos importados. El enlace actual es la ficha RAWG, no un sitio oficial; reemplázalo por la página oficial del juego antes de guardar.";
            location.hash = "#proponer"; form.scrollIntoView({behavior:"smooth",block:"start"});
        });
        enlaces.appendChild(importar);
    }
    const calificacionBox = document.createElement("div"); calificacionBox.className = "calificacion-catalogo";
    const resumen = document.createElement("span"); resumen.className = "resumen-calificacion"; resumen.dataset.resumenSlug = juego.slug;
    const select = document.createElement("select"); select.setAttribute("aria-label", `Tu calificación para ${juego.nombre}`); select.dataset.calificar = juego.slug;
    select.innerHTML = '<option value="">Tu nota</option><option value="1">1 ★</option><option value="2">2 ★★</option><option value="3">3 ★★★</option><option value="4">4 ★★★★</option><option value="5">5 ★★★★★</option>';
    select.value = pfCalificacionesUsuario[juego.slug] ? String(pfCalificacionesUsuario[juego.slug]) : "";
    const calificar = document.createElement("button"); calificar.type = "button"; calificar.className = "boton-mini"; calificar.textContent = "Calificar";
    calificar.addEventListener("click", async () => {
        const puntos = Number(select.value);
        if (!puntos || puntos < 1 || puntos > 5) { mensaje("mensajeBusqueda", "Elige una calificación del 1 al 5."); return; }
        if (usuario && supabase) {
            const { error } = await supabase.from("videojuego_calificaciones").upsert({ usuario_id: usuario.id, slug: juego.slug, puntuacion: puntos }, { onConflict: "usuario_id,slug" });
            if (error) { mensaje("mensajeBusqueda", "No se pudo guardar la calificación en la cuenta. Ejecuta el SQL y vuelve a probar."); console.error(error); return; }
        }
        const locales = pfLeerJSONLocal(PF_CLAVE_CALIFICACIONES_LOCAL, {}); locales[juego.slug] = puntos; pfGuardarJSONLocal(PF_CLAVE_CALIFICACIONES_LOCAL, locales);
        pfCalificacionesUsuario[juego.slug] = puntos;
        await pfCargarResumenCalificaciones(); pfActualizarResumenTarjetas();
        mensaje("mensajeBusqueda", usuario ? "Tu calificación se guardó en tu cuenta." : "Calificación guardada en este navegador. Inicia sesión para sincronizarla entre dispositivos.");
    });
    calificacionBox.append(resumen, select, calificar);
    const favorito = document.createElement("button"); favorito.type = "button"; favorito.className = "boton-favorito"; favorito.dataset.favorito = juego.slug; favorito.setAttribute("aria-pressed", "false"); favorito.textContent = "☆ Añadir a favoritos";
    favorito.addEventListener("click", async () => {
        const id = juego.slug; const favoritos = leerFavoritos();
        const siguiente = favoritos.includes(id) ? favoritos.filter(x => x !== id) : [...favoritos, id];
        guardarFavoritos(siguiente); actualizarBotonesFavoritos();
        pfFiltrosActualizados();
        await guardarFavoritoNube(id, siguiente.includes(id));
    });
    info.append(genero, titulo, desc, edad, requisitos, bloqueStreamers, enlaces, calificacionBox, favorito);
    articulo.append(figura, info);
    return articulo;
}
function pfGeneroCoincide(generoJuego, categoria, juego = {}) {
    const g = pfNormalizarBusqueda(generoJuego || "");
    const c = pfNormalizarBusqueda(categoria || "");
    if (!c) return true;
    const tiene = (...palabras) => palabras.some(p => g.includes(p));
    switch (c) {
        case "accion":
            return tiene("accion", "action", "shooter", "disparos", "battle royale", "hack and slash", "hero shooter") || g === "moba";
        case "carreras":
            return tiene("carreras", "racing", "conduccion", "kart", "motorsport");
        case "aventura":
            return tiene("aventura", "adventure", "exploracion", "exploration", "mundo abierto", "open world", "metroidvania", "sandbox");
        case "estrategia":
            return tiene("estrategia", "strategy", "tactics", "tactica", "turnos", "real-time strategy", "rts", "moba");
        case "supervivencia":
            return tiene("supervivencia", "survival", "crafting", "supervivencia");
        case "terror":
            return tiene("terror", "horror", "survival horror", "psychological horror");
        case "rpg":
            return tiene("rpg", "mmorpg", "arpg", "rol", "role-playing", "role playing", "action rpg");
        case "deportes":
            return tiene("deporte", "sports", "futbol", "football", "soccer", "basketball", "baloncesto", "tennis", "tenis", "wrestling", "lucha libre");
        case "simulacion":
            return tiene("simulacion", "simulation", "simulator", "simulador", "gestion", "management", "granja", "farming", "city builder");
        case "cooperativo":
            return Boolean(juego.cooperativo) || tiene("cooperativo", "co-op", "coop", "cooperative", "multiplayer", "multijugador", "party game", "online co-op");
        case "familiar":
            return Boolean(juego.infantil) || tiene("familiar", "family", "party game", "educational") || ["3+", "7+"].includes(String(juego.edad || ""));
        case "disparos":
            return tiene("disparos", "shooter", "fps", "third-person shooter", "tps");
        case "moba":
            return tiene("moba", "multiplayer online battle arena");
        case "battle royale":
            return tiene("battle royale", "battle-royale");
        case "indie":
            return Boolean(juego.indie) || tiene("indie", "independent");
        case "sandbox":
            return tiene("sandbox", "mundo abierto", "open world", "building");
        default:
            return g.includes(c) || c.includes(g);
    }
}

function pfCoincideFiltros(juego) {
    const busqueda = pfNormalizarBusqueda($("buscadorJuegos")?.value || "");
    const genero = pfNormalizarBusqueda($("filtroGeneroCatalogo")?.value || "");
    const edad = $("filtroEdadCatalogo")?.value || "";
    const esInfantil = document.body.dataset.modoKids === "true";
    const textoJuego = pfNormalizarBusqueda(`${juego.nombre} ${juego.genero} ${juego.descripcion} ${juego.streamers}`);
    return (!busqueda || textoJuego.includes(busqueda))
        && pfGeneroCoincide(juego.genero, genero, juego)
        && (!edad || juego.edad === edad)
        && (!soloFavoritos || leerFavoritos().includes(juego.slug))
        && (!esInfantil || juego.infantil);
}
function pfPintarCatalogoActual() {
    const normal = document.getElementById("catalogoDinamico");
    const input = $("buscadorJuegos");
    const query = (input?.value || "").trim();
    if (!normal) return;

    normal.replaceChildren();
    const nombresDestacados = new Set([...document.querySelectorAll(".contenedor-juegos .juego h3")].map(titulo => pfNormalizarBusqueda(titulo.textContent)));
    const resultadosExternos = query.length >= 2 && pfTerminoWikidata === query
        ? pfResultadosWikidata.map(pfNormalizarJuego).filter(j => !nombresDestacados.has(pfNormalizarBusqueda(j.nombre)))
        : [];
    const todos = [
        ...(window.PIXELFORGE_CATALOGO || []).map(pfNormalizarJuego).map(j => ({ ...j, deBase: true })),
        ...pfJuegosBD.map(pfNormalizarJuego).filter(j => !nombresDestacados.has(pfNormalizarBusqueda(j.nombre))),
        ...(window.pfJuegosRawg || []).map(pfNormalizarJuego).filter(j => !nombresDestacados.has(pfNormalizarBusqueda(j.nombre))),
        ...resultadosExternos
    ];
    const unicos = new Map();
    todos.forEach(j => unicos.set(j.slug, j));
    const visibles = [...unicos.values()].filter(pfCoincideFiltros);
    visibles.forEach(j => normal.appendChild(pfCrearTarjetaJuego(j)));
    aplicarFiltroJuegos();
    const destacadosVisibles = [...document.querySelectorAll(".contenedor-juegos .juego")].filter(card => !card.hidden).length;

    if (!visibles.length) {
        const aviso = document.createElement("p");
        aviso.className = "mensaje-catalogo-vacio";
        if (query.length >= 2 && pfWikidataCargando) {
            aviso.textContent = "Buscando videojuegos en Wikidata...";
        } else if (query.length >= 2 && pfWikidataError) {
            aviso.textContent = destacadosVisibles
                ? "No pude conectar con Wikidata. Hay coincidencias en los juegos destacados de arriba."
                : "No pude conectar con la búsqueda de Wikidata. Puedes seguir buscando en los juegos destacados y los aprobados por la comunidad.";
        } else if (query.length >= 2 && destacadosVisibles) {
            aviso.textContent = "No hay coincidencias adicionales en el catálogo de la comunidad. Revisa también los juegos destacados que aparecen arriba.";
        } else if (query.length >= 2) {
            aviso.textContent = "No se encontraron coincidencias en los juegos aprobados ni en Wikidata. Prueba el nombre oficial del juego o revisa tu conexión.";
        } else {
            aviso.textContent = "Los videojuegos aprobados por la comunidad aparecerán aquí. Usa el buscador para consultar más juegos sin cargar un catálogo fijo.";
        }
        normal.appendChild(aviso);
    }

    const total = destacadosVisibles + visibles.length;
    if (query.length >= 2 && pfWikidataCargando) {
        mensaje("mensajeBusqueda", total ? `Se muestran ${total} coincidencia(s) local(es); buscando más videojuegos...` : "Buscando videojuegos en la base local y Wikidata...");
    } else if (!total) {
        mensaje("mensajeBusqueda", query ? "No se encontraron videojuegos con ese nombre o filtros." : "No hay videojuegos que coincidan con los filtros actuales.");
    } else if (query.length >= 2 && pfResultadosWikidata.length) {
        mensaje("mensajeBusqueda", `Se encontraron ${total} resultado(s). Los resultados de Wikidata son informativos y no se guardan en Supabase automáticamente.`);
    } else {
        mensaje("mensajeBusqueda", `Coincidencias visibles: ${total}.`);
    }
    pfActualizarResumenTarjetas();
}

function pfRenderCatalogos() {
    pfPintarCatalogoActual();
    const kids = document.getElementById("catalogoInfantil");
    if (kids) {
        kids.replaceChildren();
        const todos = [...(window.PIXELFORGE_CATALOGO || []).map(pfNormalizarJuego), ...pfJuegosBD.map(pfNormalizarJuego)];
        const unicos = new Map();
        todos.forEach(j => { if (j.infantil) unicos.set(j.slug, j); });
        const infantiles = [...unicos.values()];
        infantiles.forEach(j => kids.appendChild(pfCrearTarjetaJuego(j)));
        if (!infantiles.length) {
            const aviso = document.createElement("p");
            aviso.className = "mensaje-catalogo-vacio";
            aviso.textContent = "La zona infantil mostrará aquí los juegos aprobados que tengan una edad sugerida infantil. Revisa siempre la clasificación oficial.";
            kids.appendChild(aviso);
        }
    }
    actualizarBotonesFavoritos();
    pfActualizarResumenTarjetas();
}

async function pfConsultarWikidata(termino, signal) {
    const textoSeguro = String(termino).replace(/\\/g, "\\\\").replace(/"/g, '\\"').slice(0, 100);
    const sparql = `SELECT ?item ?itemLabel ?itemDescription ?releaseDate ?officialWebsite WHERE {
      SERVICE wikibase:mwapi {
        bd:serviceParam wikibase:api "EntitySearch";
          wikibase:endpoint "www.wikidata.org";
          mwapi:search "${textoSeguro}";
          mwapi:language "es".
        ?item wikibase:apiOutputItem mwapi:item.
      }
      ?item wdt:P31/wdt:P279* wd:Q7889.
      OPTIONAL { ?item wdt:P577 ?releaseDate. }
      OPTIONAL { ?item wdt:P856 ?officialWebsite. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
    }
    LIMIT 10`;
    const url = "https://query.wikidata.org/sparql?query=" + encodeURIComponent(sparql) + "&format=json";
    const respuesta = await fetch(url, {
        method: "GET",
        headers: { "Accept": "application/sparql-results+json" },
        signal,
        cache: "no-store"
    });
    if (!respuesta.ok) throw new Error(`Wikidata respondió HTTP ${respuesta.status}.`);
    const json = await respuesta.json();
    const bindings = json?.results?.bindings;
    if (!Array.isArray(bindings)) throw new Error("Wikidata devolvió una respuesta que no pude reconocer.");
    return bindings.map(registro => {
        const itemUrl = registro.item?.value || "";
        const id = itemUrl.split("/").pop();
        const nombre = registro.itemLabel?.value || "Videojuego";
        const descripcionApi = registro.itemDescription?.value || "Videojuego encontrado en Wikidata.";
        const fecha = registro.releaseDate?.value ? registro.releaseDate.value.slice(0, 10) : "";
        const sitio = registro.officialWebsite?.value || "";
        return {
            slug: `wikidata-${id || pfSlug(nombre)}`,
            nombre,
            genero: "Videojuego",
            edad: "Pendiente de verificar",
            descripcion: fecha ? `${descripcionApi} · Lanzamiento registrado: ${fecha}.` : descripcionApi,
            url: /^https:\/\//i.test(sitio) ? sitio : "",
            url_wikidata: itemUrl,
            url_streamers: `https://www.twitch.tv/search?term=${encodeURIComponent(nombre)}`,
            streamers: "Busca creadores que transmiten este videojuego",
            infantil: false,
            deBase: false,
            fuenteWikidata: true
        };
    }).filter(juego => juego.nombre && juego.slug);
}

function pfProgramarBusquedaWikidata() {
    const termino = ($("buscadorJuegos")?.value || "").trim();
    if (pfWikidataTimer) clearTimeout(pfWikidataTimer);
    if (pfWikidataController) pfWikidataController.abort();
    pfWikidataCargando = false;
    pfWikidataError = false;

    if (termino.length < 2) {
        pfTerminoWikidata = "";
        pfResultadosWikidata = [];
        pfPintarCatalogoActual();
        return;
    }

    if (termino !== pfTerminoWikidata) {
        pfTerminoWikidata = termino;
        pfResultadosWikidata = [];
    }
    if (pfCacheWikidata.has(termino)) {
        pfResultadosWikidata = pfCacheWikidata.get(termino);
        pfPintarCatalogoActual();
        return;
    }

    pfWikidataCargando = true;
    pfPintarCatalogoActual();
    pfWikidataTimer = window.setTimeout(async () => {
        const controlador = new AbortController();
        pfWikidataController = controlador;
        try {
            let resultados = await pfConsultarWikidata(termino, controlador.signal);
            if (controlador.signal.aborted || termino !== ($("buscadorJuegos")?.value || "").trim()) return;
            // Si la búsqueda en español no devuelve registros, intenta la consulta con la escritura en inglés.
            if (!resultados.length) {
                resultados = await pfConsultarWikidataIngles(termino, controlador.signal);
            }
            if (controlador.signal.aborted || termino !== ($("buscadorJuegos")?.value || "").trim()) return;
            pfResultadosWikidata = resultados;
            pfCacheWikidata.set(termino, resultados);
        } catch (error) {
            if (error?.name !== "AbortError") {
                console.warn("No se pudo buscar en Wikidata:", error);
                pfResultadosWikidata = [];
                pfWikidataError = true;
            }
        } finally {
            if (!controlador.signal.aborted && termino === ($("buscadorJuegos")?.value || "").trim()) {
                pfWikidataCargando = false;
                pfPintarCatalogoActual();
            }
        }
    }, 450);
}
async function pfConsultarWikidataIngles(termino, signal) {
    // Segunda consulta idéntica con el texto de búsqueda en inglés, por si la primera no encontró títulos.
    const textoSeguro = String(termino).replace(/\\/g, "\\\\").replace(/"/g, '\\"').slice(0, 100);
    const sparql = `SELECT ?item ?itemLabel ?itemDescription ?releaseDate ?officialWebsite WHERE {
      SERVICE wikibase:mwapi {
        bd:serviceParam wikibase:api "EntitySearch";
          wikibase:endpoint "www.wikidata.org";
          mwapi:search "${textoSeguro}";
          mwapi:language "en".
        ?item wikibase:apiOutputItem mwapi:item.
      }
      ?item wdt:P31/wdt:P279* wd:Q7889.
      OPTIONAL { ?item wdt:P577 ?releaseDate. }
      OPTIONAL { ?item wdt:P856 ?officialWebsite. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en,es". }
    }
    LIMIT 10`;
    const url = "https://query.wikidata.org/sparql?query=" + encodeURIComponent(sparql) + "&format=json";
    const respuesta = await fetch(url, { headers: { "Accept": "application/sparql-results+json" }, signal, cache: "no-store" });
    if (!respuesta.ok) throw new Error(`Wikidata respondió HTTP ${respuesta.status}.`);
    const json = await respuesta.json();
    if (!Array.isArray(json?.results?.bindings)) return [];
    return json.results.bindings.map(registro => {
        const itemUrl = registro.item?.value || "";
        const id = itemUrl.split("/").pop();
        const nombre = registro.itemLabel?.value || "Videojuego";
        const description = registro.itemDescription?.value || "Videojuego encontrado en Wikidata.";
        const fecha = registro.releaseDate?.value ? registro.releaseDate.value.slice(0, 10) : "";
        const sitio = registro.officialWebsite?.value || "";
        return { slug: `wikidata-${id || pfSlug(nombre)}`, nombre, genero: "Videojuego", edad: "Pendiente de verificar", descripcion: fecha ? `${description} · Lanzamiento registrado: ${fecha}.` : description, url: /^https:\/\//i.test(sitio) ? sitio : "", url_wikidata: itemUrl, url_streamers: `https://www.twitch.tv/search?term=${encodeURIComponent(nombre)}`, streamers: "Busca creadores que transmiten este videojuego", infantil: false, deBase: false, fuenteWikidata: true };
    }).filter(juego => juego.nombre && juego.slug);
}

// RAWG: catálogo mucho más amplio (requiere una clave gratuita del proveedor).
window.pfJuegosRawg = window.pfJuegosRawg || [];
let pfRawgTemporizador = null;
let pfRawgConsultaActual = "";
function pfRawgGeneroParaCategoria(categoria) {
    const c = pfNormalizarBusqueda(categoria);
    const mapa = { accion:"action", carreras:"racing", aventura:"adventure", estrategia:"strategy", terror:"horror", rpg:"role-playing", deportes:"sports", simulacion:"simulation", indie:"indie", sandbox:"sandbox" };
    return mapa[c] || "";
}
function pfMapearJuegoRawg(rawg) {
    const generos = (rawg.genres || []).map(x => x.name).filter(Boolean);
    const tags = (rawg.tags || []).map(x => x.name).filter(Boolean);
    const todosGeneros = [...generos, ...tags].join(", ") || "Otro";
    const edad = rawg.esrb_rating?.name ? rawg.esrb_rating.name : "Pendiente de verificar";
    const plataformasPC = (rawg.platforms || []).map(x => x.platform?.name).filter(Boolean);
    const requisitosPC = (rawg.platforms || []).find(x => /pc|windows/i.test(x.platform?.name || ""))?.requirements || {};
    return {
        slug: `rawg-${rawg.slug || rawg.id}`, nombre: rawg.name || "Videojuego", genero: todosGeneros,
        edad, descripcion: `Juego de RAWG${rawg.released ? ` · Lanzamiento: ${rawg.released}` : ""}${rawg.rating ? ` · Valoración RAWG: ${rawg.rating}/5` : ""}.`,
        url: `https://rawg.io/games/${rawg.slug || rawg.id}`, imagen: rawg.background_image || "",
        streamers: "", url_streamers: pfTwitchBuscar(rawg.name || ""),
        requisitos_minimos: requisitosPC.minimum || "", requisitos_recomendados: requisitosPC.recommended || "",
        fuenteRawg: true, rawgId: rawg.id, rawgSlug: rawg.slug || String(rawg.id), infantil: /everyone|everyone 10\+/i.test(edad),
        rawgPlataformas: plataformasPC.join(", ")
    };
}
async function pfCargarRawgParaCatalogo() {
    const config = window.PIXELFORGE_CONFIG || {};
    const key = String(config.rawgApiKey || "").trim();
    if (!key) return;
    const busqueda = String($("buscadorJuegos")?.value || "").trim();
    const categoria = String($("filtroGeneroCatalogo")?.value || "").trim();
    if (busqueda.length === 1) return;
    const queryKey = `${busqueda.toLowerCase()}|${categoria.toLowerCase()}`;
    if (queryKey === pfRawgConsultaActual) return;
    pfRawgConsultaActual = queryKey;
    const params = new URLSearchParams({ key, page_size: "24", ordering: "-added" });
    if (busqueda.length >= 2) params.set("search", busqueda);
    const genre = pfRawgGeneroParaCategoria(categoria);
    if (genre) params.set("genres", genre);
    if (categoria && ["supervivencia", "cooperativo", "familiar", "disparos", "moba", "battle royale"].includes(pfNormalizarBusqueda(categoria))) {
        const tags = { supervivencia:"survival", cooperativo:"co-op", familiar:"family", disparos:"shooter", moba:"moba", "battle royale":"battle-royale" };
        params.set("tags", tags[pfNormalizarBusqueda(categoria)]);
    }
    try {
        const response = await fetch(`https://api.rawg.io/api/games?${params.toString()}`, { headers: { Accept: "application/json" }, cache: "no-store" });
        if (!response.ok) throw new Error(`RAWG HTTP ${response.status}`);
        const data = await response.json();
        if (queryKey !== pfRawgConsultaActual) return;
        window.pfJuegosRawg = (data.results || []).map(pfMapearJuegoRawg);
        pfPintarCatalogoActual();
    } catch (error) {
        console.warn("RAWG no pudo cargar el catálogo; se conserva el catálogo actual:", error);
        if (queryKey === pfRawgConsultaActual && $("mensajeBusqueda")) mensaje("mensajeBusqueda", "No se pudo cargar RAWG. Comprueba la clave API y la conexión; el catálogo guardado se conserva.");
    }
}
function pfProgramarRawg() {
    if (pfRawgTemporizador) clearTimeout(pfRawgTemporizador);
    pfRawgTemporizador = setTimeout(pfCargarRawgParaCatalogo, 550);
}
function pfFiltrosActualizados() {
    aplicarFiltroJuegos();
    pfPintarCatalogoActual();
    pfProgramarBusquedaWikidata();
    pfProgramarRawg();
}

// Se registra la búsqueda una sola vez y antes de esperar a la red/Supabase.
$("buscadorJuegos")?.addEventListener("input", pfFiltrosActualizados);
$("filtroGeneroCatalogo")?.addEventListener("change", pfFiltrosActualizados);
$("filtroEdadCatalogo")?.addEventListener("change", pfFiltrosActualizados);

// PixelForge V7: enlaza las categorías en cuanto se carga el script, sin esperar a Supabase.
// Así los botones siguen funcionando aunque falle o tarde la consulta a la base de datos.
document.querySelectorAll(".categoria-filtro").forEach(btn => {
    btn.setAttribute("aria-pressed", "false");
    btn.addEventListener("click", () => {
        // La navegación de PixelForge muestra una sola sección a la vez.
        // Ir primero al catálogo evita filtrar una sección que permanece oculta.
        if (window.location.hash !== "#juegos") window.location.hash = "#juegos";
        const cat = String(btn.dataset.genero || "").trim();
        const busqueda = $("buscadorJuegos");
        const filtro = $("filtroGeneroCatalogo");
        const filtroEdad = $("filtroEdadCatalogo");
        const tabTodos = $("tabTodosJuegos");

        // Asegura que los resultados filtrados estén visibles en el catálogo general.
        if (tabTodos && !tabTodos.classList.contains("activa")) tabTodos.click();
        if (busqueda) busqueda.value = "";
        if (filtroEdad) filtroEdad.value = "";

        if (filtro) {
            if (!cat) {
                filtro.value = "";
            } else {
                let opcion = [...filtro.options].find(o =>
                    pfNormalizarBusqueda(o.value || o.textContent) === pfNormalizarBusqueda(cat)
                );
                // Si se añade una categoría nueva al HTML, no se pierde el filtro por falta de opción.
                if (!opcion) {
                    opcion = document.createElement("option");
                    opcion.value = cat;
                    opcion.textContent = cat;
                    filtro.appendChild(opcion);
                }
                filtro.value = opcion.value;
            }
        }

        document.querySelectorAll(".categoria-filtro").forEach(categoriaBtn => {
            const activa = categoriaBtn === btn;
            categoriaBtn.classList.toggle("activa", activa);
            categoriaBtn.setAttribute("aria-pressed", String(activa));
        });

        pfFiltrosActualizados();
        $("juegos")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
});

async function pfCargarCatalogoBD() {
    if (!supabase) return;
    const { data, error } = await supabase.from("catalogo_publico").select("slug,nombre,genero,descripcion,clasificacion_edad,sitio_oficial,imagen_url,streamers,es_infantil,requisitos_minimos,requisitos_recomendados").eq("aprobado", true).order("nombre", { ascending: true }).limit(500);
    if (error) { console.warn("Catálogo de Supabase no disponible todavía. El catálogo base seguirá funcionando.", error.message); return; }
    pfJuegosBD = (data || []).map(row => ({ ...row, edad: row.clasificacion_edad, url: row.sitio_oficial, imagen: row.imagen_url, infantil: row.es_infantil, deBase: false }));
}
async function guardarFavoritoNube(slug, guardado) {
    if (!supabase || !usuario) return;
    try {
        if (guardado) {
            const { error } = await supabase.from("videojuego_favoritos").upsert({ usuario_id: usuario.id, slug }, { onConflict: "usuario_id,slug" });
            if (error) throw error;
        } else {
            const { error } = await supabase.from("videojuego_favoritos").delete().eq("usuario_id", usuario.id).eq("slug", slug);
            if (error) throw error;
        }
    } catch (error) { console.error("Favorito no pudo sincronizarse:", error); mensaje("mensajeBusqueda", "El favorito queda guardado en este navegador, pero no se sincronizó con Supabase. Revisa el SQL."); }
}
async function pfCargarFavoritosUsuario() {
    if (!supabase || !usuario) { actualizarBotonesFavoritos(); return; }
    const locales = leerFavoritos();
    const { data, error } = await supabase.from("videojuego_favoritos").select("slug").eq("usuario_id", usuario.id);
    if (error) { console.warn("No se pudieron recuperar favoritos de la cuenta:", error.message); return; }
    const remotos = (data || []).map(x => x.slug);
    const combinados = [...new Set([...remotos, ...locales])];
    guardarFavoritos(combinados);
    for (const slug of combinados) {
        if (!remotos.includes(slug)) await guardarFavoritoNube(slug, true);
    }
    actualizarBotonesFavoritos();
}
async function pfCargarCalificacionesUsuario() {
    pfCalificacionesUsuario = pfLeerJSONLocal(PF_CLAVE_CALIFICACIONES_LOCAL, {});
    if (!supabase || !usuario) return;
    const { data, error } = await supabase.from("videojuego_calificaciones").select("slug,puntuacion").eq("usuario_id", usuario.id);
    if (error) { console.warn("No se pudieron cargar las calificaciones:", error.message); return; }
    (data || []).forEach(r => { pfCalificacionesUsuario[r.slug] = r.puntuacion; });
    pfGuardarJSONLocal(PF_CLAVE_CALIFICACIONES_LOCAL, pfCalificacionesUsuario);
}
async function pfCargarResumenCalificaciones() {
    if (!supabase) return;
    const { data, error } = await supabase.from("resumen_calificaciones_videojuegos").select("slug,promedio,total");
    if (error) { console.warn("Resumen de calificaciones no disponible aún:", error.message); return; }
    pfCalificacionesResumen = {};
    (data || []).forEach(r => { pfCalificacionesResumen[r.slug] = { promedio: Number(r.promedio) || 0, total: Number(r.total) || 0 }; });
}
const pfCargarCalificacionesResumen = pfCargarResumenCalificaciones;
function pfActualizarResumenTarjetas() {
    document.querySelectorAll("[data-resumen-slug]").forEach(el => {
        const slug = el.dataset.resumenSlug; const r = pfCalificacionesResumen[slug];
        el.textContent = r && r.total ? `Comunidad: ${r.promedio.toFixed(1)}/5 (${r.total})` : "Comunidad: sin calificaciones";
    });
    document.querySelectorAll("select[data-calificar]").forEach(select => {
        const slug = select.dataset.calificar;
        if (pfCalificacionesUsuario[slug]) select.value = String(pfCalificacionesUsuario[slug]);
    });
}
async function pfVerificarAdmin() {
    const estado = $("pfEstadoAdmin");
    const zona = $("zonaModeracionCatalogo");
    if (!supabase || !usuario || usuario.id === "invitado-local") {
        pfEsAdmin = false;
        if (zona) zona.hidden = true;
        if (estado) estado.textContent = !supabase
            ? "No se pudo conectar con Supabase. Revisa la conexión y la consola del navegador."
            : "Inicia sesión con la cuenta que habilitaste como administradora en Supabase para mostrar el panel.";
        window.dispatchEvent(new Event("pixelforge:admin-state"));
        return;
    }
    const { data, error } = await supabase.from("pixelforge_admins").select("user_id").eq("user_id", usuario.id).maybeSingle();
    pfEsAdmin = !error && Boolean(data);
    if (zona) zona.hidden = !pfEsAdmin;
    if (estado) {
        estado.textContent = error
            ? `No se pudo verificar el permiso de administrador. Detalle: ${error.code || "sin código"} — ${error.message || "error de Supabase"}`
            : pfEsAdmin
                ? "Acceso de administrador confirmado. Puedes revisar propuestas y editar el catálogo más abajo."
                : "Has iniciado sesión, pero esta cuenta aún no está registrada como administradora. Ejecuta PASO_ADMINISTRADOR_V8.sql con el correo exacto de tu cuenta.";
    }
    if (error) console.error("PixelForge no pudo comprobar el administrador:", error);
    window.dispatchEvent(new Event("pixelforge:admin-state"));
    pfInicializarEditorCatalogo();
    if (pfEsAdmin) { await pfCargarPropuestasAdmin(); await pfCargarCatalogoAdmin(); }
}
async function pfCargarPropuestasAdmin() {
    if (!pfEsAdmin || !supabase) return;
    const contenedor = $("listaPropuestasPendientes"); if (!contenedor) return;
    const { data, error } = await supabase.from("propuestas_videojuegos").select("id,nombre,genero,clasificacion_edad,sitio_oficial,imagen_url,streamers,descripcion,estado,creado_en").eq("estado", "pendiente").order("creado_en", { ascending: true }).limit(100);
    contenedor.replaceChildren();
    if (error) { const p = document.createElement("p"); p.textContent = "No se pudieron cargar propuestas. Ejecuta el SQL de PixelForge."; contenedor.appendChild(p); console.warn(error); return; }
    if (!data?.length) { const p = document.createElement("p"); p.textContent = "No hay propuestas pendientes."; contenedor.appendChild(p); return; }
    data.forEach(p => {
        const card = document.createElement("article"); card.className = "tarjeta-publicacion";
        const title = document.createElement("h4"); title.textContent = p.nombre;
        const detail = document.createElement("p"); detail.textContent = `${p.genero} · ${p.clasificacion_edad} · ${p.descripcion || "Sin descripción"}`;
        const url = pfCrearEnlace(p.sitio_oficial, "Abrir página propuesta");
        const actions = document.createElement("div"); actions.className = "acciones-formulario";
        const approve = document.createElement("button"); approve.type = "button"; approve.className = "boton"; approve.textContent = "Aprobar y publicar";
        approve.addEventListener("click", async () => {
            botonCargando(approve, true, "Publicando...");
            try {
                const slugBase = pfSlug(p.nombre);
                const { error: insertError } = await supabase.from("catalogo_publico").upsert({ slug: slugBase, nombre: p.nombre, genero: p.genero, descripcion: p.descripcion || "Propuesto por la comunidad PixelForge.", clasificacion_edad: p.clasificacion_edad || "Pendiente de verificar", sitio_oficial: p.sitio_oficial, imagen_url: p.imagen_url || null, streamers: p.streamers || null, es_infantil: ["3+", "7+"].includes(p.clasificacion_edad), aprobado: true }, { onConflict: "slug" });
                if (insertError) throw insertError;
                const { error: updateError } = await supabase.from("propuestas_videojuegos").update({ estado: "aprobada" }).eq("id", p.id);
                if (updateError) throw updateError;
                await pfCargarCatalogoBD(); pfRenderCatalogos(); await pfCargarPropuestasAdmin();
            } catch (e) { mensaje("mensajePropuesta", "No se pudo aprobar: " + (e.message || "comprueba las políticas SQL")); }
            finally { botonCargando(approve, false); }
        });
        const reject = document.createElement("button"); reject.type = "button"; reject.className = "boton boton-secundario"; reject.textContent = "Rechazar";
        reject.addEventListener("click", async () => {
            if (!confirm(`¿Rechazar la propuesta “${p.nombre}”?`)) return;
            const { error: updateError } = await supabase.from("propuestas_videojuegos").update({ estado: "rechazada" }).eq("id", p.id);
            if (updateError) mensaje("mensajePropuesta", "No se pudo rechazar: " + updateError.message); else await pfCargarPropuestasAdmin();
        });
        actions.append(approve, reject); card.append(title, detail, url, actions); contenedor.appendChild(card);
    });
}
async function pfCargarCatalogoAdmin() {
    if (!pfEsAdmin || !supabase) return;
    const lista = $("pfEditorListaCatalogo");
    if (!lista) return;
    lista.replaceChildren();
    const { data, error } = await supabase.from("catalogo_publico")
        .select("slug,nombre,genero,descripcion,clasificacion_edad,sitio_oficial,imagen_url,streamers,es_infantil,aprobado,requisitos_minimos,requisitos_recomendados")
        .order("nombre", { ascending: true }).limit(500);
    if (error) {
        const p = document.createElement("p");
        p.textContent = "No se pudo leer el catálogo de Supabase. Ejecuta pixelforge_v8_migracion.sql y revisa la consola.";
        lista.appendChild(p); console.warn("Editor de catálogo PixelForge:", error); return;
    }
    if (!data?.length) {
        const p = document.createElement("p"); p.textContent = "La tabla está lista, pero aún no tiene juegos guardados."; lista.appendChild(p); return;
    }
    data.forEach(juego => {
        const card = document.createElement("article"); card.className = "tarjeta-publicacion pf-admin-juego";
        const title = document.createElement("h4"); title.textContent = juego.nombre;
        const detail = document.createElement("p"); detail.textContent = `${juego.genero} · ${juego.clasificacion_edad} · ${juego.aprobado ? "Publicado" : "Borrador"}`;
        const actions = document.createElement("div"); actions.className = "acciones-formulario";
        const edit = document.createElement("button"); edit.type = "button"; edit.className = "boton boton-secundario"; edit.textContent = "Editar";
        edit.addEventListener("click", () => {
            const form = $("pfEditorCatalogoForm");
            $("pfEditorSlug").value = juego.slug || ""; $("pfEditorSlug").readOnly = true;
            $("pfEditorNombre").value = juego.nombre || "";
            const generoSelect = $("pfEditorGenero");
            const generoActual = juego.genero || "Otro";
            if (generoSelect && ![...generoSelect.options].some(o => o.value === generoActual || o.textContent === generoActual)) {
                const opcionGenero = document.createElement("option"); opcionGenero.value = generoActual; opcionGenero.textContent = generoActual; generoSelect.appendChild(opcionGenero);
            }
            if (generoSelect) generoSelect.value = generoActual;
            const edadSelect = $("pfEditorEdad");
            const edadActual = juego.clasificacion_edad || "Pendiente de verificar";
            if (edadSelect && ![...edadSelect.options].some(o => o.value === edadActual || o.textContent === edadActual)) {
                const opcionEdad = document.createElement("option"); opcionEdad.value = edadActual; opcionEdad.textContent = edadActual; edadSelect.appendChild(opcionEdad);
            }
            if (edadSelect) edadSelect.value = edadActual;
            $("pfEditorUrl").value = juego.sitio_oficial || ""; $("pfEditorImagen").value = juego.imagen_url || "";
            $("pfEditorStreamers").value = juego.streamers || ""; $("pfEditorDescripcion").value = juego.descripcion || "";
            if ($("pfEditorReqMin")) $("pfEditorReqMin").value = juego.requisitos_minimos || "";
            if ($("pfEditorReqRec")) $("pfEditorReqRec").value = juego.requisitos_recomendados || "";
            $("pfEditorInfantil").checked = Boolean(juego.es_infantil); $("pfEditorAprobado").checked = Boolean(juego.aprobado);
            $("pfEditorGuardar").textContent = "Guardar cambios";
            $("pfEditorMensaje").textContent = `Editando: ${juego.nombre}. El identificador no cambia.`;
            form?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        const del = document.createElement("button"); del.type = "button"; del.className = "boton boton-secundario"; del.textContent = "Eliminar";
        del.addEventListener("click", async () => {
            if (!confirm(`¿Eliminar “${juego.nombre}” del catálogo público? Esta acción no elimina publicaciones ni la biblioteca personal.`)) return;
            del.disabled = true;
            try {
                const { error: deleteError } = await supabase.from("catalogo_publico").delete().eq("slug", juego.slug);
                if (deleteError) throw deleteError;
                await pfCargarCatalogoBD(); pfRenderCatalogos(); await pfCargarCatalogoAdmin();
                $("pfEditorMensaje").textContent = `Se eliminó “${juego.nombre}” del catálogo público.`;
            } catch (e) {
                $("pfEditorMensaje").textContent = "No se pudo eliminar. Comprueba el permiso de administrador y las políticas RLS.";
                console.error("Error al eliminar del catálogo:", e);
            } finally { del.disabled = false; }
        });
        actions.append(edit, del); card.append(title, detail, actions); lista.appendChild(card);
    });
}

function pfInicializarEditorCatalogo() {
    const form = $("pfEditorCatalogoForm");
    if (!form || form.dataset.inicializado === "true") return;
    form.dataset.inicializado = "true";
    $("pfEditorNuevo")?.addEventListener("click", () => {
        form.reset(); $("pfEditorSlug").readOnly = false; $("pfEditorGuardar").textContent = "Guardar juego";
        $("pfEditorMensaje").textContent = "Formulario listo para un juego nuevo.";
    });
    $("pfEditorCancelar")?.addEventListener("click", () => {
        form.reset(); $("pfEditorSlug").readOnly = false; $("pfEditorGuardar").textContent = "Guardar juego";
        $("pfEditorMensaje").textContent = "Edición cancelada.";
    });
    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (!pfEsAdmin || !supabase) { $("pfEditorMensaje").textContent = "Inicia sesión con una cuenta administradora para modificar el catálogo."; return; }
        const nombre = $("pfEditorNombre").value.trim();
        const slug = ($("pfEditorSlug").value.trim() || pfSlug(nombre)).toLowerCase();
        const url = $("pfEditorUrl").value.trim(); const imagen = $("pfEditorImagen").value.trim();
        const esHttps = value => { try { return new URL(value).protocol === "https:"; } catch { return false; } };
        if (!nombre || nombre.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) { $("pfEditorMensaje").textContent = "Escribe un nombre y un identificador simple (ej. mi-videojuego)."; return; }
        if (!esHttps(url) || (imagen && !esHttps(imagen))) { $("pfEditorMensaje").textContent = "La página oficial es obligatoria y debe comenzar con https://; la imagen también, si la usas."; return; }
        const btn = $("pfEditorGuardar"); btn.disabled = true; btn.textContent = "Guardando...";
        try {
            const payload = {
                slug, nombre, genero: $("pfEditorGenero").value,
                clasificacion_edad: $("pfEditorEdad").value,
                sitio_oficial: url, imagen_url: imagen || null,
                streamers: $("pfEditorStreamers").value.trim() || null,
                descripcion: $("pfEditorDescripcion").value.trim() || null,
                requisitos_minimos: $("pfEditorReqMin")?.value.trim() || null,
                requisitos_recomendados: $("pfEditorReqRec")?.value.trim() || null,
                es_infantil: $("pfEditorInfantil").checked,
                aprobado: $("pfEditorAprobado").checked
            };
            const { error } = await supabase.from("catalogo_publico").upsert(payload, { onConflict: "slug" });
            if (error) throw error;
            form.reset(); $("pfEditorSlug").readOnly = false; btn.textContent = "Guardar juego";
            $("pfEditorMensaje").textContent = `“${nombre}” se guardó en Supabase.`;
            await pfCargarCatalogoBD(); pfRenderCatalogos(); await pfCargarCatalogoAdmin();
        } catch (error) {
            console.error("No se pudo guardar el videojuego en Supabase:", error);
            $("pfEditorMensaje").textContent = "No se pudo guardar. Revisa que tu cuenta esté en pixelforge_admins y ejecuta el SQL V8.";
        } finally { btn.disabled = false; if (btn.textContent === "Guardando...") btn.textContent = "Guardar juego"; }
    });
}

async function pfEnviarPropuesta(evento) {
    evento.preventDefault();
    if (!supabase) { mensaje("mensajePropuesta", "No se ha conectado Supabase. Comprueba tu internet y la configuración."); return; }
    const nombre = $("propuestaNombre").value.trim();
    const genero = $("propuestaGenero").value;
    const edad = $("propuestaEdad").value;
    const sitio = $("propuestaUrl").value.trim();
    const imagen = $("propuestaImagen").value.trim();
    const streamers = $("propuestaStreamers").value.trim();
    const descripcion = $("propuestaDescripcion").value.trim();
    const validarHttps = (valor) => { try { const u = new URL(valor); return u.protocol === "https:"; } catch { return false; } };
    if (!nombre || !validarHttps(sitio) || (imagen && !validarHttps(imagen))) { mensaje("mensajePropuesta", "Escribe un nombre y enlaces https válidos. No se aceptan páginas inseguras."); return; }
    const boton = $("enviarPropuesta"); botonCargando(boton, true, "Enviando...");
    try {
        const { error } = await supabase.from("propuestas_videojuegos").insert({ nombre, genero, clasificacion_edad: edad, sitio_oficial: sitio, imagen_url: imagen || null, streamers: streamers || null, descripcion: descripcion || null, creado_por: (usuario?.id && usuario.id !== "invitado-local") ? usuario.id : null, estado: "pendiente" });
        if (error) throw error;
        $("formPropuestaJuego").reset();
        mensaje("mensajePropuesta", "¡Propuesta recibida! Se guardó en la base de datos y quedará pendiente de revisión antes de aparecer en el catálogo.");
        if (pfEsAdmin) await pfCargarPropuestasAdmin();
    } catch (error) {
        console.error("Error al enviar propuesta:", error);
        mensaje("mensajePropuesta", "No se pudo guardar la propuesta. Ejecuta el archivo SQL de PixelForge en Supabase y vuelve a intentar. Detalle: " + (error.message || "error de conexión"));
    } finally { botonCargando(boton, false); }
}

/* ================= PIXELFORGE: API EXTERNA DE VIDEOJUEGOS (FreeToGame) ================= */
let pfJuegosApi = [];
let pfApiCargando = false;

function pfNormalizarGeneroApi(genero) {
    const g = String(genero || "").toLowerCase();
    if (g.includes("shooter") || g.includes("fps")) return "Disparos";
    if (g.includes("battle royale")) return "Battle royale";
    if (g.includes("rpg") || g.includes("mmo")) return "RPG";
    if (g.includes("strategy") || g.includes("moba")) return "Estrategia";
    if (g.includes("racing")) return "Carreras";
    if (g.includes("sports")) return "Deportes";
    if (g.includes("survival")) return "Supervivencia";
    return "Acción";
}

async function pfCargarJuegosApi(categoria = "") {
    const contenedor = $("contenedorApiJuegos");
    if (!contenedor) return;

    if (pfApiCargando) return;
    pfApiCargando = true;
    contenedor.innerHTML = '<p class="mensaje-catalogo-vacio">⚡ Consultando la API de videojuegos...</p>';

    try {
        let datos = [];
        // Primero se intenta la API remota para que la pestaña realmente consulte datos en vivo.
        try {
            const resp = await fetch("https://www.freetogame.com/api/games", {
                headers: { "Accept": "application/json" }, cache: "no-store"
            });
            if (resp.ok) datos = await resp.json();
            else console.warn("FreeToGame respondió HTTP", resp.status);
        } catch (e) {
            console.warn("La API directa puede estar bloqueada por CORS o no estar disponible:", e);
        }
        // Segundo intento: proxy del hosting, si el usuario decide configurarlo.
        if (!Array.isArray(datos) || !datos.length) {
            try {
                const resp = await fetch("./api/games", { headers: { "Accept": "application/json" }, cache: "no-store" });
                if (resp.ok) { const respuesta = await resp.json(); datos = Array.isArray(respuesta) ? respuesta : respuesta.games; }
            } catch (e) { console.warn("No se pudo conectar con proxy /api/games:", e); }
        }
        // Tercer intento: archivo JSON local opcional, útil para un hosting sin proxy.
        if (!Array.isArray(datos) || !datos.length) {
            try {
                const resp = await fetch("./data/games.json", { cache: "no-store" });
                if (resp.ok) { const respuesta = await resp.json(); datos = Array.isArray(respuesta) ? respuesta : respuesta.games; }
            } catch (e) { console.warn("No se pudo cargar /data/games.json:", e); }
        }
        // Último recurso: mostrar el catálogo incluido para que la sección no quede vacía sin internet/API.
        if (!Array.isArray(datos) || !datos.length) {
            datos = (window.PIXELFORGE_CATALOGO || []).map((j, index) => ({
                id: `local-${index + 1}`, title: j.nombre, genre: j.genero,
                platform: "PC / Consola", thumbnail: j.imagen,
                short_description: j.descripcion, game_url: j.url, developer: "Catálogo PixelForge"
            }));
        }
        if (!Array.isArray(datos) && Array.isArray(datos?.games)) datos = datos.games;

        if (Array.isArray(datos) && datos.length) {
            if (categoria) {
                const catNorm = categoria.toLowerCase();
                datos = datos.filter(j => {
                    const g = (j.genre || "").toLowerCase();
                    if (catNorm === "shooter") return g.includes("shooter") || g.includes("fps") || g.includes("shoot 'em up");
                    if (catNorm === "battle-royale") return g.includes("battle royale") || g.includes("battle-royale");
                    if (catNorm === "mmorpg") return g.includes("mmo") || g.includes("mmorpg");
                    if (catNorm === "strategy") return g.includes("strategy") || g.includes("moba") || g.includes("tactics");
                    if (catNorm === "rpg") return g.includes("rpg") || g.includes("role-playing") || g.includes("mmorpg");
                    if (catNorm === "racing") return g.includes("racing") || g.includes("kart");
                    if (catNorm === "sports") return g.includes("sports") || g.includes("football") || g.includes("soccer");
                    if (catNorm === "survival") return g.includes("survival");
                    return g.includes(catNorm);
                });
            }
        }

        if (!Array.isArray(datos) || !datos.length) {
            contenedor.innerHTML = '<p class="mensaje-catalogo-vacio">La API no devolvió juegos para esta categoría. Prueba otra categoría o vuelve a consultar más tarde.</p>';
            return;
        }

        pfJuegosApi = datos.slice(0, 48);
        contenedor.replaceChildren();

        pfJuegosApi.forEach(juego => {
            const card = document.createElement("article");
            card.className = "juego tarjeta-catalogo-extra";
            card.dataset.juego = `api-${juego.id}`;
            card.dataset.genero = pfNormalizarGeneroApi(juego.genre);

            const figura = document.createElement("div");
            figura.className = "imagen-juego-contenedor";
            const img = document.createElement("img");
            img.loading = "lazy";
            img.alt = `Portada de ${juego.title}`;
            img.src = juego.thumbnail || pfImagenMarcador(juego.title);
            img.addEventListener("error", () => {
                if (!img.dataset.fallback) {
                    img.dataset.fallback = "1";
                    img.src = pfImagenMarcador(juego.title);
                }
            }, { once: true });
            figura.appendChild(img);

            const info = document.createElement("div");
            info.className = "informacion";

            const badges = document.createElement("div");
            badges.innerHTML = `<span class="badge-api">🌐 API OFICIAL</span><span class="badge-plataforma">${juego.platform || "PC"}</span>`;

            const generoSpan = document.createElement("span");
            generoSpan.textContent = (juego.genre || "VIDEOJUEGO").toUpperCase();

            const tit = document.createElement("h3");
            tit.textContent = juego.title;

            const desc = document.createElement("p");
            desc.textContent = juego.short_description || "Juego obtenido desde la API oficial de videojuegos.";

            const acciones = document.createElement("div");
            acciones.className = "acciones-catalogo";

            if (juego.game_url) {
                acciones.appendChild(pfCrearEnlace(juego.game_url, "Sitio oficial"));
            }

            // Botón añadir a biblioteca
            const btnBiblioteca = document.createElement("button");
            btnBiblioteca.type = "button";
            btnBiblioteca.className = "boton-agregar-biblioteca";
            btnBiblioteca.textContent = "+ A mi biblioteca";
            btnBiblioteca.title = "Guardar este videojuego en tu biblioteca personal";
            btnBiblioteca.addEventListener("click", async () => {
                if (!usuario) {
                    usuario = { id: "invitado-local", email: "invitado@pixelforge.local" };
                    localStorage.setItem("pixelforge_usuario_activo", JSON.stringify(usuario));
                }
                const nuevoJuego = {
                    usuario_id: usuario.id,
                    nombre: juego.title,
                    plataforma: juego.platform && juego.platform.toLowerCase().includes("pc") ? "PC" : "Otra",
                    genero: pfNormalizarGeneroApi(juego.genre),
                    estado: "Jugando",
                    valoracion: 5,
                    notas: `Importado desde la API FreeToGame. Desarrollador: ${juego.developer || "Desconocido"}.`
                };

                if (usuario.id === "invitado-local" || !supabase) {
                    pfGuardarCopiaJuego(nuevoJuego, true);
                    btnBiblioteca.textContent = "✔ En tu biblioteca";
                    btnBiblioteca.disabled = true;
                    if ($("zonaBiblioteca") && !$("zonaBiblioteca").hidden) await cargarJuegos();
                    mensaje("mensajeBusqueda", `¡"${juego.title}" se guardó en tu biblioteca!`);
                } else {
                    btnBiblioteca.textContent = "Guardando...";
                    try {
                        const { error } = await supabase.from("videojuegos").insert(nuevoJuego);
                        if (error) throw error;
                        pfGuardarCopiaJuego(nuevoJuego, true);
                        btnBiblioteca.textContent = "✔ En tu biblioteca";
                        btnBiblioteca.disabled = true;
                        if ($("zonaBiblioteca") && !$("zonaBiblioteca").hidden) await cargarJuegos();
                        mensaje("mensajeBusqueda", `¡"${juego.title}" se guardó en tu cuenta de Supabase!`);
                    } catch (err) {
                        pfGuardarCopiaJuego(nuevoJuego, true);
                        btnBiblioteca.textContent = "✔ Guardado local";
                        btnBiblioteca.disabled = true;
                        mensaje("mensajeBusqueda", "El videojuego quedó guardado en este dispositivo. Se intentará sincronizar automáticamente cuando haya conexión.");
                    }
                }
            });
            acciones.appendChild(btnBiblioteca);

            // Botón favorito
            const btnFav = document.createElement("button");
            btnFav.type = "button";
            btnFav.className = "boton-favorito";
            btnFav.dataset.favorito = `api-${juego.id}`;
            const favoritos = leerFavoritos();
            const esFav = favoritos.includes(`api-${juego.id}`);
            btnFav.setAttribute("aria-pressed", String(esFav));
            btnFav.textContent = esFav ? "★ En favoritos" : "☆ Favorito";
            btnFav.addEventListener("click", async () => {
                const favs = leerFavoritos();
                const id = `api-${juego.id}`;
                const sig = favs.includes(id) ? favs.filter(x => x !== id) : [...favs, id];
                guardarFavoritos(sig);
                btnFav.setAttribute("aria-pressed", String(sig.includes(id)));
                btnFav.textContent = sig.includes(id) ? "★ En favoritos" : "☆ Favorito";
                if (typeof guardarFavoritoNube === "function") void guardarFavoritoNube(id, sig.includes(id));
            });
            acciones.appendChild(btnFav);

            info.append(badges, generoSpan, tit, desc, acciones);
            card.append(figura, info);
            contenedor.appendChild(card);
        });

    } catch (error) {
        console.error("Error al cargar FreeToGame API:", error);
        contenedor.innerHTML = `<p class="mensaje-catalogo-vacio">No se pudo conectar con la API de FreeToGame (${error.message}). Puedes seguir explorando el catálogo base y los destacados.</p>`;
    } finally {
        pfApiCargando = false;
    }
}

async function iniciarCatalogoExtendido() {
    // Pestañas del catálogo
    const tabTodos = $("tabTodosJuegos");
    const tabApi = $("tabApiJuegos");
    const tabComunidad = $("tabComunidadJuegos");
    const secGeneral = $("seccionCatalogoGeneral");
    const secApi = $("seccionApiJuegos");

    if (tabTodos && tabApi && secGeneral && secApi) {
        tabTodos.addEventListener("click", () => {
            tabTodos.classList.add("activa");
            tabApi.classList.remove("activa");
            if (tabComunidad) tabComunidad.classList.remove("activa");
            secGeneral.hidden = false;
            secApi.hidden = true;
        });

        tabApi.addEventListener("click", () => {
            tabApi.classList.add("activa");
            tabTodos.classList.remove("activa");
            if (tabComunidad) tabComunidad.classList.remove("activa");
            secGeneral.hidden = true;
            secApi.hidden = false;
            if (!pfJuegosApi.length) {
                pfCargarJuegosApi($("filtroCategoriaApi")?.value || "");
            }
        });

        if (tabComunidad) {
            tabComunidad.addEventListener("click", () => {
                tabTodos.click();
                $("catalogoDinamico")?.scrollIntoView({ behavior: "smooth", block: "start" });
            });
        }
    }

    if ($("filtroCategoriaApi")) {
        $("filtroCategoriaApi").addEventListener("change", (e) => {
            pfCargarJuegosApi(e.target.value);
        });
    }

    // Las tres tarjetas originales se conservan; si sus imágenes locales no existen, se muestra una portada ilustrativa.
    document.querySelectorAll("#contenedorJuegos .juego").forEach(card => {
        const img = card.querySelector("img");
        if (img) img.addEventListener("error", () => { if (!img.dataset.fallback) { img.dataset.fallback = "1"; img.src = pfImagenMarcador(card.querySelector("h3")?.textContent || "PixelForge"); } }, { once: true });
        const h3 = card.querySelector("h3");
        if (h3 && !card.querySelector(".nota-edad-original")) {
            const p = document.createElement("p"); p.className = "nota-edad-original";
            p.textContent = h3.textContent.includes("GTA") ? "Edad sugerida: 18+" : h3.textContent.includes("Fortnite") ? "Edad sugerida: 12+" : "Edad sugerida: 7+";
            card.querySelector(".informacion")?.appendChild(p);
        }
        const titulo = card.querySelector("h3")?.textContent?.toLowerCase() || "";
        const datos = titulo.includes("minecraft") ? {slug:"minecraft", streamers:"Auronplay / Vegetta777", url:"https://www.twitch.tv/search?term=Minecraft", edad:"7+"}
            : titulo.includes("fortnite") ? {slug:"fortnite", streamers:"Ninja / SypherPK", url:"https://www.twitch.tv/search?term=Fortnite", edad:"12+"}
            : {slug:"gta-v", streamers:"TheProfessional / Caylus", url:"https://www.twitch.tv/search?term=GTA%20V", edad:"18+"};
        const info = card.querySelector(".informacion");
        if (info && !info.querySelector(".streamers-juego")) {
            const s = document.createElement("p"); s.className = "streamers-juego"; s.textContent = "Streamers / creadores: " + datos.streamers; info.appendChild(s);
            const l = pfCrearEnlace(datos.url, "Ver streamers", "enlace-juego enlace-secundario"); info.appendChild(l);
        }
    });
    await pfCargarCatalogoBD();
    await pfCargarCalificacionesResumen();
    await pfCargarCalificacionesUsuario();
    await pfCargarFavoritosUsuario();
    pfRenderCatalogos();
    pfCatalogoInicializado = true;
    $("formPropuestaJuego")?.addEventListener("submit", pfEnviarPropuesta);
    window.addEventListener("pixelforge:auth", async () => {
        await pfCargarFavoritosUsuario(); await pfCargarCalificacionesUsuario(); await pfVerificarAdmin();
        pfRenderCatalogos();
    });
    await pfVerificarAdmin();
    // Recarga el catálogo una vez para ver juegos recién aprobados mientras el visitante mantiene la página abierta.
    window.addEventListener("focus", async () => { await pfCargarCatalogoBD(); pfRenderCatalogos(); });
}
const botonSync = document.getElementById("btnSincronizar");
const estadoSync = document.getElementById("estadoSincronizacion");
const textoBoton = document.getElementById("textoBoton");
const iconoSync = document.querySelector(".sync-icon");

if (botonSync && estadoSync && textoBoton && iconoSync) botonSync.addEventListener("click", async () => {
    botonSync.disabled = true;
    textoBoton.textContent = "Sincronizando...";
    estadoSync.className = "estado-sync loading";
    estadoSync.textContent = "🔄 Conectando con Supabase...";
    iconoSync.classList.add("girando");

    try {
        if (!supabase && window.supabase) {
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        }
        if (!supabase) throw new Error("Cliente de Supabase no disponible.");

        const { data, error } = await supabase
            .from("videojuegos")
            .select("*")
            .limit(100);

        if (error) throw error;

        estadoSync.className = "estado-sync online";
        estadoSync.textContent = `✅ Conectado a Supabase · ${data.length} videojuego(s) en la base de datos`;
        if (usuario) await cargarJuegos();
        await pfCargarCatalogoBD();
        pfFiltrosActualizados();

        textoBoton.textContent = "Sincronizado";
        iconoSync.classList.remove("girando");
        iconoSync.textContent = "✔";
        iconoSync.style.color = "#22c55e";

    } catch (error) {
        console.error("Error al sincronizar con Supabase:", error);
        estadoSync.className = "estado-sync error";
        estadoSync.textContent = "❌ " + (error?.message || "Error al conectar con Supabase");
        textoBoton.textContent = "Reintentar";
        iconoSync.classList.remove("girando");
        iconoSync.textContent = "⚠";
        iconoSync.style.color = "#ef4444";
    } finally {
        botonSync.disabled = false;
    }
});

// Puente interno: expone el cliente público de Supabase y el estado de admin,
// nunca la clave service_role. La autorización real la hacen las políticas RLS.
window.PIXELFORGE_ADMIN_BRIDGE = {
    getClient: () => supabase,
    getUser: () => usuario,
    setUser: (nextUser) => { usuario = nextUser; },
    isAdmin: () => Boolean(pfEsAdmin),
    refreshAdmin: () => pfVerificarAdmin()
};
})();



/* ===== Módulo consolidado: profile.js ===== */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const bridge = () => window.PIXELFORGE_ADMIN_BRIDGE || null;
  const currentUser = () => bridge()?.getUser?.() || null;
  const dbClient = () => bridge()?.getClient?.() || null;

  function setLoading(button, loading) {
    if (!button) return;
    if (loading) {
      button.dataset.textoOriginal = button.textContent;
      button.textContent = 'GUARDANDO...';
      button.disabled = true;
    } else {
      button.textContent = button.dataset.textoOriginal || button.textContent;
      button.disabled = false;
    }
  }

  function updateAvatar(url, name) {
    const avatar = $('pfProfileAvatarPreview');
    if (!avatar) return;
    avatar.replaceChildren();
    if (url && /^https?:\/\//i.test(url)) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = 'Foto de perfil';
      img.onerror = () => { avatar.textContent = (name || 'PF').slice(0, 2).toUpperCase(); };
      avatar.appendChild(img);
    } else {
      avatar.textContent = (name || 'PF').trim().slice(0, 2).toUpperCase() || 'PF';
    }
  }

  function loadProfile() {
    const user = currentUser();
    const meta = user?.user_metadata || {};
    if ($('pfProfileName')) $('pfProfileName').value = meta.display_name || meta.full_name || '';
    if ($('pfProfileUsername')) $('pfProfileUsername').value = meta.username || '';
    if ($('pfProfileAvatar')) $('pfProfileAvatar').value = meta.avatar_url || '';
    if ($('pfProfileBio')) $('pfProfileBio').value = meta.bio || '';
    if ($('pfProfileStatus')) $('pfProfileStatus').textContent = user?.app_metadata?.pixelforge_status || 'Usuario';
    updateAvatar(meta.avatar_url || '', meta.display_name || meta.full_name || user?.email || 'PF');
    if ($('pfProfileMessage')) $('pfProfileMessage').textContent = user?.email
      ? `Cuenta: ${user.email}`
      : 'Inicia sesión para editar tu perfil.';
  }

  function initProfile() {
    const form = $('pfProfileForm');
    if (!form || form.dataset.pfProfileReady === '1') return;
    form.dataset.pfProfileReady = '1';

    $('pfProfileAvatar')?.addEventListener('input', () =>
      updateAvatar($('pfProfileAvatar').value.trim(), $('pfProfileName')?.value || 'PF'));
    $('pfProfileName')?.addEventListener('input', () =>
      updateAvatar($('pfProfileAvatar')?.value.trim(), $('pfProfileName').value));

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const status = $('pfProfileMessage');
      const submit = form.querySelector('[type="submit"]');
      const user = currentUser();
      const db = dbClient();

      if (!user || user.id === 'invitado-local' || !db) {
        if (status) status.textContent = 'Inicia sesión con una cuenta para guardar los cambios de perfil.';
        return;
      }

      const display_name = $('pfProfileName')?.value.trim() || '';
      const username = ($('pfProfileUsername')?.value || '').trim().replace(/^@/, '');
      const avatar_url = $('pfProfileAvatar')?.value.trim() || '';
      const bio = $('pfProfileBio')?.value.trim() || '';
      if (!display_name) {
        if (status) status.textContent = 'Escribe un nombre visible.';
        return;
      }
      if (avatar_url && !/^https?:\/\//i.test(avatar_url)) {
        if (status) status.textContent = 'La foto debe usar un enlace http o https válido.';
        return;
      }

      setLoading(submit, true);
      if (status) status.textContent = 'Guardando tu perfil...';
      try {
        const { data, error } = await db.auth.updateUser({
          data: { display_name, full_name: display_name, username, avatar_url, bio }
        });
        if (error) throw error;
        bridge()?.setUser?.(data?.user || user);
        loadProfile();
        if (status) status.textContent = '✓ Perfil actualizado correctamente.';
        window.dispatchEvent(new Event('pixelforge:auth'));
      } catch (error) {
        console.error('No se pudo actualizar el perfil:', error);
        if (status) status.textContent = 'No se pudo guardar: ' + (error?.message || 'error desconocido');
      } finally {
        setLoading(submit, false);
      }
    });
  }

  window.PIXELFORGE_PROFILE = { load: loadProfile, init: initProfile };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProfile, { once: true });
  } else {
    initProfile();
  }
  window.addEventListener('pixelforge:auth', loadProfile);
  loadProfile();
})();


/* ===== Módulo consolidado: navigation.js ===== */
(() => {
    'use strict';

    const sectionIds = new Set([
        'inicio', 'comunidad-destacada', 'juegos', 'biblioteca', 'perfil', 'kids',
        'proponer', 'musica', 'comunidad', 'streamers', 'creadores',
        'reportes', 'administracion', 'aprendizaje', 'contactos',
        'pfV10UserDashboard', 'pfV10Directory', 'pfV10CollaboratorDashboard', 'perfil'
    ]);

    const privateSectionIds = new Set([
        'pfV10UserDashboard', 'pfV10Directory', 'pfV10CollaboratorDashboard', 'perfil'
    ]);

    const bridge = () => window.PIXELFORGE_ADMIN_BRIDGE || null;
    const esAdministrador = () => Boolean(bridge()?.isAdmin?.());
    const usuarioRegistrado = () => {
        const user = bridge()?.getUser?.();
        return Boolean(user?.id && user.id !== 'invitado-local');
    };

    function mostrarSubseccion() {
        let id = decodeURIComponent(location.hash.slice(1)) || 'inicio';

        // Las vistas educativas se manejan en el router integrado al final de script.js.
        if (id === 'manual-programacion' || id === 'manual-streaming' || /^(mp|ms)-(indice|capitulo-\d+)$/.test(id)) return;

        if (id === 'administracion' && !esAdministrador()) {
            history.replaceState(null, '', location.pathname + location.search + '#inicio');
            id = 'inicio';
        }

        if (privateSectionIds.has(id) && !usuarioRegistrado()) {
            history.replaceState(null, '', location.pathname + location.search + '#biblioteca');
            id = 'biblioteca';
        }

        const target = document.getElementById(sectionIds.has(id) ? id : 'inicio')
            || document.getElementById('inicio');

        document.querySelectorAll('main > section[id]').forEach(section => {
            const visible = section === target;
            section.hidden = !visible;
            section.classList.toggle('pf-subseccion-activa', visible);
        });

        const adminLink = document.getElementById('pfAdminNavLink');
        if (adminLink) adminLink.hidden = !esAdministrador();

        document.querySelectorAll('header nav a[href^="#"]').forEach(link => {
            if (link.getAttribute('href') === '#' + target.id) {
                link.setAttribute('aria-current', 'page');
            } else {
                link.removeAttribute('aria-current');
            }
        });

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Menú compacto: las categorías secundarias y la biblioteca solo aparecen al desplegarlo.
    const menuToggle = document.getElementById('pfMenuToggle');
    const mainNav = document.getElementById('pfMainNav');

    function cerrarMenu() {
        if (!menuToggle || !mainNav) return;
        menuToggle.setAttribute('aria-expanded', 'false');
        menuToggle.classList.remove('is-open');
        mainNav.classList.remove('is-open');
    }

    if (menuToggle && mainNav) {
        menuToggle.addEventListener('click', () => {
            const abierto = menuToggle.getAttribute('aria-expanded') === 'true';
            menuToggle.setAttribute('aria-expanded', String(!abierto));
            menuToggle.classList.toggle('is-open', !abierto);
            mainNav.classList.toggle('is-open', !abierto);
        });

        mainNav.addEventListener('click', event => {
            if (event.target.closest('a')) cerrarMenu();
        });

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') cerrarMenu();
        });

        document.addEventListener('click', event => {
            if (!event.target.closest('.pf-navigation-area')) cerrarMenu();
        });
    }

    window.addEventListener('hashchange', mostrarSubseccion);
    window.addEventListener('pixelforge:admin-state', mostrarSubseccion);
    window.addEventListener('pixelforge:auth', mostrarSubseccion);

    // Espera a que script.js y Dashboards.js creen el puente y los paneles V10.
    if (document.readyState === 'complete') {
        mostrarSubseccion();
    } else {
        window.addEventListener('load', mostrarSubseccion, { once: true });
    }

    // Conserva la vista previa de las publicaciones en la portada.
    const source = document.getElementById('listaPublicaciones');
    const preview = document.getElementById('vistaPreviaPublicaciones');

    function actualizarVistaPrevia() {
        if (!source || !preview) return;
        const cards = [...source.querySelectorAll('.tarjeta-publicacion')].slice(0, 3);
        preview.replaceChildren();

        if (!cards.length) {
            const p = document.createElement('p');
            p.textContent = source.querySelector('p')?.textContent
                || 'Todavía no hay publicaciones disponibles.';
            preview.appendChild(p);
            return;
        }

        cards.forEach(card => {
            const copy = document.createElement('article');
            copy.className = 'tarjeta-publicacion';
            card.querySelectorAll('.autor-publicacion,h4,p,small').forEach(node => {
                copy.append(node.cloneNode(true));
            });
            preview.appendChild(copy);
        });
    }

    if (source && preview) {
        new MutationObserver(actualizarVistaPrevia).observe(source, {
            childList: true,
            subtree: true,
            characterData: true
        });
        actualizarVistaPrevia();
    }
})();


/* ===== Módulo consolidado: admin-v9.js ===== */
/* ============================= PIXELFORGE V9 ============================= */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const REPORTS_KEY = 'pixelforge_v9_reportes_local';
  const CREATOR_REQUESTS_KEY = 'pixelforge_v9_solicitudes_creadores';
  const STREAM_REQUESTS_KEY = 'pixelforge_v9_solicitudes_stream';
  const readList = (key) => { try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } };
  const writeList = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (error) { console.warn('PixelForge V9: no se pudo guardar localmente.', error); return false; } };
  const text = (id) => String($(id)?.value || '').trim();
  const dateLabel = (value) => { try { return new Date(value).toLocaleString('es-MX'); } catch { return value || ''; } };
  const dbClient = () => window.PIXELFORGE_ADMIN_BRIDGE?.getClient?.() || null;
  const adminAllowed = () => Boolean(window.PIXELFORGE_ADMIN_BRIDGE?.isAdmin?.());
  async function insertRemote(table, payload) {
    const db = dbClient();
    if (!db) throw new Error('Supabase aún no está conectado.');
    const { error } = await db.from(table).insert(payload);
    if (error) throw error;
  }
  async function updateRemote(table, id, fields) {
    const db = dbClient();
    if (!db || !adminAllowed()) throw new Error('Debes iniciar sesión con una cuenta administradora.');
    const { error } = await db.from(table).update(fields).eq('id', id);
    if (error) throw error;
  }
  function errorShort(error) { return String(error?.message || error?.details || 'error desconocido').slice(0, 240); }
  function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }
  function safeDisplay(value) { return String(value ?? ''); }
  function renderList(containerId, items, kind) {
    const root = $(containerId); if (!root) return;
    root.replaceChildren();
    if (!items.length) { const p=document.createElement('p'); p.className='pf-v9-empty'; p.textContent='Aún no hay registros guardados en este navegador.'; root.append(p); return; }
    items.slice(-5).reverse().forEach((item) => {
      const article=document.createElement('article'); article.className='pf-v9-local-item';
      const title=document.createElement('strong');
      if (kind==='report') title.textContent=(item.tipo || 'Reporte') + ': ' + (item.resumen || 'Sin resumen');
      else title.textContent=(item.alias || 'Tester') + ' — ' + String(item.calificacion || '—') + '/5';
      const body=document.createElement('p'); body.textContent=kind==='report' ? safeDisplay(item.detalle) : safeDisplay(item.opinion);
      const meta=document.createElement('small'); meta.textContent=dateLabel(item.fecha) + (item.dispositivo ? ' · ' + item.dispositivo : '');
      article.append(title, body, meta); root.append(article);
    });
  }
  function updateDashboard() {
    const games = document.querySelectorAll('#contenedorJuegos .juego').length + document.querySelectorAll('#catalogoDinamico .juego, #catalogoDinamico .tarjeta-juego, #catalogoDinamico article').length;
    const favs = (() => { try { const v=JSON.parse(localStorage.getItem('pixelforge_favoritos_v1') || '[]'); return Array.isArray(v) ? v.length : 0; } catch { return 0; } })();
    const reports = readList(REPORTS_KEY).length;
    const creators = readList(CREATOR_REQUESTS_KEY).length;
    const streams = readList(STREAM_REQUESTS_KEY).length;
    if ($('pfStatJuegos')) $('pfStatJuegos').textContent=String(games);
    if ($('pfStatFavoritos')) $('pfStatFavoritos').textContent=String(favs);
    if ($('pfStatReportes')) $('pfStatReportes').textContent=String(reports);
    if ($('pfStatCreadores')) $('pfStatCreadores').textContent=String(creators);
    if ($('pfStatStreams')) $('pfStatStreams').textContent=String(streams);
  }
  function setupStream() {
    const form=$('pfV9StreamForm'), input=$('pfV9Channel'), player=$('pfV9Player'), status=$('pfV9StreamStatus');
    if (!form || !input || !player || !status) return;
    form.addEventListener('submit',(event)=>{
      event.preventDefault(); const channel=text('pfV9Channel');
      if (!/^[A-Za-z0-9_]{1,60}$/.test(channel)) { status.textContent='Escribe un nombre de canal válido. Solo letras, números y guion bajo.'; return; }
      if (location.protocol==='file:') { status.textContent='Abre PixelForge con Live Server o un dominio web para probar el reproductor de Twitch.'; return; }
      const parent = String(window.PIXELFORGE_CONFIG?.twitchParent || location.hostname).trim();
      player.replaceChildren();
      const iframe=document.createElement('iframe'); iframe.title='Directo de Twitch: '+channel; iframe.loading='lazy'; iframe.allow='autoplay; fullscreen'; iframe.allowFullscreen=true; iframe.referrerPolicy='strict-origin-when-cross-origin';
      iframe.src='https://player.twitch.tv/?channel='+encodeURIComponent(channel)+'&parent='+encodeURIComponent(parent)+'&muted=true';
      player.append(iframe); status.textContent='Se solicitó el directo de '+channel+'. Si no aparece, verifica el dominio parent en api-config.js y que el canal esté transmitiendo.';
    });
    $('pfV9Search')?.addEventListener('click',()=>{const q=text('pfV9Channel') || 'videojuegos'; window.open('https://www.twitch.tv/search?term='+encodeURIComponent(q),'_blank','noopener,noreferrer');});
  }
  function setupReports() {
    const form=$('pfV9ReportForm'); if (!form) return;
    const refresh=()=>{renderList('pfV9ReportList',readList(REPORTS_KEY),'report'); updateDashboard();};
    form.addEventListener('submit', async (event)=>{
      event.preventDefault();
      const record={id:crypto?.randomUUID?.() || String(Date.now()), tipo:text('pfV9ReportType'), resumen:text('pfV9ReportTitle'), detalle:text('pfV9ReportDetail'), pagina:location.href, navegador:navigator.userAgent, fecha:new Date().toISOString()};
      const status=$('pfV9ReportStatus');
      let remoto=false, errorRemoto='';
      try {
        await insertRemote('pf_v9_reports', { id: record.id, tipo:record.tipo, resumen:record.resumen, detalle:record.detalle, pagina_url:record.pagina, navegador:record.navegador, estado:'pendiente' });
        remoto=true;
      } catch (error) { errorRemoto=errorShort(error); console.warn('PixelForge reportes: no se pudo guardar en Supabase:', error); }
      const items=readList(REPORTS_KEY); items.push({...record, almacenamiento:remoto?'supabase':'local'});
      const ok=writeList(REPORTS_KEY,items);
      if (status) status.textContent=remoto
        ? 'Reporte recibido en PixelForge y enviado al panel administrativo. Se conservó una copia de respaldo local.'
        : (ok ? 'Reporte guardado solo en este navegador. No llegó al panel administrativo; ejecuta la migración SQL V9 y verifica Supabase. Detalle: '+errorRemoto : 'El navegador no permitió guardar el reporte; descarga el contenido o revisa el almacenamiento.');
      if (ok || remoto) { form.reset(); refresh(); }
    });
    $('pfV9ExportReports')?.addEventListener('click',()=>downloadJson('pixelforge-reportes-v9.json',readList(REPORTS_KEY)));
    refresh();
  }
  function setupCreatorHub() {
    const cfg = window.PIXELFORGE_CONFIG || {};
    const fee = Number.isFinite(Number(cfg.creatorRecoveryFeeMxn)) && Number(cfg.creatorRecoveryFeeMxn) >= 0
      ? Number(cfg.creatorRecoveryFeeMxn) : 50;
    const feeLabel = $('pfCreatorFeeLabel');
    if (feeLabel) feeLabel.textContent = fee.toLocaleString('es-MX', {style:'currency', currency:'MXN', maximumFractionDigits:0}) + ' MXN';

    const hasGame = $('pfCreatorHasGame');
    const hasStreamed = $('pfCreatorHasStreamed');
    const gameDetails = $('pfCreatorGameDetails');
    const streamDetails = $('pfCreatorStreamDetails');
    const beginnerNotice = $('pfCreatorBeginnerNotice');
    const syncBeginnerNotice = () => { if (beginnerNotice) beginnerNotice.hidden = !(hasGame?.value === 'no' && hasStreamed?.value === 'no'); };
    const syncConditional = (select, container, requiredIds) => {
      if (!select || !container) return;
      const visible = select.value !== 'no';
      container.hidden = !visible;
      container.querySelectorAll('input,select,textarea').forEach(el => { el.disabled = !visible; if (!visible) el.value = ''; });
      requiredIds.forEach(id => { const el=$(id); if (el) el.required = visible; });
    };
    hasGame?.addEventListener('change', () => syncConditional(hasGame, gameDetails, ['pfCreatorGameName']));
    hasStreamed?.addEventListener('change', () => { syncConditional(hasStreamed, streamDetails, []); syncBeginnerNotice(); });
    hasGame?.addEventListener('change', syncBeginnerNotice);
    syncConditional(hasGame, gameDetails, ['pfCreatorGameName']);
    syncConditional(hasStreamed, streamDetails, []);
    syncBeginnerNotice();

    const creatorForm = $('pfCreatorForm');
    creatorForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const hasGameValue = text('pfCreatorHasGame');
      const hasStreamedValue = text('pfCreatorHasStreamed');
      const record = {
        id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()),
        nombre: text('pfCreatorName'), alias: text('pfCreatorAlias'), correo: text('pfCreatorEmail'),
        perfil: text('pfCreatorRole'), nombreIdeaVideojuego: text('pfCreatorIdeaName'), conceptoVideojuego: text('pfCreatorIdeaConcept'),
        yaCreoVideojuego: hasGameValue, yaHizoStreams: hasStreamedValue, videojuego: text('pfCreatorGameName'), enlaceVideojuego: text('pfCreatorGameLink'),
        experienciaDesarrollo: text('pfCreatorGameDetailsText'), plataformaStream: text('pfCreatorPlatform'),
        canalStream: text('pfCreatorStreamLink'), experienciaStream: text('pfCreatorStreamExperience'),
        propuesta: text('pfCreatorBio'), aceptaCuotaInformada: Boolean($('pfCreatorFeeConsent')?.checked),
        aceptaRevisionDatos: Boolean($('pfCreatorDataConsent')?.checked), cuotaRecuperacionMXN: fee,
        estado: 'Pendiente de revisión', fecha: new Date().toISOString()
      };
      const status = $('pfCreatorStatus');
      const mailLink = $('pfCreatorMailLink');
      let remoto = false, errorRemoto = '';
      try {
        await insertRemote('pf_v9_creator_applications', {
          id: record.id,
          nombre_publico: record.nombre, alias: record.alias, correo: record.correo, perfil: record.perfil,
          nombre_idea_videojuego: record.nombreIdeaVideojuego || null, concepto_videojuego: record.conceptoVideojuego || null,
          ya_creo_videojuego: hasGameValue, ya_hizo_streams: hasStreamedValue,
          videojuego_existente: record.videojuego || null, enlace_videojuego: record.enlaceVideojuego || null,
          experiencia_desarrollo: record.experienciaDesarrollo || null, plataforma_stream: record.plataformaStream || null,
          canal_stream: record.canalStream || null, experiencia_stream: record.experienciaStream || null,
          propuesta: record.propuesta, acepta_cuota_informada: record.aceptaCuotaInformada,
          acepta_revision_datos: record.aceptaRevisionDatos, cuota_recuperacion_mxn: fee,
          estado: 'pendiente', cuota_estado: 'no_cobrada'
        });
        remoto = true;
      } catch (error) { errorRemoto = errorShort(error); console.warn('PixelForge creadores: no se pudo guardar en Supabase:', error); }
      const items = readList(CREATOR_REQUESTS_KEY); items.push({...record, almacenamiento: remoto ? 'supabase' : 'local'});
      const ok = writeList(CREATOR_REQUESTS_KEY, items);
      if (ok || remoto) {
        const tieneExperiencia = hasGameValue === 'si' || hasGameValue === 'en_proceso' || hasStreamedValue === 'si';
        if (status) status.textContent = remoto
          ? (tieneExperiencia ? 'Solicitud recibida en el panel de administración y marcada para evaluación como posible colaborador. ' : 'Solicitud recibida en el panel de administración. Revisa también la guía para principiantes. ') + 'Se conservó una copia de respaldo local; la cuota no se cobra al enviar.'
          : (tieneExperiencia ? 'Solicitud guardada solo en este navegador y marcada para futura evaluación como colaborador. ' : 'Solicitud guardada solo en este navegador; revisa la guía para principiantes. ') + 'No llegó al panel administrativo. Ejecuta el SQL V9 y verifica Supabase. Detalle: ' + errorRemoto;
        const contactEmail = String(cfg.applicationEmail || cfg.contactEmail || '').trim();
        if (mailLink && contactEmail && !remoto) {
          const lines = Object.entries(record).map(([key,value]) => `${key}: ${value}`).join('\n');
          mailLink.href = 'mailto:' + contactEmail + '?subject=' + encodeURIComponent('Solicitud de creador PixelForge — ' + record.alias) + '&body=' + encodeURIComponent(lines);
          mailLink.hidden = false;
          mailLink.textContent = 'Preparar correo de respaldo';
        } else if (mailLink) mailLink.hidden = true;
        creatorForm.reset();
        syncConditional(hasGame, gameDetails, ['pfCreatorGameName']);
        syncConditional(hasStreamed, streamDetails, []);
        syncBeginnerNotice();
        updateDashboard();
      } else if (status) status.textContent = 'No se pudo guardar la solicitud. Comprueba el almacenamiento del navegador.';
    });
    $('pfCreatorExport')?.addEventListener('click', () => downloadJson('pixelforge-solicitudes-creadores.json', readList(CREATOR_REQUESTS_KEY)));

    const streamForm = $('pfStreamRequestForm');
    streamForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const record = {
        id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()),
        nombre: text('pfStreamRequestName'), correo: text('pfStreamRequestEmail'), plataforma: text('pfStreamRequestPlatform'),
        urlCanal: text('pfStreamRequestUrl'), contenido: text('pfStreamRequestContent'),
        permisoDeclarado: Boolean($('pfStreamRequestPermission')?.checked), aceptaReglas: Boolean($('pfStreamRequestRules')?.checked),
        estado: 'Pendiente de revisión de permiso', fecha: new Date().toISOString()
      };
      const status = $('pfStreamRequestStatus');
      const mailLink = $('pfStreamRequestMailLink');
      const contactEmail = String(cfg.applicationEmail || cfg.contactEmail || '').trim();
      let remoto = false, errorRemoto = '';
      try {
        await insertRemote('pf_v9_stream_requests', {
          id: record.id,
          nombre_publico: record.nombre, correo: record.correo, plataforma: record.plataforma,
          url_canal: record.urlCanal, contenido: record.contenido, permiso_declarado: record.permisoDeclarado,
          acepta_reglas: record.aceptaReglas, estado: 'pendiente'
        });
        remoto = true;
      } catch (error) { errorRemoto = errorShort(error); console.warn('PixelForge streams: no se pudo guardar en Supabase:', error); }
      const items = readList(STREAM_REQUESTS_KEY); items.push({...record, almacenamiento: remoto ? 'supabase' : 'local'});
      const ok = writeList(STREAM_REQUESTS_KEY, items);
      if (ok || remoto) {
        if (status) status.textContent = remoto
          ? 'Solicitud recibida en el panel administrativo y pendiente de revisión. El canal no se publica automáticamente.'
          : 'Solicitud guardada solo en este navegador. No llegó al panel de administración. Ejecuta el SQL V9 y verifica Supabase. Detalle: ' + errorRemoto;
        if (mailLink && contactEmail && !remoto) {
          const lines = Object.entries(record).map(([key,value]) => `${key}: ${value}`).join('\n');
          mailLink.href = 'mailto:' + contactEmail + '?subject=' + encodeURIComponent('Solicitud de permiso para stream — ' + record.nombre) + '&body=' + encodeURIComponent(lines);
          mailLink.hidden = false;
          mailLink.textContent = 'Preparar correo de respaldo';
        } else if (mailLink) mailLink.hidden = true;
        streamForm.reset(); updateDashboard();
      } else if (status) status.textContent = 'No se pudo guardar la solicitud. Revisa el almacenamiento del navegador.';
    });
    $('pfStreamRequestExport')?.addEventListener('click', () => downloadJson('pixelforge-solicitudes-stream.json', readList(STREAM_REQUESTS_KEY)));

    const approvedRoot = $('pfApprovedStreams');
    const approved = Array.isArray(cfg.featuredStreams) ? cfg.featuredStreams : [];
    if (approvedRoot) {
      approvedRoot.replaceChildren();
      if (!approved.length) {
        const p = document.createElement('p'); p.className='pf-v9-empty';
        p.textContent='Todavía no hay canales destacados configurados. Cuando una solicitud se revise y se autorice, agrega el canal a featuredStreams en api-config.js.';
        approvedRoot.append(p);
      } else {
        approved.forEach((item) => {
          if (!item || typeof item.channel !== 'string' || !/^[A-Za-z0-9_]{1,60}$/.test(item.channel)) return;
          const card=document.createElement('article'); card.className='pf-v9-local-item';
          const title=document.createElement('strong'); title.textContent=String(item.name || item.channel);
          const detail=document.createElement('p'); detail.textContent='Twitch · Canal configurado para aparecer en PixelForge';
          const button=document.createElement('button'); button.type='button'; button.className='boton'; button.textContent='Ver directo';
          button.addEventListener('click',()=>{
            const channelInput=$('pfV9Channel'); if(channelInput) channelInput.value=item.channel;
            const form=$('pfV9StreamForm');
            if(form) { location.hash='#streamers'; form.requestSubmit(); }
          });
          card.append(title,detail,button); approvedRoot.append(card);
        });
      }
    }
    void loadPublicFeaturedStreams();
    updateDashboard();
  }
  const STATUS_CREATOR = [['pendiente','Pendiente'],['en_revision','En revisión'],['aprobada','Aprobada / colaborador'],['rechazada','Rechazada'],['archivada','Archivada']];
  const STATUS_FEE = [['no_cobrada','No cobrada'],['pendiente','Pendiente de pago'],['confirmada','Pago confirmado manualmente'],['exenta','Exenta'],['cancelada','Cancelada']];
  const STATUS_STREAM = [['pendiente','Pendiente'],['en_revision','En revisión'],['aprobada','Aprobada'],['rechazada','Rechazada']];
  const STATUS_REPORT = [['pendiente','Pendiente'],['en_revision','En revisión'],['resuelto','Resuelto'],['cerrado','Cerrado']];
  function setAdminGate(message, authorized) {
    if ($('pfAdminGate')) $('pfAdminGate').textContent = message;
    if ($('pfAdminWorkspace')) $('pfAdminWorkspace').hidden = !authorized;
  }
  function appendText(parent, tag, value, className) {
    const el = document.createElement(tag); if (className) el.className = className; el.textContent = safeDisplay(value); parent.append(el); return el;
  }
  function makeSelect(options, value) {
    const select = document.createElement('select'); select.className = 'pf-admin-select';
    options.forEach(([val,label]) => { const option=document.createElement('option'); option.value=val; option.textContent=label; select.append(option); });
    select.value = options.some(o=>o[0]===value) ? value : options[0][0]; return select;
  }
  function adminAction(label, handler, secondary=false) {
    const b=document.createElement('button'); b.type='button'; b.className=secondary?'boton boton-secundario':'boton'; b.textContent=label;
    b.addEventListener('click', async()=>{ b.disabled=true; try { await handler(); } catch(error) { const st=$('pfAdminStatus'); if(st) st.textContent='No se completó la acción: '+errorShort(error); console.error(error); } finally { b.disabled=false; } });
    return b;
  }
  async function adminSetStatus(table,id,fields) { await updateRemote(table,id,fields); }
  async function loadAdminPanel() {
    const nav=$('pfAdminNavLink'); const isAdmin=adminAllowed();
    if(nav) nav.hidden=!isAdmin;
    if(!isAdmin) { setAdminGate('Acceso restringido. Inicia sesión con una cuenta incluida en pixelforge_admins para utilizar este panel.',false); return; }
    const db=dbClient();
    if(!db) { setAdminGate('No se pudo conectar con Supabase. Verifica la configuración de la web.',false); return; }
    setAdminGate('Administrador verificado. Cargando solicitudes y reportes…',true);
    const status=$('pfAdminStatus'); if(status) status.textContent='';
    const specs = [
      ['pf_v9_creator_applications', 'pfAdminCreatorCount', 'pfAdminCreatorList', renderAdminCreators],
      ['pf_v9_stream_requests', 'pfAdminStreamCount', 'pfAdminStreamList', renderAdminStreams],
      ['pf_v9_reports', 'pfAdminReportCount', 'pfAdminReportList', renderAdminReports]
    ];
    const results = await Promise.all(specs.map(async ([table]) => {
      try {
        const response = await db.from(table).select('*').order('created_at',{ascending:false}).limit(100);
        if (response.error) throw response.error;
        return { data: response.data || [], error: null };
      } catch (error) { return { data: [], error }; }
    }));
    let failures = 0;
    results.forEach((result, index) => {
      const [table, countId, listId, renderer] = specs[index];
      const countNode = $(countId);
      if (result.error) {
        failures++;
        if (countNode) countNode.textContent = '—';
        const list = $(listId);
        if (list) { list.replaceChildren(); appendText(list, 'p', table + ': ' + errorShort(result.error), 'pf-v9-empty'); }
        console.error('Panel administrador V9 (' + table + '):', result.error);
      } else {
        if (countNode) countNode.textContent = String(result.data.length);
        renderer(result.data);
      }
    });
    const creators = results[0].data;
    $('pfAdminFeeCount').textContent = results[0].error ? '—' : String(creators.filter(x=>['pendiente','no_cobrada'].includes(x.cuota_estado) && x.estado==='aprobada').length);
    if (failures) {
      setAdminGate('Administrador verificado. Algunas tablas no pudieron sincronizarse; revisa el detalle de cada sección.',true);
      if(status) status.textContent='Sincronización parcial: '+(3-failures)+' de 3 tablas V9 cargadas. Revisa migraciones y políticas RLS. Última revisión: '+new Date().toLocaleTimeString('es-MX')+'.';
    } else {
      setAdminGate('Administrador verificado. Datos actualizados desde Supabase.',true);
      if(status) status.textContent='Datos actualizados desde Supabase. Última actualización: '+new Date().toLocaleTimeString('es-MX')+'.';
    }
  }
  function renderAdminCreators(items) {
    const root=$('pfAdminCreatorList'); if(!root)return; root.replaceChildren();
    if(!items.length){appendText(root,'p','No hay solicitudes de creadores registradas.','pf-v9-empty');return;}
    items.forEach(item=>{
      const card=document.createElement('article'); card.className='pf-admin-card';
      appendText(card,'h4',`${item.alias||item.nombre_publico||'Creador'} · ${item.perfil||'sin perfil'}`);
      appendText(card,'p',`${item.nombre_publico||''} · ${item.correo||''}`);
      appendText(card,'p',`Juego: ${item.ya_creo_videojuego||'—'} · Streams previos: ${item.ya_hizo_streams||'—'}`);
      if(item.nombre_idea_videojuego) appendText(card,'p','Idea: '+item.nombre_idea_videojuego);
      if(item.concepto_videojuego) appendText(card,'p','Concepto: '+item.concepto_videojuego);
      if(item.videojuego_existente) appendText(card,'p','Proyecto anterior: '+item.videojuego_existente);
      if(item.enlace_videojuego) { const a=document.createElement('a'); a.href=item.enlace_videojuego; a.target='_blank'; a.rel='noopener noreferrer'; a.textContent='Ver demo/portafolio'; card.append(a); }
      if(item.canal_stream) { const a=document.createElement('a'); a.href=item.canal_stream; a.target='_blank'; a.rel='noopener noreferrer'; a.textContent='Ver canal de stream'; card.append(a); }
      if(item.propuesta) appendText(card,'p','Propuesta: '+item.propuesta);
      appendText(card,'small',`Recibida: ${dateLabel(item.created_at)} · Cuota sugerida: $${Number(item.cuota_recuperacion_mxn||0).toFixed(2)} MXN`);
      const controls=document.createElement('div'); controls.className='pf-admin-controls';
      const state=makeSelect(STATUS_CREATOR,item.estado); const fee=makeSelect(STATUS_FEE,item.cuota_estado);
      const save=adminAction('Guardar estado',async()=>{await adminSetStatus('pf_v9_creator_applications',item.id,{estado:state.value,cuota_estado:fee.value}); const st=$('pfAdminStatus'); if(st)st.textContent='Solicitud de creador actualizada. El pago se registra de forma manual; no se procesó ningún cobro.'; await loadAdminPanel();});
      appendText(controls,'label','Solicitud'); controls.append(state); appendText(controls,'label','Cuota'); controls.append(fee,save);
      card.append(controls); root.append(card);
    });
  }
  function extractTwitchChannel(item) {
    if(item.plataforma!=='Twitch')return null;
    try { const u=new URL(item.url_canal); if(!/(^|\.)twitch\.tv$/i.test(u.hostname))return null; const slug=u.pathname.split('/').filter(Boolean)[0]||''; return /^[A-Za-z0-9_]{1,60}$/.test(slug)?slug:null; } catch {return null;}
  }
  async function approveAndFeatureStream(item) {
    await adminSetStatus('pf_v9_stream_requests',item.id,{estado:'aprobada'});
    const db=dbClient(); const row={solicitud_id:item.id,nombre_publico:item.nombre_publico,plataforma:item.plataforma,url_canal:item.url_canal,canal_twitch:extractTwitchChannel(item),activo:true};
    const {error}=await db.from('pf_v9_featured_streams').upsert(row,{onConflict:'solicitud_id'});
    if(error) throw error;
    if($('pfAdminStatus')) $('pfAdminStatus').textContent='Solicitud aprobada y canal destacado. Revisa que la autorización sea válida antes de publicar.';
    await loadAdminPanel(); await loadPublicFeaturedStreams();
  }
  function renderAdminStreams(items) {
    const root=$('pfAdminStreamList'); if(!root)return; root.replaceChildren();
    if(!items.length){appendText(root,'p','No hay solicitudes de stream registradas.','pf-v9-empty');return;}
    items.forEach(item=>{
      const card=document.createElement('article'); card.className='pf-admin-card';
      appendText(card,'h4',item.nombre_publico||'Canal sin nombre');
      appendText(card,'p',`${item.correo||''} · ${item.plataforma||''}`);
      const a=document.createElement('a'); a.href=item.url_canal; a.target='_blank'; a.rel='noopener noreferrer'; a.textContent='Abrir canal solicitado'; card.append(a);
      appendText(card,'p',item.contenido||'Sin descripción de contenido');
      appendText(card,'small',`Permiso declarado: ${item.permiso_declarado?'sí':'no'} · Reglas aceptadas: ${item.acepta_reglas?'sí':'no'} · ${dateLabel(item.created_at)}`);
      const controls=document.createElement('div'); controls.className='pf-admin-controls';
      const state=makeSelect(STATUS_STREAM,item.estado);
      controls.append(state,adminAction('Guardar estado',async()=>{await adminSetStatus('pf_v9_stream_requests',item.id,{estado:state.value}); if($('pfAdminStatus'))$('pfAdminStatus').textContent='Estado de solicitud de stream actualizado.'; await loadAdminPanel();},true));
      if(item.estado!=='aprobada') controls.append(adminAction('Aprobar y destacar canal',()=>approveAndFeatureStream(item)));
      else controls.append(adminAction('Volver a destacar',()=>approveAndFeatureStream(item),true));
      const deactivate=adminAction('Retirar de destacados',async()=>{const db=dbClient(); const {error}=await db.from('pf_v9_featured_streams').update({activo:false}).eq('solicitud_id',item.id); if(error)throw error; await loadPublicFeaturedStreams(); if($('pfAdminStatus'))$('pfAdminStatus').textContent='Canal retirado de destacados; la solicitud se conserva.';},true);
      controls.append(deactivate); card.append(controls); root.append(card);
    });
  }
  function renderAdminReports(items) {
    const root=$('pfAdminReportList'); if(!root)return; root.replaceChildren();
    if(!items.length){appendText(root,'p','No hay reportes registrados.','pf-v9-empty');return;}
    items.forEach(item=>{
      const card=document.createElement('article'); card.className='pf-admin-card';
      appendText(card,'h4',`${item.tipo||'Reporte'} · ${item.resumen||'Sin resumen'}`);
      appendText(card,'p',item.detalle||'Sin detalle');
      appendText(card,'small',`${dateLabel(item.created_at)} · ${item.pagina_url||''}`);
      const controls=document.createElement('div'); controls.className='pf-admin-controls'; const state=makeSelect(STATUS_REPORT,item.estado);
      controls.append(state,adminAction('Guardar estado',async()=>{await adminSetStatus('pf_v9_reports',item.id,{estado:state.value}); if($('pfAdminStatus'))$('pfAdminStatus').textContent='Estado del reporte actualizado.'; await loadAdminPanel();}));
      card.append(controls); root.append(card);
    });
  }
  async function loadPublicFeaturedStreams() {
    const root=$('pfApprovedStreams'); if(!root)return;
    const db=dbClient(); if(!db)return;
    try {
      const {data,error}=await db.from('pf_v9_featured_streams').select('id,nombre_publico,plataforma,url_canal,canal_twitch,activo').eq('activo',true).order('created_at',{ascending:false}).limit(50);
      if(error)throw error;
      root.replaceChildren();
      if(!data?.length){appendText(root,'p','Todavía no hay canales con permiso confirmados para aparecer aquí.','pf-v9-empty');return;}
      data.forEach(item=>{
        const card=document.createElement('article'); card.className='pf-v9-local-item';
        appendText(card,'strong',item.nombre_publico||item.canal_twitch||'Canal destacado');
        appendText(card,'p',item.plataforma+' · canal aprobado por PixelForge');
        if(item.plataforma==='Twitch' && item.canal_twitch) {
          card.append(adminAction('Ver directo',()=>{const inp=$('pfV9Channel');const form=$('pfV9StreamForm');if(inp)inp.value=item.canal_twitch;location.hash='#streamers';form?.requestSubmit();}));
        } else {
          const a=document.createElement('a');a.href=item.url_canal;a.target='_blank';a.rel='noopener noreferrer';a.className='boton';a.textContent='Abrir directo';card.append(a);
        }
        root.append(card);
      });
    } catch(error) { console.warn('No se pudo cargar la lista pública de streams destacados:',error); }
  }
  function setupAdminPanel() {
    const nav=$('pfAdminNavLink');
    if(nav) nav.hidden=!adminAllowed();
    $('pfAdminRefresh')?.addEventListener('click',loadAdminPanel);
    window.addEventListener('pixelforge:supabase-sync-complete', () => { if (adminAllowed()) loadAdminPanel(); });
    window.addEventListener('pixelforge:admin-state',()=>{if(nav)nav.hidden=!adminAllowed();if(location.hash==='#administracion')loadAdminPanel();});
    window.addEventListener('pixelforge:auth',()=>{if(location.hash==='#administracion')setTimeout(loadAdminPanel,0);});
    window.addEventListener('hashchange',()=>{if(location.hash==='#administracion')loadAdminPanel();});
    if(location.hash==='#administracion') loadAdminPanel();
  }
  function setContact(id, value, kind) {
    const el=$(id); if (!el || !value) return;
    let href=value;
    if (kind==='email') href='mailto:'+value;
    if (kind==='whatsapp') href='https://wa.me/'+value.replace(/\D/g,'');
    if (kind==='social') { if (!/^https?:\/\//i.test(href)) href='https://'+href; }
    el.textContent=value; el.href=href; el.target=kind==='email' || kind==='whatsapp' ? '_self' : '_blank';
    if (el.target==='_blank') el.rel='noopener noreferrer';
  }
  function setupContacts() {
    const cfg=window.PIXELFORGE_CONFIG || {};
    setContact('pfV9ContactEmail',String(cfg.contactEmail||'').trim(),'email');
    setContact('pfV9ContactWhatsapp',String(cfg.whatsapp||'').trim(),'whatsapp');
    setContact('pfV9ContactSocial',String(cfg.social||'').trim(),'social');
  }
  function init() {
    setupStream(); setupReports(); setupCreatorHub(); setupContacts(); setupAdminPanel(); updateDashboard();
    document.querySelectorAll('[data-favorito]').forEach(button=>button.addEventListener('click',()=>setTimeout(updateDashboard,80)));
    const catalogue=document.getElementById('catalogoDinamico');
    if (catalogue && window.MutationObserver) new MutationObserver(updateDashboard).observe(catalogue,{childList:true,subtree:true});
    const games=document.getElementById('contenedorJuegos');
    if (games && window.MutationObserver) new MutationObserver(updateDashboard).observe(games,{childList:true,subtree:true});
    window.addEventListener('storage',updateDashboard);
    window.addEventListener('hashchange',updateDashboard);
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();


/* ===== Módulo consolidado: admin-v10.js ===== */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const bridge = () => window.PIXELFORGE_ADMIN_BRIDGE || null;
  const dbClient = () => bridge()?.getClient?.() || null;
  const currentUser = () => bridge()?.getUser?.() || null;
  const isAdmin = () => Boolean(bridge()?.isAdmin?.());
  let myCollaboratorProfile = null;
  let refreshRunning = false;
  const V10_QUEUE_KEY = 'pixelforge_v10_pending_sync_v1';
  function queueV10(type, payload, error) {
    try { const queue = JSON.parse(localStorage.getItem(V10_QUEUE_KEY) || '[]'); const id = payload.id || (window.crypto?.randomUUID ? window.crypto.randomUUID() : ''); const storedPayload = { ...payload }; if (type !== 'collaborator' && id) storedPayload.id = id; queue.push({ id, type, user_id: payload.user_id || payload.solicitante_id || payload.created_by, payload: storedPayload, queued_at: new Date().toISOString(), last_error: String(error?.message || error || 'Sin conexión') }); localStorage.setItem(V10_QUEUE_KEY, JSON.stringify(queue)); return true; } catch (storageError) { console.warn('No se pudo guardar la cola V10 local:', storageError); return false; }
  }

  function isRealUser() {
    const user = currentUser();
    return Boolean(user?.id && user.id !== 'invitado-local' && dbClient());
  }

  function setText(id, value) {
    const node = $(id);
    if (node) node.textContent = String(value ?? '');
  }

  function setStatus(id, value, isError = false) {
    const node = $(id);
    if (!node) return;
    node.textContent = value;
    node.classList.toggle('pf10-error', Boolean(isError));
  }

  function make(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined && value !== null) node.textContent = String(value);
    return node;
  }

  function dateLabel(value) {
    if (!value) return 'Fecha no disponible';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('es-MX');
  }

  function statusLabel(value) {
    const labels = {
      pendiente: 'Pendiente', en_revision: 'En revisión', resuelto: 'Resuelto', cerrado: 'Cerrado',
      aceptada: 'Aceptada', rechazada: 'Rechazada', en_curso: 'En curso', finalizada: 'Finalizada',
      cancelada: 'Cancelada', aprobado: 'Aprobado', rechazada_colaborador: 'Rechazada', suspendido: 'Suspendido'
    };
    return labels[value] || value || 'Sin estado';
  }

  function specialtyLabel(value) {
    const labels = {
      streamer: 'Streamer',
      programador: 'Programador',
      aficionado: 'Aficionado a los videojuegos'
    };
    return labels[value] || value || 'Usuario';
  }

  function addPanels() {
    if ($('pfV10UserDashboard')) return;
    const main = document.querySelector('main');
    const nav = document.querySelector('.pf-header nav');
    if (!main || !nav) return;

    const reportLink = nav.querySelector('a[href="#reportes"]');
    const navMarkup = `
      <a href="#pfV10UserDashboard" id="pfV10UserNav" hidden>Mi dashboard</a>
      <a href="#pfV10Directory" id="pfV10DirectoryNav" hidden>Colaboradores</a>
      <a href="#pfV10CollaboratorDashboard" id="pfV10CollaboratorNav" hidden>Panel colaborador</a>`;
    if (reportLink) reportLink.insertAdjacentHTML('afterend', navMarkup);
    else nav.insertAdjacentHTML('beforeend', navMarkup);

    main.insertAdjacentHTML('beforeend', `
      <section class="seccion pf10-section" id="pfV10UserDashboard" hidden>
        <p class="etiqueta">PIXELFORGE · ESPACIO PERSONAL</p>
        <h2>Mi dashboard</h2>
        <p class="descripcion">Consulta tus reportes, participa en sondeos y encuentra apoyo dentro de la comunidad PixelForge.</p>
        <div class="pf10-stats">
          <article class="pf10-stat"><span>Mis reportes</span><strong id="pf10ReportCount">0</strong></article>
          <article class="pf10-stat"><span>Mis asesorías</span><strong id="pf10AdviceCount">0</strong></article>
          <article class="pf10-stat"><span>Mi perfil</span><strong id="pf10RoleState">Usuario</strong></article>
        </div>
        <div class="pf10-grid">
          <article class="panel-pixel pf10-card">
            <h3>Crear un reporte</h3>
            <p>Describe errores, problemas con tu cuenta, contenido o ideas para mejorar PixelForge.</p>
            <form id="pf10ReportForm" class="pf10-form">
              <label for="pf10ReportType">Tipo de reporte</label>
              <select id="pf10ReportType" required>
                <option value="Error funcional">Error funcional</option>
                <option value="Cuenta o acceso">Cuenta o acceso</option>
                <option value="Diseño o accesibilidad">Diseño o accesibilidad</option>
                <option value="Catálogo o videojuegos">Catálogo o videojuegos</option>
                <option value="Streams o música">Streams o música</option>
                <option value="Sugerencia">Sugerencia</option>
                <option value="Otro">Otro</option>
              </select>
              <label for="pf10ReportTitle">Resumen</label>
              <input id="pf10ReportTitle" maxlength="120" required placeholder="Ej. No puedo guardar un videojuego">
              <label for="pf10ReportDetail">Describe lo ocurrido</label>
              <textarea id="pf10ReportDetail" rows="4" maxlength="2500" required placeholder="¿Qué pasó? ¿Qué esperabas que sucediera?"></textarea>
              <button class="boton" type="submit">Enviar reporte</button>
              <p id="pf10ReportStatus" class="pf10-status" role="status" aria-live="polite"></p>
            </form>
          </article>
          <article class="panel-pixel pf10-card">
            <h3>Estado de mis reportes</h3>
            <p>Las actualizaciones que haga el equipo aparecerán aquí.</p>
            <div id="pf10MyReports" class="pf10-list"><p>Inicia sesión para consultar tus reportes.</p></div>
          </article>
        </div>
        <article class="panel-pixel pf10-card pf10-wide">
          <h3>Sondeos de la comunidad</h3>
          <p>Participa en decisiones y propuestas para las próximas mejoras de PixelForge.</p>
          <div id="pf10PollList" class="pf10-list"><p>Cargando sondeos…</p></div>
        </article>
        <div class="pf10-grid">
          <article class="panel-pixel pf10-card">
            <h3>Solicitar incorporación como colaborador</h3>
            <p>Postúlate para apoyar a otros integrantes como streamer, programador o aficionado a los videojuegos. Tu solicitud debe ser aprobada por superadministración.</p>
            <form id="pf10CollaboratorApplyForm" class="pf10-form">
              <label for="pf10CollabName">Nombre público</label>
              <input id="pf10CollabName" maxlength="100" required placeholder="Nombre que verá la comunidad">
              <label for="pf10CollabSpecialty">Especialidad principal</label>
              <select id="pf10CollabSpecialty" required>
                <option value="streamer">Streamer y creación de contenido</option>
                <option value="programador">Programador y desarrollo</option>
                <option value="aficionado">Aficionado a los videojuegos</option>
              </select>
              <label for="pf10CollabBio">¿En qué puedes ayudar?</label>
              <textarea id="pf10CollabBio" rows="3" maxlength="700" required placeholder="Cuéntale a la comunidad qué conocimientos o experiencia puedes compartir."></textarea>
              <button class="boton" type="submit">Enviar solicitud</button>
              <p id="pf10ApplyStatus" class="pf10-status" role="status" aria-live="polite"></p>
            </form>
            <div id="pf10MyCollabState" class="pf10-status" role="status" aria-live="polite"></div>
          </article>
          <article class="panel-pixel pf10-card">
            <h3>Mis solicitudes de asesoría</h3>
            <p>Consulta si el colaborador aceptó tu solicitud y lee sus respuestas.</p>
            <div id="pf10MyAdvice" class="pf10-list"><p>Aún no has solicitado asesorías.</p></div>
          </article>
        </div>
      </section>

      <section class="seccion pf10-section" id="pfV10Directory" hidden>
        <p class="etiqueta">PIXELFORGE · APOYO ENTRE LA COMUNIDAD</p>
        <h2>Directorio de colaboradores</h2>
        <p class="descripcion">Encuentra personas aprobadas por PixelForge y solicita una asesoría rápida para tus ideas, proyectos o dudas.</p>
        <div id="pf10DirectoryList" class="pf10-directory"><p>Inicia sesión para consultar colaboradores.</p></div>
      </section>

      <section class="seccion pf10-section" id="pfV10CollaboratorDashboard" hidden>
        <p class="etiqueta">PIXELFORGE · ESPACIO DE COLABORACIÓN</p>
        <h2>Dashboard de colaborador</h2>
        <p class="descripcion">Administra tu disponibilidad y atiende las solicitudes de asesoría que te envíe la comunidad.</p>
        <article class="panel-pixel pf10-card">
          <div class="pf10-profile-head"><div><h3 id="pf10CollaboratorName">Colaborador</h3><p id="pf10CollaboratorSpecialty">Especialidad</p></div><button type="button" class="boton boton-secundario" id="pf10ToggleAvailability">Cambiar disponibilidad</button></div>
          <p id="pf10AvailabilityStatus" class="pf10-status" role="status"></p>
        </article>
        <article class="panel-pixel pf10-card pf10-wide">
          <h3>Solicitudes recibidas</h3>
          <p>Al aceptar una solicitud podrás iniciar la asesoría y marcarla como finalizada cuando termines.</p>
          <div id="pf10CollaboratorRequests" class="pf10-request-groups">
            <section class="pf10-request-group"><h4>Solicitudes activas</h4><div id="pf10CollaboratorPending" class="pf10-list"><p>No hay solicitudes activas.</p></div></section>
            <section class="pf10-request-group"><h4>Historial de asesorías</h4><div id="pf10CollaboratorHistory" class="pf10-list"><p>Aún no hay asesorías finalizadas o rechazadas.</p></div></section>
          </div>
          <p id="pf10CollaboratorStatus" class="pf10-status" role="status" aria-live="polite"></p>
        </article>
      </section>`);

    const adminWorkspace = $('pfAdminWorkspace');
    if (adminWorkspace && !$('pf10AdminExtension')) {
      adminWorkspace.insertAdjacentHTML('beforeend', `
        <section class="pf10-admin-extension" id="pf10AdminExtension">
          <p class="etiqueta">PIXELFORGE · SUPERADMINISTRACIÓN</p>
          <h3>Gestión de colaboradores y asesorías</h3>
          <p>Aprueba a quienes podrán ofrecer asesorías y supervisa las solicitudes de la comunidad.</p>
          <div class="pf10-stats">
            <article class="pf10-stat"><span>Colaboradores registrados</span><strong id="pf10AdminCollabCount">0</strong></article>
            <article class="pf10-stat"><span>Asesorías registradas</span><strong id="pf10AdminAdviceCount">0</strong></article>
            <article class="pf10-stat"><span>Sondeos activos</span><strong id="pf10AdminPollCount">0</strong></article>
          </div>
          <div class="pf10-grid">
            <article class="pf10-card">
              <h4>Solicitudes de colaboración</h4>
              <div id="pf10AdminCollaborators" class="pf10-list"><p>Cargando colaboradores…</p></div>
            </article>
            <article class="pf10-card">
              <h4>Supervisión de asesorías</h4>
              <div id="pf10AdminAdvice" class="pf10-list"><p>Cargando asesorías…</p></div>
            </article>
          </div>
          <article class="pf10-card pf10-wide">
            <h4>Crear un sondeo</h4>
            <form id="pf10PollCreateForm" class="pf10-form">
              <label for="pf10PollQuestion">Pregunta</label>
              <input id="pf10PollQuestion" maxlength="180" required placeholder="Ej. ¿Qué función debería mejorar PixelForge primero?">
              <label for="pf10PollOptions">Opciones (una por línea, entre 2 y 6)</label>
              <textarea id="pf10PollOptions" rows="4" required placeholder="Mejorar la biblioteca&#10;Agregar más videojuegos&#10;Mejorar los perfiles"></textarea>
              <button class="boton" type="submit">Publicar sondeo</button>
              <p id="pf10PollAdminStatus" class="pf10-status" role="status" aria-live="polite"></p>
            </form>
            <h4>Sondeos publicados</h4>
            <div id="pf10AdminPolls" class="pf10-list"><p>Aún no hay sondeos.</p></div>
          </article>
          <p id="pf10AdminStatus" class="pf10-status" role="status" aria-live="polite"></p>
          <button type="button" class="boton boton-secundario" id="pf10AdminRefresh">Actualizar panel de superadministración</button>
        </section>`);
    }

    const adminLink = $('pfAdminNavLink');
    if (adminLink) adminLink.textContent = 'Superadministración';
  }

  function wrapSubsection(node, title, description = '', open = false, id = '') {
    if (!node || !node.parentNode) return null;
    const details = document.createElement('details');
    details.className = 'pf10-subsection';
    if (id) details.id = id;
    details.open = Boolean(open);
    const summary = make('summary', 'pf10-subsection-title', title);
    const content = make('div', 'pf10-subsection-content');
    if (description) content.append(make('p', 'pf10-subsection-description', description));
    node.parentNode.insertBefore(details, node);
    content.append(node);
    details.append(summary, content);
    return details;
  }

  function organizeDashboardSections() {
    const user = $('pfV10UserDashboard');
    if (user && !user.dataset.organized) {
      const stats = user.querySelector('.pf10-stats');
      if (stats) user.insertBefore(make('h3', 'pf10-section-heading', 'Resumen general'), stats);
      const grids = user.querySelectorAll(':scope > .pf10-grid');
      const polls = user.querySelector(':scope > .pf10-wide');
      if (grids[0]) wrapSubsection(grids[0], '01 · Reportes y soporte', 'Crea un reporte y consulta el seguimiento que realiza el equipo.', true, 'pf10UserReportsSection');
      if (polls) wrapSubsection(polls, '02 · Comunidad y sondeos', 'Participa en las decisiones y propuestas de PixelForge.', false, 'pf10UserPollsSection');
      if (grids[1]) wrapSubsection(grids[1], '03 · Colaboración y asesorías', 'Solicita incorporarte al equipo o revisa las asesorías que has solicitado.', false, 'pf10UserCollabSection');
      user.dataset.organized = 'true';
    }

    const collaborator = $('pfV10CollaboratorDashboard');
    if (collaborator && !collaborator.dataset.organized) {
      const cards = collaborator.querySelectorAll(':scope > article.pf10-card');
      if (cards[0]) wrapSubsection(cards[0], '01 · Mi perfil y disponibilidad', 'Mantén actualizado tu estado para que la comunidad sepa cuándo puede solicitarte apoyo.', true, 'pf10CollaboratorProfileSection');
      if (cards[1]) wrapSubsection(cards[1], '02 · Solicitudes y seguimiento', 'Atiende las solicitudes activas y consulta tu historial de asesorías.', false, 'pf10CollaboratorRequestsSection');
      collaborator.dataset.organized = 'true';
    }

    const admin = $('pf10AdminExtension');
    if (admin && !admin.dataset.organized) {
      const grid = admin.querySelector(':scope > .pf10-grid');
      const polls = admin.querySelector(':scope > .pf10-wide');
      if (grid) wrapSubsection(grid, '01 · Equipo y asesorías', 'Aprueba colaboradores y supervisa las solicitudes de apoyo.', true, 'pf10AdminTeamSection');
      if (polls) wrapSubsection(polls, '02 · Sondeos de la comunidad', 'Publica preguntas, revisa sondeos y cierra las votaciones.', false, 'pf10AdminPollsSection');
      admin.dataset.organized = 'true';
    }
  }

  function appendStateLine(parent, label, value) {
    const p = make('p', 'pf10-meta');
    p.append(make('strong', '', label + ': '), document.createTextNode(statusLabel(value)));
    parent.append(p);
  }

  async function loadMyReports(db, user) {
    const root = $('pf10MyReports');
    if (!root) return;
    const { data, error } = await db.from('pf_v9_reports')
      .select('id,tipo,resumen,detalle,estado,notas_administracion,created_at')
      .eq('created_by', user.id).order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    root.replaceChildren();
    const items = data || [];
    setText('pf10ReportCount', items.length);
    if (!items.length) { root.append(make('p', 'pf10-empty', 'Todavía no tienes reportes enviados desde una cuenta registrada.')); return; }
    items.forEach(item => {
      const card = make('article', 'pf10-item');
      card.append(make('strong', '', `${item.tipo} · ${item.resumen}`));
      appendStateLine(card, 'Estado', item.estado);
      card.append(make('small', '', dateLabel(item.created_at)));
      if (item.notas_administracion) card.append(make('p', 'pf10-response', 'Respuesta del equipo: ' + item.notas_administracion));
      root.append(card);
    });
  }

  async function loadMyAdvice(db, user) {
    const root = $('pf10MyAdvice');
    if (!root) return;
    const { data, error } = await db.from('pf_v10_advice_requests')
      .select('id,tema,mensaje,estado,respuesta,created_at')
      .eq('solicitante_id', user.id).order('created_at', { ascending: false }).limit(40);
    if (error) throw error;
    root.replaceChildren();
    const items = data || [];
    setText('pf10AdviceCount', items.length);
    if (!items.length) { root.append(make('p', 'pf10-empty', 'Aún no has solicitado asesorías.')); return; }
    items.forEach(item => {
      const card = make('article', 'pf10-item');
      card.append(make('strong', '', item.tema));
      appendStateLine(card, 'Estado', item.estado);
      card.append(make('p', '', item.mensaje), make('small', '', dateLabel(item.created_at)));
      if (item.respuesta) card.append(make('p', 'pf10-response', 'Respuesta del colaborador: ' + item.respuesta));
      root.append(card);
    });
  }

  async function loadPolls(db, user) {
    const root = $('pf10PollList');
    if (!root) return;
    const [{ data: polls, error }, { data: votes, error: voteError }] = await Promise.all([
      db.from('pf_v10_polls').select('id,question,options,active,created_at').eq('active', true).order('created_at', { ascending: false }),
      db.from('pf_v10_poll_votes').select('poll_id,option_index').eq('user_id', user.id)
    ]);
    if (error) throw error;
    if (voteError) throw voteError;
    root.replaceChildren();
    if (!polls?.length) { root.append(make('p', 'pf10-empty', 'Por ahora no hay sondeos activos.')); return; }
    const voted = new Map((votes || []).map(v => [v.poll_id, v.option_index]));
    for (const poll of polls) {
      const card = make('article', 'pf10-item pf10-poll');
      card.append(make('strong', '', poll.question));
      const voteIndex = voted.get(poll.id);
      const resultsBox = make('div', 'pf10-poll-results');
      let results = [];
      try {
        const response = await db.rpc('pf_v10_poll_results', { p_poll_id: poll.id });
        if (!response.error) results = response.data || [];
      } catch (e) { console.warn('No se pudieron cargar resultados del sondeo:', e); }
      const total = results.reduce((sum, row) => sum + Number(row.total_votes || 0), 0);
      if (voteIndex) {
        card.append(make('p', 'pf10-meta', `Ya participaste. Votos registrados: ${total}.`));
        results.forEach(row => {
          const line = make('p', 'pf10-result-line', `${row.option_label}: ${row.total_votes} voto(s)` + (Number(row.option_index) === Number(voteIndex) ? ' · Tu elección' : ''));
          resultsBox.append(line);
        });
        card.append(resultsBox);
      } else {
        const form = make('form', 'pf10-form');
        (poll.options || []).forEach((option, index) => {
          const label = make('label', 'pf10-radio-label');
          const radio = document.createElement('input');
          radio.type = 'radio'; radio.name = 'pf10-poll-' + poll.id; radio.value = String(index + 1); radio.required = true;
          label.append(radio, document.createTextNode(' ' + option));
          form.append(label);
        });
        const button = make('button', 'boton', 'Enviar voto'); button.type = 'submit'; form.append(button);
        form.addEventListener('submit', async event => {
          event.preventDefault();
          const selected = form.querySelector('input[type="radio"]:checked');
          if (!selected) return;
          button.disabled = true;
          try {
            const { error: rpcError } = await db.rpc('pf_v10_vote_poll', { p_poll_id: poll.id, p_option_index: Number(selected.value) });
            if (rpcError) throw rpcError;
            setStatus('pf10ReportStatus', 'Tu voto quedó registrado.');
            await loadPolls(db, user);
          } catch (e) { setStatus('pf10ReportStatus', 'No se pudo registrar el voto: ' + e.message, true); button.disabled = false; }
        });
        card.append(form);
      }
      root.append(card);
    }
  }

  async function loadCollaboratorProfile(db, user) {
    const { data, error } = await db.from('pf_v10_collaborators').select('*').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    myCollaboratorProfile = data || null;
    const form = $('pf10CollaboratorApplyForm');
    const state = $('pf10MyCollabState');
    if (form) form.hidden = Boolean(data);
    if (state) {
      state.textContent = data
        ? `Tu solicitud de colaboración está: ${statusLabel(data.estado)}. Especialidad: ${data.especialidad}.`
        : 'Todavía no tienes una solicitud de colaboración.';
    }
    const approved = data?.estado === 'aprobado';
    const accountStatus = approved
      ? specialtyLabel(data.especialidad)
      : data?.estado === 'pendiente' ? 'Solicitud pendiente' : 'Usuario';
    setText('pf10RoleState', accountStatus);
    setText('pfProfileStatus', approved ? specialtyLabel(data.especialidad) : accountStatus);
    if ($('pf10CollaboratorNav')) $('pf10CollaboratorNav').hidden = !approved;
    if ($('pfV10CollaboratorDashboard')) $('pfV10CollaboratorDashboard').hidden = !approved;
    if (approved) {
      setText('pf10CollaboratorName', data.nombre_publico);
      setText('pf10CollaboratorSpecialty', specialtyLabel(data.especialidad) + ' · ' + (data.presentacion || ''));
      setText('pf10AvailabilityStatus', data.disponible ? 'Estás disponible para recibir asesorías.' : 'Tu perfil aparece como no disponible.');
      setText('pf10ToggleAvailability', data.disponible ? 'Pausar solicitudes' : 'Volver a estar disponible');
      await loadCollaboratorRequests(db, user);
    }
  }

  async function loadDirectory(db, user) {
    const root = $('pf10DirectoryList');
    if (!root) return;
    const { data, error } = await db.from('pf_v10_collaborators')
      .select('user_id,nombre_publico,especialidad,presentacion,disponible')
      .eq('estado', 'aprobado').order('nombre_publico', { ascending: true }).limit(100);
    if (error) throw error;
    root.replaceChildren();
    const items = (data || []).filter(item => item.user_id !== user.id);
    if (!items.length) { root.append(make('p', 'pf10-empty', 'Todavía no hay colaboradores aprobados disponibles en el directorio.')); return; }

    const groups = [
      { key: 'streamer', label: 'Streamers y creadores de contenido' },
      { key: 'programador', label: 'Programadores y desarrolladores' },
      { key: 'aficionado', label: 'Aficionados a los videojuegos' }
    ];
    const normalized = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (const group of groups) {
      const members = items.filter(item => normalized(item.especialidad).includes(group.key));
      if (!members.length) continue;
      const block = make('section', 'pf10-directory-group');
      block.append(make('h3', 'pf10-directory-heading', group.label));
      const cards = make('div', 'pf10-directory-cards');
      members.forEach(item => {
        const card = make('article', 'pf10-directory-card');
        card.append(make('h3', '', item.nombre_publico));
        card.append(make('span', 'pf10-specialty', item.especialidad));
        card.append(make('p', '', item.presentacion || 'Colaborador de PixelForge.'));
        card.append(make('small', item.disponible ? 'pf10-available' : 'pf10-unavailable', item.disponible ? 'Disponible para asesorías' : 'No disponible por ahora'));
        const form = make('form', 'pf10-form pf10-advice-form');
        form.dataset.collaboratorId = item.user_id;
        const topicLabel = make('label', '', 'Tema de la asesoría');
        const topic = document.createElement('select'); topic.required = true;
        ['Programación','Transmisiones y streaming','Videojuegos','Idea o proyecto','Creación de contenido','Otro'].forEach(value => {
          const option = document.createElement('option'); option.value = value; option.textContent = value; topic.append(option);
        });
        const msgLabel = make('label', '', '¿Qué necesitas resolver?');
        const message = document.createElement('textarea'); message.rows = 3; message.maxLength = 1200; message.required = true; message.placeholder = 'Explica brevemente tu duda o idea.';
        const button = make('button', 'boton', 'Solicitar asesoría'); button.type = 'submit'; button.disabled = !item.disponible;
        form.append(topicLabel, topic, msgLabel, message, button);
        const status = make('p', 'pf10-status'); status.setAttribute('role','status');
        form.addEventListener('submit', async event => {
          event.preventDefault();
          button.disabled = true;
          const advicePayload = {
            id: (window.crypto?.randomUUID ? window.crypto.randomUUID() : undefined),
            solicitante_id: user.id, colaborador_id: item.user_id,
            tema: topic.value, mensaje: message.value.trim(), estado: 'pendiente'
          };
          try {
            const { error: insertError } = await db.from('pf_v10_advice_requests').insert(advicePayload);
            if (insertError) throw insertError;
            status.textContent = 'Solicitud enviada. Podrás revisar la respuesta en Mi dashboard.';
            form.reset();
            await loadMyAdvice(db, user);
          } catch (e) { const saved = queueV10('advice', advicePayload, e); status.textContent = saved ? 'No llegó a Supabase. La solicitud quedó guardada en este navegador para reintentarla al recuperar la conexión.' : 'No se pudo enviar ni guardar localmente: ' + e.message; status.classList.add('pf10-error'); }
          finally { button.disabled = !item.disponible; }
        });
        card.append(form, status);
        cards.append(card);
      });
      block.append(cards);
      root.append(block);
    }
  }

  async function loadCollaboratorRequests(db, user) {
    const activeRoot = $('pf10CollaboratorPending');
    const historyRoot = $('pf10CollaboratorHistory');
    const fallbackRoot = $('pf10CollaboratorRequests');
    if (!activeRoot && !historyRoot && !fallbackRoot) return;
    const { data, error } = await db.from('pf_v10_advice_requests')
      .select('id,solicitante_id,tema,mensaje,estado,respuesta,created_at')
      .eq('colaborador_id', user.id).order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    if (activeRoot) activeRoot.replaceChildren();
    if (historyRoot) historyRoot.replaceChildren();
    if (fallbackRoot && !activeRoot && !historyRoot) fallbackRoot.replaceChildren();
    const isHistory = item => ['finalizada','rechazada','cancelada'].includes(item.estado);
    if (!data?.length) {
      const empty = make('p', 'pf10-empty', 'Aún no has recibido solicitudes de asesoría.');
      (activeRoot || fallbackRoot)?.append(empty);
      return;
    }
    data.forEach(item => {
      const card = make('article', 'pf10-item');
      card.append(make('strong', '', item.tema));
      card.append(make('small', '', 'Solicitud de cuenta: ' + String(item.solicitante_id).slice(0, 8) + '… · ' + dateLabel(item.created_at)));
      card.append(make('p', '', item.mensaje));
      appendStateLine(card, 'Estado', item.estado);
      const response = document.createElement('textarea'); response.rows = 2; response.maxLength = 1200; response.placeholder = 'Respuesta para la persona solicitante…'; response.value = item.respuesta || '';
      card.append(make('label', '', 'Tu respuesta'), response);
      const controls = make('div', 'pf10-actions');
      const actions = [];
      if (item.estado === 'pendiente') actions.push(['Aceptar','aceptada'],['Rechazar','rechazada']);
      if (item.estado === 'aceptada') actions.push(['Iniciar asesoría','en_curso']);
      if (item.estado === 'en_curso') actions.push(['Finalizar asesoría','finalizada']);
      actions.forEach(([label, nextState]) => {
        const button = make('button', 'boton boton-secundario', label); button.type = 'button';
        button.addEventListener('click', async () => {
          button.disabled = true;
          try {
            const { error: updateError } = await db.from('pf_v10_advice_requests')
              .update({ estado: nextState, respuesta: response.value.trim() }).eq('id', item.id);
            if (updateError) throw updateError;
            setStatus('pf10CollaboratorStatus', 'Solicitud actualizada: ' + statusLabel(nextState));
            await loadCollaboratorRequests(db, user);
            await loadMyAdvice(db, user);
          } catch (e) { setStatus('pf10CollaboratorStatus', 'No se pudo actualizar: ' + e.message, true); button.disabled = false; }
        });
        controls.append(button);
      });
      if (actions.length) card.append(controls);
      const target = isHistory(item) ? (historyRoot || fallbackRoot) : (activeRoot || fallbackRoot);
      target?.append(card);
    });
    if (activeRoot && !activeRoot.children.length) activeRoot.append(make('p', 'pf10-empty', 'No tienes solicitudes activas.'));
    if (historyRoot && !historyRoot.children.length) historyRoot.append(make('p', 'pf10-empty', 'Aún no hay asesorías finalizadas o rechazadas.'));
  }

  async function handleReportSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget; // currentTarget deja de estar disponible después del primer await.
    const db = dbClient(); const user = currentUser(); const button = form.querySelector('button[type="submit"]');
    if (!db || !user?.id || user.id === 'invitado-local') { setStatus('pf10ReportStatus', 'Inicia sesión con tu cuenta PixelForge para enviar y consultar reportes.', true); return; }
    const payload = {
      id: (window.crypto?.randomUUID ? window.crypto.randomUUID() : undefined),
      tipo: $('pf10ReportType').value,
      resumen: $('pf10ReportTitle').value.trim(),
      detalle: $('pf10ReportDetail').value.trim(),
      pagina_url: location.href,
      navegador: navigator.userAgent,
      estado: 'pendiente'
    };
    button.disabled = true;
    try {
      const { error } = await db.from('pf_v9_reports').insert(payload);
      if (error) throw error;
      form.reset();
      setStatus('pf10ReportStatus', 'Reporte enviado correctamente. Su estado aparecerá en esta pantalla.');
      await loadMyReports(db, user);
    } catch (e) { const saved = queueV10('report', { ...payload, created_by: user.id }, e); if (saved) form.reset(); setStatus('pf10ReportStatus', saved ? 'No se pudo conectar con Supabase. El reporte quedó guardado en este navegador para sincronizarlo al recuperar la conexión.' : 'No se pudo enviar ni guardar localmente: ' + e.message, true); }
    finally { button.disabled = false; }
  }

  async function handleCollaboratorApply(event) {
    event.preventDefault();
    const form = event.currentTarget; // conservar referencia antes de esperar a Supabase.
    const db = dbClient(); const user = currentUser(); const button = form.querySelector('button[type="submit"]');
    if (!db || !user?.id || user.id === 'invitado-local') { setStatus('pf10ApplyStatus', 'Inicia sesión para enviar tu solicitud.', true); return; }
    button.disabled = true;
    const collaboratorPayload = {
      user_id: user.id,
      nombre_publico: $('pf10CollabName').value.trim(),
      especialidad: $('pf10CollabSpecialty').value,
      presentacion: $('pf10CollabBio').value.trim(),
      estado: 'pendiente', disponible: false
    };
    try {
      const { error } = await db.from('pf_v10_collaborators').insert(collaboratorPayload);
      if (error) throw error;
      form.reset();
      setStatus('pf10ApplyStatus', 'Solicitud enviada. El superadministrador revisará tu perfil.');
      await loadCollaboratorProfile(db, user);
      await loadAdminExtension();
    } catch (e) { const saved = queueV10('collaborator', collaboratorPayload, e); if (saved) form.reset(); setStatus('pf10ApplyStatus', saved ? 'No llegó a Supabase. Tu solicitud quedó guardada en este navegador y se reintentará con tu cuenta al recuperar la conexión.' : 'No se pudo enviar ni guardar localmente: ' + e.message, true); }
    finally { button.disabled = false; }
  }

  async function toggleAvailability() {
    const db = dbClient(); const user = currentUser();
    if (!db || !user || !myCollaboratorProfile) return;
    const next = !myCollaboratorProfile.disponible;
    const { error } = await db.from('pf_v10_collaborators').update({ disponible: next }).eq('user_id', user.id);
    if (error) { setStatus('pf10AvailabilityStatus', 'No se pudo cambiar la disponibilidad: ' + error.message, true); return; }
    myCollaboratorProfile.disponible = next;
    setText('pf10AvailabilityStatus', next ? 'Estás disponible para recibir asesorías.' : 'Tu perfil aparece como no disponible.');
    setText('pf10ToggleAvailability', next ? 'Pausar solicitudes' : 'Volver a estar disponible');
    const dbUser = currentUser();
    if (dbUser) await loadDirectory(db, dbUser);
  }

  async function loadAdminExtension() {
    const db = dbClient();
    if (!db || !isAdmin()) return;
    const status = $('pf10AdminStatus');
    const specs = [
      ['pf_v10_collaborators','pf10AdminCollabCount','pf10AdminCollaborators',renderAdminCollaborators],
      ['pf_v10_advice_requests','pf10AdminAdviceCount','pf10AdminAdvice',renderAdminAdvice],
      ['pf_v10_polls','pf10AdminPollCount','pf10AdminPolls',renderAdminPolls]
    ];
    const results = await Promise.all(specs.map(async ([table]) => {
      try {
        const response = await db.from(table).select('*').order('created_at', { ascending: false }).limit(100);
        if (response.error) throw response.error;
        return { data: response.data || [], error: null };
      } catch (error) { return { data: [], error }; }
    }));
    let failures = 0;
    results.forEach((result,index) => {
      const [table,countId,rootId,renderer] = specs[index];
      if (result.error) {
        failures++;
        setText(countId,'—');
        const root = $(rootId);
        if (root) { root.replaceChildren(); root.append(make('p','pf10-error',table + ': ' + result.error.message)); }
        console.error('PixelForge V10 admin (' + table + '):',result.error);
      } else {
        setText(countId,index === 2 ? result.data.filter(p => p.active).length : result.data.length);
        renderer(result.data);
      }
    });
    if (status) status.textContent = failures
      ? 'Sincronización parcial: ' + (3-failures) + ' de 3 tablas V10 cargadas. Revisa el detalle de cada sección.'
      : 'Datos de colaboradores, asesorías y sondeos actualizados desde Supabase.';
  }

  function renderAdminCollaborators(items) {
    const root = $('pf10AdminCollaborators'); if (!root) return;
    root.replaceChildren();
    if (!items.length) { root.append(make('p', 'pf10-empty', 'No hay solicitudes de colaboradores.')); return; }
    items.forEach(item => {
      const card = make('article', 'pf10-item');
      card.append(make('strong', '', item.nombre_publico + ' · ' + item.especialidad));
      card.append(make('p', '', item.presentacion || 'Sin presentación.'));
      appendStateLine(card, 'Estado', item.estado);
      card.append(make('small', '', 'Usuario: ' + item.user_id + ' · ' + dateLabel(item.created_at)));
      const actions = make('div', 'pf10-actions');
      [['Aprobar','aprobado'],['Rechazar','rechazado'],['Suspender','suspendido']].forEach(([label, next]) => {
        const button = make('button', 'boton boton-secundario', label); button.type = 'button';
        button.addEventListener('click', async () => {
          button.disabled = true;
          try {
            const { error } = await dbClient().rpc('pf_v10_set_collaborator_status', { p_user_id: item.user_id, p_estado: next });
            if (error) throw error;
            setStatus('pf10AdminStatus', 'Estado actualizado: ' + item.nombre_publico + ' → ' + statusLabel(next));
            await loadAdminExtension();
            const user = currentUser(); if (user?.id === item.user_id) await refreshAll();
          } catch (e) { setStatus('pf10AdminStatus', 'No se pudo modificar el perfil: ' + e.message, true); button.disabled = false; }
        });
        actions.append(button);
      });
      card.append(actions); root.append(card);
    });
  }

  function renderAdminAdvice(items) {
    const root = $('pf10AdminAdvice'); if (!root) return;
    root.replaceChildren();
    if (!items.length) { root.append(make('p', 'pf10-empty', 'No hay asesorías registradas.')); return; }
    items.forEach(item => {
      const card = make('article', 'pf10-item');
      card.append(make('strong', '', item.tema));
      appendStateLine(card, 'Estado', item.estado);
      card.append(make('p', '', item.mensaje));
      card.append(make('small', '', 'Solicitante: ' + String(item.solicitante_id).slice(0, 8) + '… · Colaborador: ' + String(item.colaborador_id).slice(0, 8) + '… · ' + dateLabel(item.created_at)));
      if (!['finalizada','rechazada','cancelada'].includes(item.estado)) {
        const close = make('button', 'boton boton-secundario', 'Cerrar seguimiento'); close.type = 'button';
        close.addEventListener('click', async () => {
          close.disabled = true;
          try {
            const { error } = await dbClient().from('pf_v10_advice_requests').update({ estado: 'finalizada' }).eq('id', item.id);
            if (error) throw error;
            await loadAdminExtension();
          } catch (e) { setStatus('pf10AdminStatus', 'No se pudo cerrar el seguimiento: ' + e.message, true); close.disabled = false; }
        });
        card.append(close);
      }
      root.append(card);
    });
  }

  function renderAdminPolls(items) {
    const root = $('pf10AdminPolls'); if (!root) return;
    root.replaceChildren();
    if (!items.length) { root.append(make('p', 'pf10-empty', 'No hay sondeos creados.')); return; }
    items.forEach(item => {
      const card = make('article', 'pf10-item');
      card.append(make('strong', '', item.question));
      card.append(make('small', '', item.active ? 'Activo' : 'Cerrado'));
      if (item.active) {
        const button = make('button', 'boton boton-secundario', 'Cerrar sondeo'); button.type = 'button';
        button.addEventListener('click', async () => {
          button.disabled = true;
          try {
            const { error } = await dbClient().from('pf_v10_polls').update({ active: false }).eq('id', item.id);
            if (error) throw error;
            await loadAdminExtension();
            const user = currentUser(); if (user) await loadPolls(dbClient(), user);
          } catch (e) { setStatus('pf10AdminStatus', 'No se pudo cerrar el sondeo: ' + e.message, true); button.disabled = false; }
        });
        card.append(button);
      }
      root.append(card);
    });
  }

  async function handleCreatePoll(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!isAdmin()) { setStatus('pf10PollAdminStatus', 'Solo la superadministración puede publicar sondeos.', true); return; }
    const question = $('pf10PollQuestion').value.trim();
    const options = $('pf10PollOptions').value.split('\n').map(v => v.trim()).filter(Boolean);
    const button = form.querySelector('button[type="submit"]');
    if (options.length < 2 || options.length > 6) { setStatus('pf10PollAdminStatus', 'Escribe entre 2 y 6 opciones, una por línea.', true); return; }
    button.disabled = true;
    try {
      const { error } = await dbClient().from('pf_v10_polls').insert({ question, options, active: true });
      if (error) throw error;
      form.reset();
      setStatus('pf10PollAdminStatus', 'Sondeo publicado correctamente.');
      await loadAdminExtension();
      const user = currentUser(); if (user) await loadPolls(dbClient(), user);
    } catch (e) { setStatus('pf10PollAdminStatus', 'No se pudo publicar: ' + e.message, true); }
    finally { button.disabled = false; }
  }

  async function refreshAll() {
    if (refreshRunning) return;
    refreshRunning = true;
    try {
      const user = currentUser(); const db = dbClient();
      const admin = isAdmin();
      if (admin) await loadAdminExtension();
      const logged = isRealUser();
      if ($('pfV10UserNav')) $('pfV10UserNav').hidden = !logged;
      if ($('pfV10DirectoryNav')) $('pfV10DirectoryNav').hidden = !logged;
      if ($('pfV10UserDashboard')) $('pfV10UserDashboard').hidden = !logged;
      if ($('pfV10Directory')) $('pfV10Directory').hidden = !logged;
      if (!logged) {
        myCollaboratorProfile = null;
        if ($('pfV10CollaboratorNav')) $('pfV10CollaboratorNav').hidden = true;
        if ($('pfV10CollaboratorDashboard')) $('pfV10CollaboratorDashboard').hidden = true;
        return;
      }
      setText('pf10RoleState', 'Usuario');
      try {
        await loadCollaboratorProfile(db, user);
        await Promise.all([loadMyReports(db, user), loadMyAdvice(db, user), loadPolls(db, user), loadDirectory(db, user)]);
      } catch (e) {
        console.warn('PixelForge V10: no se pudieron cargar todos los datos del usuario:', e);
        setStatus('pf10MyCollabState', 'No se pudo cargar una parte del dashboard. Verifica la migración SQL V10. ' + e.message, true);
      }
    } finally { refreshRunning = false; }
  }

  function bindEvents() {
    $('pf10ReportForm')?.addEventListener('submit', handleReportSubmit);
    $('pf10CollaboratorApplyForm')?.addEventListener('submit', handleCollaboratorApply);
    $('pf10ToggleAvailability')?.addEventListener('click', toggleAvailability);
    $('pf10PollCreateForm')?.addEventListener('submit', handleCreatePoll);
    $('pf10AdminRefresh')?.addEventListener('click', loadAdminExtension);
    $('pfAdminRefresh')?.addEventListener('click', () => { if (isAdmin()) loadAdminExtension(); });
    window.addEventListener('pixelforge:auth', refreshAll);
    window.addEventListener('pixelforge:admin-state', refreshAll);
    window.addEventListener('pixelforge:supabase-sync-complete', () => { if (isAdmin()) loadAdminExtension(); refreshAll(); });
    window.addEventListener('hashchange', () => {
      if (location.hash === '#administracion' && isAdmin()) loadAdminExtension();
      if (isRealUser() && ['#pfV10UserDashboard','#pfV10Directory','#pfV10CollaboratorDashboard'].includes(location.hash)) refreshAll();
    });
  }

  function init() {
    addPanels();
    organizeDashboardSections();
    bindEvents();
    refreshAll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();

/* ===== Módulo consolidado: role-management.js ===== */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const bridge = () => window.PIXELFORGE_ADMIN_BRIDGE || null;
  const db = () => bridge()?.getClient?.() || null;
  const isAdmin = () => Boolean(bridge()?.isAdmin?.());
  const user = () => bridge()?.getUser?.() || null;

  const ROLES = [
    ['creador', 'Creador'],
    ['streamer', 'Streamer'],
    ['programador', 'Programador'],
    ['aficionado', 'Aficionado a los videojuegos'],
    ['colaborador', 'Colaborador'],
    ['moderador', 'Moderador']
  ];
  const ROLE_NAMES = Object.fromEntries(ROLES);
  let usersCache = [];
  let loading = false;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function setStatus(message, isError = false) {
    const status = $('pfRoleManagerStatus');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('pf-role-error', isError);
  }

  function ensurePanel() {
    const workspace = $('pfAdminWorkspace');
    if (!workspace || $('pfRoleManager')) return;
    const panel = document.createElement('section');
    panel.id = 'pfRoleManager';
    panel.className = 'pf-role-manager';
    panel.innerHTML = `
      <div class="pf-role-heading">
        <div><p class="etiqueta">PIXELFORGE · CONTROL DE ACCESOS</p><h3>Gestión de roles y permisos</h3>
        <p class="descripcion">Asigna varios roles a una misma cuenta. Los roles administrativos raíz se gestionan por separado y no pueden asignarse desde aquí.</p></div>
        <button type="button" class="boton boton-secundario" id="pfRoleReload">Actualizar usuarios</button>
      </div>
      <label class="pf-role-search-label" for="pfRoleSearch">Buscar cuenta</label>
      <input id="pfRoleSearch" class="pf-role-search" type="search" placeholder="Correo, nombre o ID de usuario">
      <p id="pfRoleManagerStatus" class="pf-role-status" role="status" aria-live="polite">Carga los usuarios para comenzar.</p>
      <div id="pfRoleUsers" class="pf-role-users"><p>Los usuarios aparecerán aquí.</p></div>
      <p class="pf-role-footnote">Los roles de esta sección no convierten una cuenta en superadministradora. El acceso administrativo raíz se conserva en pixelforge_admins y se valida en Supabase.</p>`;
    workspace.appendChild(panel);
    $('pfRoleReload')?.addEventListener('click', loadUsers);
    $('pfRoleSearch')?.addEventListener('input', renderUsers);
  }

  function roleLabel(code) {
    if (code === 'usuario') return 'Usuario';
    if (code === 'superadministrador') return 'Superadministrador';
    if (code === 'administrador') return 'Administrador';
    return ROLE_NAMES[code] || code;
  }

  function renderUsers() {
    const root = $('pfRoleUsers');
    if (!root) return;
    const term = String($('pfRoleSearch')?.value || '').trim().toLowerCase();
    const rows = usersCache.filter(item => [item.email, item.display_name, item.user_id].some(value => String(value || '').toLowerCase().includes(term)));
    root.replaceChildren();
    if (!rows.length) {
      root.append(el('p', 'pf-role-empty', usersCache.length ? 'No hay coincidencias.' : 'No se encontraron usuarios.'));
      return;
    }
    rows.forEach(item => {
      const card = el('article', 'pf-role-user');
      const top = el('div', 'pf-role-user-top');
      const identity = el('div', 'pf-role-identity');
      identity.append(el('strong', '', item.display_name || item.email || 'Usuario'));
      identity.append(el('span', '', item.email || item.user_id));
      identity.append(el('small', '', 'ID: ' + item.user_id));
      top.append(identity);
      const assigned = Array.isArray(item.roles) ? item.roles : ['usuario'];
      const chips = el('div', 'pf-role-chips');
      assigned.forEach(code => {
        const chip = el('span', 'pf-role-chip', roleLabel(code));
        if (code !== 'usuario' && code !== 'superadministrador' && code !== 'administrador') {
          const remove = el('button', 'pf-role-remove', '×');
          remove.type = 'button';
          remove.title = 'Retirar rol ' + roleLabel(code);
          remove.setAttribute('aria-label', 'Retirar rol ' + roleLabel(code));
          remove.addEventListener('click', () => changeRole('remove', item.user_id, code, remove));
          chip.append(remove);
        }
        chips.append(chip);
      });
      const controls = el('div', 'pf-role-controls');
      const select = document.createElement('select');
      select.className = 'pf-role-select';
      select.setAttribute('aria-label', 'Seleccionar rol para ' + (item.email || item.user_id));
      select.append(new Option('Seleccionar rol…', ''));
      ROLES.forEach(([code, label]) => {
        if (!assigned.includes(code)) select.append(new Option(label, code));
      });
      const add = el('button', 'boton boton-secundario', 'Asignar rol');
      add.type = 'button';
      add.disabled = select.options.length < 2;
      add.addEventListener('click', () => {
        if (!select.value) { setStatus('Selecciona un rol antes de asignarlo.', true); return; }
        changeRole('assign', item.user_id, select.value, add);
      });
      controls.append(select, add);
      card.append(top, chips, controls);
      root.append(card);
    });
  }

  async function loadUsers() {
    if (loading) return;
    if (!isAdmin()) { setStatus('No tienes permisos para gestionar roles.', true); return; }
    const client = db();
    if (!client) { setStatus('No se detectó la conexión con Supabase.', true); return; }
    loading = true;
    const button = $('pfRoleReload');
    if (button) button.disabled = true;
    setStatus('Cargando usuarios y roles…');
    try {
      const { data, error } = await client.rpc('pf_rbac_list_users');
      if (error) throw error;
      usersCache = Array.isArray(data) ? data : [];
      renderUsers();
      setStatus('Se cargaron ' + usersCache.length + ' cuentas. Puedes asignar o retirar roles.');
    } catch (error) {
      console.error('PixelForge RBAC:', error);
      setStatus('No se pudieron cargar los usuarios: ' + (error.message || 'Error desconocido') + '. Comprueba que ejecutaste roles.sql.', true);
    } finally {
      loading = false;
      if (button) button.disabled = false;
    }
  }

  async function changeRole(action, userId, roleCode, button) {
    const client = db();
    if (!client || !isAdmin()) { setStatus('Solo la superadministración puede modificar roles.', true); return; }
    if (button) button.disabled = true;
    setStatus(action === 'assign' ? 'Asignando rol…' : 'Retirando rol…');
    try {
      const rpcName = action === 'assign' ? 'pf_rbac_assign_role' : 'pf_rbac_remove_role';
      const { error } = await client.rpc(rpcName, { p_user_id: userId, p_role_code: roleCode });
      if (error) throw error;
      setStatus(action === 'assign' ? 'Rol asignado correctamente.' : 'Rol retirado correctamente.');
      await loadUsers();
    } catch (error) {
      console.error('PixelForge RBAC action:', error);
      setStatus('No se pudo modificar el rol: ' + (error.message || 'Error desconocido'), true);
      if (button) button.disabled = false;
    }
  }

  function onAdminState() {
    ensurePanel();
    if (isAdmin()) loadUsers();
  }

  ensurePanel();
  window.addEventListener('pixelforge:admin-state', onAdminState);
  window.addEventListener('pixelforge:auth', onAdminState);
  window.addEventListener('hashchange', () => {
    if (location.hash === '#administracion' && isAdmin()) loadUsers();
  });
  if (isAdmin()) loadUsers();

  window.PIXELFORGE_RBAC = {
    loadUsers,
    async myRoles() {
      const client = db();
      if (!client) return [];
      const { data, error } = await client.rpc('pf_rbac_my_roles');
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    },
    async hasPermission(permissionCode) {
      const client = db();
      if (!client) return false;
      const { data, error } = await client.rpc('pf_rbac_has_permission', { p_permission_code: permissionCode });
      if (error) throw error;
      return data === true;
    }
  };
})();


/* ===== Módulo consolidado: supabase-sync.js ===== */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const bridge = () => window.PIXELFORGE_ADMIN_BRIDGE || null;
  const db = () => bridge()?.getClient?.() || null;
  const isAdmin = () => Boolean(bridge()?.isAdmin?.());
  const currentUser = () => bridge()?.getUser?.() || null;
  const V10_QUEUE_KEY = 'pixelforge_v10_pending_sync_v1';
  const QUEUES = {
    reports: { key: 'pixelforge_v9_reportes_local', table: 'pf_v9_reports' },
    creators: { key: 'pixelforge_v9_solicitudes_creadores', table: 'pf_v9_creator_applications' },
    streams: { key: 'pixelforge_v9_solicitudes_stream', table: 'pf_v9_stream_requests' }
  };
  const TABLES = [
    ['pixelforge_admins','Administradores'],['catalogo_publico','Catálogo público'],['propuestas_videojuegos','Propuestas de videojuegos'],
    ['pf_v9_creator_applications','Solicitudes de creadores'],['pf_v9_stream_requests','Solicitudes de stream'],['pf_v9_featured_streams','Streams destacados'],['pf_v9_reports','Reportes'],
    ['pf_v10_collaborators','Colaboradores'],['pf_v10_advice_requests','Asesorías'],['pf_v10_polls','Sondeos'],['pf_v10_poll_votes','Votos'],
    ['pf_rbac_roles','Roles'],['pf_rbac_permissions','Permisos'],['pf_rbac_role_permissions','Permisos por rol'],['pf_rbac_user_roles','Roles de usuarios'],['pf_rbac_audit','Historial de roles']
  ];
  let busy = false;

  function read(key) { try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } }
  function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { console.warn('PixelForge sync localStorage:', e); return false; } }
  function uuid() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c==='x'?r:(r&3|8)).toString(16); });
  }
  function stableId(item) {
    const valid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
    if (valid(item.supabase_sync_id)) return item.supabase_sync_id;
    if (valid(item.id)) return item.id;
    item.supabase_sync_id = uuid();
    return item.supabase_sync_id;
  }
  function dateValue(value) { const d = value ? new Date(value) : new Date(); return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString(); }
  function setStatus(message, error=false) { const node=$('pfSupabaseSyncStatus'); if(node){node.textContent=message;node.classList.toggle('pf-sync-error',error);} }
  function ensurePanel() {
    const workspace=$('pfAdminWorkspace');
    if (!workspace || $('pfSupabaseSyncPanel')) return;
    const section=document.createElement('section'); section.id='pfSupabaseSyncPanel'; section.className='pf-sync-panel pf-admin-block';
    section.innerHTML=`
      <div class="pf-sync-head"><div><p class="etiqueta">PIXELFORGE · CONEXIÓN Y DATOS</p><h3>Sincronización con Supabase</h3><p class="descripcion">Comprueba qué tablas existen, cuántos registros hay y recupera respaldos locales pendientes de envío.</p></div><div class="pf-sync-actions"><button type="button" class="boton boton-secundario" id="pfSupabaseCheck">Revisar conexión</button><button type="button" class="boton" id="pfSupabaseRun">Sincronizar respaldos</button></div></div>
      <p id="pfSupabaseSyncStatus" class="pf-sync-status" role="status" aria-live="polite">Esperando revisión de Supabase…</p>
      <div class="pf-sync-summary"><article><span>Respaldos pendientes</span><strong id="pfSyncPendingCount">0</strong></article><article><span>Tablas detectadas</span><strong id="pfSyncTableCount">—</strong></article><article><span>Última revisión</span><strong id="pfSyncLastCheck">—</strong></article></div>
      <div class="pf-sync-table-wrap"><table class="pf-sync-table"><thead><tr><th>Área</th><th>Tabla Supabase</th><th>Registros</th><th>Estado</th></tr></thead><tbody id="pfSyncTableBody"><tr><td colspan="4">Presiona “Revisar conexión”.</td></tr></tbody></table></div>
      <p class="pf-sync-note">Los respaldos locales solo existen en el navegador y dispositivo donde se enviaron. Esta función no puede recuperar datos que nunca llegaron a Supabase desde otro dispositivo o que fueron borrados del navegador.</p>`;
    workspace.append(section);
    $('pfSupabaseCheck')?.addEventListener('click',checkRemote);
    $('pfSupabaseRun')?.addEventListener('click',runSync);
    updatePendingCount();
  }
  function updatePendingCount() {
    let total=0;
    Object.values(QUEUES).forEach(q => { total += read(q.key).filter(x => x.almacenamiento !== 'supabase').length; });
    total += read(V10_QUEUE_KEY).length;
    const node=$('pfSyncPendingCount'); if(node) node.textContent=String(total);
  }
  function setButtonState(disabled) { ['pfSupabaseCheck','pfSupabaseRun'].forEach(id=>{const b=$(id);if(b)b.disabled=disabled;}); }
  function renderRows(rows) {
    const body=$('pfSyncTableBody'); if(!body)return; body.replaceChildren();
    const byName=new Map((rows||[]).map(r=>[r.relation_name,r]));
    let found=0;
    TABLES.forEach(([name,label])=>{
      const info=byName.get(name); const tr=document.createElement('tr');
      const cells=[label,name,info?.is_present ? Number(info.row_count).toLocaleString('es-MX') : '—',info?.is_present ? 'Disponible' : 'Falta tabla'];
      if(info?.is_present) found++;
      cells.forEach((value,i)=>{const td=document.createElement('td');td.textContent=String(value);if(i===3)td.className=info?.is_present?'pf-sync-ok':'pf-sync-bad';tr.append(td);});body.append(tr);
    });
    const count=$('pfSyncTableCount'); if(count) count.textContent=found+' / '+TABLES.length;
    const last=$('pfSyncLastCheck'); if(last) last.textContent=new Date().toLocaleTimeString('es-MX');
  }
  async function checkRemote() {
    if (!isAdmin()) { setStatus('Inicia sesión con una cuenta de superadministrador.',true); return; }
    const client=db(); if(!client){setStatus('No hay cliente Supabase inicializado. Revisa js/config.js y la conexión.',true);return;}
    setButtonState(true); setStatus('Consultando inventario directamente en Supabase…');
    try {
      const {data,error}=await client.rpc('pf_admin_sync_overview');
      if(error) throw error;
      renderRows(data||[]);
      const missing=(data||[]).filter(r=>!r.is_present).map(r=>r.relation_name);
      setStatus(missing.length ? 'Conexión correcta. Faltan '+missing.length+' tablas: '+missing.join(', ')+'. Ejecuta database/pixelforge.sql y database/roles.sql según corresponda.' : 'Conexión correcta. Todas las tablas de PixelForge están presentes y se consultaron desde Supabase.');
    } catch(e) {
      console.error('PixelForge Supabase sync check:',e);
      setStatus('No se pudo consultar el inventario: '+(e.message||e)+'. Ejecuta database/supabase-sync.sql y vuelve a revisar.',true);
      const body=$('pfSyncTableBody'); if(body){body.replaceChildren();const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=4;td.textContent='No se pudo ejecutar pf_admin_sync_overview: '+(e.message||e);tr.append(td);body.append(tr);}
    } finally { setButtonState(false); }
  }
  function buildV9Payload(type,item) {
    const id=stableId(item); const created_at=dateValue(item.fecha || item.created_at);
    if(type==='reports') return {id,created_at,created_by:null,tipo:String(item.tipo||'Reporte').slice(0,80),resumen:String(item.resumen||'Reporte importado').slice(0,120),detalle:String(item.detalle||'Sin detalle').slice(0,2500),pagina_url:item.pagina||item.pagina_url||null,navegador:item.navegador||null,estado:'pendiente'};
    if(type==='creators') {
      if(item.aceptaCuotaInformada!==true || item.aceptaRevisionDatos!==true) throw new Error('No se puede importar: el respaldo no conserva las dos aceptaciones obligatorias.');
      const hasGame=['si','no','en_proceso'].includes(item.yaCreoVideojuego)?item.yaCreoVideojuego:'no';
      const hasStreams=['si','no'].includes(item.yaHizoStreams)?item.yaHizoStreams:'no';
      return {id,created_at,created_by:null,nombre_publico:String(item.nombre||'Usuario importado').slice(0,100),alias:String(item.alias||'Usuario').slice(0,60),correo:String(item.correo||'sin-correo@local.invalid').slice(0,160),perfil:['desarrollador','streamer','ambos'].includes(item.perfil)?item.perfil:'desarrollador',nombre_idea_videojuego:item.nombreIdeaVideojuego||null,concepto_videojuego:item.conceptoVideojuego||null,ya_creo_videojuego:hasGame,ya_hizo_streams:hasStreams,videojuego_existente:item.videojuego||null,enlace_videojuego:item.enlaceVideojuego||null,experiencia_desarrollo:item.experienciaDesarrollo||null,plataforma_stream:item.plataformaStream||null,canal_stream:item.canalStream||null,experiencia_stream:item.experienciaStream||null,propuesta:String(item.propuesta||'Solicitud importada desde respaldo local').slice(0,2000),acepta_cuota_informada:true,acepta_revision_datos:true,cuota_recuperacion_mxn:Number(item.cuotaRecuperacionMXN)||50,cuota_estado:'no_cobrada',estado:'pendiente'};
    }
    if(item.permisoDeclarado!==true || item.aceptaReglas!==true) throw new Error('No se puede importar: el respaldo no conserva la autorización del canal y la aceptación de reglas.');
    return {id,created_at,created_by:null,nombre_publico:String(item.nombre||'Canal importado').slice(0,100),correo:String(item.correo||'sin-correo@local.invalid').slice(0,160),plataforma:item.plataforma==='YouTube'?'YouTube':'Twitch',url_canal:String(item.urlCanal||'https://example.invalid').slice(0,500),contenido:String(item.contenido||'Solicitud importada desde respaldo local').slice(0,1200),permiso_declarado:true,acepta_reglas:true,estado:'pendiente'};
  }
  async function syncV9() {
    const client=db(); let synced=0, failed=0, skipped=0;
    for (const [type,queue] of Object.entries(QUEUES)) {
      const items=read(queue.key);
      for (const item of items) {
        if (item.almacenamiento==='supabase') { skipped++; continue; }
        try {
          const payload=buildV9Payload(type,item);
          const {error}=await client.from(queue.table).upsert(payload,{onConflict:'id',ignoreDuplicates:true});
          if(error) throw error;
          item.almacenamiento='supabase'; item.sincronizado_en=new Date().toISOString(); delete item.error_sincronizacion; synced++;
        } catch(e) { item.error_sincronizacion=String(e.message||e); failed++; }
        write(queue.key,items);
      }
    }
    return {synced,failed,skipped};
  }
  async function syncV10OwnQueue() {
    const client=db(), user=currentUser(); const queue=read(V10_QUEUE_KEY); if(!client||!user?.id||user.id==='invitado-local') return {synced:0,failed:0,pending:queue.length};
    const keep=[]; let synced=0, failed=0;
    for(const entry of queue) {
      if(entry.user_id && entry.user_id!==user.id) { keep.push(entry); continue; }
      try {
        let response;
        if(entry.type==='report') response=await client.from('pf_v9_reports').upsert({...entry.payload,created_by:user.id},{onConflict:'id',ignoreDuplicates:true});
        else if(entry.type==='collaborator') {
          response=await client.from('pf_v10_collaborators').insert(entry.payload);
          if(response.error?.code==='23505') response={error:null};
        }
        else if(entry.type==='advice') response=await client.from('pf_v10_advice_requests').upsert(entry.payload,{onConflict:'id',ignoreDuplicates:true});
        else throw new Error('Tipo de respaldo desconocido: '+entry.type);
        if(response.error) throw response.error;
        synced++;
      } catch(e) { entry.last_error=String(e.message||e); keep.push(entry); failed++; }
    }
    write(V10_QUEUE_KEY,keep);
    return {synced,failed,pending:keep.length};
  }
  async function runSync() {
    if(busy)return; if(!isAdmin()){setStatus('Solo la superadministración puede iniciar la sincronización global.',true);return;}
    busy=true;setButtonState(true);setStatus('Recuperando respaldos locales y verificando Supabase…');
    try {
      const local=await syncV9();
      const own=await syncV10OwnQueue();
      updatePendingCount();
      window.dispatchEvent(new Event('pixelforge:supabase-sync-complete'));
      await checkRemote();
      const parts=['Respaldos V9 sincronizados: '+local.synced,'pendientes con error: '+local.failed,'V10 de esta cuenta sincronizados: '+own.synced,'V10 pendientes: '+own.pending];
      setStatus(parts.join(' · '),local.failed>0||own.failed>0);
    } catch(e) { setStatus('La sincronización no terminó: '+(e.message||e),true); }
    finally { busy=false;setButtonState(false); }
  }
  async function retryOwnQueue() {
    const user=currentUser(); if(!user?.id||user.id==='invitado-local')return;
    const result=await syncV10OwnQueue(); updatePendingCount();
    if(result.synced) window.dispatchEvent(new Event('pixelforge:supabase-sync-complete'));
  }
  function init() {
    ensurePanel();
    window.addEventListener('pixelforge:admin-state',()=>{ensurePanel();if(isAdmin())checkRemote();});
    window.addEventListener('pixelforge:auth',()=>{ensurePanel();retryOwnQueue();if(isAdmin())checkRemote();});
    window.addEventListener('hashchange',()=>{if(location.hash==='#administracion'&&isAdmin()){ensurePanel();checkRemote();}});
    if(isAdmin())checkRemote();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.PIXELFORGE_SUPABASE_SYNC={check:checkRemote,sync:runSync};
})();


/* ===== Módulo consolidado: soundtrack.js ===== */
(() => {
    "use strict";
    const PISTAS_LOCALES_DEFAULT = [
        // --- SELECCIÓN K-POP EN VIDEOJUEGOS ---
        {
            titulo: "POP/STARS (feat. (G)I-DLE & Madison Beer)",
            artista: "K/DA",
            juego: "League of Legends (Grupo Virtual)",
            url: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/be/6d/da/be6dda93-0fc9-9545-38a7-04bfd3a4c67d/mzaf_12674869634233540340.plus.aac.p.m4a",
            caratula: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/93/f8/8a/93f88a32-342c-b650-ef1c-ebc1c9f804c3/00198704643309_Cover.jpg/600x600bb.jpg",
            duracion: "3:11",
            esApi: false
        },
        {
            titulo: "Perfect Night",
            artista: "LE SSERAFIM",
            juego: "Overwatch 2 (Colaboración Oficial)",
            url: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/bc/f7/7f/bcf77f57-ea7e-e483-aa46-6cb919eee7e5/mzaf_16548890274351085831.plus.aac.p.m4a",
            caratula: "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/a0/cd/40/a0cd4013-89cf-0554-0aa5-1ac5a0bb3db1/196922680779_Cover.jpg/600x600bb.jpg",
            duracion: "2:39",
            esApi: false
        },
        {
            titulo: "GODS (Himno Oficial Worlds)",
            artista: "League of Legends & NewJeans",
            juego: "League of Legends Worlds 2023",
            url: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/98/f8/6c/98f86c06-431b-1112-52a2-f2222bece13e/mzaf_5836013213479843390.plus.aac.p.m4a",
            caratula: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/30/59/e0/3059e000-eb6f-6c08-4387-c1ee9d38d962/00198704670657_Cover.jpg/600x600bb.jpg",
            duracion: "3:41",
            esApi: false
        },
        {
            titulo: "Ready For Love (The Virtual)",
            artista: "BLACKPINK",
            juego: "PUBG Mobile (Concierto Virtual)",
            url: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/74/11/8f/74118f5b-5a11-e863-66bf-dd200408b589/mzaf_8781433739403529773.plus.aac.p.m4a",
            caratula: "https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/52/8e/5a/528e5a30-52b0-b68c-f184-635fcf15e6d7/22UM1IM01017.rgb.jpg/600x600bb.jpg",
            duracion: "3:05",
            esApi: false
        },
        {
            titulo: "MORE",
            artista: "K/DA (feat. Lexie Liu & Seraphine)",
            juego: "League of Legends",
            url: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/cb/d1/27/cbd127bc-1665-1095-9aa9-13322bd1da20/mzaf_12465534455231308006.plus.aac.p.m4a",
            caratula: "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/67/11/24/671124b5-7b83-672c-46fc-92245524db3d/00198704643033_Cover.jpg/600x600bb.jpg",
            duracion: "3:37",
            esApi: false
        },
        // --- SELECCIÓN eFOOTBALL (KONAMI) ---
        {
            titulo: "Fiesta",
            artista: "CxM",
            juego: "eFootball (Konami)",
            evento: "Banda Sonora Oficial eFootball",
            url: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/90/0d/21/900d21e6-c457-70b9-83cb-a177d0a45084/mzaf_1621968359718200629.plus.aac.p.m4a",
            caratula: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/84/03/57/84035799-08ce-ebf7-af38-b132e8b85544/198704686016_Cover.jpg/600x600bb.jpg",
            duracion: "2:45",
            esApi: false
        },
        {
            titulo: "404 (New Era)",
            artista: "KiiiKiii",
            juego: "eFootball (Konami)",
            evento: "Banda Sonora Oficial eFootball",
            url: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/ef/d8/84/efd884da-ffb3-dff0-1c53-05ee61d7baa1/mzaf_9160660066743675925.plus.aac.p.m4a",
            caratula: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/1c/b4/81/1cb481b3-9b5b-83bf-e047-41e3089b0653/199806885123.jpg/600x600bb.jpg",
            duracion: "3:00",
            esApi: false
        },
        {
            titulo: "Dracula (JENNIE Remix)",
            artista: "Tame Impala & JENNIE",
            juego: "eFootball (Konami)",
            evento: "Banda Sonora Oficial eFootball",
            url: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/71/5d/31/715d3169-5fba-a0b7-da24-2aefc83796cf/mzaf_8089500935177582820.plus.aac.p.m4a",
            caratula: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/36/be/b4/36beb41f-c644-55cb-9fbb-bf0622a66653/196873644783.jpg/600x600bb.jpg",
            duracion: "3:25",
            esApi: false
        },
        // --- BANDAS SONORAS RETRO Y CHIPTUNE ---
        {
            titulo: "Battle Boss (Tema de Jefe Final)",
            artista: "BoxCat Games",
            juego: "Nameless RPG / Boss Battle",
            url: "/audio/battle-boss.mp3",
            caratula: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&auto=format&fit=crop&q=80",
            duracion: "0:53",
            esApi: false
        },
        {
            titulo: "Mt. Fox Shop (Tienda del Pueblo)",
            artista: "BoxCat Games",
            juego: "Nameless RPG Soundtrack",
            url: "/audio/mt-fox-shop.mp3",
            caratula: "https://images.unsplash.com/photo-1500651230702-0e2d8a49d4ad?w=400&auto=format&fit=crop&q=80",
            duracion: "3:14",
            esApi: false
        },
        {
            titulo: "Battle Special (Combate Épico)",
            artista: "BoxCat Games",
            juego: "Action RPG Chronicles",
            url: "/audio/battle-special.mp3",
            caratula: "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=400&auto=format&fit=crop&q=80",
            duracion: "0:54",
            esApi: false
        },
        {
            titulo: "Breaking In (Infiltración Hacker)",
            artista: "BoxCat Games",
            juego: "Cyberpunk Heist",
            url: "/audio/breaking-in.mp3",
            caratula: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400&auto=format&fit=crop&q=80",
            duracion: "0:32",
            esApi: false
        },
        {
            titulo: "B-3 (Exploración Chiptune)",
            artista: "BoxCat Games",
            juego: "Dungeon Crawler 8-Bit",
            url: "/audio/dungeon-b3.mp3",
            caratula: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&auto=format&fit=crop&q=80",
            duracion: "3:06",
            esApi: false
        },
        {
            titulo: "Inspiration (Mundo Abierto)",
            artista: "BoxCat Games",
            juego: "Pixel Adventures OST",
            url: "/audio/inspiration.mp3",
            caratula: "https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=400&auto=format&fit=crop&q=80",
            duracion: "4:28",
            esApi: false
        }
    ];

    // Lista activa de canciones (puede provenir de la colección local o de la API de música)
    let pistasActivas = [...PISTAS_LOCALES_DEFAULT];
    let indiceActual = 0;
    let reproduciendo = false;

    // Referencias DOM
    const audio = document.getElementById("audioGamer") || document.getElementById("audioRainwave");
    const btnPlay = document.getElementById("btnAudioPlay");
    const btnPrev = document.getElementById("btnAudioPrev");
    const btnNext = document.getElementById("btnAudioNext");
    const titulo = document.getElementById("tituloTemaGamer") || document.getElementById("tituloTemaRainwave");
    const artista = document.getElementById("artistaTemaGamer") || document.getElementById("artistaTemaRainwave");
    const album = document.getElementById("albumTemaGamer") || document.getElementById("albumTemaRainwave");
    const estado = document.getElementById("estadoGamer") || document.getElementById("estadoRainwave");
    const caratulaImg = document.getElementById("caratulaAudioImg");
    const caratulaContenedor = document.getElementById("caratulaAudioContenedor");
    const barraProgreso = document.getElementById("barraProgresoAudio");
    const tiempoActualEl = document.getElementById("tiempoActualAudio");
    const tiempoTotalEl = document.getElementById("tiempoTotalAudio");
    const volumenSlider = document.getElementById("volumenAudio");
    const listaPistasContenedor = document.getElementById("listaPistasAudio");
    const badgeOrigenMusica = document.getElementById("badgeOrigenMusica");
    const tituloListaPistas = document.getElementById("tituloListaPistas");

    // Elementos de la API de música
    const inputBusquedaMusica = document.getElementById("inputBusquedaMusicaApi");
    const btnBuscarMusica = document.getElementById("btnBuscarMusicaApi");
    const btnApiKpop = document.getElementById("btnApiKpopGaming");
    const btnColeccionLocal = document.getElementById("btnColeccionLocalMusica");
    const contenedorChips = document.getElementById("chipsMusica");

    if (!audio) return;

    function formatearTiempo(segundos) {
        if (!segundos || isNaN(segundos)) return "0:00";
        const mins = Math.floor(segundos / 60);
        const segs = Math.floor(segundos % 60);
        return `${mins}:${segs < 10 ? "0" : ""}${segs}`;
    }

    function renderizarListaPistas() {
        if (!listaPistasContenedor) return;
        listaPistasContenedor.replaceChildren();

        if (pistasActivas.length === 0) {
            const vacio = document.createElement("p");
            vacio.style.color = "#8ba0c0";
            vacio.style.fontSize = "0.9rem";
            vacio.style.padding = "10px";
            vacio.textContent = "No se encontraron canciones para esta búsqueda. Prueba con otro término o vuelve a pistas clásicas.";
            listaPistasContenedor.appendChild(vacio);
            return;
        }

        pistasActivas.forEach((p, idx) => {
            const item = document.createElement("div");
            item.className = `pista-item ${idx === indiceActual ? "activa" : ""}`;
            item.setAttribute("role", "button");
            item.setAttribute("tabindex", "0");
            item.innerHTML = `
                <div class="pista-item-info">
                    <span class="pista-item-titulo">${idx + 1}. ${p.titulo}</span>
                    <span class="pista-item-subtitulo">${p.artista} · ${p.juego}</span>
                </div>
                <div class="pista-item-meta">
                    ${p.evento ? '<span style="font-size: 0.68rem; padding: 2px 6px; border-radius: 4px; background: rgba(255, 45, 117, 0.18); color: #ff2d75; border: 1px solid rgba(255, 45, 117, 0.4); font-weight: bold;">K-POP</span>' : (p.esApi ? '<span style="font-size: 0.68rem; padding: 2px 6px; border-radius: 4px; background: rgba(0, 229, 255, 0.15); color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.3);">API</span>' : '')}
                    <span style="font-size: 0.8rem; color: #00e5ff; font-variant-numeric: tabular-nums;">${p.duracion || "0:30"}</span>
                </div>
            `;
            item.addEventListener("click", () => cargarPista(idx, true));
            item.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    cargarPista(idx, true);
                }
            });
            listaPistasContenedor.appendChild(item);
        });
    }

    function cargarPista(indice, autoPlay = false) {
        if (!pistasActivas || pistasActivas.length === 0) return;
        if (indice < 0) indice = pistasActivas.length - 1;
        if (indice >= pistasActivas.length) indice = 0;
        indiceActual = indice;
        const pista = pistasActivas[indiceActual];

        audio.src = pista.url;
        audio.load();

        if (titulo) titulo.textContent = pista.titulo;
        if (artista) artista.textContent = `Artista: ${pista.artista}`;
        if (album) album.textContent = pista.evento ? `Banda Sonora: ${pista.juego} (${pista.evento})` : `Banda Sonora: ${pista.juego}`;
        if (estado) estado.textContent = `Pista ${indiceActual + 1} de ${pistasActivas.length} · Lista para reproducir`;
        if (caratulaImg) caratulaImg.src = pista.caratula || "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&auto=format&fit=crop&q=80";

        if (barraProgreso) {
            barraProgreso.value = 0;
            barraProgreso.max = 100;
        }
        if (tiempoActualEl) tiempoActualEl.textContent = "0:00";
        if (tiempoTotalEl) tiempoTotalEl.textContent = pista.duracion || "0:30";

        // Actualizar clase activa en la lista visual
        document.querySelectorAll(".pista-item").forEach((el, idx) => {
            el.classList.toggle("activa", idx === indiceActual);
        });

        if (autoPlay) {
            iniciarReproduccion();
        } else {
            actualizarBotonPlay(false);
        }
    }

    function actualizarBotonPlay(estaReproduciendo) {
        reproduciendo = estaReproduciendo;
        if (btnPlay) {
            btnPlay.textContent = estaReproduciendo ? "⏸" : "▶";
            btnPlay.setAttribute("aria-label", estaReproduciendo ? "Pausar música" : "Reproducir música");
        }
        if (caratulaContenedor) {
            caratulaContenedor.classList.toggle("reproduciendo", estaReproduciendo);
        }
        const onda = document.getElementById("ondaEcualizador");
        if (onda) {
            onda.classList.toggle("reproduciendo", estaReproduciendo);
        }
        if (estado && pistasActivas[indiceActual]) {
            const p = pistasActivas[indiceActual];
            estado.textContent = estaReproduciendo ? `▶ Reproduciendo: ${p.titulo}` : `⏸ Pausado: ${p.titulo}`;
        }
    }

    function iniciarReproduccion() {
        const promesa = audio.play();
        if (promesa !== undefined) {
            promesa.then(() => {
                actualizarBotonPlay(true);
            }).catch((err) => {
                console.warn("Autoplay bloqueado por el navegador o interacción requerida:", err);
                actualizarBotonPlay(false);
                if (estado) estado.textContent = "Pulsa reproducir ▶ para iniciar el audio";
            });
        }
    }

    function alternarReproduccion() {
        if (audio.paused) {
            iniciarReproduccion();
        } else {
            audio.pause();
            actualizarBotonPlay(false);
        }
    }

    // Configuración de eventos de audio HTML5
    audio.addEventListener("timeupdate", () => {
        if (!barraProgreso || isNaN(audio.duration) || audio.duration === 0) return;
        const porcentaje = (audio.currentTime / audio.duration) * 100;
        barraProgreso.value = porcentaje || 0;
        if (tiempoActualEl) tiempoActualEl.textContent = formatearTiempo(audio.currentTime);
        if (tiempoTotalEl && audio.duration) tiempoTotalEl.textContent = formatearTiempo(audio.duration);
    });

    audio.addEventListener("ended", () => {
        cargarPista(indiceActual + 1, true);
    });

    audio.addEventListener("error", (e) => {
        console.warn("PixelForge Audio: No se pudo reproducir este stream, pasando a la siguiente pista.", e);
        if (estado) estado.textContent = "Stream no disponible, saltando a la siguiente...";
        setTimeout(() => {
            if (pistasActivas.length > 1) {
                cargarPista(indiceActual + 1, true);
            }
        }, 1200);
    });

    if (barraProgreso) {
        barraProgreso.addEventListener("input", () => {
            if (!isNaN(audio.duration)) {
                audio.currentTime = (barraProgreso.value / 100) * audio.duration;
            }
        });
    }

    if (volumenSlider) {
        volumenSlider.addEventListener("input", () => {
            audio.volume = Number(volumenSlider.value) / 100;
        });
        audio.volume = Number(volumenSlider.value || 80) / 100;
    }

    if (btnPlay) btnPlay.addEventListener("click", alternarReproduccion);
    if (btnPrev) btnPrev.addEventListener("click", () => cargarPista(indiceActual - 1, true));
    if (btnNext) btnNext.addEventListener("click", () => cargarPista(indiceActual + 1, true));

    // ==========================================
    // CONEXIÓN CON LA API DE MÚSICA (iTunes Search API)
    // ==========================================
    async function consultarApiMusica(termino) {
        const terminoLimpio = (termino || "").trim();
        if (!terminoLimpio) return;

        if (estado) estado.textContent = `Consultando API de música para "${terminoLimpio}"...`;
        if (btnBuscarMusica) {
            btnBuscarMusica.disabled = true;
            btnBuscarMusica.textContent = "Buscando...";
        }

        try {
            // La API de iTunes es pública, gratuita, sin API keys, con CORS abierto y entrega previews oficiales en audio AAC/MP3
            const urlApi = `https://itunes.apple.com/search?term=${encodeURIComponent(terminoLimpio)}&entity=song&limit=25`;
            const respuesta = await fetch(urlApi);

            if (!respuesta.ok) {
                throw new Error(`Error HTTP: ${respuesta.status}`);
            }

            const data = await respuesta.json();
            const cancionesValidas = (data.results || [])
                .filter(item => item.previewUrl)
                .map(item => {
                    const duracionSegundos = item.trackTimeMillis ? Math.round(item.trackTimeMillis / 1000) : 30;
                    return {
                        titulo: item.trackName || "Pista de banda sonora",
                        artista: item.artistName || "Varios artistas",
                        juego: item.collectionName || terminoLimpio,
                        url: item.previewUrl,
                        caratula: item.artworkUrl100 ? item.artworkUrl100.replace("100x100bb", "450x450bb") : "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&auto=format&fit=crop&q=80",
                        duracion: formatearTiempo(duracionSegundos),
                        esApi: true
                    };
                });

            if (cancionesValidas.length === 0) {
                if (estado) estado.textContent = `No se hallaron previews para "${terminoLimpio}". Intenta con otra saga.`;
                return;
            }

            pistasActivas = cancionesValidas;
            if (badgeOrigenMusica) {
                badgeOrigenMusica.textContent = `API EN VIVO (${cancionesValidas.length} TEMAS)`;
                badgeOrigenMusica.style.borderColor = "#00e5ff";
                badgeOrigenMusica.style.color = "#00e5ff";
            }
            if (tituloListaPistas) {
                tituloListaPistas.textContent = `Resultados en vivo: "${terminoLimpio}" (${cancionesValidas.length} pistas)`;
            }

            renderizarListaPistas();
            cargarPista(0, true);

        } catch (error) {
            console.error("Error al consultar API de música:", error);
            if (estado) estado.textContent = `No se pudo conectar con la API de música. Cargando colección local...`;
            restaurarColeccionLocal();
        } finally {
            if (btnBuscarMusica) {
                btnBuscarMusica.disabled = false;
                btnBuscarMusica.textContent = "Buscar en la API";
            }
        }
    }

    function restaurarColeccionLocal() {
        pistasActivas = [...PISTAS_LOCALES_DEFAULT];
        if (badgeOrigenMusica) {
            badgeOrigenMusica.textContent = "COLECCIÓN LOCAL";
            badgeOrigenMusica.style.borderColor = "#8ba0c0";
            badgeOrigenMusica.style.color = "#8ba0c0";
        }
        if (tituloListaPistas) {
            tituloListaPistas.textContent = "Pistas destacadas (K-Pop y bandas sonoras):";
        }
        renderizarListaPistas();
        cargarPista(0, false);
    }

    // Eventos de la barra de búsqueda de música
    if (btnBuscarMusica && inputBusquedaMusica) {
        btnBuscarMusica.addEventListener("click", () => {
            consultarApiMusica(inputBusquedaMusica.value);
        });

        inputBusquedaMusica.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                consultarApiMusica(inputBusquedaMusica.value);
            }
        });
    }

    // ==========================================
    // CONEXIÓN CON LA API OFICIAL DE K-POP GAMER (/api/kpop-gaming)
    // ==========================================
    async function consultarApiKpop(filtro = "") {
        const filtroLimpio = (filtro || "").trim();
        if (estado) estado.textContent = "Conectando con la API oficial de K-Pop Gamer...";
        if (btnApiKpop) {
            btnApiKpop.disabled = true;
            btnApiKpop.textContent = "Cargando API...";
        }

        try {
            const urlApi = filtroLimpio
                ? `/api/kpop-gaming?search=${encodeURIComponent(filtroLimpio)}`
                : "/api/kpop-gaming";

            const respuesta = await fetch(urlApi);
            if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);

            const data = await respuesta.json();
            const cancionesValidas = data.resultados || [];

            if (cancionesValidas.length === 0) {
                if (estado) estado.textContent = `No se encontraron temas en la API de K-Pop para "${filtroLimpio}".`;
                return;
            }

            pistasActivas = cancionesValidas;
            if (badgeOrigenMusica) {
                badgeOrigenMusica.textContent = `API K-POP GAMER (${cancionesValidas.length} TEMAS)`;
                badgeOrigenMusica.style.borderColor = "#ff2d75";
                badgeOrigenMusica.style.color = "#ff2d75";
            }
            if (tituloListaPistas) {
                tituloListaPistas.textContent = `Pistas API K-Pop Gamer (${cancionesValidas.length} colaboraciones):`;
            }

            renderizarListaPistas();
            cargarPista(0, true);
            if (estado) estado.textContent = `API K-Pop Gamer conectada · ${cancionesValidas.length} temas oficiales disponibles`;

        } catch (error) {
            console.error("Error al consultar API de K-Pop Gamer:", error);
            // Respaldo directo en caso de recarga del servidor
            try {
                const resp = await fetch("./data/kpop_gaming.json");
                if (resp.ok) {
                    const datos = await resp.json();
                    pistasActivas = datos;
                    if (badgeOrigenMusica) {
                        badgeOrigenMusica.textContent = `API K-POP GAMER (${datos.length} TEMAS)`;
                        badgeOrigenMusica.style.borderColor = "#ff2d75";
                        badgeOrigenMusica.style.color = "#ff2d75";
                    }
                    if (tituloListaPistas) {
                        tituloListaPistas.textContent = `Pistas API K-Pop Gamer (${datos.length} colaboraciones):`;
                    }
                    renderizarListaPistas();
                    cargarPista(0, true);
                    return;
                }
            } catch (_) {}
            if (estado) estado.textContent = "No se pudo conectar con la API de K-Pop Gamer. Restaurando...";
            restaurarColeccionLocal();
        } finally {
            if (btnApiKpop) {
                btnApiKpop.disabled = false;
                btnApiKpop.textContent = "🇰🇷 API K-Pop Gamer";
            }
        }
    }

    // Botón para activar la API de K-Pop Gamer
    if (btnApiKpop) {
        btnApiKpop.addEventListener("click", () => {
            document.querySelectorAll(".chip-musica-btn").forEach(c => c.classList.remove("activo"));
            consultarApiKpop();
        });
    }

    // Botón para volver a las pistas locales
    if (btnColeccionLocal) {
        btnColeccionLocal.addEventListener("click", () => {
            restaurarColeccionLocal();
            if (inputBusquedaMusica) inputBusquedaMusica.value = "";
            document.querySelectorAll(".chip-musica-btn").forEach(c => c.classList.remove("activo"));
        });
    }

    // Chips de sagas populares (Zelda, Mario, Minecraft, Halo, Cyberpunk, etc.)
    if (contenedorChips) {
        contenedorChips.addEventListener("click", (e) => {
            const botonChip = e.target.closest(".chip-musica-btn");
            if (!botonChip) return;

            document.querySelectorAll(".chip-musica-btn").forEach(c => c.classList.remove("activo"));
            botonChip.classList.add("activo");

            const query = botonChip.dataset.query || botonChip.textContent;
            if (inputBusquedaMusica) inputBusquedaMusica.value = query;
            consultarApiMusica(query);
        });
    }

    // Inicializar reproductor con pistas clásicas al inicio
    renderizarListaPistas();
    cargarPista(0, false);
})();

/* ===== Gestión integrada de los dos manuales educativos ===== */
(() => {
  'use strict';
  const appShell = document.getElementById('pfAppShell');
  const manuals = [...document.querySelectorAll('.pf-manual-view[data-pf-manual]')];
  const homeTitle = document.title;
  const manualByHash = (hash) => {
    if (hash === 'manual-programacion' || hash.startsWith('mp-')) return manuals.find(v => v.dataset.pfManual === 'mp') || null;
    if (hash === 'manual-streaming' || hash.startsWith('ms-')) return manuals.find(v => v.dataset.pfManual === 'ms') || null;
    return null;
  };
  function renderManualRoute() {
    const hash = decodeURIComponent(location.hash.replace(/^#/, ''));
    const active = manualByHash(hash);
    manuals.forEach(view => { view.hidden = view !== active; });
    if (appShell) appShell.hidden = Boolean(active);
    document.body.classList.toggle('pf-reading-mode', Boolean(active));
    if (active) {
      const heading = active.querySelector('.manual-hero h2');
      document.title = `${heading?.textContent.trim() || 'Manual'} | PixelForge`;
      if (/^(mp|ms)-capitulo-\d+$/.test(hash)) {
        requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ block: 'start' }));
      } else {
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    } else {
      document.title = homeTitle;
    }
  }
  manuals.forEach(root => {
    const prefix = root.dataset.pfManual;
    const legacyPageName = prefix === 'mp' ? 'manual-programacion' : 'manual-streaming';
    const key = `pixelforge:manual:${legacyPageName}:completed`;
    const checks = [...root.querySelectorAll('.chapter-check')];
    const bar = root.querySelector(`#${prefix}-progressBar`);
    const label = root.querySelector(`#${prefix}-progressText`);
    const navLinks = [...root.querySelectorAll('.chapter-nav a')];
    let completed = [];
    try { completed = JSON.parse(localStorage.getItem(key) || '[]'); } catch { completed = []; }
    if (!Array.isArray(completed)) completed = [];
    function update() {
      const done = checks.filter(c => c.checked).length;
      if (bar) bar.style.width = `${checks.length ? done / checks.length * 100 : 0}%`;
      if (label) label.textContent = `${done} de ${checks.length} completados`;
      try { localStorage.setItem(key, JSON.stringify(checks.filter(c => c.checked).map(c => Number(c.dataset.check)))); } catch { /* almacenamiento local opcional */ }
    }
    checks.forEach(check => {
      check.checked = completed.includes(Number(check.dataset.check));
      check.addEventListener('change', update);
    });
    update();
    root.querySelector(`#${prefix}-resetProgress`)?.addEventListener('click', () => {
      if (!window.confirm('¿Reiniciar el progreso de este manual en este navegador?')) return;
      checks.forEach(check => { check.checked = false; });
      update();
    });
    const search = root.querySelector(`#${prefix}-chapterSearch`);
    search?.addEventListener('input', () => {
      const query = search.value.trim().toLocaleLowerCase('es');
      navLinks.forEach(link => { link.hidden = Boolean(query) && !link.textContent.toLocaleLowerCase('es').includes(query); });
    });
    root.querySelectorAll('.copy-code').forEach(button => {
      button.addEventListener('click', async () => {
        const code = button.parentElement.querySelector('code')?.innerText || '';
        try {
          await navigator.clipboard.writeText(code);
          button.textContent = 'Copiado';
        } catch {
          button.textContent = 'No se pudo copiar';
        }
        window.setTimeout(() => { button.textContent = 'Copiar código'; }, 1600);
      });
    });
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          navLinks.forEach(link => link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`));
        });
      }, { rootMargin: '-15% 0px -70% 0px' });
      root.querySelectorAll('.manual-chapter').forEach(chapter => observer.observe(chapter));
    }
  });
  window.addEventListener('hashchange', renderManualRoute);
  window.addEventListener('load', renderManualRoute, { once: true });
  renderManualRoute();
})();
