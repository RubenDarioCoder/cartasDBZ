// ==========================================================================
// game-engine.js — Motor de reglas "DBZ Leyenda"
// ==========================================================================
// Este módulo NO toca el DOM. Recibe un pool de cartas (cartas_db.json) y
// expone funciones puras / con efectos controlados sobre un objeto "estado".
// La capa de interfaz (app.js) es la única responsable de pintar pantalla.
//
// Reglas base (manual "Leyenda - Reglas de Juego"):
//  - Mazo mínimo 40 cartas, no repetir una misma carta 2+ veces en el mismo
//    turno (las esferas sí pueden repetirse).
//  - Energía inicial configurable: 200 / 500 / 1000.
//  - Mano inicial de 7 cartas. Robás hasta tener 7 al inicio de tu turno.
//  - Atacar = bajar carta de ataque + su esfera correspondiente (par).
//  - Defender = bajar carta de ataque propia (se usa su valor DEF) + esfera.
//    Si DEF defensor > ATK atacante, el sobrante NO se descuenta a nadie.
//  - Cartas modificadoras: suman/restan ATK/DEF a un ataque ya bajado, y
//    requieren su propia esfera.
//  - Instantáneas: se juegan en el turno del rival (o el propio si la carta
//    lo permite), efecto según texto.
//  - 7 esferas del dragón juntas y bajadas = 100 de daño directo automático.
//  - Si no bajaste ninguna carta en tu turno, descartás hasta quedar con 5.
//  - Regla de oro: el texto de la carta puede contradecir la regla general;
//    eso se resuelve vía el sistema de efectos (EFFECTS) por efectoId.
//
// Extensiones agregadas para soportar cartas con mecánicas especiales:
//  - "comboCon": array de números de carta. Si esta carta y otra del combo
//    ya están en mesa este turno, comparten una sola esfera (genераliza la
//    regla de "androides").
//  - "multiplicador": true en una modificadora -> en vez de sumar ATK/DEF,
//    los multiplica (x2, x3, etc., según el valor ataque/defensa de la
//    carta como factor).
//  - "permanente": true -> la carta queda en una zona aparte
//    (estado.jX.permanentes) y su efecto se re-evalúa cada turno hasta que
//    se descarte explícitamente.
//  - Recuperación de energía: ctx.curar(n) en EFFECTS, respeta energiaMax.
//  - Bonus de turno (estado.jX.bonusTurno): modificadores temporales que
//    aplican durante la resolución de ataques y se limpian al pasar turno.
//  - Anulación de ataque por umbral de puntos: EFFECTS puede setear
//    ctx.anularSiAtaqueMenorA = N.
// ==========================================================================

