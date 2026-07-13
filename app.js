// app.js - DBZ Leyenda (Cromeros / Flashgondor)
// Versión corregida con todos los efectos y validaciones

const coleccionAlbum = {};

const rangosCajas = [
    { id: "caja_1", titulo: "Serie 1 — Caja Goku",       desde: 1,   hasta: 176, css: "naranja",  carpeta: "caja1", fondo: "fondos/caja1.png" },
    { id: "caja_2", titulo: "Serie 2 — Caja Piccolo",    desde: 177, hasta: 265, css: "azul",     carpeta: "caja2", fondo: "fondos/caja2.png" },
    { id: "caja_3", titulo: "Serie 3 — Caja Vegeta",     desde: 266, hasta: 401, css: "verde",    carpeta: "caja3", fondo: "fondos/caja3.png" },
    { id: "caja_4", titulo: "Serie 4 — Caja Gohan",      desde: 402, hasta: 543, css: "roja",     carpeta: "caja4", fondo: "fondos/caja4.png" },
    { id: "caja_5", titulo: "Serie 5 — Caja Cell",       desde: 544, hasta: 699, css: "amarilla", carpeta: "caja5", fondo: "fondos/caja5.png" },
];

let cajaActiva = null;
let cartaSeleccionadaNum = null;
let filtroActual = 'todas';
let mazoPoolEspecificaciones = [];
let estructuraMazosGuardados = {};
let mazoIdEnEdicion = null;
let arenaCombateEstado = null;

document.addEventListener("DOMContentLoaded", async () => {
    document.getElementById("modal-carta").className = "modal-oculto";
    inicializarEstructuraBase();
    await cargarBaseDatosCartas();
    cargarDesdeLocalStorage();
    renderizarMenuCajas();
});

function inicializarEstructuraBase() {
    rangosCajas.forEach(c => {
        coleccionAlbum[c.id] = { id: c.id, titulo: c.titulo, desde: c.desde, hasta: c.hasta, cssClass: c.css, cartas: {} };
        for (let i = c.desde; i <= c.hasta; i++) {
            coleccionAlbum[c.id].cartas[i] = { numero: i, obtenida: false, repetidas: 0, imgFrente: null, imgAtras: null, tipo: "Ataque", atk: 0, def: 0, esfera: 0 };
        }
    });
}

async function cargarBaseDatosCartas() {
    try {
        const res = await fetch('cartas_db.json');
        if (res.ok) {
            const data = await res.json();
            mazoPoolEspecificaciones = data.cartas || [];
        } else {
            console.warn('No se pudo cargar cartas_db.json. El inventario estará vacío.');
        }
    } catch (e) {
        console.error('Error al cargar cartas_db.json:', e);
    }
}

function rutaImagenCarta(numero) {
    const carta = buscarCartaEnMemoria(numero);
    if (carta && carta.imgFrente) return carta.imgFrente;
    const caja = rangosCajas.find(c => numero >= c.desde && numero <= c.hasta);
    if (caja) return `cartas/${caja.carpeta}/${numero}.jpg`;
    return null;
}

function rutaDorsoCarta() {
    return 'cartas/dorso/dorso.jpg';
}

function renderizarMenuCajas() {
    const contenedor = document.getElementById("bloque-cajas");
    contenedor.innerHTML = "";
    Object.values(coleccionAlbum).forEach(caja => {
        const rangoCaja = rangosCajas.find(r => r.id === caja.id);
        const div = document.createElement("div");
        div.className = `tarjeta-caja ${caja.cssClass}`;
        const total = caja.hasta - caja.desde + 1;
        const obtenidas = Object.values(caja.cartas).filter(c => c.obtenida || c.repetidas > 0).length;

        if (rangoCaja && rangoCaja.fondo) {
            div.style.backgroundImage = `url('${rangoCaja.fondo}')`;
            div.style.backgroundSize = 'cover';
            div.style.backgroundPosition = 'center';
        }

        div.innerHTML = `
            <div class="tarjeta-caja-overlay">
                <h3>${caja.titulo}</h3>
                <p>N° ${caja.desde} al ${caja.hasta}</p>
                <div class="contador-completado">${obtenidas} / ${total} obtenidas</div>
            </div>`;
        div.onclick = () => {
            cajaActiva = caja;
            document.getElementById("pantalla-seleccion").className = "seccion-oculta";
            document.getElementById("pantalla-album").className = "seccion-activa";
            document.getElementById("album-titulo").innerText = caja.titulo;
            refrescarGrilla();
        };
        contenedor.appendChild(div);
    });
}

