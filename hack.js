// ==========================================================================
// hack.js — Utilidad de DESARROLLO/TESTING para "DBZ Leyenda"
// ==========================================================================
// Este archivo NO se carga automáticamente desde index.html. Es una
// herramienta de consola para poblar tu álbum local con TODAS las cartas
// que existan en cartas_db.json, marcándolas como "obtenidas" (sin imagen,
// mostrando el nombre como placeholder), para poder armar mazos y jugar
// partidas de prueba sin tener que subir 900 fotos a mano.
//
// CÓMO USARLO:
//   1) Abrí la app en el navegador (index.html ya cargado normalmente).
//   2) Abrí la consola del navegador (F12 → pestaña "Console").
//   3) Pegá el contenido de este archivo y presioná Enter, o cargalo así:
//        const s = document.createElement('script');
//        s.src = 'hack.js';
//        document.body.appendChild(s);
//   4) Llamá a una de estas funciones según lo que necesites:
//
//        hackPoblarAlbumCompleto()
//          → Marca como obtenida 1 copia de CADA carta de cartas_db.json.
//
//        hackPoblarAlbumCompleto(3)
//          → Igual, pero con 3 copias de cada carta (útil para armar mazos
//            de 40+ sin que falten repetidas).
//
//        hackVaciarAlbum()
//          → Revierte todo: pone el álbum en blanco otra vez (como recién
//            instalado). Útil para volver al álbum vacío original donde
//            cada uno sube su propia foto.
//
//        hackCrearMazoDePrueba("Mazo Test", 40)
//          → Crea automáticamente un mazo legal (>=40 cartas) usando las
//            cartas disponibles en cartas_db.json, listo para jugar PVP
//            sin tener que arrastrar cartas una por una en el editor.
//
// IMPORTANTE: esto solo toca tu localStorage local (clave
// "coleccionAlbum_Publico" / "estructuraMazos_Publico"), nunca modifica
// cartas_db.json. Cada usuario real de la página seguirá viendo su álbum
// vacío y subiendo sus propias fotos normalmente; este script es solo para
// vos, mientras desarrollás y probás el motor de juego.
// ==========================================================================

function hackPoblarAlbumCompleto(copias = 1) {
    if (typeof coleccionAlbum === "undefined" || typeof mazoPoolEspecificaciones === "undefined") {
        console.error("[hack.js] No encuentro coleccionAlbum / mazoPoolEspecificaciones. ¿Está cargado app.js en esta página?");
        return;
    }
    if (!mazoPoolEspecificaciones.length) {
        console.warn("[hack.js] mazoPoolEspecificaciones está vacío todavía. Esperá a que termine de cargar cartas_db.json (mirá la pestaña Network) y reintentá.");
        return;
    }

    let marcadas = 0;
    mazoPoolEspecificaciones.forEach(spec => {
        const carta = buscarCartaEnMemoria(spec.numero);
        if (!carta) {
            console.warn(`[hack.js] La carta #${spec.numero} (${spec.nombre}) no entra en ningún rango de caja definido en rangosCajas. Revisá rangosCajas en app.js.`);
            return;
        }
        carta.obtenida = true;
        carta.repetidas = Math.max(carta.repetidas, copias);
        marcadas++;
    });

    guardarEnLocalStorage();
    if (typeof cajaActiva !== "undefined" && cajaActiva) refrescarGrilla();
    if (typeof renderizarMenuCajas === "function") renderizarMenuCajas();

    console.log(`[hack.js] Listo. ${marcadas} cartas marcadas como obtenidas (x${copias} c/u). Recargá el álbum o cambiá de pestaña para verlo reflejado.`);
}