const DBZEngine = (() => {

    const TIPOS = {
        ATAQUE: "Ataque",
        ESFERA: "Esfera",
        MODIFICADORA: "Modificadora",
        INSTANTANEA: "Instantanea",
        ESPECIAL: "Especial"
    };

    // ----------------------------------------------------------------------
    // SISTEMA DE EFECTOS (REGLA DE ORO: el texto de la carta manda)
    // ----------------------------------------------------------------------
    // Cada efecto recibe (estado, ctx) y puede mutar el estado libremente.
    // ctx trae: jugadorId, oponenteId, cartaJugada (spec), engine (helpers).
    // Si un efectoId no está registrado acá, se aplica el comportamiento
    // "POR_DEFECTO" (es decir, solo las reglas generales del manual).
    // Esto permite ir sumando las cartas que falten sin tocar el motor base.
    const EFFECTS = {
        POR_DEFECTO: () => {},

        // "DEVOLVER ATAQUE" (#10): el ataque del rival se vuelve en su contra
        // sin dañarte. No sirve contra el ataque de las 7 esferas.
        DEVOLVER_ATAQUE: (estado, ctx) => {
            ctx.log(`${ctx.spec.nombre}: el ataque rival se redirige contra sí mismo.`);
            ctx.anularDanioYRedirigir = true;
        },

        // "EL DUELO" (#14): el rival muestra la mano, elegís hasta 3 esferas
        // y van a su cementerio (descarte).
        EL_DUELO: (estado, ctx) => {
            const oponente = estado[ctx.oponenteId];
            const esferas = oponente.mano.filter(n => ctx.engine.specOf(n)?.tipo === TIPOS.ESFERA);
            const aDescartar = esferas.slice(0, 3);
            aDescartar.forEach(num => {
                oponente.mano.splice(oponente.mano.indexOf(num), 1);
                oponente.descarte.push(num);
            });
            ctx.log(`${ctx.spec.nombre}: se enviaron ${aDescartar.length} esfera(s) del rival al cementerio.`);
        },

        // "DESTRUCCION" (#16): elegís 1 carta (no esfera) de la mano rival y
        // va a su cementerio.
        DESTRUCCION: (estado, ctx) => {
            const oponente = estado[ctx.oponenteId];
            const idx = oponente.mano.findIndex(n => ctx.engine.specOf(n)?.tipo !== TIPOS.ESFERA);
            if (idx >= 0) {
                const [num] = oponente.mano.splice(idx, 1);
                oponente.descarte.push(num);
                ctx.log(`${ctx.spec.nombre}: se descartó una carta de la mano rival.`);
            }
        },

        // "REVIVIR" (#18): buscás en tu cementerio y volvés 1 carta (no
        // esfera) a tu mano, luego descartás 1.
        REVIVIR: (estado, ctx) => {
            const propio = estado[ctx.jugadorId];
            const idx = propio.descarte.findIndex(n => ctx.engine.specOf(n)?.tipo !== TIPOS.ESFERA);
            if (idx >= 0) {
                const [num] = propio.descarte.splice(idx, 1);
                propio.mano.push(num);
                ctx.log(`${ctx.spec.nombre}: recuperaste una carta del cementerio.`);
            }
        },

        // "LA CHANCE DE CELL" (#23): descartás hasta 3 cartas y robás otras 3.
        LA_CHANCE_DE_CELL: (estado, ctx) => {
            const propio = estado[ctx.jugadorId];
            const aDescartar = propio.mano.splice(0, Math.min(3, propio.mano.length));
            propio.descarte.push(...aDescartar);
            for (let i = 0; i < 3 && propio.mazo.length; i++) {
                propio.mano.push(propio.mazo.pop());
            }
            ctx.log(`${ctx.spec.nombre}: descartaste ${aDescartar.length} y robaste cartas nuevas.`);
        },

        // "PREMONICION" (#25): obligás al rival a mostrar su mano (efecto
        // puramente informativo en interfaz, se resuelve en app.js).
        PREMONICION: (estado, ctx) => {
            ctx.mostrarManoRival = true;
            ctx.log(`${ctx.spec.nombre}: viste la mano de tu rival.`);
        },

        // "DETENER" (#80): bloquea un ataque (instantánea). El bloqueo se
        // marca en el estado de la partida (no en el ctx local) para que
        // resolverAtaques lo detecte cuando llegue el momento de aplicar daño.
        BLOQUEAR_ATAQUE: (estado, ctx) => {
            estado.bloqueoAtaquePendiente = true;
            ctx.log(`${ctx.spec.nombre}: ¡el próximo ataque será bloqueado por completo!`);
        },

        // -------------------- NUEVAS (Caja Goku / Caja Vegeta) --------------

        // "LA MAGIA DEL DRAGON" (#31): recupera 20 de energía sin pasar el máximo.
        RECUPERAR_20: (estado, ctx) => { ctx.curar(20); },

        // "MERIENDA" (#167): recupera 50 de energía. No podés hacer otra
        // acción este turno (se resuelve marcando bajoCartaEsteTurno true,
        // que ya impide el "descarte por inacción"; la restricción de "no
        // más acciones" la hace cumplir la interfaz).
        RECUPERAR_50: (estado, ctx) => { ctx.curar(50); },

        // "CAPSULA DE SALUD" (#273, permanente): recupera 50 por turno hasta
        // llenar el contador, luego se descarta sola.
        CAPSULA_DE_SALUD_TURNO: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            if (j.energia >= j.energiaMax) { ctx.retirarPermanente(); return; }
            ctx.curar(50);
            if (j.energia >= j.energiaMax) ctx.retirarPermanente();
        },

        // "CON LA GUARDIA BAJA" (#60): el rival no puede defenderse este turno.
        SIN_DEFENSA_RIVAL: (estado, ctx) => {
            const propio = estado[ctx.jugadorId];
            propio.bonusTurno.rivalNoPuedeDefenderse = true;
            ctx.log(`${ctx.spec.nombre}: tu rival no podrá defenderse este turno.`);
        },

        // "SORPRESUSTO" (#62 y #160): las defensas del rival bajan a la mitad este turno.
        DEFENSA_RIVAL_MITAD: (estado, ctx) => {
            const propio = estado[ctx.jugadorId];
            propio.bonusTurno.rivalDefensaMitad = true;
            ctx.log(`${ctx.spec.nombre}: las defensas de tu rival quedan reducidas a la mitad este turno.`);
        },

        // "TOMANDO EL CONTROL" (#81): el rival muestra la mano y descarta TODAS sus esferas.
        DESCARTAR_TODAS_ESFERAS_RIVAL: (estado, ctx) => {
            const oponente = estado[ctx.oponenteId];
            const esferas = oponente.mano.filter(n => ctx.engine.specOf(n)?.tipo === TIPOS.ESFERA);
            esferas.forEach(num => {
                oponente.mano.splice(oponente.mano.indexOf(num), 1);
                oponente.descarte.push(num);
            });
            ctx.log(`${ctx.spec.nombre}: se descartaron ${esferas.length} esfera(s) de la mano rival.`);
        },

        // "DRAGON COME BOLAS" (#274): el rival muestra la mano y descarta 1 esfera (si tiene).
        DESCARTAR_UNA_ESFERA_RIVAL: (estado, ctx) => {
            const oponente = estado[ctx.oponenteId];
            const idx = oponente.mano.findIndex(n => ctx.engine.specOf(n)?.tipo === TIPOS.ESFERA);
            if (idx >= 0) {
                const [num] = oponente.mano.splice(idx, 1);
                oponente.descarte.push(num);
                ctx.log(`${ctx.spec.nombre}: se descartó una esfera de la mano rival.`);
            } else {
                ctx.log(`${ctx.spec.nombre}: el rival no tenía esferas en mano.`);
            }
        },

        // "SCOUTER" / "PREMONICION" / "EL MEJOR REGALO" (mostrar mano): solo informativo en UI.
        MOSTRAR_MANO_RIVAL: (estado, ctx) => {
            ctx.mostrarManoRival = true;
            ctx.log(`${ctx.spec.nombre}: viste la mano de tu rival.`);
        },

        // "DESINTEGRAR" (#284): carta al azar de la mano rival va al descarte.
        DESCARTAR_AL_AZAR_RIVAL: (estado, ctx) => {
            const oponente = estado[ctx.oponenteId];
            if (oponente.mano.length === 0) return;
            const idx = Math.floor(Math.random() * oponente.mano.length);
            const [num] = oponente.mano.splice(idx, 1);
            oponente.descarte.push(num);
            ctx.log(`${ctx.spec.nombre}: una carta al azar de la mano rival fue al cementerio.`);
        },

        // "VUELTA A LA VIDA" / "FUERZAS ESPECIALES" (#127, #329): buscar en
        // tu mazo o tu descarte una carta y devolverla a la mano.
        RECUPERAR_DEL_DESCARTE: (estado, ctx) => {
            const propio = estado[ctx.jugadorId];
            if (propio.descarte.length === 0) { ctx.log(`${ctx.spec.nombre}: el cementerio está vacío.`); return; }
            const num = propio.descarte.pop();
            propio.mano.push(num);
            ctx.log(`${ctx.spec.nombre}: recuperaste una carta del cementerio.`);
        },

        // "CURACION" (#366): revisa el descarte y devuelve hasta 3 cartas a la mano.
        RECUPERAR_3_DEL_DESCARTE: (estado, ctx) => {
            const propio = estado[ctx.jugadorId];
            const n = Math.min(3, propio.descarte.length);
            for (let i = 0; i < n; i++) propio.mano.push(propio.descarte.pop());
            ctx.log(`${ctx.spec.nombre}: recuperaste ${n} carta(s) del cementerio.`);
        },

        // "LLEGAN LOS SAIYAYIN" (#151): buscar hasta 3 cartas del mazo a la
        // mano (simplificado: las primeras 3 disponibles del mazo propio).
        BUSCAR_EN_MAZO_3: (estado, ctx) => {
            const propio = estado[ctx.jugadorId];
            const n = Math.min(3, propio.mazo.length);
            for (let i = 0; i < n; i++) propio.mano.push(propio.mazo.pop());
            ctx.log(`${ctx.spec.nombre}: buscaste ${n} carta(s) en tu mazo.`);
        },

        // "EXPLORADORES" (#279): destruye una carta permanente del rival.
        DESTRUIR_PERMANENTE_RIVAL: (estado, ctx) => {
            const num = ctx.engine.destruirPermanente ? ctx.engine.destruirPermanente(estado, ctx.oponenteId) : null;
            if (num) {
                const s = ctx.engine.specOf(num);
                ctx.log(`${ctx.spec.nombre}: destruiste la carta permanente "${s ? s.nombre : num}" del rival.`);
            } else {
                ctx.log(`${ctx.spec.nombre}: el rival no tenía cartas permanentes en mesa.`);
            }
        },

        // "MUERTE DEL PATRIARCA" (#351): ambos descartan TODAS sus esferas
        // (mano y permanentes).
        AMBOS_DESCARTAN_ESFERAS: (estado, ctx) => {
            [ctx.jugadorId, ctx.oponenteId].forEach(id => {
                const j = estado[id];
                const esferas = j.mano.filter(n => ctx.engine.specOf(n)?.tipo === TIPOS.ESFERA);
                esferas.forEach(num => {
                    j.mano.splice(j.mano.indexOf(num), 1);
                    j.descarte.push(num);
                });
            });
            ctx.log(`${ctx.spec.nombre}: ambos jugadores descartaron todas sus esferas.`);
        },

        // "LA TERRIBLE MILK" (#277) / "MILK AL RESCATE" (#261): anulan o
        // mandan al fondo del mazo cartas de personajes puntuales. Como el
        // motor no modela "personajes" como atributo todavía, se deja el
        // efecto informativo (no rompe el juego, pero no filtra por nombre
        // automáticamente; queda para una iteración futura con más datos).
        // "GARRA DEL DRAGON" (#106): el texto original permite defender DOS
        // ataques a la vez sumando sus puntos de ataque contra una sola
        // defensa. El motor actual resuelve cada ataque contra la defensa
        // de forma independiente (no acumulada), así que por ahora esta
        // carta funciona como una Modificadora/Ataque normal con su
        // ATK/DEF de base; la mecánica de "doble bloqueo" queda pendiente
        // para una iteración futura.
        GARRA_DEL_DRAGON: (estado, ctx) => {
            ctx.log(`${ctx.spec.nombre}: (la mecánica de bloquear 2 ataques a la vez aún no está implementada; funciona como carta normal).`);
        },

        ANULAR_PERSONAJE: (estado, ctx) => {
            ctx.log(`${ctx.spec.nombre}: efecto narrativo de personaje (sin filtro automático todavía).`);
        },

        // ---- Instantáneas que modifican un ataque ya bajado en mesa ----
        // Estas requieren que la UI pase un "objetivoAtaque" al llamar
        // jugarInstantanea; si no se pasó (objetivoAtaque null), el helper
        // modificarObjetivo no hace nada y se loguea como informativo.
        MODIFICAR_OBJETIVO_0_40: (estado, ctx) => {
            const aplicado = ctx.modificarObjetivo(0, 40, false);
            ctx.log(aplicado ? `${ctx.spec.nombre}: +0/+40 aplicado al ataque elegido.` : `${ctx.spec.nombre}: hace falta elegir un ataque en mesa para aplicar el bonus.`);
        },
        MODIFICAR_OBJETIVO_20_0: (estado, ctx) => {
            const aplicado = ctx.modificarObjetivo(20, 0, false);
            ctx.log(aplicado ? `${ctx.spec.nombre}: +20/+0 aplicado al ataque elegido.` : `${ctx.spec.nombre}: hace falta elegir un ataque en mesa para aplicar el bonus.`);
        },
        MODIFICAR_OBJETIVO_20_20: (estado, ctx) => {
            const aplicado = ctx.modificarObjetivo(20, 20, false);
            ctx.log(aplicado ? `${ctx.spec.nombre}: +20/+20 aplicado al ataque elegido.` : `${ctx.spec.nombre}: hace falta elegir un ataque en mesa para aplicar el bonus.`);
        },
        MODIFICAR_OBJETIVO_MENOS20_MENOS20: (estado, ctx) => {
            const aplicado = ctx.modificarObjetivo(-20, -20, false);
            ctx.log(aplicado ? `${ctx.spec.nombre}: -20/-20 aplicado al ataque elegido.` : `${ctx.spec.nombre}: hace falta elegir un ataque en mesa para aplicar el bonus.`);
        },

        // "FURIA DEMONIACA" (#162): instantánea que multiplica x3/x3 un
        // ataque de PICCOLO ya bajado en mesa.
        MULTIPLICAR_OBJETIVO_X3: (estado, ctx) => {
            const aplicado = ctx.modificarObjetivo(3, 3, true);
            ctx.log(aplicado ? `${ctx.spec.nombre}: x3/x3 aplicado al ataque elegido.` : `${ctx.spec.nombre}: hace falta elegir un ataque en mesa para aplicar el multiplicador.`);
        },

        // "ATAQUE DEMOLEDOR" (#592): x1/x2 sobre CELL JUNIOR ya bajado.
        MULTIPLICAR_OBJETIVO_X1_X2: (estado, ctx) => {
            const aplicado = ctx.modificarObjetivo(1, 2, true);
            ctx.log(aplicado ? `${ctx.spec.nombre}: x1/x2 aplicado al ataque elegido.` : `${ctx.spec.nombre}: hace falta elegir un ataque en mesa para aplicar el multiplicador.`);
        },

        // "MANO ABIERTA" (#76): EXCEPCIÓN a la regla general del manual. Si
        // al defender, tu DEF supera el ATK rival, el rival debe descontar
        // la diferencia de SU energía (en vez de no pasar nada, como dicta
        // la regla por defecto). Se marca en bonusTurno de quien la juega,
        // y resolverAtaques lo consume la próxima vez que ese jugador
        // defienda con éxito.
        DEFENSA_PERFORADORA: (estado, ctx) => {
            estado[ctx.jugadorId].bonusTurno.defensaPerforadoraPropia = true;
            ctx.log(`${ctx.spec.nombre}: si tu defensa supera el próximo ataque rival, la diferencia se le descuenta a él.`);
        },

        // "ANULAR ATAQUE POR UMBRAL" — variantes parametrizadas (ATRAPADO,
        // INDESTRUCTIBLE, NEUTRALIZACION). Estas son instantáneas que se
        // juegan EN RESPUESTA, antes de resolverAtaques, así que el efecto
        // se evalúa dentro de resolverAtaques vía ctx.anularSiAtaqueMenorA.
        // Como jugarInstantanea() y resolverAtaques() son llamadas
        // separadas, el "umbral pendiente" se guarda en el estado.
        ANULAR_SI_MENOR_80: (estado, ctx) => {
            estado.anulacionPendiente = { umbral: 80, incluyeIgual: true };
            ctx.log(`${ctx.spec.nombre}: el próximo ataque de 80 pts o menos será anulado.`);
        },
        ANULAR_SI_MENOR_IGUAL_80_V2: (estado, ctx) => {
            estado.anulacionPendiente = { umbral: 80, incluyeIgual: false };
            ctx.log(`${ctx.spec.nombre}: el próximo ataque de menos de 80 pts será anulado.`);
        },
        ANULAR_SI_MENOR_IGUAL_100: (estado, ctx) => {
            estado.anulacionPendiente = { umbral: 100, incluyeIgual: true };
            ctx.log(`${ctx.spec.nombre}: el próximo ataque de hasta 100 pts será anulado.`);
        },
        ANULAR_TOTAL_SIN_EXCEPCION: (estado, ctx) => {
            // "NEUTRALIZACION": el ataque no te hace NINGÚN daño (sin
            // importar el puntaje), salvo el ataque de las 7 esferas.
            estado.bloqueoAtaquePendiente = true;
            ctx.log(`${ctx.spec.nombre}: el próximo ataque no te hará ningún daño.`);
        },

        // "EL MEJOR REGALO" (#331): devuelve a tu mano las cartas de
        // ataque/defensa usadas en este turno (las del cementerio jugadas
        // recién). Simplificado: recupera la última carta de tipo Ataque
        // descartada este turno.
        RECUPERAR_ULTIMA_JUGADA: (estado, ctx) => {
            const propio = estado[ctx.jugadorId];
            const idx = [...propio.descarte].reverse().findIndex(n => ctx.engine.specOf(n)?.tipo === TIPOS.ATAQUE);
            if (idx >= 0) {
                const realIdx = propio.descarte.length - 1 - idx;
                const [num] = propio.descarte.splice(realIdx, 1);
                propio.mano.push(num);
                ctx.log(`${ctx.spec.nombre}: recuperaste a tu mano la última carta de ataque jugada.`);
            }
        },

        // -------------------- NUEVAS (Caja Cell / Mr. Satan) ----------------

        // "CINTURON DE CAMPEONES" (#554, permanente): mano de 8 en vez de 7.
        // El efecto de turno que aplica limiteMano=8 lo hace procesarPermanentes
        // usando CINTURON_TURNO; al jugarla solo se logea.
        CINTURON_DE_CAMPEONES: (estado, ctx) => {
            ctx.log(`${ctx.spec.nombre}: ahora podés tener 8 cartas en mano mientras esté en mesa.`);
        },
        CINTURON_DE_CAMPEONES_TURNO: (estado, ctx) => {
            estado[ctx.jugadorId].condiciones.limiteMano = 8;
            ctx.log(`${ctx.spec.nombre} (permanente): límite de mano = 8 este turno.`);
        },

        // "SORPRESA TOTAL" (#559): rival no puede atacar el próximo turno.
        RIVAL_NO_PUEDE_ATACAR: (estado, ctx) => {
            estado[ctx.jugadorId].bonusTurno.rivalNoPuedeAtacarProximoTurno = true;
            ctx.log(`${ctx.spec.nombre}: tu rival no podrá atacar en su próximo turno.`);
        },

        // "GOLPE FATAL" (#566): destruye una permanente rival O causa 50 dmg.
        // La UI debe ofrecer la elección; el motor por defecto prefiere destruir
        // permanente si hay alguna, si no causa daño directo.
        GOLPE_FATAL: (estado, ctx) => {
            const oponente = estado[ctx.oponenteId];
            if (oponente.permanentes.length > 0) {
                const num = ctx.engine.destruirPermanente(estado, ctx.oponenteId);
                const s = ctx.engine.specOf(num);
                ctx.log(`${ctx.spec.nombre}: destruiste la carta permanente "${s ? s.nombre : num}" del rival.`);
            } else {
                oponente.energia = Math.max(0, oponente.energia - 50);
                ctx.log(`${ctx.spec.nombre}: el rival no tenía permanentes, le causaste 50 pts de daño directo.`);
            }
        },

        // "CARA A CARA" (#570): durante ESTE turno no se pueden usar
        // modificadoras, instantáneas ni permanentes (las validaciones
        // dentro de modificarAtaque/jugarInstantanea/jugarEspecial lo leen).
        CARA_A_CARA: (estado, ctx) => {
            estado[ctx.jugadorId].bonusTurno.caraACara = true;
            estado[ctx.oponenteId].bonusTurno.caraACara = true;
            ctx.log(`${ctx.spec.nombre}: este turno no se pueden usar modificadoras, instantáneas ni permanentes.`);
        },

        // "QUITA AIRE" (#573): usada como defensa, el rival no podrá atacar
        // el próximo turno. Se activa al bajarla (modificarDefensa o al
        // declarar defensa con esta carta).
        QUITA_AIRE: (estado, ctx) => {
            estado[ctx.jugadorId].bonusTurno.rivalNoPuedeAtacarProximoTurno = true;
            ctx.log(`${ctx.spec.nombre}: tu rival no podrá atacar en su próximo turno.`);
        },

        // "DOLOR DE PANZA" (#581): si el rival no se defiende en su turno,
        // vos recuperás 300 pts al inicio de tu siguiente turno.
        // Se guarda en el jugador que la jugó; faseRobo la evalúa cuando
        // vuelve a ser su turno chequeando si el rival se defendió.
        DOLOR_DE_PANZA: (estado, ctx) => {
            estado[ctx.jugadorId]._dolorDePanzaActivo = true;
            ctx.log(`${ctx.spec.nombre}: si tu rival no se defiende, recuperarás 300 pts en tu próximo turno.`);
        },

        // "EL REMEDIO DE SATAN" (#582): si no atacás en este turno recuperás
        // 100 pts. También quita la condición DOLOR DE PANZA del rival.
        REMEDIO_DE_SATAN: (estado, ctx) => {
            estado[ctx.jugadorId]._remedioSatan = true;
            // Quitar DOLOR DE PANZA del rival (del jugador que lo aplicó)
            estado[ctx.oponenteId]._dolorDePanzaActivo = false;
            ctx.log(`${ctx.spec.nombre}: si no atacás este turno, recuperarás 100 pts. Se quitó el Dolor de Panza del rival.`);
        },

        // "BURLA DIABOLICA" (#593, permanente): cada turno penaliza -0/-50
        // al ataque que elija el rival que la tiene. Efecto de turno.
        BURLA_DIABOLICA_TURNO: (estado, ctx) => {
            // Aplica -50 de DEF al primer ataque rival bajado (si hay)
            const rival = estado[ctx.jugadorId === 'j1' ? 'j2' : 'j1'];
            if (rival.campoAtaque.length > 0) {
                rival.campoAtaque[0]._bonusInstantDef = (rival.campoAtaque[0]._bonusInstantDef || 0) - 50;
                ctx.log(`BURLA DIABOLICA (permanente): -50 DEF aplicado al primer ataque rival.`);
            }
        },

        // "PIZZA" (#551): baja ataques del grupo Mr. Satan sin usar esferas.
        // En el motor se modela como que "exime del costo de esfera" a las
        // cartas del grupo cuando esta carta está en juego. Por ahora se
        // implementa como efecto narrativo + marca de estado para la UI.
        PIZZA: (estado, ctx) => {
            estado[ctx.jugadorId]._pizzaActiva = true;
            ctx.log(`${ctx.spec.nombre}: podés bajar ataques Mr. Satan sin esferas este turno.`);
        },

        // "EL GRAN SATAN" (#555): combo con PIROSHKI (#552) + CALONI (#553)
        // → rival no puede defenderse (amplía el combo a 3 cartas).
        EL_GRAN_SATAN: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            const specOf = ctx.engine.specOf;
            const tienePiroshki = j.campoAtaque.some(e => specOf(e.ataqueNum)?.numero === 552);
            const tieneCaloni = j.campoAtaque.some(e => specOf(e.ataqueNum)?.numero === 553);
            if (tienePiroshki && tieneCaloni) {
                j.bonusTurno.rivalNoPuedeDefenderse = true;
                ctx.log(`${ctx.spec.nombre}: con PIROSHKI y CALONI en mesa, ¡el rival no puede defenderse!`);
            } else {
                ctx.log(`${ctx.spec.nombre}: necesitás PIROSHKI y EL APUESTO CALONI en mesa para activar el efecto.`);
            }
        },

        // "MEGATON DESTRUCTOR" (#556): x3/x3 sobre PIROSHKI. Se aplica
        // como modificador combo con efectoId en modificarAtaque.
        // (el multiplicador ya está en el JSON como multAtk:3/multDef:3 + comboCon:[552])

        // "LA TRANQUILIDAD DE CELL" (#562): +60/+60 a CELL PERFECTO pero
        // descartás toda tu mano. El bonus va por multiplicador/combo en el
        // JSON; el descarte de mano lo implementa este efecto.
        LA_TRANQUILIDAD: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            const manoAntes = j.mano.length;
            j.descarte.push(...j.mano);
            j.mano = [];
            ctx.log(`${ctx.spec.nombre}: descartaste ${manoAntes} cartas de tu mano.`);
        },

        // "ENCUENTRO DE COLOSOS" (#563): solo se pueden bajar cartas de
        // Cell o Goku este turno. Efecto narrativo (sin catálogo de personajes
        // modelado todavía, igual que otras cartas de filtro por personaje).
        ENCUENTRO_DE_COLOSOS: (estado, ctx) => {
            ctx.log(`${ctx.spec.nombre}: este turno solo se pueden bajar cartas de Cell y de Goku (aplicar manualmente).`);
        },

        // "ESTUDIANDO MOVIMIENTOS" (#574): ver las primeras 20 cartas del
        // mazo rival. No podés atacar este turno.
        ESTUDIAR_MOVIMIENTOS: (estado, ctx) => {
            ctx.mostrarMazoRival = true;
            estado.ataquesBloqueadosEsteTurno = true;
            ctx.log(`${ctx.spec.nombre}: viste las primeras 20 cartas del mazo rival. No podés atacar este turno.`);
        },

        // "QUIETO AHI" (#568): anula un ataque (instantánea, igual que DETENER).
        QUIETO_AHI: (estado, ctx) => {
            estado.bloqueoAtaquePendiente = true;
            ctx.log(`${ctx.spec.nombre}: ¡el próximo ataque será bloqueado por completo!`);
        },

        // "ATAQUE DEMOLEDOR" (#592): x1/x2 sobre CELL JUNIOR.
        // Se aplica vía combo+multiplicador en el JSON, no necesita efecto extra.

        // "MULTIPLICACION" (#572): defender 2 ataques a la vez (suma sus ATK
        // y los enfrenta contra UNA sola defensa). Se marca como condición
        // del defensor; resolverAtaques la consume.
        MULTIPLICACION: (estado, ctx) => {
            estado[ctx.jugadorId].condiciones.defendioDobleAtaque = false; // reset
            estado[ctx.jugadorId]._multiplicacionActiva = true;
            ctx.log(`${ctx.spec.nombre}: podés defender hasta 2 ataques con esta carta como defensa combinada.`);
        },

        // "ATAQUE VELOZ" (#571): puede usarse en el turno del adversario
        // como ataque sorpresa. La UI lo habilita cuando el rival está
        // resolviendo su turno; el motor lo procesa igual que un ataque
        // normal (ya que declararAtaque no valida de quién es el turno).
        ATAQUE_VELOZ: (estado, ctx) => {
            ctx.log(`${ctx.spec.nombre}: ataque realizado en el turno del adversario.`);
        },

        // -------------------- NUEVAS (última tanda) -------------------------

        // "PREPARADOS LISTOS" (#594, permanente): +0/+50 DEF a TODOS los
        // ataques propios en mesa mientras la carta permanezca activa.
        PREPARADOS_LISTOS_TURNO: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            if (j.campoAtaque.length > 0) {
                j.campoAtaque.forEach(e => { e._bonusInstantDef = (e._bonusInstantDef || 0) + 50; });
                ctx.log(`PREPARADOS LISTOS: +50 DEF a cada ataque en mesa.`);
            }
        },

        // "HUMILLANDO" (#601): este ataque no puede ser bloqueado por
        // instantáneas como DETENER / NEUTRALIZACION / ATRAPADO.
        HUMILLANDO: (estado, ctx) => {
            estado._ataqueNoBloqueableActivo = true;
            ctx.log(`${ctx.spec.nombre}: este ataque no puede ser bloqueado.`);
        },

        // "TE ARREPENTIRAS" (#610): descartás hasta 4 cartas propias
        // y robás hasta 4 del mazo.
        TE_ARREPENTIRAS: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            const nDesc = Math.min(4, j.mano.length);
            for (let i = 0; i < nDesc; i++) j.descarte.push(j.mano.shift());
            const nRoba = Math.min(4, j.mazo.length);
            for (let i = 0; i < nRoba; i++) j.mano.push(j.mazo.pop());
            ctx.log(`${ctx.spec.nombre}: descartaste ${nDesc} y robaste ${nRoba} cartas.`);
        },

        // "NO TE CONFIES" (#614): el rival descarta 3 cartas (elegís vos)
        // y roba 3 nuevas. Simplificado: descarta las 3 primeras de su mano.
        NO_TE_CONFIES: (estado, ctx) => {
            const rival = estado[ctx.oponenteId];
            const nDesc = Math.min(3, rival.mano.length);
            for (let i = 0; i < nDesc; i++) rival.descarte.push(rival.mano.shift());
            const nRoba = Math.min(3, rival.mazo.length);
            for (let i = 0; i < nRoba; i++) rival.mano.push(rival.mazo.pop());
            ctx.log(`${ctx.spec.nombre}: rival descartó ${nDesc} y robó ${nRoba} cartas.`);
        },

        // "DEBILIDAD" (#616, permanente): al inicio de cada turno propio,
        // marca el primer ataque rival en mesa para que su DEF quede a la
        // mitad en la resolución. resolverAtaques chequea _debilidadActiva.
        DEBILIDAD_TURNO: (estado, ctx) => {
            const rivalId = ctx.jugadorId === 'j1' ? 'j2' : 'j1';
            const rival = estado[rivalId];
            if (rival.campoAtaque.length > 0) {
                rival.campoAtaque[0]._debilidadActiva = true;
                ctx.log(`DEBILIDAD: la DEF del primer ataque rival quedará reducida a la mitad.`);
            }
        },

        // ============================================================
        // EFECTOS NUEVAS CARTAS (Caja otro mundo / Torneo)
        // ============================================================

        // "YA LO HICE" (#621) + SATAN LO HIZO (#622) + SALVADOS (#623) + SOY EL MEJOR (#625):
        // Bajar las 4 cartas juntas con solo 2 esferas = ganás la partida.
        // El motor busca las 3 compañeras en la MANO del jugador, las consume
        // y setea el ganador. Si no están todas en mano, efecto nulo.
        WIN_COMBO_SATAN: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            const necesarias = [622, 623, 625];
            const idxs = necesarias.map(n => j.mano.indexOf(n));
            const tieneTodasEnMano = idxs.every(i => i >= 0);
            if (tieneTodasEnMano) {
                // Consumir las 3 cartas de mano (de atrás para no desfasar índices)
                idxs.sort((a, b) => b - a).forEach(i => j.descarte.push(j.mano.splice(i, 1)[0]));
                estado.ganador = estado.turnoJugador;
                ctx.log(`¡¡¡ COMBO MR. SATAN !!! Jugador ${estado.turnoJugador} baja YA LO HICE + SATAN LO HIZO + SALVADOS + SOY EL MEJOR y GANA LA PARTIDA.`);
            } else {
                const faltantes = necesarias.filter((n, i) => idxs[i] < 0).join(', ');
                ctx.log(`${ctx.spec.nombre}: faltan cartas en mano: #${faltantes}. Necesitás las 4 para ganar.`);
            }
        },

        // "MALDITO KAKAROTO" (#619): rival muestra mano y envía 1 carta
        // de Goku de vuelta a su mazo (buscada por nombre).
        MALDITO_KAKAROTO: (estado, ctx) => {
            ctx.mostrarManoRival = true;
            const oponente = estado[ctx.oponenteId];
            const specOf = ctx.engine.specOf;
            const idxGoku = oponente.mano.findIndex(n => {
                const s = specOf(n);
                return s && s.nombre && s.nombre.toUpperCase().includes('GOKU');
            });
            if (idxGoku >= 0) {
                const [num] = oponente.mano.splice(idxGoku, 1);
                // Insertar al fondo del mazo y mezclar
                oponente.mazo.unshift(num);
                for (let i = oponente.mazo.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [oponente.mazo[i], oponente.mazo[j]] = [oponente.mazo[j], oponente.mazo[i]];
                }
                ctx.log(`${ctx.spec.nombre}: devolviste una carta de Goku al mazo rival y lo mezclaste.`);
            } else {
                ctx.log(`${ctx.spec.nombre}: el rival no tenía cartas de Goku en mano.`);
            }
        },

        // "NO LO PUEDO CREER" (#628): busca hasta 2 cartas de A-18 en tu mazo.
        BUSCAR_A18_EN_MAZO: (estado, ctx) => {
            const propio = estado[ctx.jugadorId];
            const specOf = ctx.engine.specOf;
            let encontradas = 0;
            const nuevaMazo = [];
            for (const num of propio.mazo) {
                const s = specOf(num);
                if (encontradas < 2 && s && s.nombre && s.nombre.toUpperCase().includes('A-18')) {
                    propio.mano.push(num);
                    encontradas++;
                } else {
                    nuevaMazo.push(num);
                }
            }
            propio.mazo = nuevaMazo;
            ctx.log(`${ctx.spec.nombre}: buscaste ${encontradas} carta(s) de A-18 en tu mazo.`);
        },

        // "PIDE UN DESEO" (#630): por cada esfera extra bajada devolvés 1
        // carta del cementerio a tu mano. La UI maneja cuántas esferas se
        // bajan; el motor recupera 1 carta por defecto (simplificado).
        PIDE_UN_DESEO: (estado, ctx) => {
            const propio = estado[ctx.jugadorId];
            if (propio.descarte.length > 0) {
                propio.mano.push(propio.descarte.pop());
                ctx.log(`${ctx.spec.nombre}: recuperaste 1 carta del cementerio. Bajá más esferas para recuperar más.`);
            } else {
                ctx.log(`${ctx.spec.nombre}: el cementerio está vacío.`);
            }
        },

        // "HORA DE DESAYUNO" (#632, permanente): recupera 50 pts por cada
        // carta descartada (máx 1 descarte activable por turno).
        // Por simplicidad, recupera 50 fijo al inicio de cada turno propio.
        HORA_DESAYUNO_TURNO: (estado, ctx) => {
            ctx.curar(50);
            ctx.log(`HORA DE DESAYUNO: recuperaste 50 pts.`);
        },

        // "INTIMIDACION" (#652, permanente): el rival no puede bajar
        // permanentes mientras esta carta esté en mesa.
        INTIMIDACION_TURNO: (estado, ctx) => {
            const rivalId = ctx.jugadorId === 'j1' ? 'j2' : 'j1';
            estado[rivalId].condiciones.bloqueadoPermanentes = true;
            ctx.log(`INTIMIDACION: el rival no puede bajar permanentes este turno.`);
        },

        // "FURIA DIVINA" (#654): ver mano rival y descartar 1 carta de
        // ataque/defensa. Simplificado: descarta la primera carta de Ataque
        // de la mano rival.
        FURIA_DIVINA: (estado, ctx) => {
            ctx.mostrarManoRival = true;
            const oponente = estado[ctx.oponenteId];
            const specOf = ctx.engine.specOf;
            const idx = oponente.mano.findIndex(n => specOf(n)?.tipo === TIPOS.ATAQUE);
            if (idx >= 0) {
                const [num] = oponente.mano.splice(idx, 1);
                oponente.descarte.push(num);
                ctx.log(`${ctx.spec.nombre}: viste la mano rival y descartaste una carta de ataque suya.`);
            } else {
                ctx.log(`${ctx.spec.nombre}: el rival no tenía cartas de ataque en mano.`);
            }
        },

        // "APERITIVO A LO GOKU" (#658): recupera 100 + 50 por cada esfera
        // extra bajada. Aquí implementamos el base de 100 (sin esferas extra).
        APERITIVO_GOKU: (estado, ctx) => {
            ctx.curar(100);
            ctx.log(`${ctx.spec.nombre}: recuperaste 100 pts. Bajá esferas extra para recuperar +50 c/u (usá hackCrearMazoDePrueba en UI).`);
        },

        // "ESO ES DEMASIADO" (#673, permanente): si alguien realiza un ataque
        // de más de 200 pts, debe descartar 2 cartas. Se chequea en resolverAtaques
        // consultando si hay permanente activo.
        ESO_ES_DEMASIADO_TURNO: (estado, ctx) => {
            estado._esoEsDemasiadoActivo = ctx.jugadorId;
            ctx.log(`ESO ES DEMASIADO: activo. Ataques de más de 200 pts forzarán descartar 2 cartas.`);
        },

        // "VICTORIA" (#678): si el rival no te daña en su turno, recuperás
        // 100 pts. No podés atacar este turno.
        VICTORIA: (estado, ctx) => {
            estado[ctx.jugadorId]._victoriaActiva = true;
            estado.ataquesBloqueadosEsteTurno = true;
            ctx.log(`${ctx.spec.nombre}: no podés atacar. Si el rival no te daña, recuperarás 100 pts al inicio de tu turno.`);
        },

        // "LAS REGLAS DICEN" (#679, instantánea): todas las cartas bajadas
        // este turno vuelven al mazo del jugador que las bajó y no se
        // computan daños. Cancela el turno completo de ataques.
        LAS_REGLAS_DICEN: (estado, ctx) => {
            const atacanteId = estado.turnoJugador === 1 ? 'j1' : 'j2';
            const atacante = estado[atacanteId];
            // Devolver todos los ataques en mesa al mazo del atacante
            atacante.campoAtaque.forEach(e => {
                atacante.mazo.push(e.ataqueNum);
                if (e.esferaNum) atacante.mazo.push(e.esferaNum);
                (e.modificadores || []).forEach(m => {
                    atacante.mazo.push(m.num);
                    if (m.esferaNum) atacante.mazo.push(m.esferaNum);
                });
            });
            atacante.campoAtaque = [];
            // Devolver defensa al mazo del defensor
            const defensorId = atacanteId === 'j1' ? 'j2' : 'j1';
            const defensor = estado[defensorId];
            if (defensor.campoDefensa) {
                defensor.mazo.push(defensor.campoDefensa.defensaNum);
                if (defensor.campoDefensa.esferaNum) defensor.mazo.push(defensor.campoDefensa.esferaNum);
                defensor.campoDefensa = null;
            }
            estado.bloqueoAtaquePendiente = false;
            estado.anulacionPendiente = null;
            ctx.log(`${ctx.spec.nombre}: todas las cartas del turno vuelven al mazo. No se computan daños.`);
        },

        // ============================================================
        // EFECTOS DEL BATCH 39-86 + 159
        // ============================================================

        // RECUPERAR_25: añade 25 pts (BESO DE DRAGON #71)
        RECUPERAR_25: (estado, ctx) => { ctx.curar(25); },

        // MODIFICAR_OBJETIVO_20_40: +20 ATK / +40 DEF (MUSCULOS DE ACERO #74)
        MODIFICAR_OBJETIVO_20_40: (estado, ctx) => {
            const aplicado = ctx.modificarObjetivo(20, 40, false);
            ctx.log(aplicado ? `${ctx.spec.nombre}: +20/+40 aplicado al ataque elegido.`
                             : `${ctx.spec.nombre}: elegí un ataque en mesa.`);
        },

        // MODIFICAR_OBJETIVO_80_0: +80 ATK / +0 DEF (INDESTRUCTIBLE #67)
        MODIFICAR_OBJETIVO_80_0: (estado, ctx) => {
            const aplicado = ctx.modificarObjetivo(80, 0, false);
            ctx.log(aplicado ? `${ctx.spec.nombre}: +80/+0 aplicado al ataque elegido.`
                             : `${ctx.spec.nombre}: elegí un ataque en mesa.`);
        },

        // KNOCK_OUT (#48): descarta hasta 6 y roba la misma cantidad.
        // No puede atacar este turno (ataquesBloqueadosEsteTurno).
        KNOCK_OUT: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            const nDesc = Math.min(6, j.mano.length);
            for (let i = 0; i < nDesc; i++) j.descarte.push(j.mano.shift());
            const nRoba = Math.min(nDesc, j.mazo.length);
            for (let i = 0; i < nRoba; i++) j.mano.push(j.mazo.pop());
            estado.ataquesBloqueadosEsteTurno = true;
            ctx.log(`${ctx.spec.nombre}: descartaste ${nDesc} y robaste ${nRoba}. No podés atacar este turno.`);
        },

        // COMPARTIR_ESFERA_GRATIS (#50): el próximo ataque que bajes este
        // turno no necesita esfera. Se marca en el estado del jugador.
        COMPARTIR_ESFERA_GRATIS: (estado, ctx) => {
            estado[ctx.jugadorId]._proximoAtaqueSinEsfera = true;
            ctx.log(`${ctx.spec.nombre}: tu próximo ataque de este turno no necesita esfera.`);
        },

        // LA_GRAN_IDEA_DE_BUU (#58): rival descarta toda su mano y roba 3.
        LA_GRAN_IDEA_DE_BUU: (estado, ctx) => {
            const rival = estado[ctx.oponenteId];
            const nDesc = rival.mano.length;
            rival.descarte.push(...rival.mano);
            rival.mano = [];
            const nRoba = Math.min(3, rival.mazo.length);
            for (let i = 0; i < nRoba; i++) rival.mano.push(rival.mazo.pop());
            ctx.log(`${ctx.spec.nombre}: rival descartó ${nDesc} cartas y robó ${nRoba}.`);
        },

        // MIRADA_MAESTRA (#75): ves las 10 primeras cartas de tu mazo y
        // las reordenás a gusto. El motor las mezcla aleatoriamente por
        // defecto (no hay interacción drag&drop todavía); se logea como
        // efecto informativo hasta que la UI soporte el reordenamiento.
        MIRADA_MAESTRA: (estado, ctx) => {
            ctx.log(`${ctx.spec.nombre}: miraste las 10 cartas de tu mazo. Reordenalas a gusto (por ahora sin UI de arrastre).`);
        }
    };

    // ----------------------------------------------------------------------
    // CONSTRUCCIÓN DE ESTADO
    // ----------------------------------------------------------------------
    function crearJugador(mazoNumeros, energiaInicial) {
        const mazo = [...mazoNumeros];
        shuffle(mazo);
        return {
            energia: energiaInicial,
            energiaMax: energiaInicial,
            mazo,
            mano: [],
            descarte: [],
            campoAtaque: [],
            campoDefensa: null,
            permanentes: [],
            bonusTurno: {
                rivalNoPuedeDefenderse: false,
                rivalDefensaMitad: false,
                defensaPerforadoraPropia: false,
                // Nuevas mecánicas:
                caraACara: false,            // bloquea modificadoras/inst/permanentes este turno
                rivalNoPuedeAtacarProximoTurno: false, // QUITA AIRE / SORPRESA TOTAL
            },
            // Condiciones persistentes (entre turnos, no se limpian en bonusTurno):
            condiciones: {
                dolorDePanza: false,
                limiteMano: 7,
                defendioDobleAtaque: false,
                bloqueadoPermanentes: false, // INTIMIDACION
            },
            cartasJugadasEsteTurno: []
        };
    }

    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function crearEstadoPartida(mazoJ1, mazoJ2, energiaInicial, pool) {
        const estado = {
            pool,
            poolPorNumero: new Map(pool.map(c => [c.numero, c])),
            j1: crearJugador(mazoJ1, energiaInicial),
            j2: crearJugador(mazoJ2, energiaInicial),
            turnoJugador: 1,
            faseTurno: "inicio", // inicio -> robo -> accion -> fin
            historial: [],
            ganador: null,
            bajoCartaEsteTurno: false,
            esperandoDefensa: false,
            ataquePendiente: null // {atacanteId, ataqueNum, esferaNum, modificadores, totalAtk}
        };
        // Mano inicial: 7 cartas cada uno
        [estado.j1, estado.j2].forEach(j => {
            for (let i = 0; i < 7 && j.mazo.length; i++) j.mano.push(j.mazo.pop());
        });
        return estado;
    }

    function specOfFactory(estado) {
        return (numero) => estado.poolPorNumero.get(numero) || null;
    }

    function log(estado, msg) {
        estado.historial.push(msg);
        if (estado.historial.length > 200) estado.historial.shift();
    }

    // ----------------------------------------------------------------------
    // HELPERS DE VALIDACIÓN
    // ----------------------------------------------------------------------
    function idJugador(estado, n) { return n === 1 ? "j1" : "j2"; }
    function idRival(n) { return n === 1 ? "j2" : "j1"; }

    function jugadorActivo(estado) { return estado[idJugador(estado, estado.turnoJugador)]; }
    function jugadorRival(estado) { return estado[idRival(estado.turnoJugador)]; }

    // ¿Esta carta (no-esfera) ya se jugó este turno? El manual prohíbe
    // repetir una misma carta de mazo 2+ veces en el mismo turno; las
    // esferas están exceptuadas.
    function puedeJugarseEsteTurno(jugador, numero, spec) {
        if (spec.tipo === TIPOS.ESFERA) return true;
        return !jugador.cartasJugadasEsteTurno.includes(numero);
    }

    function tieneEsferaDisponibleEnMano(jugador, esferaNumNecesario, poolPorNumero, excluir = []) {
        // Cualquier carta de tipo Esfera sirve como "esfera necesaria N" si
        // su número de esfera natural coincide. En este juego cada esfera
        // física (1 a 7 estrellas) es una carta distinta y se identifica
        // por su orden dentro de las cartas tipo Esfera del pool.
        // Para mantenerlo simple y fiel al manual: usamos el campo
        // "esferaNecesaria" de la carta de ataque para indicar qué ESFERA
        // (1-7) se requiere, y buscamos en mano una carta Esfera cuyo
        // "número de esfera" (posición entre las cartas Esfera) coincida.
        const idx = jugador.mano.findIndex((num, i) => {
            if (excluir.includes(i)) return false;
            const s = poolPorNumero.get(num);
            return s && s.tipo === TIPOS.ESFERA && esferaValor(s, poolPorNumero) === esferaNumNecesario;
        });
        return idx;
    }

    // Determina qué "valor de esfera" (1-7) representa una carta Esfera.
    // Convención: el nombre contiene el número ("ESFERA DEL DRAGON 3") o,
    // si no, se infiere por orden de aparición entre las cartas Esfera del
    // pool (fallback robusto para datasets futuros).
    const _esferaValorCache = new Map();
    function esferaValor(spec, poolPorNumero) {
        if (_esferaValorCache.has(spec.numero)) return _esferaValorCache.get(spec.numero);
        const match = spec.nombre && spec.nombre.match(/(\d+)\s*$/);
        let valor;
        if (match) {
            valor = parseInt(match[1], 10);
        } else {
            // fallback: posición entre cartas Esfera ordenadas por número
            const todasEsferas = [...poolPorNumero.values()]
                .filter(c => c.tipo === TIPOS.ESFERA)
                .sort((a, b) => a.numero - b.numero);
            valor = todasEsferas.findIndex(c => c.numero === spec.numero) + 1;
        }
        _esferaValorCache.set(spec.numero, valor);
        return valor;
    }

    // ----------------------------------------------------------------------
    // ACCIONES PRINCIPALES
    // ----------------------------------------------------------------------

    function faseRobo(estado) {
        const jugadorId = idJugador(estado, estado.turnoJugador);
        const j = jugadorActivo(estado);
        const rival = jugadorRival(estado);

        // QUITA AIRE / SORPRESA TOTAL
        if (rival.bonusTurno.rivalNoPuedeAtacarProximoTurno) {
            estado.ataquesBloqueadosEsteTurno = true;
            rival.bonusTurno.rivalNoPuedeAtacarProximoTurno = false;
            log(estado, `Jugador ${estado.turnoJugador} no puede realizar ataques este turno.`);
        } else {
            estado.ataquesBloqueadosEsteTurno = false;
        }

        // VICTORIA (#678): al inicio de mi turno, si el rival no me dañó
        // en su turno anterior, recupero 100 pts.
        if (j._victoriaActiva) {
            j._victoriaActiva = false;
            if (!j._recibioDanioTurnoAnterior) {
                const antes = j.energia;
                j.energia = Math.min(j.energiaMax, j.energia + 100);
                log(estado, `VICTORIA: el rival no te dañó, recuperaste ${j.energia - antes} pts.`);
            }
        }
        j._recibioDanioTurnoAnterior = false;

        // DOLOR DE PANZA: cuando vuelve a ser mi turno, chequeo si el rival
        // se defendió durante su turno. Si no lo hizo, recupero 300 pts.
        if (j._dolorDePanzaActivo) {
            j._dolorDePanzaActivo = false;
            if (!rival._seDefendioTurnoAnterior) {
                const antes = j.energia;
                j.energia = Math.min(j.energiaMax, j.energia + 300);
                log(estado, `DOLOR DE PANZA: el rival no se defendió, jugador ${estado.turnoJugador} recupera ${j.energia - antes} pts.`);
            }
        }
        rival._seDefendioTurnoAnterior = false;

        estado.faseTurno = "accion";
        estado.bajoCartaEsteTurno = false;
        j.cartasJugadasEsteTurno = [];

        // Resetear limiteMano a 7 y luego procesar permanentes ANTES de
        // robar (así CINTURON DE CAMPEONES sube el límite a 8 y el robo
        // de cartas ya lo respeta en este mismo turno).
        j.condiciones.limiteMano = 7;
        j.condiciones.bloqueadoPermanentes = false; // se reactiva si INTIMIDACION está en mesa
        procesarPermanentes(estado, jugadorId);

        while (j.mano.length < j.condiciones.limiteMano && j.mazo.length > 0) {
            j.mano.push(j.mazo.pop());
        }
        if (j.mazo.length === 0 && j.mano.length < j.condiciones.limiteMano) {
            if (j.descarte.length > 0) {
                j.mazo = shuffle([...j.descarte]);
                j.descarte = [];
                log(estado, `Jugador ${estado.turnoJugador} recicló su pila de descarte (se quedó sin cartas).`);
                while (j.mano.length < j.condiciones.limiteMano && j.mazo.length > 0) j.mano.push(j.mazo.pop());
            }
        }
    }

    // Intentar declarar un ataque: idxAtaqueEnMano + idxEsferaEnMano
    function declararAtaque(estado, idxAtaqueEnMano) {
        const j = jugadorActivo(estado);
        const specOf = specOfFactory(estado);
        const numAtaque = j.mano[idxAtaqueEnMano];
        const spec = specOf(numAtaque);

        if (!spec) return { ok: false, error: "Carta inválida." };
        if (spec.tipo === TIPOS.ESFERA) return { ok: false, error: "Las esferas no se 'atacan', se bajan junto a un ataque." };
        if (spec.tipo === TIPOS.MODIFICADORA) return { ok: false, error: "Usá 'Modificar ataque', no 'Atacar', para esta carta." };
        if (spec.tipo === TIPOS.INSTANTANEA) return { ok: false, error: "Las instantáneas se juegan en el turno rival." };
        if (!puedeJugarseEsteTurno(j, numAtaque, spec)) return { ok: false, error: "Ya jugaste esta carta este turno." };
        if (estado.ataquesBloqueadosEsteTurno) return { ok: false, error: "No podés atacar este turno (efecto de QUITA AIRE / SORPRESA TOTAL)." };

        const esferaReq = spec.esferaNecesaria || 0;
        let idxEsfera = -1;
        if (esferaReq > 0) {
            idxEsfera = tieneEsferaDisponibleEnMano(j, esferaReq, estado.poolPorNumero, [idxAtaqueEnMano]);
            if (idxEsfera < 0) return { ok: false, error: `Necesitás la Esfera N° ${esferaReq} en tu mano para jugar "${spec.nombre}".` };
        }

        // Bajar las cartas (orden importa para no desfasar índices)
        const indices = esferaReq > 0 ? [idxAtaqueEnMano, idxEsfera] : [idxAtaqueEnMano];
        indices.sort((a, b) => b - a);
        let numEsfera = null;
        indices.forEach(i => {
            const num = j.mano[i];
            if (num === numAtaque) { /* lo sacamos también */ }
        });
        // Extraer respetando índices descendentes
        const sacados = {};
        indices.forEach(i => { sacados[i] = j.mano.splice(i, 1)[0]; });
        numEsfera = esferaReq > 0 ? sacados[idxEsfera] : null;

        j.campoAtaque.push({ ataqueNum: numAtaque, esferaNum: numEsfera, modificadores: [] });
        j.cartasJugadasEsteTurno.push(numAtaque);
        estado.bajoCartaEsteTurno = true;
        log(estado, `Jugador ${estado.turnoJugador} bajó "${spec.nombre}" (ATK ${spec.ataque}) lista para atacar.`);

        return { ok: true };
    }

    // Modificar un ataque ya bajado en el campo propio (índice en campoAtaque)
    function modificarAtaque(estado, idxCampoAtaque, idxModificadoraEnMano) {
        const j = jugadorActivo(estado);
        const specOf = specOfFactory(estado);
        const entrada = j.campoAtaque[idxCampoAtaque];
        if (!entrada) return { ok: false, error: "No hay ataque en ese slot." };
        if (estado[idJugador(estado, estado.turnoJugador)].bonusTurno.caraACara ||
            estado[idRival(estado.turnoJugador)].bonusTurno.caraACara) {
            return { ok: false, error: "CARA A CARA: no se pueden usar modificadoras este turno." };
        }

        const numMod = j.mano[idxModificadoraEnMano];
        const spec = specOf(numMod);
        if (!spec || spec.tipo !== TIPOS.MODIFICADORA) return { ok: false, error: "Esa carta no es modificadora." };
        if (!puedeJugarseEsteTurno(j, numMod, spec)) return { ok: false, error: "Ya jugaste esta carta este turno." };

        // REGLA ESPECIAL DE COMBOS (texto de carta, ver REGLA DE ORO del manual):
        // Varias cartas dicen "si bajás esta carta junto a [otra carta
        // nombrada], usá solo una de las esferas para las dos". Esto se
        // modela con dos mecanismos:
        //   - esAndroide: combina con CUALQUIER otra carta también androide.
        //   - comboCon: [números] combina solo con esas cartas puntuales.
        // Si el combo ya está en mesa (como ataque base o como modificador
        // de cualquier ataque propio) este turno, no se pide esfera nueva.
        const comboDestino = (otroSpec) => {
            if (!otroSpec) return false;
            if (spec.esAndroide && otroSpec.esAndroide) return true;
            if (Array.isArray(spec.comboCon) && spec.comboCon.includes(otroSpec.numero)) return true;
            if (Array.isArray(otroSpec.comboCon) && otroSpec.comboCon.includes(spec.numero)) return true;
            return false;
        };
        const yaHayComboBajado = j.campoAtaque.some(e => {
            if (comboDestino(specOf(e.ataqueNum))) return true;
            return (e.modificadores || []).some(m => comboDestino(specOf(m.num)));
        });

        const esferaReq = spec.esferaNecesaria || 0;
        let idxEsfera = -1;
        if (esferaReq > 0 && !yaHayComboBajado) {
            idxEsfera = tieneEsferaDisponibleEnMano(j, esferaReq, estado.poolPorNumero, [idxModificadoraEnMano]);
            if (idxEsfera < 0) return { ok: false, error: `Necesitás la Esfera N° ${esferaReq} para usar "${spec.nombre}".` };
        }

        const indices = (esferaReq > 0 && !yaHayComboBajado) ? [idxModificadoraEnMano, idxEsfera] : [idxModificadoraEnMano];
        indices.sort((a, b) => b - a);
        const sacados = {};
        indices.forEach(i => { sacados[i] = j.mano.splice(i, 1)[0]; });
        const numEsfera = (esferaReq > 0 && !yaHayComboBajado) ? sacados[idxEsfera] : null;

        if (yaHayComboBajado) {
            log(estado, `"${spec.nombre}" comparte esfera con su combo ya bajado este turno.`);
        }

        entrada.modificadores.push({ num: numMod, esferaNum: numEsfera });
        j.cartasJugadasEsteTurno.push(numMod);
        estado.bajoCartaEsteTurno = true;

        // Multiplicador (ej: "MODIFICA X2 X2"): en vez de sumar, se aplica
        // como factor sobre el ATK/DEF acumulado de la entrada hasta ahora.
        // El factor viene de los campos dedicados multAtk/multDef del JSON
        // (NO de ataque/defensa, que siguen siendo el ATK/DEF propio de la
        // carta cuando se la juega como ataque independiente).
        if (spec.multiplicador) {
            const factorAtk = spec.multAtk || 1;
            const factorDef = spec.multDef || 1;
            entrada._multAtk = (entrada._multAtk || 1) * factorAtk;
            entrada._multDef = (entrada._multDef || 1) * factorDef;
            log(estado, `Jugador ${estado.turnoJugador} aplicó multiplicador "${spec.nombre}" (x${factorAtk}/x${factorDef}).`);
        } else {
            log(estado, `Jugador ${estado.turnoJugador} aplicó modificadora "${spec.nombre}" (+${spec.ataque}/+${spec.defensa}).`);
        }

        // Si la modificadora tiene un efectoId especial (más allá de sumar
        // o multiplicar ATK/DEF), se dispara acá. Esto cubre cartas como
        // "MANO ABIERTA" (excepción a la regla de defensa) que están
        // tipadas como Modificadora en la base original.
        if (spec.efectoId && spec.efectoId !== "POR_DEFECTO") {
            const jugadorId = idJugador(estado, estado.turnoJugador);
            const oponenteId = idRival(estado.turnoJugador);
            const ctxMod = {
                jugadorId, oponenteId, spec, engine: { specOf, destruirPermanente },
                log: (m) => log(estado, m)
            };
            const efecto = EFFECTS[spec.efectoId] || EFFECTS.POR_DEFECTO;
            efecto(estado, ctxMod);
        }
        return { ok: true };
    }

    // Calcula ATK/DEF totales de una entrada de campo (ataque + modificadores).
    // Primero se suman los bonus de las modificadoras NO-multiplicadoras al
    // valor base, y luego se aplica el multiplicador acumulado (si hay).
    function totalDeEntrada(estado, entrada) {
        const specOf = specOfFactory(estado);
        const base = specOf(entrada.ataqueNum) || specOf(entrada.defensaNum);
        let atk = base ? base.ataque : 0;
        let def = base ? base.defensa : 0;
        (entrada.modificadores || []).forEach(m => {
            const s = specOf(m.num);
            if (s && !s.multiplicador) { atk += s.ataque; def += s.defensa; }
        });
        atk += entrada._bonusInstantAtk || 0;
        def += entrada._bonusInstantDef || 0;
        if (entrada._multAtk) atk = Math.round(atk * entrada._multAtk);
        if (entrada._multDef) def = Math.round(def * entrada._multDef);
        return { atk: Math.max(0, atk), def: Math.max(0, def) };
    }

    // Resolver: el jugador activo decide enviar TODOS sus ataques bajados a
    // resolución contra el rival. Por cada ataque, el rival (si tiene una
    // defensa preparada en estado.j_/campoDefensa) absorbe daño; si no, se
    // descuenta todo a su energía.
    function resolverAtaques(estado) {
        const atacanteId = idJugador(estado, estado.turnoJugador);
        const defensorId = idRival(estado.turnoJugador);
        const atacante = estado[atacanteId];
        const defensor = estado[defensorId];
        const specOf = specOfFactory(estado);

        if (atacante.campoAtaque.length === 0) {
            return { ok: false, error: "No bajaste ningún ataque todavía." };
        }

        // MULTIPLICACION (#572): si el defensor tiene esta carta activa y
        // hay una defensa preparada, suma el ATK de TODOS los ataques del
        // rival y los enfrenta de una vez contra la DEF de la defensa.
        // El sobrante de DEF no daña al atacante (regla general); el
        // sobrante de ATK sí daña al defensor (como siempre).
        if (defensor._multiplicacionActiva && defensor.campoDefensa && atacante.campoAtaque.length > 1) {
            defensor._multiplicacionActiva = false;
            const atkTotal = atacante.campoAtaque.reduce((sum, e) => sum + totalDeEntrada(estado, e).atk, 0);
            const { def } = totalDeEntrada(estado, { ...defensor.campoDefensa, ataqueNum: defensor.campoDefensa.defensaNum });
            const danio = Math.max(0, atkTotal - def);
            log(estado, `MULTIPLICACION: ATK total ${atkTotal} vs DEF ${def} → daño combinado ${danio}.`);
            if (danio > 0) defensor.energia = Math.max(0, defensor.energia - danio);
            // Descartar todo al cementerio
            atacante.campoAtaque.forEach(e => {
                atacante.descarte.push(e.ataqueNum);
                if (e.esferaNum) atacante.descarte.push(e.esferaNum);
                (e.modificadores || []).forEach(m => { atacante.descarte.push(m.num); if (m.esferaNum) atacante.descarte.push(m.esferaNum); });
            });
            atacante.campoAtaque = [];
            defensor.descarte.push(defensor.campoDefensa.defensaNum);
            if (defensor.campoDefensa.esferaNum) defensor.descarte.push(defensor.campoDefensa.esferaNum);
            (defensor.campoDefensa.modificadores || []).forEach(m => { defensor.descarte.push(m.num); if (m.esferaNum) defensor.descarte.push(m.esferaNum); });
            defensor.campoDefensa = null;
            atacante.bonusTurno = { rivalNoPuedeDefenderse: false, rivalDefensaMitad: false, defensaPerforadoraPropia: false, caraACara: false, rivalNoPuedeAtacarProximoTurno: false };
            revisarFinDePartida(estado);
            return { ok: true };
        }
        if (defensor._multiplicacionActiva) defensor._multiplicacionActiva = false; // consumir si solo hay 1 ataque

        atacante.campoAtaque.forEach(entrada => {
            const { atk } = totalDeEntrada(estado, entrada);
            const specAtaque = specOf(entrada.ataqueNum);

            const ctx = {
                jugadorId: atacanteId, oponenteId: defensorId,
                spec: specAtaque, engine: { specOf, destruirPermanente },
                log: (m) => log(estado, m),
                anularDanioYRedirigir: false,
                ataqueBloqueado: false,
                anularSiAtaqueMenorA: 0,
                curar: (n) => {
                    const jug = estado[atacanteId];
                    const antes = jug.energia;
                    jug.energia = Math.min(jug.energiaMax, jug.energia + n);
                    log(estado, `${jug === estado.j1 ? 'Jugador 1' : 'Jugador 2'} recupera ${jug.energia - antes} pts de energía.`);
                }
            };
            const efecto = EFFECTS[specAtaque?.efectoId] || EFFECTS.POR_DEFECTO;
            efecto(estado, ctx);

            let danio = atk;
            let fueBloqueado = false;

            // Anulación de ataque por umbral, declarada por una instantánea
            // jugada en respuesta. HUMILLANDO lo cancela si está activo.
            if (estado.anulacionPendiente) {
                if (estado._ataqueNoBloqueableActivo) {
                    log(estado, `¡${specAtaque?.nombre} tiene HUMILLANDO activo: la anulación no tiene efecto!`);
                    estado.anulacionPendiente = null;
                } else {
                    const { umbral, incluyeIgual } = estado.anulacionPendiente;
                    const cumple = incluyeIgual ? atk <= umbral : atk < umbral;
                    if (cumple) {
                        danio = 0;
                        fueBloqueado = true;
                        log(estado, `¡El ataque de "${specAtaque?.nombre}" (${atk} pts) fue anulado!`);
                    }
                    estado.anulacionPendiente = null;
                }
            }

            if (!fueBloqueado && ctx.anularSiAtaqueMenorA > 0 && atk <= ctx.anularSiAtaqueMenorA && !estado._ataqueNoBloqueableActivo) {
                danio = 0;
                fueBloqueado = true;
                log(estado, `¡El ataque de "${specAtaque?.nombre}" (${atk} pts) fue anulado!`);
            }

            // DEBILIDAD: si el atacante marcó su propia entrada como debilitada,
            // la DEF de ese ataque se reduce a la mitad antes de calcular el daño.
            if (entrada._debilidadActiva) {
                delete entrada._debilidadActiva;
                const { def: defAtk } = totalDeEntrada(estado, entrada);
                entrada._bonusInstantDef = (entrada._bonusInstantDef || 0) - Math.floor(defAtk / 2);
                log(estado, `DEBILIDAD: la DEF del ataque se redujo a la mitad.`);
            }

            if (!fueBloqueado && defensor.campoDefensa && !atacante.bonusTurno.rivalNoPuedeDefenderse) {
                let { def } = totalDeEntrada(estado, { ...defensor.campoDefensa, ataqueNum: defensor.campoDefensa.defensaNum });
                if (atacante.bonusTurno.rivalDefensaMitad) {
                    def = Math.floor(def / 2);
                    log(estado, `Las defensas del rival están reducidas a la mitad este turno.`);
                }
                danio = Math.max(0, atk - def);
                log(estado, `Defensa rival absorbe ${Math.min(atk, def)} pts.`);

                if (def > atk && defensor.bonusTurno.defensaPerforadoraPropia) {
                    const sobrante = def - atk;
                    atacante.energia = Math.max(0, atacante.energia - sobrante);
                    log(estado, `¡"Mano Abierta": el atacante pierde ${sobrante} pts!`);
                    defensor.bonusTurno.defensaPerforadoraPropia = false;
                }
            } else if (!fueBloqueado && defensor.campoDefensa && atacante.bonusTurno.rivalNoPuedeDefenderse) {
                log(estado, `El rival no puede defenderse este turno.`);
            }

            if (estado.bloqueoAtaquePendiente && !estado._ataqueNoBloqueableActivo) {
                danio = 0;
                fueBloqueado = true;
                estado.bloqueoAtaquePendiente = false;
                log(estado, `¡El ataque de "${specAtaque?.nombre}" fue bloqueado!`);
            } else if (estado.bloqueoAtaquePendiente && estado._ataqueNoBloqueableActivo) {
                log(estado, `¡${specAtaque?.nombre} tiene HUMILLANDO: el bloqueo no tiene efecto!`);
                estado.bloqueoAtaquePendiente = false;
            } else if (ctx.anularDanioYRedirigir) {
                atacante.energia = Math.max(0, atacante.energia - atk);
                log(estado, `¡El ataque de ${specAtaque?.nombre} se redirige y daña a su propio jugador en ${atk} pts!`);
                danio = 0;
            }

            estado._ataqueNoBloqueableActivo = false; // consumir por ataque

            // ESO ES DEMASIADO (#673, permanente): si el ataque supera 200
            // pts, el atacante debe descartar 2 cartas.
            if (estado._esoEsDemasiadoActivo && atk > 200) {
                const nDesc = Math.min(2, atacante.mano.length);
                for (let i = 0; i < nDesc; i++) atacante.descarte.push(atacante.mano.shift());
                log(estado, `ESO ES DEMASIADO: ataque de ${atk} pts, atacante descartó ${nDesc} cartas.`);
            }

            if (danio > 0) {
                defensor.energia = Math.max(0, defensor.energia - danio);
                defensor._recibioDanioTurnoAnterior = true;
                log(estado, `${specAtaque?.nombre || 'Ataque'} inflige ${danio} pts de daño.`);
            } else if (!ctx.anularDanioYRedirigir && !fueBloqueado) {
                log(estado, `${specAtaque?.nombre || 'Ataque'} fue absorbido por completo.`);
            }
        });

        // Los bonus de turno del atacante se limpian tras resolver (sólo
        // valen "durante este turno", según el texto de cada carta).
        atacante.bonusTurno = {
            rivalNoPuedeDefenderse: false,
            rivalDefensaMitad: false,
            defensaPerforadoraPropia: false,
            caraACara: false,
            rivalNoPuedeAtacarProximoTurno: false,
        };

        // Las cartas usadas van al cementerio (descarte) de cada uno
        atacante.campoAtaque.forEach(e => {
            atacante.descarte.push(e.ataqueNum);
            if (e.esferaNum) atacante.descarte.push(e.esferaNum);
            (e.modificadores || []).forEach(m => {
                atacante.descarte.push(m.num);
                if (m.esferaNum) atacante.descarte.push(m.esferaNum);
            });
        });
        atacante.campoAtaque = [];

        if (defensor.campoDefensa) {
            defensor.descarte.push(defensor.campoDefensa.defensaNum);
            if (defensor.campoDefensa.esferaNum) defensor.descarte.push(defensor.campoDefensa.esferaNum);
            (defensor.campoDefensa.modificadores || []).forEach(m => {
                defensor.descarte.push(m.num);
                if (m.esferaNum) defensor.descarte.push(m.esferaNum);
            });
            defensor.campoDefensa = null;
        }

        revisarFinDePartida(estado);
        return { ok: true };
    }

    // El jugador NO activo prepara una carta de ataque propia como defensa
    // (se usa su valor DEF). Requiere esfera igual que un ataque normal.
    function declararDefensa(estado, jugadorDefId, idxCartaEnMano) {
        const j = estado[jugadorDefId];
        const specOf = specOfFactory(estado);
        const num = j.mano[idxCartaEnMano];
        const spec = specOf(num);

        if (!spec) return { ok: false, error: "Carta inválida." };
        if (spec.tipo !== TIPOS.ATAQUE) return { ok: false, error: "Solo podés defenderte con cartas de Ataque." };
        if (j.campoDefensa) return { ok: false, error: "Ya tenés una defensa preparada." };

        const esferaReq = spec.esferaNecesaria || 0;
        let idxEsfera = -1;
        if (esferaReq > 0) {
            idxEsfera = tieneEsferaDisponibleEnMano(j, esferaReq, estado.poolPorNumero, [idxCartaEnMano]);
            if (idxEsfera < 0) return { ok: false, error: `Necesitás la Esfera N° ${esferaReq} para defenderte con "${spec.nombre}".` };
        }

        const indices = esferaReq > 0 ? [idxCartaEnMano, idxEsfera] : [idxCartaEnMano];
        indices.sort((a, b) => b - a);
        const sacados = {};
        indices.forEach(i => { sacados[i] = j.mano.splice(i, 1)[0]; });
        const numEsfera = esferaReq > 0 ? sacados[idxEsfera] : null;

        j.campoDefensa = { defensaNum: num, esferaNum: numEsfera, modificadores: [] };
        j._seDefendioTurnoAnterior = true;
        log(estado, `Jugador defensor preparó "${spec.nombre}" (DEF ${spec.defensa}).`);
        return { ok: true };
    }

    // Aplica una carta Modificadora a la DEFENSA ya preparada de un jugador
    // (en vez de a un ataque en campoAtaque). Misma lógica de combos,
    // multiplicadores y esferas que modificarAtaque, pero apuntando a
    // campoDefensa. Necesario para cartas como "MANO ABIERTA" que se usan
    // típicamente defendiendo.
    function modificarDefensa(estado, jugadorDefId, idxModificadoraEnMano) {
        const j = estado[jugadorDefId];
        const specOf = specOfFactory(estado);
        if (!j.campoDefensa) return { ok: false, error: "No tenés una defensa preparada todavía." };

        const numMod = j.mano[idxModificadoraEnMano];
        const spec = specOf(numMod);
        if (!spec || spec.tipo !== TIPOS.MODIFICADORA) return { ok: false, error: "Esa carta no es modificadora." };

        const comboDestino = (otroSpec) => {
            if (!otroSpec) return false;
            if (spec.esAndroide && otroSpec.esAndroide) return true;
            if (Array.isArray(spec.comboCon) && spec.comboCon.includes(otroSpec.numero)) return true;
            if (Array.isArray(otroSpec.comboCon) && otroSpec.comboCon.includes(spec.numero)) return true;
            return false;
        };
        const yaHayComboBajado = comboDestino(specOf(j.campoDefensa.defensaNum)) ||
            (j.campoDefensa.modificadores || []).some(m => comboDestino(specOf(m.num)));

        const esferaReq = spec.esferaNecesaria || 0;
        let idxEsfera = -1;
        if (esferaReq > 0 && !yaHayComboBajado) {
            idxEsfera = tieneEsferaDisponibleEnMano(j, esferaReq, estado.poolPorNumero, [idxModificadoraEnMano]);
            if (idxEsfera < 0) return { ok: false, error: `Necesitás la Esfera N° ${esferaReq} para usar "${spec.nombre}".` };
        }

        const indices = (esferaReq > 0 && !yaHayComboBajado) ? [idxModificadoraEnMano, idxEsfera] : [idxModificadoraEnMano];
        indices.sort((a, b) => b - a);
        const sacados = {};
        indices.forEach(i => { sacados[i] = j.mano.splice(i, 1)[0]; });
        const numEsfera = (esferaReq > 0 && !yaHayComboBajado) ? sacados[idxEsfera] : null;

        j.campoDefensa.modificadores.push({ num: numMod, esferaNum: numEsfera });

        if (spec.multiplicador) {
            const factorAtk = spec.multAtk || 1;
            const factorDef = spec.multDef || 1;
            j.campoDefensa._multAtk = (j.campoDefensa._multAtk || 1) * factorAtk;
            j.campoDefensa._multDef = (j.campoDefensa._multDef || 1) * factorDef;
            log(estado, `Defensor aplicó multiplicador "${spec.nombre}" (x${factorAtk}/x${factorDef}) a su defensa.`);
        } else {
            log(estado, `Defensor aplicó modificadora "${spec.nombre}" (+${spec.ataque}/+${spec.defensa}) a su defensa.`);
        }

        if (spec.efectoId && spec.efectoId !== "POR_DEFECTO") {
            const oponenteId = idRival(jugadorDefId === "j1" ? 1 : 2);
            const ctxMod = {
                jugadorId: jugadorDefId, oponenteId, spec, engine: { specOf, destruirPermanente },
                log: (m) => log(estado, m)
            };
            const efecto = EFFECTS[spec.efectoId] || EFFECTS.POR_DEFECTO;
            efecto(estado, ctxMod);
        }
        return { ok: true };
    }

    // Ataque especial: bajar las 7 esferas del dragón juntas (100 dmg directo)
    function ataqueEsferasDelDragon(estado) {
        const j = jugadorActivo(estado);
        const specOf = specOfFactory(estado);
        const esferasEnMano = [];
        for (let v = 1; v <= 7; v++) {
            const idx = j.mano.findIndex((num, i) => {
                const s = specOf(num);
                return s && s.tipo === TIPOS.ESFERA && esferaValor(s, estado.poolPorNumero) === v && !esferasEnMano.includes(i);
            });
            if (idx < 0) return { ok: false, error: `Te falta la Esfera N° ${v}.` };
            esferasEnMano.push(idx);
        }
        esferasEnMano.sort((a, b) => b - a);
        const usadas = esferasEnMano.map(i => j.mano.splice(i, 1)[0]);
        const rival = jugadorRival(estado);
        rival.energia = Math.max(0, rival.energia - 100);
        j.descarte.push(...usadas);
        estado.bajoCartaEsteTurno = true;
        log(estado, `¡Jugador ${estado.turnoJugador} reunió las 7 Esferas del Dragón! 100 pts de daño directo.`);
        revisarFinDePartida(estado);
        return { ok: true };
    }

    // Jugar una instantánea. jugadorId = quién la juega (puede ser el propio
    // turno o el del rival, según el texto de la carta). objetivoAtaque, si
    // se pasa, es { jugadorId: 'j1'|'j2', idxCampoAtaque } y permite que el
    // efecto modifique ATK/DEF de un ataque ya bajado en mesa (propio o
    // rival), como piden cartas tipo "SUPER ATAQUE: modifica +0+40".
    function jugarInstantanea(estado, jugadorId, idxEnMano, objetivoAtaque = null) {
        const j = estado[jugadorId];
        const specOf = specOfFactory(estado);
        const num = j.mano[idxEnMano];
        const spec = specOf(num);
        if (!spec || spec.tipo !== TIPOS.INSTANTANEA) return { ok: false, error: "Esa carta no es instantánea." };
        if (estado.j1.bonusTurno.caraACara || estado.j2.bonusTurno.caraACara) {
            return { ok: false, error: "CARA A CARA: no se pueden usar instantáneas este turno." };
        }

        const esferaReq = spec.esferaNecesaria || 0;
        let idxEsfera = -1;
        if (esferaReq > 0) {
            idxEsfera = tieneEsferaDisponibleEnMano(j, esferaReq, estado.poolPorNumero, [idxEnMano]);
            if (idxEsfera < 0) return { ok: false, error: `Necesitás la Esfera N° ${esferaReq} para jugar "${spec.nombre}".` };
        }
        const indices = esferaReq > 0 ? [idxEnMano, idxEsfera] : [idxEnMano];
        indices.sort((a, b) => b - a);
        indices.forEach(i => j.descarte.push(j.mano.splice(i, 1)[0]));

        const oponenteId = idRival(jugadorId === "j1" ? 1 : 2);
        const ctx = {
            jugadorId, oponenteId, spec, engine: { specOf, destruirPermanente },
            log: (m) => log(estado, m),
            // Helper para que el efecto modifique el ataque objetivo, si se
            // indicó uno. Si la carta requiere objetivo y no se pasó, no
            // hace nada (la UI es responsable de pedirlo antes de llamar).
            modificarObjetivo: (deltaAtk, deltaDef, esMultiplicador) => {
                if (!objetivoAtaque) return false;
                const jugObjetivo = estado[objetivoAtaque.jugadorId];
                const entrada = jugObjetivo.campoAtaque[objetivoAtaque.idxCampoAtaque];
                if (!entrada) return false;
                if (esMultiplicador) {
                    entrada._multAtk = (entrada._multAtk || 1) * (deltaAtk || 1);
                    entrada._multDef = (entrada._multDef || 1) * (deltaDef || 1);
                } else {
                    entrada._bonusInstantAtk = (entrada._bonusInstantAtk || 0) + deltaAtk;
                    entrada._bonusInstantDef = (entrada._bonusInstantDef || 0) + deltaDef;
                    // Se aplica directo sumando un "modificador virtual" sin
                    // costo de esfera adicional (la instantánea ya pagó la suya).
                    entrada.modificadores = entrada.modificadores || [];
                }
                return true;
            }
        };
        const efecto = EFFECTS[spec.efectoId] || EFFECTS.POR_DEFECTO;
        efecto(estado, ctx);
        log(estado, `Instantánea "${spec.nombre}" jugada.`);
        return { ok: true, ctx };
    }

    // Jugar una carta ESPECIAL: similar a una instantánea (dispara su efecto
    // vía EFFECTS), pero se juega en el PROPIO turno del jugador activo, no
    // en el del rival, y cuenta como "bajar carta" para la regla de descarte.
    // Si la carta es "permanente", en vez de ir al cementerio queda activa
    // en estado[jugadorId].permanentes hasta que algo la destruya.
    function jugarEspecial(estado, idxEnMano) {
        const j = jugadorActivo(estado);
        const jugadorId = idJugador(estado, estado.turnoJugador);
        const specOf = specOfFactory(estado);
        const num = j.mano[idxEnMano];
        const spec = specOf(num);
        if (!spec || spec.tipo !== TIPOS.ESPECIAL) return { ok: false, error: "Esa carta no es de tipo Especial." };
        if (!puedeJugarseEsteTurno(j, num, spec)) return { ok: false, error: "Ya jugaste esta carta este turno." };
        // INTIMIDACION (#652): el rival bloqueó permanentes este turno
        if (spec.permanente && jugadorActivo(estado).condiciones.bloqueadoPermanentes) {
            return { ok: false, error: "INTIMIDACION: tu rival tiene una carta permanente que te impide bajar permanentes este turno." };
        }

        const esferaReq = spec.esferaNecesaria || 0;
        let idxEsfera = -1;
        if (esferaReq > 0) {
            idxEsfera = tieneEsferaDisponibleEnMano(j, esferaReq, estado.poolPorNumero, [idxEnMano]);
            if (idxEsfera < 0) return { ok: false, error: `Necesitás la Esfera N° ${esferaReq} para jugar "${spec.nombre}".` };
        }
        const indices = esferaReq > 0 ? [idxEnMano, idxEsfera] : [idxEnMano];
        indices.sort((a, b) => b - a);
        const sacados = {};
        indices.forEach(i => { sacados[i] = j.mano.splice(i, 1)[0]; });
        const numEsfera = esferaReq > 0 ? sacados[idxEsfera] : null;

        if (spec.permanente) {
            j.permanentes.push({ num });
            if (numEsfera) j.descarte.push(numEsfera); // la esfera se gasta igual, la carta queda en mesa
            log(estado, `"${spec.nombre}" queda en mesa como carta permanente.`);
        } else {
            j.descarte.push(num);
            if (numEsfera) j.descarte.push(numEsfera);
        }
        j.cartasJugadasEsteTurno.push(num);
        estado.bajoCartaEsteTurno = true;

        const oponenteId = idRival(estado.turnoJugador);
        const ctx = {
            jugadorId, oponenteId, spec, engine: { specOf, destruirPermanente },
            log: (m) => log(estado, m),
            curar: (n) => {
                const antes = j.energia;
                j.energia = Math.min(j.energiaMax, j.energia + n);
                log(estado, `Jugador ${estado.turnoJugador} recupera ${j.energia - antes} pts de energía.`);
            },
            activarBonusTurno: (clave) => {
                j.bonusTurno[clave] = true;
            }
        };
        const efecto = EFFECTS[spec.efectoId] || EFFECTS.POR_DEFECTO;
        efecto(estado, ctx);
        log(estado, `Carta especial "${spec.nombre}" jugada.`);
        return { ok: true, ctx };
    }

    // Aplica el efecto de todas las cartas permanentes activas de un
    // jugador al INICIO de su propio turno (ej: recuperar energía cada
    // turno hasta llenar el contador). Se llama desde faseRobo.
    function procesarPermanentes(estado, jugadorId) {
        const j = estado[jugadorId];
        const specOf = specOfFactory(estado);
        const aRetirar = [];
        j.permanentes.forEach((perm, idx) => {
            const spec = specOf(perm.num);
            if (!spec) return;
            const efecto = EFFECTS[spec.efectoTurnoId];
            if (efecto) {
                const ctx = {
                    jugadorId, spec, engine: { specOf, destruirPermanente },
                    log: (m) => log(estado, m),
                    curar: (n) => {
                        const antes = j.energia;
                        j.energia = Math.min(j.energiaMax, j.energia + n);
                        if (j.energia > antes) log(estado, `"${spec.nombre}" (permanente) recupera ${j.energia - antes} pts.`);
                    },
                    retirarPermanente: () => aRetirar.push(idx)
                };
                efecto(estado, ctx);
            }
        });
        // Retirar de atrás hacia adelante para no desfasar índices
        aRetirar.sort((a, b) => b - a).forEach(idx => {
            const [perm] = j.permanentes.splice(idx, 1);
            j.descarte.push(perm.num);
        });
    }

    // Destruye la primera carta permanente del jugador indicado (para
    // efectos tipo "EXPLORADORES: destruye una carta permanente").
    function destruirPermanente(estado, jugadorId) {
        const j = estado[jugadorId];
        if (j.permanentes.length === 0) return null;
        const [perm] = j.permanentes.splice(0, 1);
        j.descarte.push(perm.num);
        return perm.num;
    }

    function descartarHasta5(estado) {
        const j = jugadorActivo(estado);
        while (j.mano.length > 5) {
            j.descarte.push(j.mano.shift());
        }
    }

    function pasarTurno(estado) {
        const jugadorId = idJugador(estado, estado.turnoJugador);
        const j = estado[jugadorId];

        // REMEDIO DE SATAN: si el jugador no atacó este turno y tenía el
        // efecto activo (bajó la carta pero no atacó), recupera 100 pts.
        if (j._remedioSatan) {
            j._remedioSatan = false;
            if (!estado.bajoCartaEsteTurno || j.campoAtaque.length === 0) {
                const antes = j.energia;
                j.energia = Math.min(j.energiaMax, j.energia + 100);
                log(estado, `EL REMEDIO DE SATAN: recuperaste ${j.energia - antes} pts por no atacar.`);
            }
        }

        if (!estado.bajoCartaEsteTurno) {
            descartarHasta5(estado);
            log(estado, `Jugador ${estado.turnoJugador} no jugó cartas: descartó hasta quedar con 5.`);
        }

        // Limpiar estado temporal del turno
        j._pizzaActiva = false;
        estado.turnoJugador = estado.turnoJugador === 1 ? 2 : 1;
        estado.faseTurno = "robo";
        faseRobo(estado);
        revisarFinDePartida(estado);
    }

    function revisarFinDePartida(estado) {
        if (estado.j1.energia <= 0 && !estado.ganador) estado.ganador = 2;
        if (estado.j2.energia <= 0 && !estado.ganador) estado.ganador = 1;
    }

    function validarMazo(mazoNumeros) {
        if (mazoNumeros.length < 40) {
            return { ok: false, error: `El mazo necesita al menos 40 cartas (tiene ${mazoNumeros.length}).` };
        }
        return { ok: true };
    }

    return {
        TIPOS, EFFECTS,
        crearEstadoPartida, specOfFactory, faseRobo,
        declararAtaque, modificarAtaque, modificarDefensa, resolverAtaques, declararDefensa,
        ataqueEsferasDelDragon, jugarInstantanea, jugarEspecial, pasarTurno, validarMazo,
        totalDeEntrada, esferaValor, idJugador, idRival,
        procesarPermanentes, destruirPermanente
    };
})();

if (typeof module !== "undefined") module.exports = DBZEngine;