function refrescarGrilla() {
    const grilla = document.getElementById("grilla-cartas");
    grilla.innerHTML = "";
    const busqueda = document.getElementById("busqueda-num").value;

    Object.values(cajaActiva.cartas).forEach(carta => {
        const match = mazoPoolEspecificaciones.find(c => c.numero === carta.numero);
        const estaObtenida = carta.obtenida || carta.repetidas > 0;

        if (busqueda && !carta.numero.toString().includes(busqueda)) return;
        if (filtroActual === 'obtenidas' && !estaObtenida) return;
        if (filtroActual === 'faltantes' && estaObtenida) return;

        // Contenedor principal de la carta (slot) + número debajo
        const wrapper = document.createElement("div");
        wrapper.className = "carta-wrapper";

        const slot = document.createElement("div");
        slot.className = `carta-slot ${estaObtenida ? 'obtenida' : ''}`;
        slot.onclick = () => abrirModalFicha(carta.numero);

        const ruta = rutaImagenCarta(carta.numero);
        if (ruta) {
            const img = document.createElement("img");
            img.src = ruta;
            img.alt = match ? match.nombre : `#${carta.numero}`;
            img.onerror = function() {
                this.src = rutaDorsoCarta();
                this.onerror = null;
            };
            slot.appendChild(img);
        } else {
            slot.innerHTML = `<span class="sin-foto-lbl">${match ? match.nombre : 'N° ' + carta.numero}</span>`;
        }

        // Eliminamos el número flotante de dentro del slot
        // y lo añadimos como un elemento aparte debajo
        const numeroLabel = document.createElement("div");
        numeroLabel.className = "carta-numero";
        numeroLabel.textContent = `#${carta.numero}`;

        if (carta.repetidas > 0) {
            const repTag = document.createElement("span");
            repTag.className = "repetidas-tag";
            repTag.textContent = `x${carta.repetidas}`;
            numeroLabel.appendChild(repTag);
        }

        wrapper.appendChild(slot);
        wrapper.appendChild(numeroLabel);
        grilla.appendChild(wrapper);
    });
}
function abrirModalFicha(numero) {
    cartaSeleccionadaNum = numero;
    const carta = buscarCartaEnMemoria(numero);
    const match = mazoPoolEspecificaciones.find(c => c.numero === numero);

    document.getElementById("modal-titulo-carta").innerText = match ? `N° ${numero} - ${match.nombre}` : `Carta N° ${numero}`;
    document.getElementById("contador-repetidas").innerText = carta.repetidas;
    
    document.getElementById("mod-tipo").value = match ? match.tipo : carta.tipo;
    document.getElementById("mod-atk").value = match ? match.ataque : carta.atk;
    document.getElementById("mod-def").value = match ? match.defensa : carta.def;
    document.getElementById("mod-esfera").value = match ? match.esferaNecesaria : carta.esfera;

    document.getElementById("modal-img-frente").src = rutaImagenCarta(numero) || "";
    document.getElementById("modal-img-frente").onerror = function() { this.src = rutaDorsoCarta(); this.onerror = null; };
    document.getElementById("modal-img-atras").src = carta.imgAtras || rutaDorsoCarta();

    const bloqueMazo = document.getElementById("bloque-agregar-a-mazo-modal");
    const selectMazo = document.getElementById("select-mazo-directo-modal");
    
    if (Object.keys(estructuraMazosGuardados).length > 0) {
        bloqueMazo.classList.remove("seccion-oculta");
        selectMazo.innerHTML = "";
        Object.values(estructuraMazosGuardados).forEach(m => {
            selectMazo.innerHTML += `<option value="${m.id}">${m.nombre}</option>`;
        });
    } else {
        bloqueMazo.classList.add("seccion-oculta");
    }

    document.getElementById("modal-carta").className = "seccion-activa";
}

function enviarCartaAMazoDesdeModal() {
    const idMazo = document.getElementById("select-mazo-directo-modal").value;
    if (!idMazo || !estructuraMazosGuardados[idMazo]) return;

    const mazo = estructuraMazosGuardados[idMazo];
    const spec = mazoPoolEspecificaciones.find(c => c.numero === cartaSeleccionadaNum);
    if (!spec) return alert("Carta no encontrada en la base de datos.");

    // Validar límites
    const copias = mazo.cartas.filter(n => n === cartaSeleccionadaNum).length;
    if (spec.tipo !== "Esfera" && copias >= 1) {
        return alert(`La carta "${spec.nombre}" no puede repetirse en el mazo (solo 1 copia).`);
    }
    if (spec.maxCopias && copias >= spec.maxCopias) {
        return alert(`La carta "${spec.nombre}" solo admite ${spec.maxCopias} copias en el mazo.`);
    }

    mazo.cartas.push(cartaSeleccionadaNum);
    guardarEnLocalStorage();
    construirSeccionMisMazos();
    alert(`¡Carta #${cartaSeleccionadaNum} agregada a "${mazo.nombre}"!`);
}

function cambiarRepetidas(mod) {
    const carta = buscarCartaEnMemoria(cartaSeleccionadaNum);
    if(carta.repetidas + mod >= 0) {
        carta.repetidas += mod;
        carta.obtenida = carta.repetidas > 0;
        document.getElementById("contador-repetidas").innerText = carta.repetidas;
        if(cajaActiva) refrescarGrilla();
        guardarEnLocalStorage();
    }
}