function hackVaciarAlbum() {
    if (typeof coleccionAlbum === "undefined") {
        console.error("[hack.js] No encuentro coleccionAlbum. ¿Está cargado app.js en esta página?");
        return;
    }
    Object.values(coleccionAlbum).forEach(caja => {
        Object.values(caja.cartas).forEach(c => {
            c.obtenida = false;
            c.repetidas = 0;
            c.imgFrente = null;
            c.imgAtras = null;
        });
    });
    guardarEnLocalStorage();
    if (typeof cajaActiva !== "undefined" && cajaActiva) refrescarGrilla();
    if (typeof renderizarMenuCajas === "function") renderizarMenuCajas();
    console.log("[hack.js] Álbum vaciado por completo (como recién instalado).");
}

function hackCrearMazoDePrueba(nombre = "Mazo de Prueba", minimoCartas = 40) {
    if (typeof estructuraMazosGuardados === "undefined" || typeof mazoPoolEspecificaciones === "undefined") {
        console.error("[hack.js] No encuentro estructuraMazosGuardados / mazoPoolEspecificaciones. ¿Está cargado app.js en esta página?");
        return;
    }
    if (!mazoPoolEspecificaciones.length) {
        console.warn("[hack.js] mazoPoolEspecificaciones está vacío todavía. Esperá a que cargue cartas_db.json y reintentá.");
        return;
    }

    const numeros = mazoPoolEspecificaciones.map(c => c.numero);
    const cartasMazo = [];
    while (cartasMazo.length < minimoCartas) {
        cartasMazo.push(...numeros);
    }
    const mazoFinal = cartasMazo.slice(0, minimoCartas);

    const id = "deck_" + Date.now();
    estructuraMazosGuardados[id] = { id, nombre, cartas: mazoFinal };
    guardarEnLocalStorage();
    if (typeof construirSeccionMisMazos === "function") construirSeccionMisMazos();
    if (typeof configurarSelectoresPartidaVersus === "function") configurarSelectoresPartidaVersus();

    console.log(`[hack.js] Mazo "${nombre}" creado con ${mazoFinal.length} cartas (id: ${id}). Ya aparece en "Mis Mazos" y en los selectores de PVP.`);
    return id;
}

console.log("[hack.js] Cargado. Funciones disponibles: hackPoblarAlbumCompleto(copias), hackVaciarAlbum(), hackCrearMazoDePrueba(nombre, minimoCartas).");

// ==========================================================================
// AUTOEJECUCIÓN — MODO DESARROLLO
// ==========================================================================
// Si este archivo está incluido en index.html (ver la línea
// <script src="hack.js"> comentada/descomentada ahí), apenas carga puebla
// el álbum automáticamente con TODAS las cartas de cartas_db.json.
//
// Esto SOLO pasa si vos decidís incluir este script en index.html. La
// versión pública (sin esta línea) nunca ejecuta nada de esto, y el álbum
// arranca vacío como corresponde para que cada usuario suba sus fotos.
//
// Como app.js carga cartas_db.json de forma asíncrona (fetch), este script
// reintenta cada 100ms hasta que mazoPoolEspecificaciones esté listo, con
// un límite de intentos para no quedar reintentando para siempre si algo
// falló.
(function autoEjecutarModoDesarrollo() {
    let intentos = 0;
    const maxIntentos = 50; // 50 x 100ms = 5 segundos de margen
    let yaEjecutado = false;

    function intentarPoblar() {
        if (yaEjecutado) return;
        intentos++;
        if (typeof mazoPoolEspecificaciones !== "undefined" && mazoPoolEspecificaciones.length > 0) {
            yaEjecutado = true;
            console.log("[hack.js] Modo desarrollo activo: poblando álbum automáticamente...");
            hackPoblarAlbumCompleto(2);
            return;
        }
        if (intentos < maxIntentos) {
            setTimeout(intentarPoblar, 100);
        } else {
            console.warn("[hack.js] No se pudo autopoblar el álbum: cartas_db.json no cargó a tiempo. Probá llamando hackPoblarAlbumCompleto() manualmente.");
        }
    }

    // Esperamos al DOMContentLoaded por si este script se carga antes que
    // app.js termine de definir sus variables globales.
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => setTimeout(intentarPoblar, 50));
    } else {
        setTimeout(intentarPoblar, 50);
    }
})();