function procesarFoto(e, lado) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
        const carta = buscarCartaEnMemoria(cartaSeleccionadaNum);
        if (lado === 'frente') {
            carta.imgFrente = evt.target.result;
            carta.obtenida = true;
            if(carta.repetidas === 0) carta.repetidas = 1;
            document.getElementById("modal-img-frente").src = evt.target.result;
        } else {
            carta.imgAtras = evt.target.result;
            document.getElementById("modal-img-atras").src = evt.target.result;
        }
        if(cajaActiva) refrescarGrilla();
        guardarEnLocalStorage();
    };
    reader.readAsDataURL(file);
}

function guardarDatosCombate() {
    const carta = buscarCartaEnMemoria(cartaSeleccionadaNum);
    carta.tipo = document.getElementById("mod-tipo").value;
    carta.atk = parseInt(document.getElementById("mod-atk").value) || 0;
    carta.def = parseInt(document.getElementById("mod-def").value) || 0;
    carta.esfera = parseInt(document.getElementById("mod-esfera").value) || 0;
    guardarEnLocalStorage();
    alert("Atributos renovados.");
}

// ==========================================================================
// SECCIÓN ESTRUCTURACIÓN DE MAZOS Y COMBATE LOCAL REGLAMENTARIO
// ==========================================================================
function crearMazoNuevoFlujo() {
    const txt = prompt("Nombre del mazo:", "Mi Baraja");
    if (!txt) return;
    const id = "deck_" + Date.now();
    estructuraMazosGuardados[id] = { id: id, nombre: txt, cartas: [] };
    mazoIdEnEdicion = id;
    guardarEnLocalStorage();
    construirSeccionMisMazos();
}

function construirSeccionMisMazos() {
    const panelLinks = document.getElementById("lista-mazos-links-contenedor");
    panelLinks.innerHTML = "";
    Object.values(estructuraMazosGuardados).forEach(m => {
        panelLinks.innerHTML += `<button class="btn-mazo-link ${mazoIdEnEdicion === m.id ? 'activo' : ''}" onclick="seleccionarMazoEdicion('${m.id}')">${m.nombre} (${m.cartas.length})</button>`;
    });

    const wrk = document.getElementById("panel-editor-mazo");
    if(!mazoIdEnEdicion || !estructuraMazosGuardados[mazoIdEnEdicion]) {
        wrk.innerHTML = `<p style="color:var(--txt-muted); text-align:center; margin:auto;">Selecciona un mazo del panel izquierdo para gestionarlo.</p>`;
        return;
    }
    const mazo = estructuraMazosGuardados[mazoIdEnEdicion];
    wrk.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;"><h3>Editando: ${mazo.nombre}</h3><button class="btn-guardar-stats" style="background:#cc0000; width:90px; margin:0;" onclick="eliminarMazo('${mazo.id}')">Eliminar</button></div>
        <div class="rejilla-columnas-editor">
            <div class="bloque-pool"><h4>En Mazo (${mazo.cartas.length})</h4><div class="contenedor-sub-pool" id="pool-añadidas"></div></div>
            <div class="bloque-pool"><h4>Tus Cartas Disponibles</h4><div class="contenedor-sub-pool" id="pool-inventario"></div></div>
        </div>
    `;
    renderizarListasMazo(mazo);
}

function renderizarListasMazo(mazo) {
    const cajaAdd = document.getElementById("pool-añadidas");
    cajaAdd.innerHTML = "";
    mazo.cartas.forEach((num, idx) => {
        const div = document.createElement("div"); div.className = "mini-cromo-slot";
        div.onclick = () => { mazo.cartas.splice(idx, 1); guardarEnLocalStorage(); construirSeccionMisMazos(); };
        const ruta = rutaImagenCarta(num);
        if (ruta) {
            div.innerHTML = `<img src="${ruta}" onerror="this.src='${rutaDorsoCarta()}';this.onerror=null;">`;
        } else {
            div.innerHTML = `<div style="font-size:8px; padding:4px; color:var(--txt-muted); text-align:center;">#${num}</div>`;
        }
        cajaAdd.appendChild(div);
    });

    const cajaInv = document.getElementById("pool-inventario");
    cajaInv.innerHTML = "";
    if (!mazoPoolEspecificaciones.length) {
        cajaInv.innerHTML = '<p style="color:var(--txt-muted); font-size:12px; text-align:center;">Cargando cartas...</p>';
        return;
    }
    mazoPoolEspecificaciones.forEach(spec => {
        const div = document.createElement("div"); div.className = "mini-cromo-slot";
        div.onclick = () => {
            // Validar antes de añadir
            const copias = mazo.cartas.filter(n => n === spec.numero).length;
            if (spec.maxCopias && copias >= spec.maxCopias) {
                alert(`No puedes tener más de ${spec.maxCopias} copias de "${spec.nombre}" en el mazo.`);
                return;
            }
            if (spec.tipo !== "Esfera" && copias >= 1) {
                alert(`La carta "${spec.nombre}" no puede repetirse en el mazo.`);
                return;
            }
            mazo.cartas.push(spec.numero);
            guardarEnLocalStorage();
            construirSeccionMisMazos();
        };
        const ruta = rutaImagenCarta(spec.numero);
        if (ruta) {
            div.innerHTML = `<img src="${ruta}" onerror="this.src='${rutaDorsoCarta()}';this.onerror=null;">`;
        } else {
            div.innerHTML = `<div style="font-size:7px; color:#555; text-align:center; padding:3px;">${spec.nombre}</div>`;
        }
        div.innerHTML += `<span class="numero-flotante" style="font-size:9px;">#${spec.numero}</span>`;
        cajaInv.appendChild(div);
    });
}

// ==========================================================================
// CONTROLADORES DE INTERFAZ GENERALES
// ==========================================================================
function seleccionarMazoEdicion(id) { mazoIdEnEdicion = id; construirSeccionMisMazos(); }
function eliminarMazo(id) { delete estructuraMazosGuardados[id]; mazoIdEnEdicion = null; guardarEnLocalStorage(); construirSeccionMisMazos(); }
function volverASelec() { document.getElementById("pantalla-album").className = "seccion-oculta"; document.getElementById("pantalla-seleccion").className = "seccion-activa"; renderizarMenuCajas(); }
function cambiarFiltro(t) { filtroActual = t; document.querySelectorAll(".btn-filtro").forEach(b => b.classList.remove("activo")); document.getElementById(`f-${t}`).classList.add("activo"); refrescarGrilla(); }
function filtrarCartas() { refrescarGrilla(); }
function cerrarModal() { document.getElementById("modal-carta").className = "modal-oculto"; }
function voltearCartaElemento() { document.getElementById("carta-3d").classList.toggle("volteada"); }

function navegarSeccionGlobal(p) { 
    document.querySelectorAll(".btn-pestana-global").forEach(b => b.classList.remove("activa")); 
    document.getElementById(`pestana-${p}`).classList.add("activa"); 
    document.getElementById("contenedor-seccion-album").className = p === 'album' ? "bloque-global-visible" : "bloque-global-oculto"; 
    document.getElementById("contenedor-seccion-mazos").className = p === 'mazos' ? "bloque-global-visible" : "bloque-global-oculto"; 
    document.getElementById("contenedor-seccion-pvp").className = p === 'pvp' ? "bloque-global-visible" : "bloque-global-oculto"; 
    if(p === 'mazos') construirSeccionMisMazos(); 
    if(p === 'pvp') configurarSelectoresPartidaVersus(); 
}

function buscarCartaEnMemoria(num) {
    for (let c of Object.values(coleccionAlbum)) { if (c.cartas[num]) return c.cartas[num]; }
    return null;
}

// ==========================================================================
// MOTOR DE COMBATE (DBZEngine) — Integración con la interfaz
// ==========================================================================

function configurarSelectoresPartidaVersus() {
    const s1 = document.getElementById("select-pvp-mazo-j1");
    const s2 = document.getElementById("select-pvp-mazo-j2");
    if(!s1 || !s2) return;
    s1.innerHTML = ""; s2.innerHTML = "";
    Object.values(estructuraMazosGuardados).forEach(m => {
        const o = `<option value="${m.id}">${m.nombre} (${m.cartas.length})</option>`; s1.innerHTML += o; s2.innerHTML += o;
    });
}

function iniciarCombatePVPLocal() {
    const m1 = document.getElementById("select-pvp-mazo-j1").value;
    const m2 = document.getElementById("select-pvp-mazo-j2").value;
    const energia = parseInt(document.getElementById("select-pvp-energia").value) || 500;
    if(!m1 || !m2) return alert("Selecciona barajas válidas.");

    const mazo1 = estructuraMazosGuardados[m1].cartas;
    const mazo2 = estructuraMazosGuardados[m2].cartas;

    const poolMap = new Map(mazoPoolEspecificaciones.map(c => [c.numero, c]));
    const v1 = DBZEngine.validarMazo(mazo1, poolMap);
    if (!v1.ok) return alert(`Mazo de J1 inválido: ${v1.error}`);
    const v2 = DBZEngine.validarMazo(mazo2, poolMap);
    if (!v2.ok) return alert(`Mazo de J2 inválido: ${v2.error}`);

    arenaCombateEstado = DBZEngine.crearEstadoPartida(mazo1, mazo2, energia, mazoPoolEspecificaciones);

    document.getElementById("pvp-configuracion-inicial").classList.add("seccion-oculta");
    document.getElementById("pvp-pantalla-tablero").classList.remove("seccion-oculta");
    actualizarInterfazTableroPVP();
}

function specDe(num) { return mazoPoolEspecificaciones.find(c => c.numero === num); }

function nombreVisualCarta(num) {
    const spec = specDe(num);
    return { img: rutaImagenCarta(num), nombre: spec ? spec.nombre : `#${num}` };
}

function actualizarInterfazTableroPVP() {
    const estado = arenaCombateEstado;
    document.getElementById("hp-display-j1").innerText = estado.j1.energia;
    document.getElementById("hp-display-j2").innerText = estado.j2.energia;
    document.getElementById("texto-alerta-turno-actual").innerText = `TURNO JUGADOR ${estado.turnoJugador}`;
    document.getElementById("indicador-jugador-mano").innerText = estado.turnoJugador;
    document.getElementById("texto-fase-actual").innerText = `FASE: ${(estado.faseTurno || 'accion').toUpperCase()}`;

    renderFilaAtaques("campo-cartas-j1", estado.j1.campoAtaque, "j1");
    renderFilaAtaques("campo-cartas-j2", estado.j2.campoAtaque, "j2");
    renderFilaDefensa("defensa-cartas-j1", estado.j1.campoDefensa, "j1");
    renderFilaDefensa("defensa-cartas-j2", estado.j2.campoDefensa, "j2");

    const mBox = document.getElementById("mano-jugador-activa");
    mBox.innerHTML = "";
    const jugadorId = estado.turnoJugador === 1 ? "j1" : "j2";
    const act = estado[jugadorId];

    act.mano.forEach((num, idx) => {
        const div = document.createElement("div");
        div.className = "mini-cromo-slot";
        const { img, nombre } = nombreVisualCarta(num);
        const spec = specDe(num);
        const tipoTag = spec ? spec.tipo[0] : "?";
        div.innerHTML = img
            ? `<img src="${img}">`
            : `<div style="font-size:7px; color:var(--txt-muted); padding:3px; text-align:center;">${nombre}</div>`;
        div.innerHTML += `<span class="numero-flotante" style="font-size:9px;">${tipoTag}</span>`;
        div.onclick = () => manejarClickCartaEnMano(idx, num, spec);
        mBox.appendChild(div);
    });

    renderLogBatalla();

    if (estado.ganador) {
        agregarLogVisual(`🏆 ¡JUGADOR ${estado.ganador} GANA LA PARTIDA!`);
        setTimeout(() => alert(`¡Jugador ${estado.ganador} gana la partida!`), 50);
    }
}

function renderFilaAtaques(idDom, campoAtaque, jugadorId) {
    const el = document.getElementById(idDom);
    el.innerHTML = "";
    campoAtaque.forEach((entrada, idx) => {
        const div = document.createElement("div");
        div.className = "mini-cromo-slot";
        const { img, nombre } = nombreVisualCarta(entrada.ataqueNum);
        const { atk, def } = DBZEngine.totalDeEntrada(arenaCombateEstado, entrada);
        div.innerHTML = img ? `<img src="${img}">` : `<div style="font-size:7px; padding:3px; text-align:center;">${nombre}</div>`;
        div.innerHTML += `<span class="numero-flotante" style="font-size:9px;">${atk}/${def}</span>`;
        const esTurnoDeEseJugador = (arenaCombateEstado.turnoJugador === 1 && jugadorId === "j1") ||
                                     (arenaCombateEstado.turnoJugador === 2 && jugadorId === "j2");
        if (esTurnoDeEseJugador) {
            div.onclick = () => abrirSelectorModificadora(idx);
            div.title = "Tocá para aplicar una carta Modificadora desde tu mano";
        }
        el.appendChild(div);
    });
}

function renderFilaDefensa(idDom, campoDefensa, jugadorId) {
    const el = document.getElementById(idDom);
    el.innerHTML = "";
    if (!campoDefensa) return;
    const div = document.createElement("div");
    div.className = "mini-cromo-slot";
    const { img, nombre } = nombreVisualCarta(campoDefensa.defensaNum);
    const { def } = DBZEngine.totalDeEntrada(arenaCombateEstado, { ...campoDefensa, ataqueNum: campoDefensa.defensaNum });
    div.innerHTML = img ? `<img src="${img}">` : `<div style="font-size:7px; padding:3px; text-align:center;">${nombre}</div>`;
    div.innerHTML += `<span class="numero-flotante" style="font-size:9px;">DEF ${def}</span>`;
    if (jugadorId) {
        div.onclick = () => abrirSelectorModificadoraParaDefensa(jugadorId);
        div.title = "Tocá para aplicar una carta Modificadora desde la mano a esta defensa";
    }
    el.appendChild(div);
}

function renderLogBatalla() {
    const box = document.getElementById("log-batalla-pvp");
    if (!box) return;
    box.innerHTML = arenaCombateEstado.historial.map(l => `<div>&gt; ${l}</div>`).join("");
    box.scrollTop = box.scrollHeight;
}
function agregarLogVisual(msg) {
    arenaCombateEstado.historial.push(msg);
    renderLogBatalla();
}

function manejarClickCartaEnMano(idx, num, spec) {
    if (!spec) return alert("Esta carta no tiene datos cargados en la base de cartas.");
    const estado = arenaCombateEstado;
    const jugadorId = estado.turnoJugador === 1 ? "j1" : "j2";

    if (spec.tipo === "Esfera") {
        return alert("Las esferas no se juegan solas: se usan automáticamente al bajar un Ataque, Modificadora o Instantánea que las requiera.");
    }

    if (spec.tipo === "Ataque") {
        const r = DBZEngine.declararAtaque(estado, idx);
        if (!r.ok) return alert(r.error);
        return actualizarInterfazTableroPVP();
    }

    if (spec.tipo === "Modificadora") {
        if (estado[jugadorId].campoAtaque.length === 0) {
            return alert("Primero bajá un Ataque al campo antes de modificarlo.");
        }
        return abrirSelectorAtaqueParaModificar(idx);
    }

    if (spec.tipo === "Instantanea") {
        const REQUIERE_OBJETIVO = ["MODIFICAR_OBJETIVO_0_40", "MODIFICAR_OBJETIVO_20_0", "MODIFICAR_OBJETIVO_20_20", "MODIFICAR_OBJETIVO_MENOS20_MENOS20", "MULTIPLICAR_OBJETIVO_X3", "MULTIPLICAR_OBJETIVO_X1_X2", "MODIFICAR_OBJETIVO_20_40", "MODIFICAR_OBJETIVO_80_0"];
        if (REQUIERE_OBJETIVO.includes(spec.efectoId)) {
            const hayAtaquesEnMesa = estado.j1.campoAtaque.length > 0 || estado.j2.campoAtaque.length > 0;
            if (!hayAtaquesEnMesa) return alert("No hay ningún ataque en mesa todavía para aplicarle esta carta.");
            return abrirSelectorObjetivoParaInstantanea(jugadorId, idx);
        }
        const r = DBZEngine.jugarInstantanea(estado, jugadorId, idx);
        if (!r.ok) return alert(r.error);
        return actualizarInterfazTableroPVP();
    }

    if (spec.tipo === "Especial") {
        const r = DBZEngine.jugarEspecial(estado, idx);
        if (!r.ok) return alert(r.error);
        return actualizarInterfazTableroPVP();
    }
}

let _pendienteIdxModificadoraMano = null;
function abrirSelectorAtaqueParaModificar(idxModEnMano) {
    _pendienteIdxModificadoraMano = idxModEnMano;
    const estado = arenaCombateEstado;
    const jugadorId = estado.turnoJugador === 1 ? "j1" : "j2";
    const campo = estado[jugadorId].campoAtaque;

    const cont = document.getElementById("modal-eleccion-opciones");
    cont.innerHTML = "";
    document.getElementById("modal-eleccion-titulo").innerText = "¿A qué ataque aplicar la modificadora?";
    campo.forEach((entrada, idxCampo) => {
        const { nombre } = nombreVisualCarta(entrada.ataqueNum);
        const btn = document.createElement("button");
        btn.className = "btn-guardar-stats";
        btn.style.width = "auto";
        btn.innerText = nombre;
        btn.onclick = () => {
            const r = DBZEngine.modificarAtaque(estado, idxCampo, _pendienteIdxModificadoraMano);
            cerrarModalEleccionPVP();
            if (!r.ok) return alert(r.error);
            actualizarInterfazTableroPVP();
        };
        cont.appendChild(btn);
    });
    document.getElementById("modal-eleccion-pvp").className = "seccion-activa";
}

function abrirSelectorModificadora() {
    const estado = arenaCombateEstado;
    const jugadorId = estado.turnoJugador === 1 ? "j1" : "j2";
    const mano = estado[jugadorId].mano;
    const modificadoras = mano.map((num, idx) => ({ num, idx, spec: specDe(num) }))
        .filter(c => c.spec && c.spec.tipo === "Modificadora");

    if (modificadoras.length === 0) return alert("No tenés cartas Modificadoras en mano.");

    const cont = document.getElementById("modal-eleccion-opciones");
    cont.innerHTML = "";
    document.getElementById("modal-eleccion-titulo").innerText = "Elegí la modificadora a aplicar";
    modificadoras.forEach(c => {
        const btn = document.createElement("button");
        btn.className = "btn-guardar-stats";
        btn.style.width = "auto";
        btn.innerText = `${c.spec.nombre} (+${c.spec.ataque}/+${c.spec.defensa})`;
        btn.onclick = () => {
            cerrarModalEleccionPVP();
            abrirSelectorAtaqueParaModificar(c.idx);
        };
        cont.appendChild(btn);
    });
    document.getElementById("modal-eleccion-pvp").className = "seccion-activa";
}

function abrirSelectorModificadoraParaDefensa(jugadorId) {
    const estado = arenaCombateEstado;
    const mano = estado[jugadorId].mano;
    const modificadoras = mano.map((num, idx) => ({ num, idx, spec: specDe(num) }))
        .filter(c => c.spec && c.spec.tipo === "Modificadora");

    if (modificadoras.length === 0) return alert("No hay cartas Modificadoras en la mano de ese jugador.");

    const cont = document.getElementById("modal-eleccion-opciones");
    cont.innerHTML = "";
    document.getElementById("modal-eleccion-titulo").innerText = "Elegí la modificadora a aplicar a tu defensa";
    modificadoras.forEach(c => {
        const btn = document.createElement("button");
        btn.className = "btn-guardar-stats";
        btn.style.width = "auto";
        btn.innerText = `${c.spec.nombre} (+${c.spec.ataque}/+${c.spec.defensa})`;
        btn.onclick = () => {
            const r = DBZEngine.modificarDefensa(estado, jugadorId, c.idx);
            cerrarModalEleccionPVP();
            if (!r.ok) return alert(r.error);
            actualizarInterfazTableroPVP();
        };
        cont.appendChild(btn);
    });
    document.getElementById("modal-eleccion-pvp").className = "seccion-activa";
}

function abrirSelectorObjetivoParaInstantanea(jugadorId, idxEnMano) {
    const estado = arenaCombateEstado;
    const cont = document.getElementById("modal-eleccion-opciones");
    cont.innerHTML = "";
    document.getElementById("modal-eleccion-titulo").innerText = "¿A qué ataque en mesa aplicarla?";

    ["j1", "j2"].forEach(jid => {
        estado[jid].campoAtaque.forEach((entrada, idxCampo) => {
            const { nombre } = nombreVisualCarta(entrada.ataqueNum);
            const btn = document.createElement("button");
            btn.className = "btn-guardar-stats";
            btn.style.width = "auto";
            btn.innerText = `${nombre} (${jid === "j1" ? "J1" : "J2"})`;
            btn.onclick = () => {
                const r = DBZEngine.jugarInstantanea(estado, jugadorId, idxEnMano, { jugadorId: jid, idxCampoAtaque: idxCampo });
                cerrarModalEleccionPVP();
                if (!r.ok) return alert(r.error);
                actualizarInterfazTableroPVP();
            };
            cont.appendChild(btn);
        });
    });
    document.getElementById("modal-eleccion-pvp").className = "seccion-activa";
}

function cerrarModalEleccionPVP() {
    document.getElementById("modal-eleccion-pvp").className = "modal-oculto";
}

function usarAtaqueEsferasDelDragon() {
    const r = DBZEngine.ataqueEsferasDelDragon(arenaCombateEstado);
    if (!r.ok) return alert(r.error);
    actualizarInterfazTableroPVP();
}

function resolverDueloMesa() {
    const estado = arenaCombateEstado;
    const atacanteId = estado.turnoJugador === 1 ? "j1" : "j2";

    if (estado[atacanteId].campoAtaque.length === 0) {
        return alert("No bajaste ningún ataque todavía. Tocá una carta de Ataque en tu mano primero.");
    }

    const defensorId = estado.turnoJugador === 1 ? "j2" : "j1";
    const defensor = estado[defensorId];
    const tieneAtaquesParaDefender = defensor.mano.some(n => specDe(n)?.tipo === "Ataque");

    if (tieneAtaquesParaDefender && !defensor.campoDefensa) {
        const quiereDefender = confirm(`Jugador ${defensorId === 'j1' ? 1 : 2}: ¿querés preparar una defensa antes de resolver el ataque? (Cancelar = no defenderse)`);
        if (quiereDefender) {
            abrirSelectorDefensa(defensorId);
            return;
        }
    }

    const r = DBZEngine.resolverAtaques(estado);
    if (!r.ok) return alert(r.error);
    actualizarInterfazTableroPVP();
}

function abrirSelectorDefensa(defensorId) {
    const estado = arenaCombateEstado;
    const mano = estado[defensorId].mano;
    const opciones = mano.map((num, idx) => ({ num, idx, spec: specDe(num) }))
        .filter(c => c.spec && c.spec.tipo === "Ataque");

    if (opciones.length === 0) {
        alert("No tenés cartas de Ataque en mano para defenderte.");
        const r = DBZEngine.resolverAtaques(estado);
        if (!r.ok) alert(r.error);
        actualizarInterfazTableroPVP();
        return;
    }

    const cont = document.getElementById("modal-eleccion-opciones");
    cont.innerHTML = "";
    document.getElementById("modal-eleccion-titulo").innerText = `Jugador ${defensorId === 'j1' ? 1 : 2}: elegí tu carta de defensa`;
    opciones.forEach(c => {
        const btn = document.createElement("button");
        btn.className = "btn-guardar-stats";
        btn.style.width = "auto";
        btn.innerText = `${c.spec.nombre} (DEF ${c.spec.defensa})`;
        btn.onclick = () => {
            const r = DBZEngine.declararDefensa(estado, defensorId, c.idx);
            if (!r.ok) { 
                cerrarModalEleccionPVP();
                alert(r.error);
                return; 
            }
            const r2 = DBZEngine.resolverAtaques(estado);
            if (!r2.ok) alert(r2.error);
            cerrarModalEleccionPVP();
            actualizarInterfazTableroPVP();
        };
        cont.appendChild(btn);
    });
    document.getElementById("modal-eleccion-pvp").className = "seccion-activa";
}

function pasarTurnoCombateLocal() {
    const estado = arenaCombateEstado;
    const info = DBZEngine.prepararPasarTurno(estado);
    if (info && info.requiereDescarte) {
        mostrarSelectorDescartes(info);
        return;
    }
    // Si no hay descarte, el engine ya cambió el turno en prepararPasarTurno? No, prepararPasarTurno solo prepara, no cambia.
    // Debemos cambiar el turno manualmente si no requiere descarte.
    if (!info || !info.requiereDescarte) {
        DBZEngine.cambiarTurnoYRobar(estado);
        actualizarInterfazTableroPVP();
    }
}

function mostrarSelectorDescartes(info) {
    const cont = document.getElementById("modal-eleccion-opciones");
    cont.innerHTML = "";
    document.getElementById("modal-eleccion-titulo").innerText = `Jugador ${info.jugadorId === 'j1' ? 1 : 2}: debes descartar ${info.cantidad} carta(s) (no jugaste en tu turno)`;

    let seleccionados = [];
    const mano = info.mano;

    mano.forEach((num, idx) => {
        const spec = specDe(num);
        const btn = document.createElement("button");
        btn.className = "btn-guardar-stats";
        btn.style.width = "auto";
        btn.style.margin = "4px";
        btn.innerText = `${spec ? spec.nombre : '#'+num} (${idx+1})`;
        btn.dataset.idx = idx;
        btn.onclick = function() {
            const i = parseInt(this.dataset.idx);
            const pos = seleccionados.indexOf(i);
            if (pos >= 0) {
                seleccionados.splice(pos, 1);
                this.style.border = "1px solid var(--amarilla)";
            } else {
                if (seleccionados.length < info.cantidad) {
                    seleccionados.push(i);
                    this.style.border = "3px solid red";
                } else {
                    alert(`Ya seleccionaste ${info.cantidad} cartas.`);
                }
            }
        };
        cont.appendChild(btn);
    });

    const confirmBtn = document.createElement("button");
    confirmBtn.className = "btn-guardar-stats";
    confirmBtn.style.width = "auto";
    confirmBtn.style.margin = "8px auto";
    confirmBtn.innerText = "Confirmar descarte";
    confirmBtn.onclick = function() {
        if (seleccionados.length !== info.cantidad) {
            alert(`Debes seleccionar exactamente ${info.cantidad} cartas.`);
            return;
        }
        cerrarModalEleccionPVP();
        const estado = arenaCombateEstado;
        const r = DBZEngine.ejecutarDescarte(estado, seleccionados);
        if (r.ok) {
            actualizarInterfazTableroPVP();
        } else {
            alert(r.error);
        }
    };
    cont.appendChild(confirmBtn);

    document.getElementById("modal-eleccion-pvp").className = "seccion-activa";
}

function guardarEnLocalStorage() {
    try {
        localStorage.setItem("coleccionAlbum_Publico", JSON.stringify(coleccionAlbum));
        localStorage.setItem("estructuraMazos_Publico", JSON.stringify(estructuraMazosGuardados));
    } catch (e) {
        console.warn('Error al guardar en localStorage:', e);
    }
}

function cargarDesdeLocalStorage() {
    try {
        const f = localStorage.getItem("coleccionAlbum_Publico");
        if(f) {
            const o = JSON.parse(f);
            Object.keys(o).forEach(k => {
                if(coleccionAlbum[k]) {
                    Object.keys(o[k].cartas).forEach(numCarta => {
                        if(coleccionAlbum[k].cartas[numCarta]) {
                            coleccionAlbum[k].cartas[numCarta].obtenida = o[k].cartas[numCarta].obtenida;
                            coleccionAlbum[k].cartas[numCarta].repetidas = o[k].cartas[numCarta].repetidas;
                            coleccionAlbum[k].cartas[numCarta].imgFrente = o[k].cartas[numCarta].imgFrente;
                            coleccionAlbum[k].cartas[numCarta].imgAtras = o[k].cartas[numCarta].imgAtras;
                        }
                    });
                }
            });
        }
        const m = localStorage.getItem("estructuraMazos_Publico");
        if(m) estructuraMazosGuardados = JSON.parse(m);
    } catch (e) {
        console.warn('Error al cargar desde localStorage:', e);
    }
}
