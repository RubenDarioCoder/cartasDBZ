// ==========================================================================
// game-engine.js — Motor de reglas "DBZ Leyenda"
// Versión completa con todos los efectos hasta la Caja 3 (313)
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
    // FUNCIÓN AUXILIAR PARA IDENTIFICAR SAIYAJINS
    // ----------------------------------------------------------------------
    function esSaiyajin(nombre) {
        if (!nombre) return false;
        const upper = nombre.toUpperCase();
        return /GOKU|VEGETA|GOHAN|TRUNKS|GOTEN|GOTENKS|VEGITO|GOGETA|BARDOCK|RADITZ|NAPPA|TARLES/.test(upper);
    }

    // ----------------------------------------------------------------------
    // SISTEMA DE EFECTOS
    // ----------------------------------------------------------------------
    const EFFECTS = {

        // =============================================================
        // EFECTOS BÁSICOS Y REUTILIZABLES
        // =============================================================
        POR_DEFECTO: () => {},


        
        EL_REPOSO_DEL_GUERRERO_TURNO: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            // Verificar si se atacó en este turno (flag de ataque)
            // NOTA: la lógica se ejecuta al final del turno, en cambiarTurnoYRobar,
            // pero como es permanente, se ejecuta al inicio del turno.
            // Vamos a manejarlo con un flag en faseRobo.
            if (!estado.bajoCartaEsteTurno || j.campoAtaque.length === 0) {
                const curacion = 30;
                const antes = j.energia;
                j.energia = Math.min(j.energiaMax, j.energia + curacion);
                if (j.energia > antes) {
                    ctx.log(`EL REPOSO DEL GUERRERO: recuperaste ${j.energia - antes} pts de energía por no atacar.`);
                }
            }
        },

        // 387: FURIA INCONTENIBLE
        DESTRUYE_PERMANENTES_Y_ESFERAS: (estado, ctx) => {
            const j1 = estado.j1;
            const j2 = estado.j2;
            // Destruir permanentes de ambos
            j1.permanentes.forEach(p => j1.descarte.push(p.num));
            j2.permanentes.forEach(p => j2.descarte.push(p.num));
            j1.permanentes = [];
            j2.permanentes = [];
            // Destruir esferas en mano de ambos (opcional, pero dice "incluyendo esferas")
            // En el contexto, "permanentes en juego" no son esferas en mano.
            // Pero el texto dice "incluyendo esferas", las que estén en juego (campo).
            // Las esferas en juego son las que están en campoAtaque como esferaNum.
            // Vamos a descartar las esferas que estén en el campo de ataque.
            j1.campoAtaque.forEach(e => {
                if (e.esferaNum) j1.descarte.push(e.esferaNum);
                (e.modificadores || []).forEach(m => {
                    if (m.esferaNum) j1.descarte.push(m.esferaNum);
                });
            });
            j2.campoAtaque.forEach(e => {
                if (e.esferaNum) j2.descarte.push(e.esferaNum);
                (e.modificadores || []).forEach(m => {
                    if (m.esferaNum) j2.descarte.push(m.esferaNum);
                });
            });
            ctx.log(`"${ctx.spec.nombre}": se destruyeron todas las permanentes y esferas en juego.`);
        },

        // 388: BOMBA DE KI (MIL_CORTES)
        MIL_CORTES: (estado, ctx) => {
            const oponente = estado[ctx.oponenteId];
            const aDescartar = oponente.mazo.splice(-5, 5); // toma las últimas 5 (top del mazo)
            oponente.descarte.push(...aDescartar);
            ctx.log(`"${ctx.spec.nombre}": se descartaron ${aDescartar.length} cartas del mazo rival.`);
        },

        // 389: RETENCION
        RETENCION: (estado, ctx) => {
            estado._retencionActivo = true;
            // Además, el rival no podrá defender en el próximo turno
            estado[ctx.jugadorId].bonusTurno.rivalNoPuedeDefenderse = true;
            ctx.log(`"${ctx.spec.nombre}": los ataques de Freezer se reducen a la mitad y el rival no puede defenderse.`);
        },

        // 390: DIFICIL DECISION
        DIFICIL_DECISION: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            if (j.mazo.length === 0 || j.mano.length < 2) {
                ctx.log(`"${ctx.spec.nombre}": no tienes suficientes cartas en mano o mazo.`);
                return;
            }
            // Elegir una carta del mazo para tomar
            const idxMazo = Math.floor(Math.random() * j.mazo.length);
            const cartaTomada = j.mazo.splice(idxMazo, 1)[0];
            // Elegir dos cartas de la mano para devolver
            const idxMano1 = Math.floor(Math.random() * j.mano.length);
            const cartaDevuelta1 = j.mano.splice(idxMano1, 1)[0];
            const idxMano2 = Math.floor(Math.random() * j.mano.length);
            const cartaDevuelta2 = j.mano.splice(idxMano2, 1)[0];
            j.mano.push(cartaTomada);
            j.mazo.push(cartaDevuelta1, cartaDevuelta2);
            // Mezclar
            for (let i = j.mazo.length - 1; i > 0; i--) {
                const k = Math.floor(Math.random() * (i + 1));
                [j.mazo[i], j.mazo[k]] = [j.mazo[k], j.mazo[i]];
            }
            ctx.log(`"${ctx.spec.nombre}": cambiaste una carta del mazo por dos de tu mano.`);
        },

        // 391: GOLPE DEMOLEDOR
        GOLPE_DEMOLEDOR: (estado, ctx) => {
            const oponente = estado[ctx.oponenteId];
            const specOf = ctx.engine.specOf;
            const idx = oponente.mano.findIndex(num => {
                const s = specOf(num);
                return s && (s.nombre.toUpperCase().includes('PICCOLO') || s.nombre.toUpperCase().includes('KRILLIN'));
            });
            if (idx === -1) {
                ctx.log(`"${ctx.spec.nombre}": el rival no tiene Piccolo o Krillin en mano.`);
                return;
            }
            const [num] = oponente.mano.splice(idx, 1);
            oponente.descarte.push(num);
            ctx.log(`"${ctx.spec.nombre}": se descartó "${specOf(num)?.nombre}" de la mano rival.`);
        },

        // 392: SED DE VENGANZA
        MODIFICAR_FREEZER_50_50: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            const specOf = ctx.engine.specOf;
            const entrada = j.campoAtaque.find(e => {
                const s = specOf(e.ataqueNum);
                return s && s.nombre && s.nombre.toUpperCase().includes('FREEZER');
            });
            if (entrada) {
                entrada._bonusInstantAtk = (entrada._bonusInstantAtk || 0) + 50;
                entrada._bonusInstantDef = (entrada._bonusInstantDef || 0) + 50;
                ctx.log(`"${ctx.spec.nombre}": Freezer recibe +50/+50.`);
            } else {
                ctx.log(`"${ctx.spec.nombre}": no tienes Freezer en el campo.`);
            }
        },

        // 394: VEGETA CONTRAATACA
        VEGETA_CONTRAATACA: (estado, ctx) => {
            estado._vegetaContraatacaActivo = true;
            ctx.log(`"${ctx.spec.nombre}": el próximo ataque único (sin modificadoras) se anula y puedes atacar fuera de turno.`);
        },

        // 395: VESTIDA PARA MATAR (permanente)
        VESTIDA_PARA_MATAR_TURNO: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            if (j.campoAtaque.length > 0) {
                j.campoAtaque.forEach(e => {
                    e._bonusInstantDef = (e._bonusInstantDef || 0) + 20;
                });
                ctx.log(`VESTIDA PARA MATAR (permanente): +20 DEF a todos los ataques en mesa.`);
            }
        },

        // 397: DEVOLVER ESFERAS
        DEVOLVER_ESFERAS: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            const esferasDevueltas = [];
            j.campoAtaque.forEach(e => {
                if (e.esferaNum) {
                    esferasDevueltas.push(e.esferaNum);
                    e.esferaNum = null;
                }
                (e.modificadores || []).forEach(m => {
                    if (m.esferaNum) {
                        esferasDevueltas.push(m.esferaNum);
                        m.esferaNum = null;
                    }
                });
            });
            if (esferasDevueltas.length > 0) {
                j.mazo.push(...esferasDevueltas);
                for (let i = j.mazo.length - 1; i > 0; i--) {
                    const k = Math.floor(Math.random() * (i + 1));
                    [j.mazo[i], j.mazo[k]] = [j.mazo[k], j.mazo[i]];
                }
                ctx.log(`"${ctx.spec.nombre}": ${esferasDevueltas.length} esferas devueltas al mazo.`);
            } else {
                ctx.log(`"${ctx.spec.nombre}": no hay esferas en juego para devolver.`);
            }
        },

        // 399: LA FURIA DE ROSHI
        LA_FURIA_DE_ROSHI: (estado, ctx) => {
            const j1 = estado.j1;
            const j2 = estado.j2;
            // Descartar todas las manos
            const mazoComun = [...j1.mano, ...j2.mano];
            j1.mano = [];
            j2.mano = [];
            // Mezclar
            for (let i = mazoComun.length - 1; i > 0; i--) {
                const k = Math.floor(Math.random() * (i + 1));
                [mazoComun[i], mazoComun[k]] = [mazoComun[k], mazoComun[i]];
            }
            // Repartir 7 a cada uno
            const mitad = Math.min(7, Math.floor(mazoComun.length / 2));
            for (let i = 0; i < mitad && mazoComun.length > 0; i++) {
                j1.mano.push(mazoComun.pop());
                if (mazoComun.length > 0) j2.mano.push(mazoComun.pop());
            }
            // Las sobrantes van a descarte
            j1.descarte.push(...mazoComun);
            j2.descarte.push(...mazoComun);
            estado.ataquesBloqueadosEsteTurno = true;
            ctx.log(`"${ctx.spec.nombre}": ambos jugadores descartaron sus manos y robaron 7. No puedes atacar este turno.`);
        },

        // 400: GRITO DE BATALLA
        GRITO_DE_BATALLA: (estado, ctx) => {
            estado._gritoDeBatallaActivo = 2; // permite 2 ataques sin esfera
            ctx.log(`"${ctx.spec.nombre}": puedes bajar hasta 2 ataques sin esferas este turno.`);
        },

        // 363: FUSION (combo con Piccolo y Nail)
        FUSION: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            const specOf = ctx.engine.specOf;
            // Verificar que Piccolo (78) y Nail (339) estén en el campo de ataque propio
            const tienePiccolo = j.campoAtaque.some(e => specOf(e.ataqueNum)?.numero === 78);
            const tieneNail = j.campoAtaque.some(e => specOf(e.ataqueNum)?.numero === 339);
            if (tienePiccolo && tieneNail) {
                // Aplicar x2 x2 a ambos
                j.campoAtaque.forEach(e => {
                    const s = specOf(e.ataqueNum);
                    if (s && (s.numero === 78 || s.numero === 339)) {
                        e._multAtk = (e._multAtk || 1) * 2;
                        e._multDef = (e._multDef || 1) * 2;
                    }
                });
                ctx.log(`"${ctx.spec.nombre}": Piccolo y Nail se potencian x2 x2.`);
            } else {
                ctx.log(`"${ctx.spec.nombre}": necesitas tener a Piccolo y Nail en el campo para activar el combo.`);
            }
        },

        // 364: KAKASANYUDOKODAN
        KAKASANYUDOKODAN: (estado, ctx) => {
            // Se aplica en declararAtaque cuando se baja la carta con esferas extra
            // Aquí solo log, la lógica se hará en declararAtaque
            ctx.log(`"${ctx.spec.nombre}": cada esfera extra baja x2 x2.`);
        },

        // 368: BUSCAR_GOKU_EN_MAZO
        BUSCAR_GOKU_EN_MAZO: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            const specOf = ctx.engine.specOf;
            // Contar cuántas cartas de Goku hay en el mazo
            const cartasGoku = [];
            const nuevoMazo = [];
            for (const num of j.mazo) {
                const s = specOf(num);
                if (s && s.nombre && s.nombre.toUpperCase().includes('GOKU')) {
                    cartasGoku.push(num);
                } else {
                    nuevoMazo.push(num);
                }
            }
            if (cartasGoku.length === 0) {
                ctx.log(`"${ctx.spec.nombre}": no hay cartas de Goku en tu mazo.`);
                return;
            }
            // Preguntar cuántas cartas de la mano quiere cambiar
            const maxCambio = Math.min(j.mano.length, cartasGoku.length);
            if (maxCambio === 0) {
                ctx.log(`"${ctx.spec.nombre}": no tienes cartas en mano para cambiar.`);
                return;
            }
            const cantidad = parseInt(prompt(`Tienes ${cartasGoku.length} cartas de Goku en el mazo. ¿Cuántas quieres cambiar de tu mano? (0-${maxCambio})`, "0"));
            if (isNaN(cantidad) || cantidad <= 0 || cantidad > maxCambio) {
                ctx.log(`"${ctx.spec.nombre}": no se cambió ninguna carta.`);
                return;
            }
            // Elegir cartas de la mano para descartar (simplificado: las primeras 'cantidad')
            const descartadas = j.mano.splice(0, cantidad);
            // Tomar las primeras 'cantidad' de Goku del mazo
            const tomadas = cartasGoku.splice(0, cantidad);
            j.mano.push(...tomadas);
            // Devolver las descartadas al mazo
            j.mazo.push(...descartadas);
            // Mezclar
            for (let i = j.mazo.length - 1; i > 0; i--) {
                const k = Math.floor(Math.random() * (i + 1));
                [j.mazo[i], j.mazo[k]] = [j.mazo[k], j.mazo[i]];
            }
            ctx.log(`"${ctx.spec.nombre}": cambiaste ${cantidad} cartas de tu mano por cartas de Goku.`);
        },

        // 369: ASFIXIA (permanente)
        ASFIXIA: (estado, ctx) => {
            // Al jugarse como permanente, reduce 10 pts de energía al rival al inicio de cada turno
            // El efecto se ejecuta en el efectoTurnoId que definimos abajo
            ctx.log(`"${ctx.spec.nombre}": el rival perderá 10 pts de energía al inicio de cada turno.`);
        },
        ASFIXIA_TURNO: (estado, ctx) => {
            const rival = estado[ctx.jugadorId === 'j1' ? 'j2' : 'j1'];
            const perdida = 10;
            rival.energia = Math.max(0, rival.energia - perdida);
            ctx.log(`ASFIXIA: el rival pierde ${perdida} pts de energía.`);
        },

        // 370: REFLEJAR ATAQUE
        REFLEJAR_ATAQUE: (estado, ctx) => {
            estado._reflejarAtaqueActivo = true;
            ctx.log(`"${ctx.spec.nombre}": el próximo ataque de hasta 100 pts se reflejará contra el rival.`);
        },

        // 372: RETENER PERSONAJE V2 (anula y devuelve a mano)
        RETENER_PERSONAJE_V2: (estado, ctx) => {
            // Similar a RETENER_PERSONAJE pero devuelve a mano el ataque y sus modificadores
            estado._retenerPersonajeV2Activo = true;
            ctx.log(`"${ctx.spec.nombre}": el próximo ataque será anulado y devuelto a la mano del rival.`);
        },

        // 376: DESTRUCCION TOTAL
        DESTRUCCION_TOTAL: (estado, ctx) => {
            // Destruir todas las permanentes en juego (de ambos jugadores)
            const j1 = estado.j1;
            const j2 = estado.j2;
            const permanentesJ1 = [...j1.permanentes];
            const permanentesJ2 = [...j2.permanentes];
            permanentesJ1.forEach(perm => {
                j1.descarte.push(perm.num);
            });
            permanentesJ2.forEach(perm => {
                j2.descarte.push(perm.num);
            });
            j1.permanentes = [];
            j2.permanentes = [];
            ctx.log(`"${ctx.spec.nombre}": se eliminaron todas las cartas permanentes de la mesa.`);
        },

        // 379: MALA_SUERTE
        MALA_SUERTE: (estado, ctx) => {
            const oponente = estado[ctx.oponenteId];
            const specOf = ctx.engine.specOf;
            // Buscar cartas de Freezer en la mano rival
            const freezerIdx = oponente.mano.findIndex(num => {
                const s = specOf(num);
                return s && s.nombre && s.nombre.toUpperCase().includes('FREEZER');
            });
            if (freezerIdx === -1) {
                ctx.log(`"${ctx.spec.nombre}": el rival no tiene cartas de Freezer en mano.`);
                return;
            }
            const [num] = oponente.mano.splice(freezerIdx, 1);
            oponente.descarte.push(num);
            ctx.log(`"${ctx.spec.nombre}": se descartó "${specOf(num)?.nombre}" de la mano rival.`);
        },

        // 381: SALVANDO A UN AMIGO (recuperar ataque del descarte)
        RECUPERAR_ATAQUE_DESCARTE: (estado, ctx) => {
            const propio = estado[ctx.jugadorId];
            const idx = propio.descarte.findIndex(n => ctx.engine.specOf(n)?.tipo === 'Ataque');
            if (idx === -1) {
                ctx.log(`"${ctx.spec.nombre}": no hay cartas de ataque en tu cementerio.`);
                return;
            }
            const [num] = propio.descarte.splice(idx, 1);
            propio.mano.push(num);
            ctx.log(`"${ctx.spec.nombre}": recuperaste una carta de ataque del cementerio.`);
        },

        // 382: MANDAR_Y_ROBAR_3 (descartar 3 y robar 3)
        MANDAR_Y_ROBAR_3: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            const aDescartar = j.mano.splice(0, Math.min(3, j.mano.length));
            j.descarte.push(...aDescartar);
            const nRoba = Math.min(3, j.mazo.length);
            for (let i = 0; i < nRoba; i++) {
                j.mano.push(j.mazo.pop());
            }
            ctx.log(`"${ctx.spec.nombre}": descartaste ${aDescartar.length} y robaste ${nRoba}.`);
        },

        // 384: PACIENCIA
        PACIENCIA: (estado, ctx) => {
            estado._pacienciaActivo = true;
            ctx.log(`"${ctx.spec.nombre}": el próximo ataque será anulado y devuelto a la mano del rival (la esfera al descarte).`);
        },

                // 319: CAPITAN GINYU (versión mejorada)
        CAPITAN_GINYU: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            const specOf = ctx.engine.specOf;
            // Miembros de las Fuerzas Especiales (excluyendo a Ginyu, que es la carta actual)
            const miembros = [315, 316, 317, 318]; // Guldo, Recoome, Jeice, Burter
            const encontrados = [];
            const restoMano = [];
            // Separar los miembros de la mano
            for (const num of j.mano) {
                if (miembros.includes(num)) {
                    encontrados.push(num);
                } else {
                    restoMano.push(num);
                }
            }
            // Si hay al menos 2 miembros, los bajamos todos sin coste de esfera adicional
            if (encontrados.length >= 2) {
                // Bajamos cada miembro encontrado (sin coste de esfera)
                encontrados.forEach(num => {
                    const idx = j.mano.indexOf(num);
                    if (idx !== -1) {
                        j.mano.splice(idx, 1);
                        j.campoAtaque.push({ ataqueNum: num, esferaNum: null, modificadores: [] });
                        j.cartasJugadasEsteTurno.push(num);
                        const s = specOf(num);
                        if (s) ctx.log(`Se bajó a "${s.nombre}" con CAPITAN GINYU.`);
                    }
                });
                // Aplicamos el efecto de cada miembro (si tienen) - en este caso no tienen, pero por si acaso
                ctx.log(`"${ctx.spec.nombre}": se bajaron ${encontrados.length} miembros de las Fuerzas Especiales.`);
            } else {
                ctx.log(`"${ctx.spec.nombre}": necesitas al menos 2 miembros de las Fuerzas Especiales en mano para activar el efecto.`);
            }
        },
        

        // 320: DETENER EL TIEMPO
        DETENER_EL_TIEMPO: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            const primeras = j.mazo.slice(-10).reverse();
            if (primeras.length === 0) {
                ctx.log(`"${ctx.spec.nombre}": tu mazo no tiene 10 cartas.`);
                return;
            }
            // Mostrar las cartas al jugador (simplificado: se muestra en el log)
            const nombres = primeras.map(n => ctx.engine.specOf(n)?.nombre || '#'+n).join(', ');
            ctx.log(`"${ctx.spec.nombre}": las 10 primeras cartas de tu mazo son: ${nombres}. Puedes intercambiarlas con las de tu mano.`);
            // Aquí se podría implementar una UI para intercambiar, pero por ahora solo log
        },

        // 322: TIRON DE OREJAS (efecto con combo)
        TIRON_DE_OREJAS: (estado, ctx) => {
            // Este efecto permite jugar la carta aunque no sea tu turno si tienes PARALIZADO.
            // La lógica principal está en declararAtaque; aquí solo log.
            ctx.log(`"${ctx.spec.nombre}" jugado correctamente con PARALIZADO.`);
        },

        // 326: PUNTAPIE INICIAL
        PUNTAPIE_INICIAL: (estado, ctx) => {
            // Este efecto se aplica si es el primer ataque de la partida.
            // Verificamos si algún jugador ha atacado antes.
            const historial = estado.historial;
            const haAtacadoAntes = historial.some(msg => msg.includes('bajó') || msg.includes('ataque'));
            if (!haAtacadoAntes) {
                // Aplicar x1 x3 al ataque actual
                const j = estado[ctx.jugadorId];
                // El ataque actual es el último añadido al campo
                const entrada = j.campoAtaque[j.campoAtaque.length - 1];
                if (entrada) {
                    entrada._multAtk = (entrada._multAtk || 1) * 1;
                    entrada._multDef = (entrada._multDef || 1) * 3;
                    ctx.log(`"${ctx.spec.nombre}": ¡primer ataque del juego! x1/x3 aplicado.`);
                }
            } else {
                ctx.log(`"${ctx.spec.nombre}": no es el primer ataque, no se aplica el bonus.`);
            }
        },

        // 327: GOHAN SE ENFURECE
        GOHAN_SE_ENFURECE: (estado, ctx) => {
            // Se aplica como modificadora x2/x2 pero solo a cartas de Gohan.
            // La validación se hace en modificarAtaque.
            ctx.log(`"${ctx.spec.nombre}": aplica x2/x2 a una carta de Gohan.`);
        },

        // 329: BUSCAR_FUERZAS_ESPECIALES
        BUSCAR_FUERZAS_ESPECIALES: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            const specOf = ctx.engine.specOf;
            const miembros = [315, 316, 317, 318, 319]; // Guldo, Recoome, Jeice, Burter, Ginyu
            let encontrado = false;
            const nuevoMazo = [];
            for (const num of j.mazo) {
                const s = specOf(num);
                if (!encontrado && miembros.includes(num)) {
                    j.mano.push(num);
                    encontrado = true;
                } else {
                    nuevoMazo.push(num);
                }
            }
            j.mazo = nuevoMazo;
            if (encontrado) {
                ctx.log(`"${ctx.spec.nombre}": encontraste un miembro de las Fuerzas Especiales en tu mazo.`);
            } else {
                ctx.log(`"${ctx.spec.nombre}": no hay miembros de las Fuerzas Especiales en tu mazo.`);
            }
        },

        // 330: FURIA OCULTA
        FURIA_OCULTA: (estado, ctx) => {
            // Este efecto se aplica como multiplicador x1/x2 cuando se juega junto a GOHAN (32)
            // La validación se hace en declararAtaque (comboCon)
            ctx.log(`"${ctx.spec.nombre}" jugado con GOHAN, se aplica x1/x2.`);
        },

        // 332: SALUDOS A TI
        SALUDOS_A_TI: (estado, ctx) => {
            estado._saludosATiActivo = true;
            ctx.log(`"${ctx.spec.nombre}": si recibes un ataque de más de 150 pts, se anulará y el rival recibirá la mitad.`);
        },

        // 334: DESACUERDO
        DESACUERDO: (estado, ctx) => {
            const oponente = estado[ctx.oponenteId];
            const specOf = ctx.engine.specOf;
            const miembros = [315, 316, 317, 318, 319];
            let anulado = false;
            // Buscar en campo de ataque rival
            for (let i = 0; i < oponente.campoAtaque.length; i++) {
                const e = oponente.campoAtaque[i];
                if (miembros.includes(e.ataqueNum)) {
                    oponente.descarte.push(e.ataqueNum);
                    if (e.esferaNum) oponente.descarte.push(e.esferaNum);
                    (e.modificadores || []).forEach(m => {
                        oponente.descarte.push(m.num);
                        if (m.esferaNum) oponente.descarte.push(m.esferaNum);
                    });
                    oponente.campoAtaque.splice(i, 1);
                    anulado = true;
                    i--;
                }
            }
            // Buscar en defensa rival
            if (oponente.campoDefensa && miembros.includes(oponente.campoDefensa.defensaNum)) {
                oponente.descarte.push(oponente.campoDefensa.defensaNum);
                if (oponente.campoDefensa.esferaNum) oponente.descarte.push(oponente.campoDefensa.esferaNum);
                (oponente.campoDefensa.modificadores || []).forEach(m => {
                    oponente.descarte.push(m.num);
                    if (m.esferaNum) oponente.descarte.push(m.esferaNum);
                });
                oponente.campoDefensa = null;
                anulado = true;
            }
            if (anulado) {
                ctx.log(`"${ctx.spec.nombre}": se anuló una carta de las Fuerzas Especiales del rival.`);
            } else {
                ctx.log(`"${ctx.spec.nombre}": el rival no tiene Fuerzas Especiales en mesa.`);
            }
        },

        // 336: MENTE_CLARA (permanente)
        MENTE_CLARA_TURNO: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            if (j.campoAtaque.length > 0) {
                j.campoAtaque.forEach(e => {
                    e._bonusInstantAtk = (e._bonusInstantAtk || 0) + 20;
                });
                ctx.log(`MENTE CLARA (permanente): +20 ATK a todos los ataques en mesa.`);
            }
        },

        POTENCIACION_PICCOLO: (estado, ctx) => {
            // Este efecto se aplica como modificador x1/x2, pero validando que el objetivo sea Piccolo.
            // La lógica se ejecuta en modificarAtaque; aquí solo log.
            ctx.log(`"${ctx.spec.nombre}": se aplicará x1/x2 a una carta de Piccolo.`);
        },

        // Curación
        RECUPERAR_20: (estado, ctx) => { ctx.curar(20); },
        RECUPERAR_25: (estado, ctx) => { ctx.curar(25); },
        RECUPERAR_50: (estado, ctx) => { ctx.curar(50); },
        RECUPERAR_150: (estado, ctx) => { ctx.curar(150); },
        RECUPERAR_50_INST: (estado, ctx) => { ctx.curar(50); },

        // Bloqueo / anulación
        BLOQUEAR_ATAQUE: (estado, ctx) => {
            estado.bloqueoAtaquePendiente = true;
            ctx.log(`${ctx.spec.nombre}: ¡el próximo ataque será bloqueado por completo!`);
        },
        NEUTRALIZACION: (estado, ctx) => {
            estado.bloqueoAtaquePendiente = true;
            ctx.log(`"${ctx.spec.nombre}": cualquier ataque enemigo será neutralizado (solo 1).`);
        },
        DETENER: (estado, ctx) => {
            estado.bloqueoAtaquePendiente = true;
            ctx.log(`"${ctx.spec.nombre}": el próximo ataque será bloqueado.`);
        },
        QUIETO_AHI: (estado, ctx) => {
            estado.bloqueoAtaquePendiente = true;
            ctx.log(`${ctx.spec.nombre}: ¡el próximo ataque será bloqueado por completo!`);
        },
        ANULAR_TOTAL_SIN_EXCEPCION: (estado, ctx) => {
            estado.bloqueoAtaquePendiente = true;
            ctx.log(`${ctx.spec.nombre}: el próximo ataque no te hará ningún daño.`);
        },
        ANULAR_SI_MENOR_IGUAL_50: (estado, ctx) => {
            estado.anulacionPendiente = { umbral: 50, incluyeIgual: true };
            ctx.log(`${ctx.spec.nombre}: el próximo ataque de 50 pts o menos será anulado.`);
        },
        ANULAR_SI_MENOR_70: (estado, ctx) => {
            estado.anulacionPendiente = { umbral: 70, incluyeIgual: false };
            ctx.log(`${ctx.spec.nombre}: el próximo ataque de menos de 70 pts será bloqueado.`);
        },
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

        // Redirigir / devolver
        DEVOLVER_ATAQUE: (estado, ctx) => {
            ctx.log(`${ctx.spec.nombre}: el ataque rival se redirige contra sí mismo.`);
            ctx.anularDanioYRedirigir = true;
        },

        // Mostrar mano rival
        MOSTRAR_MANO_RIVAL: (estado, ctx) => {
            ctx.mostrarManoRival = true;
            ctx.log(`${ctx.spec.nombre}: viste la mano de tu rival.`);
        },

        // Modificadores de objetivo (se aplican en modificarAtaque/Instantánea)
        MODIFICAR_OBJETIVO_10_30: (estado, ctx) => {
            const aplicado = ctx.modificarObjetivo(10, 30, false);
            ctx.log(aplicado ? `${ctx.spec.nombre}: +10/+30 aplicado al ataque elegido.` : `${ctx.spec.nombre}: elegí un ataque en mesa.`);
        },
        MODIFICAR_OBJETIVO_0_40: (estado, ctx) => {
            const aplicado = ctx.modificarObjetivo(0, 40, false);
            ctx.log(aplicado ? `${ctx.spec.nombre}: +0/+40 aplicado al ataque elegido.` : `${ctx.spec.nombre}: hace falta elegir un ataque en mesa.`);
        },
        MODIFICAR_OBJETIVO_20_0: (estado, ctx) => {
            const aplicado = ctx.modificarObjetivo(20, 0, false);
            ctx.log(aplicado ? `${ctx.spec.nombre}: +20/+0 aplicado al ataque elegido.` : `${ctx.spec.nombre}: hace falta elegir un ataque en mesa.`);
        },
        MODIFICAR_OBJETIVO_20_20: (estado, ctx) => {
            const aplicado = ctx.modificarObjetivo(20, 20, false);
            ctx.log(aplicado ? `${ctx.spec.nombre}: +20/+20 aplicado al ataque elegido.` : `${ctx.spec.nombre}: hace falta elegir un ataque en mesa.`);
        },
        MODIFICAR_OBJETIVO_30_30: (estado, ctx) => {
            const aplicado = ctx.modificarObjetivo(30, 30, false);
            ctx.log(aplicado ? `${ctx.spec.nombre}: +30/+30 aplicado al ataque elegido.` : `${ctx.spec.nombre}: elegí un ataque en mesa.`);
        },
        MODIFICAR_OBJETIVO_0_30: (estado, ctx) => {
            const aplicado = ctx.modificarObjetivo(0, 30, false);
            ctx.log(aplicado ? `${ctx.spec.nombre}: +0/+30 aplicado al ataque elegido.` : `${ctx.spec.nombre}: elegí un ataque en mesa.`);
        },
        MODIFICAR_OBJETIVO_MENOS20_20: (estado, ctx) => {
            const aplicado = ctx.modificarObjetivo(-20, 20, false);
            ctx.log(aplicado ? `${ctx.spec.nombre}: -20/+20 aplicado al ataque elegido.` : `${ctx.spec.nombre}: elegí un ataque en mesa.`);
        },
        MODIFICAR_OBJETIVO_MENOS20_MENOS20: (estado, ctx) => {
            const aplicado = ctx.modificarObjetivo(-20, -20, false);
            ctx.log(aplicado ? `${ctx.spec.nombre}: -20/-20 aplicado al ataque elegido.` : `${ctx.spec.nombre}: hace falta elegir un ataque en mesa.`);
        },
        MODIFICAR_OBJETIVO_20_40: (estado, ctx) => {
            const aplicado = ctx.modificarObjetivo(20, 40, false);
            ctx.log(aplicado ? `${ctx.spec.nombre}: +20/+40 aplicado al ataque elegido.` : `${ctx.spec.nombre}: elegí un ataque en mesa.`);
        },
        MODIFICAR_OBJETIVO_80_0: (estado, ctx) => {
            const aplicado = ctx.modificarObjetivo(80, 0, false);
            ctx.log(aplicado ? `${ctx.spec.nombre}: +80/+0 aplicado al ataque elegido.` : `${ctx.spec.nombre}: elegí un ataque en mesa.`);
        },

        // Multiplicadores de objetivo
        MULTIPLICAR_OBJETIVO_X2_X2: (estado, ctx) => {
            const aplicado = ctx.modificarObjetivo(2, 2, true);
            ctx.log(aplicado ? `${ctx.spec.nombre}: x2/x2 aplicado al ataque elegido.` : `${ctx.spec.nombre}: elegí un ataque en mesa.`);
        },
        MULTIPLICAR_OBJETIVO_X3: (estado, ctx) => {
            const aplicado = ctx.modificarObjetivo(3, 3, true);
            ctx.log(aplicado ? `${ctx.spec.nombre}: x3/x3 aplicado al ataque elegido.` : `${ctx.spec.nombre}: hace falta elegir un ataque en mesa.`);
        },
        MULTIPLICAR_OBJETIVO_X1_X2: (estado, ctx) => {
            const aplicado = ctx.modificarObjetivo(1, 2, true);
            ctx.log(aplicado ? `${ctx.spec.nombre}: x1/x2 aplicado al ataque elegido.` : `${ctx.spec.nombre}: hace falta elegir un ataque en mesa.`);
        },
        MULTIPLICAR_OBJETIVO_X3_X3: (estado, ctx) => {
            // Se valida en modificarAtaque que no sea Ohzaru
            const aplicado = ctx.modificarObjetivo(3, 3, true);
            ctx.log(aplicado ? `${ctx.spec.nombre}: x3/x3 aplicado al ataque elegido.` : `${ctx.spec.nombre}: elegí un ataque en mesa.`);
        },
        MULTIPLICAR_OBJETIVO_X4_X4: (estado, ctx) => {
            // Se valida en modificarAtaque que el objetivo sea Goku
            const aplicado = ctx.modificarObjetivo(4, 4, true);
            ctx.log(aplicado ? `${ctx.spec.nombre}: x4/x4 aplicado al ataque elegido.` : `${ctx.spec.nombre}: elegí un ataque en mesa.`);
        },

        // Defensa perforadora
        DEFENSA_PERFORADORA: (estado, ctx) => {
            estado[ctx.jugadorId].bonusTurno.defensaPerforadoraPropia = true;
            ctx.log(`${ctx.spec.nombre}: si tu defensa supera el próximo ataque rival, la diferencia se le descuenta a él.`);
        },
        VEN_A_MI: (estado, ctx) => {
            estado[ctx.jugadorId].bonusTurno.defensaPerforadoraPropia = true;
            ctx.log(`"${ctx.spec.nombre}": defensa perforadora activada.`);
        },

        // Sin defensa rival
        SIN_DEFENSA_RIVAL: (estado, ctx) => {
            const propio = estado[ctx.jugadorId];
            propio.bonusTurno.rivalNoPuedeDefenderse = true;
            ctx.log(`${ctx.spec.nombre}: tu rival no podrá defenderse este turno.`);
        },

        // Defensas rival a la mitad
        DEFENSA_RIVAL_MITAD: (estado, ctx) => {
            const propio = estado[ctx.jugadorId];
            propio.bonusTurno.rivalDefensaMitad = true;
            ctx.log(`${ctx.spec.nombre}: las defensas de tu rival quedan reducidas a la mitad este turno.`);
        },

        // Rival no puede atacar
        RIVAL_NO_PUEDE_ATACAR: (estado, ctx) => {
            estado[ctx.jugadorId].bonusTurno.rivalNoPuedeAtacarProximoTurno = true;
            ctx.log(`${ctx.spec.nombre}: tu rival no podrá atacar en su próximo turno.`);
        },

        // Recuperar del descarte
        RECUPERAR_DEL_DESCARTE: (estado, ctx) => {
            const propio = estado[ctx.jugadorId];
            if (propio.descarte.length === 0) { ctx.log(`${ctx.spec.nombre}: el cementerio está vacío.`); return; }
            const num = propio.descarte.pop();
            propio.mano.push(num);
            ctx.log(`${ctx.spec.nombre}: recuperaste una carta del cementerio.`);
        },
        RECUPERAR_3_DEL_DESCARTE: (estado, ctx) => {
            const propio = estado[ctx.jugadorId];
            const n = Math.min(3, propio.descarte.length);
            for (let i = 0; i < n; i++) propio.mano.push(propio.descarte.pop());
            ctx.log(`${ctx.spec.nombre}: recuperaste ${n} carta(s) del cementerio.`);
        },
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

        // Buscar en mazo
        BUSCAR_EN_MAZO_3: (estado, ctx) => {
            const propio = estado[ctx.jugadorId];
            const n = Math.min(3, propio.mazo.length);
            for (let i = 0; i < n; i++) propio.mano.push(propio.mazo.pop());
            ctx.log(`${ctx.spec.nombre}: buscaste ${n} carta(s) en tu mazo.`);
        },

        // Descartar esferas rival
        DESCARTAR_TODAS_ESFERAS_RIVAL: (estado, ctx) => {
            const oponente = estado[ctx.oponenteId];
            const esferas = oponente.mano.filter(n => ctx.engine.specOf(n)?.tipo === TIPOS.ESFERA);
            esferas.forEach(num => {
                oponente.mano.splice(oponente.mano.indexOf(num), 1);
                oponente.descarte.push(num);
            });
            ctx.log(`${ctx.spec.nombre}: se descartaron ${esferas.length} esfera(s) de la mano rival.`);
        },
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
        DESCARTAR_AL_AZAR_RIVAL: (estado, ctx) => {
            const oponente = estado[ctx.oponenteId];
            if (oponente.mano.length === 0) return;
            const idx = Math.floor(Math.random() * oponente.mano.length);
            const [num] = oponente.mano.splice(idx, 1);
            oponente.descarte.push(num);
            ctx.log(`${ctx.spec.nombre}: una carta al azar de la mano rival fue al cementerio.`);
        },

        // Destruir permanente rival
        DESTRUIR_PERMANENTE_RIVAL: (estado, ctx) => {
            const num = ctx.engine.destruirPermanente(estado, ctx.oponenteId);
            if (num) {
                const s = ctx.engine.specOf(num);
                ctx.log(`${ctx.spec.nombre}: destruiste la carta permanente "${s ? s.nombre : num}" del rival.`);
            } else {
                ctx.log(`${ctx.spec.nombre}: el rival no tenía cartas permanentes en mesa.`);
            }
        },

        // Humillando (no bloqueable)
        HUMILLANDO: (estado, ctx) => {
            estado._ataqueNoBloqueableActivo = true;
            ctx.log(`${ctx.spec.nombre}: este ataque no puede ser bloqueado.`);
        },

        // Multiplicación (defensa combinada)
        MULTIPLICACION: (estado, ctx) => {
            estado[ctx.jugadorId]._multiplicacionActiva = true;
            ctx.log(`${ctx.spec.nombre}: podés defender hasta 2 ataques con esta carta como defensa combinada.`);
        },

        // =============================================================
        // EFECTOS DE CARTAS ESPECÍFICAS (por número)
        // =============================================================

        // Carta 10: YA EXISTE COMO DEVOLVER_ATAQUE
        // Carta 14: EL_DUELO
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

        // Carta 16: DESTRUCCION (descartar personaje rival)
        DESTRUCCION: (estado, ctx) => {
            const oponente = estado[ctx.oponenteId];
            const idx = oponente.mano.findIndex(n => ctx.engine.specOf(n)?.tipo !== TIPOS.ESFERA);
            if (idx >= 0) {
                const [num] = oponente.mano.splice(idx, 1);
                oponente.descarte.push(num);
                ctx.log(`${ctx.spec.nombre}: se descartó una carta de la mano rival.`);
            }
        },

        // Carta 18: REVIVIR
        REVIVIR: (estado, ctx) => {
            const propio = estado[ctx.jugadorId];
            const idx = propio.descarte.findIndex(n => ctx.engine.specOf(n)?.tipo !== TIPOS.ESFERA);
            if (idx >= 0) {
                const [num] = propio.descarte.splice(idx, 1);
                propio.mano.push(num);
                ctx.log(`${ctx.spec.nombre}: recuperaste una carta del cementerio.`);
            }
        },

        // Carta 23: LA_CHANCE_DE_CELL
        LA_CHANCE_DE_CELL: (estado, ctx) => {
            const propio = estado[ctx.jugadorId];
            const aDescartar = propio.mano.splice(0, Math.min(3, propio.mano.length));
            propio.descarte.push(...aDescartar);
            for (let i = 0; i < 3 && propio.mazo.length; i++) {
                propio.mano.push(propio.mazo.pop());
            }
            ctx.log(`${ctx.spec.nombre}: descartaste ${aDescartar.length} y robaste cartas nuevas.`);
        },

        // Carta 48: KNOCK_OUT
        KNOCK_OUT: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            const nDesc = Math.min(6, j.mano.length);
            for (let i = 0; i < nDesc; i++) j.descarte.push(j.mano.shift());
            const nRoba = Math.min(nDesc, j.mazo.length);
            for (let i = 0; i < nRoba; i++) j.mano.push(j.mazo.pop());
            estado.ataquesBloqueadosEsteTurno = true;
            ctx.log(`${ctx.spec.nombre}: descartaste ${nDesc} y robaste ${nRoba}. No podés atacar este turno.`);
        },

        // Carta 50: COMPARTIR_ESFERA_GRATIS
        COMPARTIR_ESFERA_GRATIS: (estado, ctx) => {
            estado[ctx.jugadorId]._proximoAtaqueSinEsfera = true;
            ctx.log(`${ctx.spec.nombre}: tu próximo ataque de este turno no necesita esfera.`);
        },

        // Carta 58: LA_GRAN_IDEA_DE_BUU
        LA_GRAN_IDEA_DE_BUU: (estado, ctx) => {
            const rival = estado[ctx.oponenteId];
            const nDesc = rival.mano.length;
            rival.descarte.push(...rival.mano);
            rival.mano = [];
            const nRoba = Math.min(3, rival.mazo.length);
            for (let i = 0; i < nRoba; i++) rival.mano.push(rival.mazo.pop());
            ctx.log(`${ctx.spec.nombre}: rival descartó ${nDesc} cartas y robó ${nRoba}.`);
        },

        // Carta 60: SIN_DEFENSA_RIVAL (ya definido)

        // Carta 62: DEFENSA_RIVAL_MITAD (ya definido)

        // Carta 71: RECUPERAR_25 (ya definido)

        // Carta 75: MIRADA_MAESTRA
        MIRADA_MAESTRA: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            const primeras = j.mazo.slice(-10).reverse();
            ctx.log(`${ctx.spec.nombre}: las primeras 10 cartas de tu mazo son: ${primeras.map(n => ctx.engine.specOf(n)?.nombre || '#'+n).join(', ')}. Reordénalas a gusto.`);
        },

        // Carta 80: DETENER (ya definido)

        // Carta 81: DESCARTAR_TODAS_ESFERAS_RIVAL (ya definido)

        // Carta 87: BUU_EL_INSACIABLE
        BUU_EL_INSACIABLE: (estado, ctx) => {
            const oponente = estado[ctx.oponenteId];
            if (oponente.campoAtaque.length === 0) {
                ctx.log(`"${ctx.spec.nombre}": tu rival no tiene ataques en mesa.`);
                return;
            }
            let totalDef = 0;
            oponente.campoAtaque.forEach(entrada => {
                const spec = ctx.engine.specOf(entrada.ataqueNum);
                if (spec) totalDef += spec.defensa;
                oponente.descarte.push(entrada.ataqueNum);
                if (entrada.esferaNum) oponente.descarte.push(entrada.esferaNum);
                (entrada.modificadores || []).forEach(m => {
                    oponente.descarte.push(m.num);
                    if (m.esferaNum) oponente.descarte.push(m.esferaNum);
                });
            });
            oponente.campoAtaque = [];
            if (totalDef > 0) ctx.curar(totalDef);
            ctx.log(`"${ctx.spec.nombre}": se anularon los ataques rivales y recuperaste ${totalDef} pts de energía.`);
        },

        // Carta 88: KAIOH_SHIN (efecto en totalDeEntrada)
        KAIOH_SHIN: (estado, ctx) => {
            ctx.log(`"${ctx.spec.nombre}" en juego. Si el rival tiene a Buu, se duplicará.`);
        },

        // Carta 89: EL_LADO_OSCURO (efecto en totalDeEntrada)
        EL_LADO_OSCURO: (estado, ctx) => {
            ctx.log(`"${ctx.spec.nombre}" en juego. Si el rival tiene a Goku, se duplicará.`);
        },

        // Carta 91: EXTREME_MAJIN_BUU
        EXTREME_MAJIN_BUU: (estado, ctx) => {
            const oponente = estado[ctx.oponenteId];
            const idx = oponente.mano.findIndex(num => {
                const s = ctx.engine.specOf(num);
                return s && s.tipo !== 'Esfera';
            });
            if (idx >= 0) {
                const [num] = oponente.mano.splice(idx, 1);
                oponente.descarte.push(num);
                ctx.log(`"${ctx.spec.nombre}": se descartó "${ctx.engine.specOf(num)?.nombre || '#'+num}" de la mano rival.`);
            } else {
                ctx.log(`"${ctx.spec.nombre}": el rival no tiene personajes en mano.`);
            }
        },

        // Carta 94: A_VER_A_VER
        A_VER_A_VER: (estado, ctx) => {
            const oponente = estado[ctx.oponenteId];
            const cantidad = Math.min(3, oponente.mano.length);
            const descartadas = [];
            for (let i = 0; i < cantidad; i++) {
                descartadas.push(oponente.mano.shift());
            }
            oponente.descarte.push(...descartadas);
            const robadas = Math.min(cantidad, oponente.mazo.length);
            for (let i = 0; i < robadas; i++) {
                oponente.mano.push(oponente.mazo.pop());
            }
            ctx.log(`"${ctx.spec.nombre}": rival descartó ${descartadas.length} y robó ${robadas}.`);
        },

        // Carta 100: NEUTRALIZACION (ya definido)

        // Carta 101: ESCUDO_DE_VAPOR
        ESCUDO_DE_VAPOR: (estado, ctx) => {
            const oponente = estado[ctx.oponenteId];
            estado._escudoDeVaporActivo = true;
            oponente.energia = Math.max(0, oponente.energia - 50);
            ctx.log(`"${ctx.spec.nombre}": el ataque rival se reduce a la mitad y el rival sufre 50 pts de daño.`);
        },

        // Carta 102: VENGANZA
        VENGANZA: (estado, ctx) => {
            estado.bloqueoAtaquePendiente = true;
            estado._venganzaActiva = true;
            ctx.log(`"${ctx.spec.nombre}": el ataque rival será descartado y no recibirás daño.`);
        },

        // Carta 105: REMATE_SAIYAN (validación en declararAtaque)
        REMATE_SAIYAN: (estado, ctx) => {
            ctx.log(`"${ctx.spec.nombre}" solo puede usarse combinado con otro ataque.`);
        },

        // Carta 108: DENDE (cura en declararAtaque)
        DENDE: (estado, ctx) => {
            ctx.curar(50);
            ctx.log(`"${ctx.spec.nombre}": recuperaste 50 pts de energía.`);
        },

        // Carta 109: BABIDI
        BABIDI: (estado, ctx) => {
            estado.anulacionPendiente = { umbral: 70, incluyeIgual: false };
            ctx.log(`"${ctx.spec.nombre}": bloquea un ataque de menos de 70 pts.`);
        },

        // Carta 110: EGOS_ENFRENTADOS
        EGOS_ENFRENTADOS: (estado, ctx) => {
            const atacanteId = estado.turnoJugador === 1 ? 'j1' : 'j2';
            const atacante = estado[atacanteId];
            if (atacante.campoAtaque.length >= 2) {
                atacante.campoAtaque.forEach(e => {
                    atacante.descarte.push(e.ataqueNum);
                    if (e.esferaNum) atacante.descarte.push(e.esferaNum);
                    (e.modificadores || []).forEach(m => { atacante.descarte.push(m.num); if (m.esferaNum) atacante.descarte.push(m.esferaNum); });
                });
                atacante.campoAtaque = [];
                ctx.log(`${ctx.spec.nombre}: los 2 ataques del rival lucharon entre sí. No recibís daño.`);
            } else {
                ctx.log(`${ctx.spec.nombre}: el rival no tiene 2 ataques en mesa. Sin efecto.`);
            }
        },

        // Carta 115: ATAQUE_COMBINADO (modifica +40+40 a todos los ataques)
        ATAQUE_COMBINADO: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            const ataques = j.campoAtaque;
            if (ataques.length >= 2) {
                ataques.forEach(entrada => {
                    entrada._bonusInstantAtk = (entrada._bonusInstantAtk || 0) + 40;
                    entrada._bonusInstantDef = (entrada._bonusInstantDef || 0) + 40;
                });
                ctx.log(`"${ctx.spec.nombre}": +40/+40 a todos los ataques en campo.`);
            } else {
                ctx.log(`"${ctx.spec.nombre}": necesitas al menos 2 ataques para activar el efecto.`);
            }
        },

        // Carta 116: VEN_A_MI (ya definido)

        // Carta 118: RECARGA
        RECARGA: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            j.mazo.push(...j.mano);
            j.mano = [];
            for (let i = j.mazo.length - 1; i > 0; i--) {
                const k = Math.floor(Math.random() * (i + 1));
                [j.mazo[i], j.mazo[k]] = [j.mazo[k], j.mazo[i]];
            }
            for (let i = 0; i < 7 && j.mazo.length; i++) j.mano.push(j.mazo.pop());
            ctx.log(`${ctx.spec.nombre}: devolviste tu mano al mazo, mezclaste y robaste ${j.mano.length} cartas nuevas.`);
        },

        // Carta 119: RECARGA_OBLIGADA
        RECARGA_OBLIGADA: (estado, ctx) => {
            const riv = estado[ctx.oponenteId];
            const cant = riv.mano.length;
            riv.descarte.push(...riv.mano);
            riv.mano = [];
            const robadas = Math.min(cant, riv.mazo.length);
            for (let i = 0; i < robadas; i++) riv.mano.push(riv.mazo.pop());
            ctx.log(`${ctx.spec.nombre}: el rival descartó ${cant} cartas y robó ${robadas}.`);
        },

        // Carta 120: MODIFICAR_OBJETIVO_MENOS20_20 (ya definido)

        // Carta 124: HACIENDO_LOS_DEBERES
        HACIENDO_LOS_DEBERES: (estado, ctx) => {
            ctx.log(`${ctx.spec.nombre}: miraste las 10 primeras cartas del mazo rival. Reordenalas a gusto.`);
            ctx.mostrarMazoRival = true;
        },

        // Carta 127: RECUPERAR_DEL_DESCARTE (ya definido)

        // Carta 128: SIN_DEFENSA_RIVAL (ya definido)

        // Carta 129: MULTIPLICAR_OBJETIVO_X2_X2 (ya definido)

        // Carta 137: HORA_DEL_BANO
        HORA_DEL_BANO: (estado, ctx) => {
            estado.bloqueoAtaquePendiente = true;
            estado._devolverEsferaAlBloquear = true;
            ctx.log(`${ctx.spec.nombre}: el próximo ataque será bloqueado y la esfera del rival vuelve a su mano.`);
        },

        // Carta 143: RECUPERAR_50 (ya definido)

        // Carta 145: ATAQUE_CAÑON
        ATAQUE_CAÑON: (estado, ctx) => {
            ctx.log(`"${ctx.spec.nombre}" jugado correctamente con "EL SACRIFICIO DE GOKU".`);
        },

        // Carta 147: SACRIFICIO_DE_GOKU
        SACRIFICIO_DE_GOKU: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            const nDesc = Math.min(2, j.mano.length);
            for (let i = 0; i < nDesc; i++) j.descarte.push(j.mano.shift());
            estado.bloqueoAtaquePendiente = true;
            ctx.log(`${ctx.spec.nombre}: descartaste ${nDesc} cartas y neutralizaste el próximo ataque.`);
        },

        // Carta 148: BUSCAR_PICCOLO_EN_MAZO
        BUSCAR_PICCOLO_EN_MAZO: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            const specOf = ctx.engine.specOf;
            let encontradas = 0;
            const nuevoMazo = [];
            for (const num of j.mazo) {
                const s = specOf(num);
                if (encontradas < 2 && s && s.nombre && s.nombre.toUpperCase().includes('PICCOLO')) {
                    j.mano.push(num);
                    encontradas++;
                } else {
                    nuevoMazo.push(num);
                }
            }
            j.mazo = nuevoMazo;
            for (let i = j.mazo.length - 1; i > 0; i--) {
                const k = Math.floor(Math.random() * (i + 1));
                [j.mazo[i], j.mazo[k]] = [j.mazo[k], j.mazo[i]];
            }
            ctx.log(`"${ctx.spec.nombre}": buscaste ${encontradas} carta(s) de Piccolo en tu mazo.`);
        },

        // Carta 149: ENMAIO_SAMA
        ENMAIO_SAMA: (estado, ctx) => {
            const oponente = estado[ctx.oponenteId];
            const noEsferas = oponente.mano.filter(num => {
                const s = ctx.engine.specOf(num);
                return s && s.tipo !== 'Esfera';
            });
            if (noEsferas.length === 0) {
                ctx.log(`"${ctx.spec.nombre}": el rival no tiene personajes (no esferas) en mano.`);
                return;
            }
            const descartados = [];
            noEsferas.forEach(num => {
                const idx = oponente.mano.indexOf(num);
                if (idx >= 0) {
                    descartados.push(oponente.mano.splice(idx, 1)[0]);
                }
            });
            oponente.descarte.push(...descartados);
            ctx.log(`"${ctx.spec.nombre}": se descartaron ${descartados.length} personajes de la mano rival.`);
        },

        // Carta 150: CUIDADO
        CUIDADO: (estado, ctx) => {
            estado._cuidadoActivo = true;
            ctx.log(`"${ctx.spec.nombre}": todos los ataques del rival se reducen a la mitad este turno.`);
        },

        // Carta 152: CORRE_GOKU_CORRE
        CORRE_GOKU_CORRE: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            const specOf = ctx.engine.specOf;
            const idx = j.descarte.findIndex(num => {
                const s = specOf(num);
                return s && s.nombre && s.nombre.toUpperCase().includes('GOKU');
            });
            if (idx >= 0) {
                const [num] = j.descarte.splice(idx, 1);
                j.mazo.push(num);
                for (let i = j.mazo.length - 1; i > 0; i--) {
                    const k = Math.floor(Math.random() * (i + 1));
                    [j.mazo[i], j.mazo[k]] = [j.mazo[k], j.mazo[i]];
                }
                ctx.log(`"${ctx.spec.nombre}": devolviste una carta de Goku del cementerio a tu mazo.`);
            } else {
                ctx.log(`"${ctx.spec.nombre}": no hay cartas de Goku en tu cementerio.`);
            }
        },

        // Carta 153/154: GUARDIAN_INFIERNO
        GUARDIAN_INFIERNO: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            const guardianes = j.campoAtaque.filter(e => {
                const s = ctx.engine.specOf(e.ataqueNum);
                return s && (s.numero === 153 || s.numero === 154);
            });
            if (guardianes.length >= 2) {
                j.bonusTurno.rivalNoPuedeDefenderse = true;
                ctx.log(`"${ctx.spec.nombre}": los dos guardianes atacan juntos → el rival no puede bloquear.`);
            } else {
                ctx.log(`"${ctx.spec.nombre}" jugado. Necesitas los dos guardianes para que el rival no pueda bloquear.`);
            }
        },

        // Carta 155: LA_FRUTA_PROHIBIDA
        LA_FRUTA_PROHIBIDA: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            const specOf = ctx.engine.specOf;
            const hayGuardián = j.campoAtaque.some(e => {
                const s = specOf(e.ataqueNum);
                return s && (s.numero === 153 || s.numero === 154);
            });
            if (hayGuardián) {
                const antes = j.energia;
                j.energia = j.energiaMax;
                ctx.log(`"${ctx.spec.nombre}": con Guardián en mesa, recuperaste toda tu energía (${j.energia - antes} pts).`);
            } else {
                ctx.curar(50);
                ctx.log(`"${ctx.spec.nombre}": sin Guardián, recuperaste 50 pts.`);
            }
        },

        // Carta 156: DESCANSA_UN_RATO
        DESCANSA_UN_RATO: (estado, ctx) => {
            estado[ctx.jugadorId].bonusTurno.rivalNoPuedeAtacarProximoTurno = true;
            ctx.log(`${ctx.spec.nombre}: ¡tu rival no podrá atacar en su próximo turno!`);
        },

        // Carta 157/158/... (POR_DEFECTO)

        // Carta 161: EL PODER DE GOHAN (efecto en totalDeEntrada)

        // Carta 163: PICCOLO VS PICCOLO (efecto en totalDeEntrada)

        // Carta 165: EL_PEQUENO_GOKU
        EL_PEQUENO_GOKU: (estado, ctx) => {
            const oponente = estado[ctx.oponenteId];
            const specOf = ctx.engine.specOf;
            const esferas = [];
            for (let i = oponente.mano.length - 1; i >= 0 && esferas.length < 3; i--) {
                const s = specOf(oponente.mano[i]);
                if (s && s.tipo === 'Esfera') {
                    esferas.push(oponente.mano.splice(i, 1)[0]);
                }
            }
            if (esferas.length > 0) {
                oponente.mazo.push(...esferas);
                for (let i = oponente.mazo.length - 1; i > 0; i--) {
                    const k = Math.floor(Math.random() * (i + 1));
                    [oponente.mazo[i], oponente.mazo[k]] = [oponente.mazo[k], oponente.mazo[i]];
                }
                ctx.log(`"${ctx.spec.nombre}": enviaste ${esferas.length} esfera(s) al mazo rival y lo mezclaste.`);
            } else {
                ctx.log(`"${ctx.spec.nombre}": el rival no tiene esferas en mano.`);
            }
        },

        // Carta 168: LA_TIERRA_SE_MUEVE
        LA_TIERRA_SE_MUEVE: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            if (j.cartasJugadasEsteTurno.length > 0) {
                ctx.log(`"${ctx.spec.nombre}": solo puede usarse al principio del turno (antes de jugar otras cartas).`);
                return;
            }
            const manoActual = [...j.mano];
            j.mano = [];
            j.mazo.push(...manoActual);
            for (let i = j.mazo.length - 1; i > 0; i--) {
                const k = Math.floor(Math.random() * (i + 1));
                [j.mazo[i], j.mazo[k]] = [j.mazo[k], j.mazo[i]];
            }
            const robadas = Math.min(7, j.mazo.length);
            for (let i = 0; i < robadas; i++) {
                j.mano.push(j.mazo.pop());
            }
            ctx.log(`"${ctx.spec.nombre}": devolviste ${manoActual.length} cartas al mazo, mezclaste y robaste ${robadas}.`);
        },

        // Carta 169: LA_CHANCE_DE_CELL (ya definido)

        // Carta 174: RECUPERAR_150 (ya definido)

        // Carta 175: MULTIPLICAR_OBJETIVO_X2_X2 (ya definido)

        // Carta 176: QUE_ES_ESTO
        QUE_ES_ESTO: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            const max = j.mano.length;
            if (max === 0) {
                ctx.log(`"${ctx.spec.nombre}": no tienes cartas en mano para descartar.`);
                return;
            }
            let cantidad = parseInt(prompt(`¿Cuántas cartas quieres descartar? (máx ${max})`, "0"));
            if (isNaN(cantidad) || cantidad < 0) cantidad = 0;
            if (cantidad > max) cantidad = max;
            if (cantidad === 0) {
                ctx.log(`"${ctx.spec.nombre}": no descartaste ninguna carta.`);
                return;
            }
            const descartadas = [];
            for (let i = 0; i < cantidad; i++) {
                descartadas.push(j.mano.shift());
            }
            j.descarte.push(...descartadas);
            const robadas = Math.min(cantidad, j.mazo.length);
            for (let i = 0; i < robadas; i++) {
                j.mano.push(j.mazo.pop());
            }
            ctx.log(`"${ctx.spec.nombre}": descartaste ${descartadas.length} y robaste ${robadas}.`);
        },

        // =============================================================
        // CAJA 2 (177-265)
        // =============================================================

        // 178: NO_QUIERO_VER
        NO_QUIERO_VER: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            const nDesc = j.mano.length;
            if (nDesc > 0) {
                j.descarte.push(...j.mano);
                j.mano = [];
            }
            const nRoba = Math.min(7, j.mazo.length);
            for (let i = 0; i < nRoba; i++) {
                j.mano.push(j.mazo.pop());
            }
            estado.ataquesBloqueadosEsteTurno = true;
            ctx.log(`"${ctx.spec.nombre}": descartaste ${nDesc} cartas, robaste ${nRoba}. Tu turno termina aquí.`);
        },

        // 183: QUE_GRACIOSO (anula todos los ataques rival)
        QUE_GRACIOSO: (estado, ctx) => {
            const atacanteId = estado.turnoJugador === 1 ? 'j1' : 'j2';
            const atacante = estado[atacanteId];
            if (atacante.campoAtaque.length === 0) {
                ctx.log(`${ctx.spec.nombre}: el rival no tiene ataques en mesa.`);
                return;
            }
            atacante.campoAtaque.forEach(e => {
                atacante.descarte.push(e.ataqueNum);
                if (e.esferaNum) atacante.descarte.push(e.esferaNum);
                (e.modificadores || []).forEach(m => {
                    atacante.descarte.push(m.num);
                    if (m.esferaNum) atacante.descarte.push(m.esferaNum);
                });
            });
            atacante.campoAtaque = [];
            estado.ataquesBloqueadosEsteTurno = true;
            ctx.log(`${ctx.spec.nombre}: ¡todos los ataques del rival fueron anulados!`);
        },

        // 185: LEGADO_SAIYAJIN (se aplica en modificarAtaque)
        LEGADO_SAIYAJIN: (estado, ctx) => {
            ctx.log(`"${ctx.spec.nombre}": aplica x1/x2 solo a saiyajins.`);
        },

        // 186: CAPSULA_SAIYAJIN
        CAPSULA_SAIYAJIN: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            const specOf = ctx.engine.specOf;
            let encontrado = false;
            const nuevoMazo = [];
            for (const num of j.mazo) {
                const s = specOf(num);
                if (!encontrado && s && esSaiyajin(s.nombre)) {
                    j.mano.push(num);
                    encontrado = true;
                } else {
                    nuevoMazo.push(num);
                }
            }
            j.mazo = nuevoMazo;
            if (encontrado) {
                ctx.log(`"${ctx.spec.nombre}": buscaste un saiyajin en tu mazo y lo añadiste a tu mano.`);
            } else {
                ctx.log(`"${ctx.spec.nombre}": no encontraste saiyajins en tu mazo.`);
            }
            if (j.mano.length > 0) {
                const idx = parseInt(prompt(`Elige una carta para descartar (0-${j.mano.length-1}):`, "0"));
                if (!isNaN(idx) && idx >= 0 && idx < j.mano.length) {
                    const [num] = j.mano.splice(idx, 1);
                    j.descarte.push(num);
                    ctx.log(`"${ctx.spec.nombre}": descartaste la carta #${num}.`);
                } else {
                    ctx.log(`"${ctx.spec.nombre}": no descartaste ninguna carta.`);
                }
            } else {
                ctx.log(`"${ctx.spec.nombre}": no tienes cartas en mano para descartar.`);
            }
        },

        // 188: MARTILLO_KAIO (se aplica en modificarAtaque)
        MARTILLO_KAIO: (estado, ctx) => {
            ctx.log(`"${ctx.spec.nombre}": aplica +0+50 a un ataque.`);
        },

        // 189/190: DEVOLVER_ATAQUE (ya definido)

        // 191: EL_DESEO_DE_OOLONG
        EL_DESEO_DE_OOLONG: (estado, ctx) => {
            const atacanteId = estado.turnoJugador === 1 ? 'j1' : 'j2';
            const atacante = estado[atacanteId];
            atacante.campoAtaque.forEach(e => {
                atacante.mano.push(e.ataqueNum);
                if (e.esferaNum) atacante.mano.push(e.esferaNum);
                (e.modificadores || []).forEach(m => {
                    atacante.descarte.push(m.num);
                    if (m.esferaNum) atacante.descarte.push(m.esferaNum);
                });
            });
            atacante.campoAtaque = [];
            estado.ataquesBloqueadosEsteTurno = true;
            ctx.log(`${ctx.spec.nombre}: los ataques del rival volvieron a su mano. No puede atacar más este turno.`);
        },

        // 192: LUNA_LLENA (se aplica en modificarAtaque)
        LUNA_LLENA: (estado, ctx) => {
            ctx.log(`"${ctx.spec.nombre}": aplica +20+40 a un saiyajin (no Ohzaru).`);
        },

        // 193: MODIFICAR_OBJETIVO_30_30 (ya definido)

        // 194: POR_POCO
        POR_POCO: (estado, ctx) => {
            estado.bloqueoAtaquePendiente = true;
            ctx.log(`"${ctx.spec.nombre}": esquivas el próximo ataque de energía.`);
        },

        // 195: DIENTES_ACERO (combo con TROPEZON)
        DIENTES_ACERO: (estado, ctx) => {
            ctx.log(`"${ctx.spec.nombre}": si se usa junto a TROPEZON, el daño se duplica.`);
        },

        // 197: TIEMPO_FUERA
        TIEMPO_FUERA: (estado, ctx) => {
            estado.ataquesBloqueadosEsteTurno = true;
            ctx.log(`"${ctx.spec.nombre}": tu rival no puede realizar más ataques este turno.`);
        },

        // 198: SIN_DEFENSA_RIVAL (ya definido)

        // =============================================================
        // CAJA 2 (201-248)
        // =============================================================

        // 201: UN_MOMENTO
        UN_MOMENTO: (estado, ctx) => {
            const rivalId = ctx.oponenteId;
            const rival = estado[rivalId];
            if (rival.campoAtaque.length > 1) {
                const aDevolver = rival.campoAtaque.slice(1);
                aDevolver.forEach(entrada => {
                    rival.mano.push(entrada.ataqueNum);
                    if (entrada.esferaNum) rival.mano.push(entrada.esferaNum);
                    (entrada.modificadores || []).forEach(m => {
                        rival.mano.push(m.num);
                        if (m.esferaNum) rival.mano.push(m.esferaNum);
                    });
                });
                rival.campoAtaque = rival.campoAtaque.slice(0, 1);
                ctx.log(`"${ctx.spec.nombre}": ${aDevolver.length} ataque(s) del rival volvieron a su mano.`);
            } else {
                ctx.log(`"${ctx.spec.nombre}": el rival tiene 1 o ningún ataque, sin efecto.`);
            }
        },

        // 202: BUSCANDO_ESFERAS (ya definido más abajo, pero lo dejamos aquí)

        // 205: MOSTRAR_MANO_RIVAL (ya definido)

        // 211: DEFENSA_RIVAL_MITAD (ya definido)

        // 214: KRILLIN_POTENCIADO (se aplica en modificarAtaque)
        KRILLIN_POTENCIADO: (estado, ctx) => {
            ctx.log(`"${ctx.spec.nombre}": +20+40 a una carta de Krillin.`);
        },

        // 218: DEFENSA_RIVAL_MITAD (ya definido)

        // 219: RECARGA (ya definido)

        // 220: ATAQUE_COMBINADO_DEFENSAS (se activa en declararAtaque)
        ATAQUE_COMBINADO_DEFENSAS: (estado, ctx) => {
            ctx.log(`"${ctx.spec.nombre}": si hay 2 ataques, defensas rival mitad.`);
        },

        // 222: DUDA
        DUDA: (estado, ctx) => {
            estado._dudaActiva = true;
            ctx.log(`"${ctx.spec.nombre}": los ataques de Piccolo se reducen a la mitad.`);
        },

        // 224: RECARGA (ya definido)

        // 227: EL_REGRESO_DE_GOKU
        EL_REGRESO_DE_GOKU: (estado, ctx) => {
            const oponente = estado[ctx.oponenteId];
            const primeras = oponente.mazo.slice(-10).reverse();
            if (primeras.length === 0) {
                ctx.log(`"${ctx.spec.nombre}": el mazo rival no tiene 10 cartas.`);
                return;
            }
            const aDescartar = [];
            const copia = [...primeras];
            for (let i = 0; i < 2 && copia.length > 0; i++) {
                const idx = Math.floor(Math.random() * copia.length);
                const num = copia.splice(idx, 1)[0];
                aDescartar.push(num);
                const realIdx = oponente.mazo.indexOf(num);
                if (realIdx !== -1) {
                    oponente.mazo.splice(realIdx, 1);
                    oponente.descarte.push(num);
                }
            }
            ctx.log(`"${ctx.spec.nombre}": se descartaron ${aDescartar.length} cartas del mazo rival.`);
        },

        // 232: BOLA_ENERGIA
        BOLA_ENERGIA: (estado, ctx) => {
            const oponente = estado[ctx.oponenteId];
            if (oponente.mano.length === 0) {
                ctx.log(`"${ctx.spec.nombre}": el rival no tiene cartas en mano.`);
                return;
            }
            const cantidad = Math.min(3, oponente.mano.length);
            const indices = [];
            const copia = [...oponente.mano];
            for (let i = 0; i < cantidad; i++) {
                const idx = Math.floor(Math.random() * copia.length);
                const num = copia.splice(idx, 1)[0];
                const realIdx = oponente.mano.indexOf(num);
                if (realIdx !== -1) indices.push(realIdx);
            }
            indices.sort((a, b) => b - a);
            const descartadas = [];
            indices.forEach(idx => {
                descartadas.push(oponente.mano.splice(idx, 1)[0]);
            });
            oponente.descarte.push(...descartadas);
            ctx.log(`"${ctx.spec.nombre}": se descartaron ${descartadas.length} cartas de la mano rival al azar.`);
        },

        // 233: SEMILLA_ERMITANO
        SEMILLA_ERMITANO: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            const specOf = ctx.engine.specOf;
            const tieneKarin = j.campoAtaque.some(e => {
                const s = specOf(e.ataqueNum);
                return s && s.nombre && s.nombre.toUpperCase().includes('MAESTRO KARIN');
            }) || (j.campoDefensa && specOf(j.campoDefensa.defensaNum)?.nombre?.toUpperCase().includes('MAESTRO KARIN'));
            if (tieneKarin) {
                j.energia = j.energiaMax;
                ctx.log(`"${ctx.spec.nombre}": con MAESTRO KARIN, recuperaste toda tu energía.`);
            } else {
                ctx.curar(50);
                ctx.log(`"${ctx.spec.nombre}": sin MAESTRO KARIN, recuperaste 50 pts.`);
            }
        },

        // 235: URANAI_BABA
        URANAI_BABA: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            const primeras = j.mazo.slice(-10).reverse();
            ctx.log(`${ctx.spec.nombre}: las 10 primeras cartas de tu mazo son: ${primeras.map(n => ctx.engine.specOf(n)?.nombre || '#'+n).join(', ')}. Reordénalas a gusto.`);
        },

        // 236: INVESTIGANDO
        INVESTIGANDO: (estado, ctx) => {
            ctx.mostrarManoRival = true;
            const riv = estado[ctx.oponenteId];
            const indices = [];
            const copia = [...riv.mano];
            for (let i = 0; i < 2 && copia.length > 0; i++) {
                const idx = Math.floor(Math.random() * copia.length);
                const num = copia.splice(idx, 1)[0];
                const realIdx = riv.mano.indexOf(num);
                if (realIdx >= 0) {
                    indices.push(realIdx);
                    riv.mano.splice(realIdx, 1);
                }
            }
            indices.sort((a, b) => b - a);
            indices.forEach(i => {});
            for (let i = 0; i < 2 && riv.mazo.length > 0; i++) {
                riv.mano.push(riv.mazo.pop());
            }
            ctx.log(`${ctx.spec.nombre}: viste la mano rival, descartaste 2 cartas y el rival robó 2 nuevas.`);
        },

        // 240: RECUPERAR_DEL_DESCARTE (ya definido)

        // 241: VOLAR
        VOLAR: (estado, ctx) => {
            estado._volarActivo = true;
            ctx.log(`"${ctx.spec.nombre}": tus ataques no pueden ser bloqueados por defensas de menos de 80 pts.`);
        },

        // 242: DONDE_ESTA_GOKU?
        DONDE_ESTA_GOKU: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            const specOf = ctx.engine.specOf;
            let encontrado = false;
            const nuevoMazo = [];
            for (const num of j.mazo) {
                const s = specOf(num);
                if (!encontrado && s && s.nombre && s.nombre.toUpperCase().includes('GOKU')) {
                    j.mano.push(num);
                    encontrado = true;
                } else {
                    nuevoMazo.push(num);
                }
            }
            j.mazo = nuevoMazo;
            if (encontrado) {
                ctx.log(`"${ctx.spec.nombre}": encontraste una carta de Goku en tu mazo.`);
            } else {
                ctx.log(`"${ctx.spec.nombre}": no hay cartas de Goku en tu mazo.`);
            }
        },

        // 243: CHAU_NAPPA
        CHAU_NAPPA: (estado, ctx) => {
            const oponente = estado[ctx.oponenteId];
            const specOf = ctx.engine.specOf;
            let encontrado = false;
            const nuevoMazo = [];
            for (const num of oponente.mazo) {
                const s = specOf(num);
                if (!encontrado && s && s.nombre && s.nombre.toUpperCase().includes('NAPPA')) {
                    oponente.descarte.push(num);
                    encontrado = true;
                } else {
                    nuevoMazo.push(num);
                }
            }
            oponente.mazo = nuevoMazo;
            if (encontrado) {
                ctx.log(`"${ctx.spec.nombre}": se descartó una carta de Nappa del mazo rival.`);
            } else {
                ctx.log(`"${ctx.spec.nombre}": no hay cartas de Nappa en el mazo rival.`);
            }
        },

        // 244: MIEDO
        MIEDO: (estado, ctx) => {
            const oponente = estado[ctx.oponenteId];
            if (oponente.campoDefensa) {
                oponente.descarte.push(oponente.campoDefensa.defensaNum);
                if (oponente.campoDefensa.esferaNum) oponente.descarte.push(oponente.campoDefensa.esferaNum);
                (oponente.campoDefensa.modificadores || []).forEach(m => {
                    oponente.descarte.push(m.num);
                    if (m.esferaNum) oponente.descarte.push(m.esferaNum);
                });
                oponente.campoDefensa = null;
                ctx.log(`"${ctx.spec.nombre}": se anuló la defensa del rival.`);
            } else {
                ctx.log(`"${ctx.spec.nombre}": el rival no tiene defensa preparada.`);
            }
        },

        // 245: ALTO_AHI
        ALTO_AHI: (estado, ctx) => {
            const j1 = estado.j1;
            const j2 = estado.j2;
            const mazoComun = [];
            [j1, j2].forEach(j => {
                mazoComun.push(...j.mano);
                mazoComun.push(...j.mazo);
                mazoComun.push(...j.descarte);
                j.mano = [];
                j.mazo = [];
                j.descarte = [];
            });
            for (let i = mazoComun.length - 1; i > 0; i--) {
                const k = Math.floor(Math.random() * (i + 1));
                [mazoComun[i], mazoComun[k]] = [mazoComun[k], mazoComun[i]];
            }
            [j1, j2].forEach(j => {
                for (let i = 0; i < 7 && mazoComun.length > 0; i++) {
                    j.mano.push(mazoComun.pop());
                }
                j.mazo = [...mazoComun];
                mazoComun.length = 0;
            });
            ctx.log(`"${ctx.spec.nombre}": ambos jugadores reiniciaron sus manos y mazos.`);
        },

        // 247: MODIFICAR_OBJETIVO_30_30 (ya definido)
        // 248: MULTIPLICAR_OBJETIVO_X2_X2 (ya definido)

        // 249: TRIPLE KAIOKEN (ya definido como MULTIPLICAR_OBJETIVO_X3_X3)
        // 251: DEVOLVER_ATAQUE (ya definido)
        // 253: CUADRUPLE KAIOKEN (ya definido como MULTIPLICAR_OBJETIVO_X4_X4)
        // 255: RIVAL_NO_PUEDE_ATACAR (ya definido)
        // 258: DETENER_ENERGIA
        DETENER_ENERGIA: (estado, ctx) => {
            estado._detenerEnergiaActivo = true;
            ctx.log(`"${ctx.spec.nombre}": el próximo ataque de energía se reduce a la mitad.`);
        },
        // 259: RIVAL_NO_PUEDE_ATACAR (ya definido)
        // 260: BURLA
        BURLA: (estado, ctx) => {
            estado._burlaActiva = true;
            ctx.log(`"${ctx.spec.nombre}": todos los ataques de energía quedan anulados este turno.`);
        },
        // 261: MILK_AL_RESCATE
        MILK_AL_RESCATE: (estado, ctx) => {
            ctx.mostrarManoRival = true;
            const oponente = estado[ctx.oponenteId];
            const specOf = ctx.engine.specOf;
            const nuevasMano = [];
            const descartadas = [];
            for (const num of oponente.mano) {
                const s = specOf(num);
                if (s && (s.nombre.toUpperCase().includes('GOKU') || s.nombre.toUpperCase().includes('GOHAN'))) {
                    descartadas.push(num);
                } else {
                    nuevasMano.push(num);
                }
            }
            oponente.mano = nuevasMano;
            oponente.mazo.unshift(...descartadas);
            for (let i = oponente.mazo.length - 1; i > 0; i--) {
                const k = Math.floor(Math.random() * (i + 1));
                [oponente.mazo[i], oponente.mazo[k]] = [oponente.mazo[k], oponente.mazo[i]];
            }
            ctx.log(`"${ctx.spec.nombre}": se enviaron ${descartadas.length} cartas de Goku/Gohan al fondo del mazo rival.`);
        },
        // 262/264: ANULAR_OHZARU
        ANULAR_OHZARU: (estado, ctx) => {
            const oponente = estado[ctx.oponenteId];
            const specOf = ctx.engine.specOf;
            let anulado = false;
            for (let i = 0; i < oponente.campoAtaque.length; i++) {
                const e = oponente.campoAtaque[i];
                const s = specOf(e.ataqueNum);
                if (s && s.nombre && s.nombre.toUpperCase().includes('OHZARU')) {
                    oponente.descarte.push(e.ataqueNum);
                    if (e.esferaNum) oponente.descarte.push(e.esferaNum);
                    (e.modificadores || []).forEach(m => {
                        oponente.descarte.push(m.num);
                        if (m.esferaNum) oponente.descarte.push(m.esferaNum);
                    });
                    oponente.campoAtaque.splice(i, 1);
                    anulado = true;
                    i--;
                }
            }
            if (oponente.campoDefensa) {
                const s = specOf(oponente.campoDefensa.defensaNum);
                if (s && s.nombre && s.nombre.toUpperCase().includes('OHZARU')) {
                    oponente.descarte.push(oponente.campoDefensa.defensaNum);
                    if (oponente.campoDefensa.esferaNum) oponente.descarte.push(oponente.campoDefensa.esferaNum);
                    (oponente.campoDefensa.modificadores || []).forEach(m => {
                        oponente.descarte.push(m.num);
                        if (m.esferaNum) oponente.descarte.push(m.esferaNum);
                    });
                    oponente.campoDefensa = null;
                    anulado = true;
                }
            }
            if (anulado) {
                ctx.log(`"${ctx.spec.nombre}": se anularon las cartas Ohzaru del rival.`);
            } else {
                ctx.log(`"${ctx.spec.nombre}": el rival no tiene Ohzaru en mesa.`);
            }
        },
        // 263: MULTIPLICAR_OBJETIVO_X2_X2 (ya definido)

        // =============================================================
        // CAJA 3 (266-313)
        // =============================================================

        // 266-272: ESFERAS (tipo Esfera, sin efecto)

        // 273: CAPSULA_DE_SALUD_TURNO
        CAPSULA_DE_SALUD_TURNO: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            if (j.energia >= j.energiaMax) { ctx.retirarPermanente(); return; }
            ctx.curar(50);
            if (j.energia >= j.energiaMax) ctx.retirarPermanente();
        },

        // 274: DESCARTAR_UNA_ESFERA_RIVAL (ya definido)
        // 275: ANULAR_SI_MENOR_IGUAL_80_V2 (ya definido)
        // 276: RIVAL_NO_PUEDE_ATACAR (ya definido)

        // 277: LA_TERRIBLE_MILK
        LA_TERRIBLE_MILK: (estado, ctx) => {
            const oponente = estado[ctx.oponenteId];
            const specOf = ctx.engine.specOf;
            const nuevasMano = [];
            const aFondoMazo = [];
            const aDescarte = [];
            for (const num of oponente.mano) {
                const s = specOf(num);
                if (s && (s.nombre.toUpperCase().includes('GOHAN') || s.nombre.toUpperCase().includes('GOTEN'))) {
                    aFondoMazo.push(num);
                } else {
                    nuevasMano.push(num);
                }
            }
            oponente.mano = nuevasMano;
            if (aFondoMazo.length > 0) {
                oponente.mazo.unshift(...aFondoMazo);
                for (let i = oponente.mazo.length - 1; i > 0; i--) {
                    const k = Math.floor(Math.random() * (i + 1));
                    [oponente.mazo[i], oponente.mazo[k]] = [oponente.mazo[k], oponente.mazo[i]];
                }
            }
            for (let i = 0; i < oponente.campoAtaque.length; i++) {
                const e = oponente.campoAtaque[i];
                const s = specOf(e.ataqueNum);
                if (s && (s.nombre.toUpperCase().includes('GOHAN') || s.nombre.toUpperCase().includes('GOTEN'))) {
                    oponente.descarte.push(e.ataqueNum);
                    if (e.esferaNum) oponente.descarte.push(e.esferaNum);
                    (e.modificadores || []).forEach(m => {
                        oponente.descarte.push(m.num);
                        if (m.esferaNum) oponente.descarte.push(m.esferaNum);
                    });
                    oponente.campoAtaque.splice(i, 1);
                    i--;
                }
            }
            ctx.log(`"${ctx.spec.nombre}": se anularon ataques de Gohan/Goten y se enviaron ${aFondoMazo.length} al fondo del mazo.`);
        },

        // 278: BUSCANDO_ESFERAS (definido abajo)

        // 279: DESTRUIR_PERMANENTE_RIVAL (ya definido)

        // 282: MERCENARIOS (efecto de multiplicador con combo)
        MERCENARIOS: (estado, ctx) => {
            ctx.log(`"${ctx.spec.nombre}" jugado con EXPLORADORES, se duplica.`);
        },

        // 283: CAMPO_PROTECTOR
        CAMPO_PROTECTOR: (estado, ctx) => {
            estado._campoProtectorActivo = -100;
            ctx.log(`"${ctx.spec.nombre}": los ataques del rival se reducen en 100 pts este turno.`);
        },

        // 284: DESCARTAR_AL_AZAR_RIVAL (ya definido)
        // 285: MOSTRAR_MANO_RIVAL (ya definido)
        // 286: MODIFICAR_OBJETIVO_30_30 (ya definido)

        // 288: DESTRUIR_INSTANTANEA
        DESTRUIR_INSTANTANEA: (estado, ctx) => {
            if (estado.bloqueoAtaquePendiente) {
                estado.bloqueoAtaquePendiente = false;
                ctx.log(`"${ctx.spec.nombre}": se anuló un bloqueo pendiente.`);
            } else if (estado.anulacionPendiente) {
                estado.anulacionPendiente = null;
                ctx.log(`"${ctx.spec.nombre}": se anuló una anulación pendiente.`);
            } else {
                ctx.log(`"${ctx.spec.nombre}": no hay instantáneas pendientes para anular.`);
            }
        },

        // 291: MULTIPLICACION (ya definido)
        // 292: CAMBIO_DE_ESFERA
        CAMBIO_DE_ESFERA: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            const specOf = ctx.engine.specOf;
            const idxEsfera = j.mano.findIndex(num => {
                const s = specOf(num);
                return s && s.tipo === 'Esfera';
            });
            if (idxEsfera === -1) {
                ctx.log(`"${ctx.spec.nombre}": no tienes esferas en mano para descartar.`);
                return;
            }
            const [esferaDesc] = j.mano.splice(idxEsfera, 1);
            j.descarte.push(esferaDesc);
            let encontrada = false;
            const nuevoMazo = [];
            for (const num of j.mazo) {
                const s = specOf(num);
                if (!encontrada && s && s.tipo === 'Esfera') {
                    j.mano.push(num);
                    encontrada = true;
                } else {
                    nuevoMazo.push(num);
                }
            }
            j.mazo = nuevoMazo;
            if (encontrada) {
                ctx.log(`"${ctx.spec.nombre}": descartaste una esfera y encontraste otra en tu mazo.`);
            } else {
                ctx.log(`"${ctx.spec.nombre}": descartaste una esfera pero no hay esferas en tu mazo.`);
            }
        },

        // 296: ANULAR_SI_MENOR_IGUAL_100 (ya definido)
        // 298: ANULAR_SI_MENOR_80 (ya definido)
        // 299: RIVAL_NO_PUEDE_ATACAR (ya definido)

        // 303: SUPER_VELOCIDAD_INST
        SUPER_VELOCIDAD_INST: (estado, ctx) => {
            estado.anulacionPendiente = { umbral: 100, incluyeIgual: true };
            estado._superVelocidadActivo = true;
            ctx.log(`"${ctx.spec.nombre}": el próximo ataque de hasta 100 pts se anula y puedes contraatacar.`);
        },

        // 304: CODAZO_SORPRESIVO (se aplica en modificarAtaque)
        CODAZO_SORPRESIVO: (estado, ctx) => {
            ctx.log(`"${ctx.spec.nombre}" jugado con SUPER VELOCIDAD, se multiplica x1/x2.`);
        },

        // 305: METAMORFOSIS
        METAMORFOSIS: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            const specOf = ctx.engine.specOf;
            const entrada = j.campoAtaque.find(e => {
                const s = specOf(e.ataqueNum);
                return s && s.numero === 290;
            });
            if (entrada) {
                entrada._multAtk = (entrada._multAtk || 1) * 2;
                entrada._multDef = (entrada._multDef || 1) * 2;
                ctx.log(`"${ctx.spec.nombre}": ZARBON multiplicado x2/x2.`);
            } else {
                ctx.log(`"${ctx.spec.nombre}": no tienes ZARBON en el campo para modificar.`);
            }
        },

        // 306: HUMILLANDO (ya definido)

        // 308: GRAN_PATRIARCA_TURNO (permanente)
        GRAN_PATRIARCA_TURNO: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            if (j.campoAtaque.length > 0) {
                j.campoAtaque.forEach(e => {
                    e._bonusInstantAtk = (e._bonusInstantAtk || 0) + 20;
                    e._bonusInstantDef = (e._bonusInstantDef || 0) + 20;
                });
                ctx.log(`EL GRAN PATRIARCA (permanente): +20/+20 a todos los ataques en mesa.`);
            }
        },

        // 312: SUPER_REMATE
        SUPER_REMATE: (estado, ctx) => {
            const oponente = estado[ctx.oponenteId];
            const specOf = ctx.engine.specOf;
            let eliminados = 0;
            for (let i = 0; i < oponente.campoAtaque.length; i++) {
                const e = oponente.campoAtaque[i];
                const s = specOf(e.ataqueNum);
                if (s && (s.numero === 289 || s.numero === 290)) {
                    oponente.descarte.push(e.ataqueNum);
                    if (e.esferaNum) oponente.descarte.push(e.esferaNum);
                    (e.modificadores || []).forEach(m => {
                        oponente.descarte.push(m.num);
                        if (m.esferaNum) oponente.descarte.push(m.esferaNum);
                    });
                    oponente.campoAtaque.splice(i, 1);
                    eliminados++;
                    i--;
                }
            }
            if (oponente.campoDefensa) {
                const s = specOf(oponente.campoDefensa.defensaNum);
                if (s && (s.numero === 289 || s.numero === 290)) {
                    oponente.descarte.push(oponente.campoDefensa.defensaNum);
                    if (oponente.campoDefensa.esferaNum) oponente.descarte.push(oponente.campoDefensa.esferaNum);
                    (oponente.campoDefensa.modificadores || []).forEach(m => {
                        oponente.descarte.push(m.num);
                        if (m.esferaNum) oponente.descarte.push(m.esferaNum);
                    });
                    oponente.campoDefensa = null;
                    eliminados++;
                }
            }
            ctx.log(`"${ctx.spec.nombre}": se eliminaron ${eliminados} carta(s) de Dodoria/Zarbon del campo rival.`);
        },

        // 313: EMBOSCADA
        EMBOSCADA: (estado, ctx) => {
            const oponente = estado[ctx.oponenteId];
            const specOf = ctx.engine.specOf;
            const esferas = oponente.mano.filter(num => {
                const s = specOf(num);
                return s && s.tipo === 'Esfera';
            });
            if (esferas.length > 0) {
                esferas.forEach(num => {
                    const idx = oponente.mano.indexOf(num);
                    if (idx !== -1) {
                        oponente.mano.splice(idx, 1);
                        oponente.mazo.push(num);
                    }
                });
                for (let i = oponente.mazo.length - 1; i > 0; i--) {
                    const k = Math.floor(Math.random() * (i + 1));
                    [oponente.mazo[i], oponente.mazo[k]] = [oponente.mazo[k], oponente.mazo[i]];
                }
                ctx.log(`"${ctx.spec.nombre}": se enviaron ${esferas.length} esferas de la mano rival al mazo.`);
            } else {
                ctx.log(`"${ctx.spec.nombre}": el rival no tiene esferas en mano.`);
            }
        },

        // =============================================================
        // EFECTOS DE PERMANENTES VARIOS
        // =============================================================

        CINTURON_DE_CAMPEONES: (estado, ctx) => {
            ctx.log(`${ctx.spec.nombre}: ahora podés tener 8 cartas en mano mientras esté en mesa.`);
        },
        CINTURON_DE_CAMPEONES_TURNO: (estado, ctx) => {
            estado[ctx.jugadorId].condiciones.limiteMano = 8;
            ctx.log(`${ctx.spec.nombre} (permanente): límite de mano = 8 este turno.`);
        },

        BURLA_DIABOLICA_TURNO: (estado, ctx) => {
            const rival = estado[ctx.jugadorId === 'j1' ? 'j2' : 'j1'];
            if (rival.campoAtaque.length > 0) {
                rival.campoAtaque[0]._bonusInstantDef = (rival.campoAtaque[0]._bonusInstantDef || 0) - 50;
                ctx.log(`BURLA DIABOLICA (permanente): -50 DEF aplicado al primer ataque rival.`);
            }
        },

        HORA_DESAYUNO_TURNO: (estado, ctx) => {
            ctx.curar(50);
            ctx.log(`HORA DE DESAYUNO: recuperaste 50 pts.`);
        },

        INTIMIDACION_TURNO: (estado, ctx) => {
            const rivalId = ctx.jugadorId === 'j1' ? 'j2' : 'j1';
            estado[rivalId].condiciones.bloqueadoPermanentes = true;
            ctx.log(`INTIMIDACION: el rival no puede bajar permanentes este turno.`);
        },

        ESO_ES_DEMASIADO_TURNO: (estado, ctx) => {
            estado._esoEsDemasiadoActivo = ctx.jugadorId;
            ctx.log(`ESO ES DEMASIADO: activo. Ataques de más de 200 pts forzarán descartar 2 cartas.`);
        },

        DEBILIDAD_TURNO: (estado, ctx) => {
            const rivalId = ctx.jugadorId === 'j1' ? 'j2' : 'j1';
            const rival = estado[rivalId];
            if (rival.campoAtaque.length > 0) {
                rival.campoAtaque[0]._debilidadActiva = true;
                ctx.log(`DEBILIDAD: la DEF del primer ataque rival quedará reducida a la mitad.`);
            }
        },

        PREPARADOS_LISTOS_TURNO: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            if (j.campoAtaque.length > 0) {
                j.campoAtaque.forEach(e => { e._bonusInstantDef = (e._bonusInstantDef || 0) + 50; });
                ctx.log(`PREPARADOS LISTOS: +50 DEF a cada ataque en mesa.`);
            }
        },

        // =============================================================
        // OTROS EFECTOS REUTILIZABLES
        // =============================================================

        PIZZA: (estado, ctx) => {
            estado[ctx.jugadorId]._pizzaActiva = true;
            ctx.log(`${ctx.spec.nombre}: podés bajar ataques Mr. Satan sin esferas este turno.`);
        },

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

        WIN_COMBO_SATAN: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            const necesarias = [622, 623, 625];
            const idxs = necesarias.map(n => j.mano.indexOf(n));
            const tieneTodasEnMano = idxs.every(i => i >= 0);
            if (tieneTodasEnMano) {
                idxs.sort((a, b) => b - a).forEach(i => j.descarte.push(j.mano.splice(i, 1)[0]));
                estado.ganador = estado.turnoJugador;
                ctx.log(`¡¡¡ COMBO MR. SATAN !!! Jugador ${estado.turnoJugador} baja YA LO HICE + SATAN LO HIZO + SALVADOS + SOY EL MEJOR y GANA LA PARTIDA.`);
            } else {
                const faltantes = necesarias.filter((n, i) => idxs[i] < 0).join(', ');
                ctx.log(`${ctx.spec.nombre}: faltan cartas en mano: #${faltantes}. Necesitás las 4 para ganar.`);
            }
        },

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

        PIDE_UN_DESEO: (estado, ctx) => {
            const propio = estado[ctx.jugadorId];
            if (propio.descarte.length > 0) {
                propio.mano.push(propio.descarte.pop());
                ctx.log(`${ctx.spec.nombre}: recuperaste 1 carta del cementerio. Bajá más esferas para recuperar más.`);
            } else {
                ctx.log(`${ctx.spec.nombre}: el cementerio está vacío.`);
            }
        },

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

        APERITIVO_GOKU: (estado, ctx) => {
            ctx.curar(100);
            ctx.log(`${ctx.spec.nombre}: recuperaste 100 pts. Bajá esferas extra para recuperar +50 c/u.`);
        },

        VICTORIA: (estado, ctx) => {
            estado[ctx.jugadorId]._victoriaActiva = true;
            estado.ataquesBloqueadosEsteTurno = true;
            ctx.log(`${ctx.spec.nombre}: no podés atacar. Si el rival no te daña, recuperarás 100 pts al inicio de tu turno.`);
        },

        LAS_REGLAS_DICEN: (estado, ctx) => {
            const atacanteId = estado.turnoJugador === 1 ? 'j1' : 'j2';
            const atacante = estado[atacanteId];
            atacante.campoAtaque.forEach(e => {
                atacante.mazo.push(e.ataqueNum);
                if (e.esferaNum) atacante.mazo.push(e.esferaNum);
                (e.modificadores || []).forEach(m => {
                    atacante.mazo.push(m.num);
                    if (m.esferaNum) atacante.mazo.push(m.esferaNum);
                });
            });
            atacante.campoAtaque = [];
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

        // =============================================================
        // EFECTOS DE CARTAS QUE FALTABAN POR COMPLETAR
        // =============================================================

        // BUSCANDO_ESFERAS (202 y 278)
        BUSCANDO_ESFERAS: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            const specOf = ctx.engine.specOf;
            let encontradas = 0;
            const nuevoMazo = [];
            for (const num of j.mazo) {
                const s = specOf(num);
                if (encontradas < 3 && s && s.tipo === 'Esfera') {
                    j.mano.push(num);
                    encontradas++;
                } else {
                    nuevoMazo.push(num);
                }
            }
            j.mazo = nuevoMazo;
            for (let i = j.mazo.length - 1; i > 0; i--) {
                const k = Math.floor(Math.random() * (i + 1));
                [j.mazo[i], j.mazo[k]] = [j.mazo[k], j.mazo[i]];
            }
            while (j.mano.length > 7) {
                j.descarte.push(j.mano.shift());
            }
            ctx.log(`"${ctx.spec.nombre}": buscaste ${encontradas} esferas en tu mazo.`);
        },

        // GOLPE_FATAL (566)
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

        // CARA_A_CARA (570)
        CARA_A_CARA: (estado, ctx) => {
            estado[ctx.jugadorId].bonusTurno.caraACara = true;
            estado[ctx.oponenteId].bonusTurno.caraACara = true;
            ctx.log(`${ctx.spec.nombre}: este turno no se pueden usar modificadoras, instantáneas ni permanentes.`);
        },

        // QUITA_AIRE (573)
        QUITA_AIRE: (estado, ctx) => {
            estado[ctx.jugadorId].bonusTurno.rivalNoPuedeAtacarProximoTurno = true;
            ctx.log(`${ctx.spec.nombre}: tu rival no podrá atacar en su próximo turno.`);
        },

        // DOLOR_DE_PANZA (581)
        DOLOR_DE_PANZA: (estado, ctx) => {
            estado[ctx.jugadorId]._dolorDePanzaActivo = true;
            ctx.log(`${ctx.spec.nombre}: si tu rival no se defiende, recuperarás 300 pts en tu próximo turno.`);
        },

        // REMEDIO_DE_SATAN (582)
        REMEDIO_DE_SATAN: (estado, ctx) => {
            estado[ctx.jugadorId]._remedioSatan = true;
            estado[ctx.oponenteId]._dolorDePanzaActivo = false;
            ctx.log(`${ctx.spec.nombre}: si no atacás este turno, recuperarás 100 pts. Se quitó el Dolor de Panza del rival.`);
        },

        // ATAQUE_VELOZ (571)
        ATAQUE_VELOZ: (estado, ctx) => {
            ctx.log(`${ctx.spec.nombre}: ataque realizado en el turno del adversario.`);
        },

        // UN_MOMENTO (193 en caja2? ya definido)
        // TE_ARREPENTIRAS (610)
        TE_ARREPENTIRAS: (estado, ctx) => {
            const j = estado[ctx.jugadorId];
            const nDesc = Math.min(4, j.mano.length);
            for (let i = 0; i < nDesc; i++) j.descarte.push(j.mano.shift());
            const nRoba = Math.min(4, j.mazo.length);
            for (let i = 0; i < nRoba; i++) j.mano.push(j.mazo.pop());
            ctx.log(`${ctx.spec.nombre}: descartaste ${nDesc} y robaste ${nRoba} cartas.`);
        },

        // NO_TE_CONFIES (614)
        NO_TE_CONFIES: (estado, ctx) => {
            const rival = estado[ctx.oponenteId];
            const nDesc = Math.min(3, rival.mano.length);
            for (let i = 0; i < nDesc; i++) rival.descarte.push(rival.mano.shift());
            const nRoba = Math.min(3, rival.mazo.length);
            for (let i = 0; i < nRoba; i++) rival.mano.push(rival.mazo.pop());
            ctx.log(`${ctx.spec.nombre}: rival descartó ${nDesc} y robó ${nRoba} cartas.`);
        },

        // MERIENDA (154? ya definido)
        MERIENDA: (estado, ctx) => {
            ctx.curar(50);
            estado.ataquesBloqueadosEsteTurno = true;
            ctx.log(`${ctx.spec.nombre}: recuperaste 50 pts. No podés realizar otra acción este turno.`);
        },

        // CAMBIO_DE_CUERPO (ya definido)
        CAMBIO_DE_CUERPO: (estado, ctx) => {
            const jug = estado[ctx.jugadorId];
            const riv = estado[ctx.oponenteId];
            [jug.mano, riv.mano] = [riv.mano, jug.mano];
            ctx.log(`${ctx.spec.nombre}: ¡intercambiaste tu mano completa con la del rival!`);
        },

        // LA_RANA (ya definido)
        LA_RANA: (estado, ctx) => {
            estado.bloqueoAtaquePendiente = true;
            ctx.log(`${ctx.spec.nombre}: el próximo ataque del rival queda reducido a 0 pts.`);
        },

        // AMBOS_DESCARTAN_ESFERAS (351)
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
        }
    };

    // ----------------------------------------------------------------------
    // FUNCIONES DE CONSTRUCCIÓN DE ESTADO Y AUXILIARES
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
                caraACara: false,
                rivalNoPuedeAtacarProximoTurno: false,
            },
            condiciones: {
                limiteMano: 7,
                bloqueadoPermanentes: false,
            },
            cartasJugadasEsteTurno: [],
            _pizzaActiva: false,
            _proximoAtaqueSinEsfera: false,
            _victoriaActiva: false,
            _dolorDePanzaActivo: false,
            _remedioSatan: false,
            _multiplicacionActiva: false,
            _recibioDanioTurnoAnterior: false,
            _seDefendioTurnoAnterior: false,
            _ataqueCombinadoDefensas: false,
            _saibamanActivo: false,
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
            faseTurno: "inicio",
            historial: [],
            ganador: null,
            bajoCartaEsteTurno: false,
            ataquesBloqueadosEsteTurno: false,
            bloqueoAtaquePendiente: false,
            anulacionPendiente: null,
            _ataqueNoBloqueableActivo: false,
            _esoEsDemasiadoActivo: null,
            _devolverEsferaAlBloquear: false,
            _pendienteDescarte: null,
            _cuidadoActivo: false,
            _escudoDeVaporActivo: false,
            _venganzaActiva: false,
            _dudaActiva: false,
            _volarActivo: false,
            _detenerEnergiaActivo: false,
            _burlaActivo: false,
            _campoProtectorActivo: 0,
            _superVelocidadActivo: false,
        };
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
    // HELPERS
    // ----------------------------------------------------------------------
    function idJugador(estado, n) { return n === 1 ? "j1" : "j2"; }
    function idRival(n) { return n === 1 ? "j2" : "j1"; }
    function jugadorActivo(estado) { return estado[idJugador(estado, estado.turnoJugador)]; }
    function jugadorRival(estado) { return estado[idRival(estado.turnoJugador)]; }

    function puedeJugarseEsteTurno(jugador, numero, spec) {
        if (spec.tipo === TIPOS.ESFERA) return true;
        return !jugador.cartasJugadasEsteTurno.includes(numero);
    }

    function tieneEsferaDisponibleEnMano(jugador, esferaNumNecesario, poolPorNumero, excluir = []) {
        const idx = jugador.mano.findIndex((num, i) => {
            if (excluir.includes(i)) return false;
            const s = poolPorNumero.get(num);
            return s && s.tipo === TIPOS.ESFERA && esferaValor(s, poolPorNumero) === esferaNumNecesario;
        });
        return idx;
    }

    const _esferaValorCache = new Map();
    function esferaValor(spec, poolPorNumero) {
        if (_esferaValorCache.has(spec.numero)) return _esferaValorCache.get(spec.numero);
        const match = spec.nombre && spec.nombre.match(/(\d+)\s*$/);
        let valor;
        if (match) {
            valor = parseInt(match[1], 10);
        } else {
            const todasEsferas = [...poolPorNumero.values()]
                .filter(c => c.tipo === TIPOS.ESFERA)
                .sort((a, b) => a.numero - b.numero);
            valor = todasEsferas.findIndex(c => c.numero === spec.numero) + 1;
        }
        _esferaValorCache.set(spec.numero, valor);
        return valor;
    }

    // ----------------------------------------------------------------------
    // VALIDACIÓN DE MAZOS
    // ----------------------------------------------------------------------
    function validarMazo(mazoNumeros, poolPorNumero) {
        if (mazoNumeros.length < 40) {
            return { ok: false, error: `El mazo necesita al menos 40 cartas (tiene ${mazoNumeros.length}).` };
        }
        const conteo = {};
        for (const num of mazoNumeros) {
            conteo[num] = (conteo[num] || 0) + 1;
        }
        for (const [num, cant] of Object.entries(conteo)) {
            const spec = poolPorNumero.get(parseInt(num));
            if (spec && spec.maxCopias && cant > spec.maxCopias) {
                return { ok: false, error: `La carta "${spec.nombre}" (#${num}) solo puede tener ${spec.maxCopias} copias en el mazo.` };
            }
            if (spec && spec.tipo !== TIPOS.ESFERA && cant > 1) {
                return { ok: false, error: `La carta "${spec.nombre}" (#${num}) no puede repetirse más de una vez en el mazo.` };
            }
        }
        return { ok: true };
    }

    // ----------------------------------------------------------------------
    // FASE DE ROBO
    // ----------------------------------------------------------------------
    function faseRobo(estado) {
        estado._cuidadoActivo = false;
        estado._escudoDeVaporActivo = false;
        estado._venganzaActiva = false;
        estado.bloqueoAtaquePendiente = false;
        estado.anulacionPendiente = null;
        estado._dudaActiva = false;
        estado._volarActivo = false;
        estado._detenerEnergiaActivo = false;
        estado._burlaActivo = false;
        estado._campoProtectorActivo = 0;
        estado._superVelocidadActivo = false;
        estado._reflejarAtaqueActivo = false;
        estado._retenerPersonajeV2Activo = false;
        estado._pacienciaActivo = false;
        estado._retencionActivo = false;
        estado._vegetaContraatacaActivo = false;
        estado._gritoDeBatallaActivo = 0;

        const jugadorId = idJugador(estado, estado.turnoJugador);
        const j = jugadorActivo(estado);
        const rival = jugadorRival(estado);

        if (rival.bonusTurno.rivalNoPuedeAtacarProximoTurno) {
            estado.ataquesBloqueadosEsteTurno = true;
            rival.bonusTurno.rivalNoPuedeAtacarProximoTurno = false;
            log(estado, `Jugador ${estado.turnoJugador} no puede realizar ataques este turno.`);
        } else {
            estado.ataquesBloqueadosEsteTurno = false;
        }

        if (j._victoriaActiva) {
            j._victoriaActiva = false;
            if (!j._recibioDanioTurnoAnterior) {
                const antes = j.energia;
                j.energia = Math.min(j.energiaMax, j.energia + 100);
                log(estado, `VICTORIA: el rival no te dañó, recuperaste ${j.energia - antes} pts.`);
            }
        }
        j._recibioDanioTurnoAnterior = false;

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

        j.condiciones.limiteMano = 7;
        j.condiciones.bloqueadoPermanentes = false;
        procesarPermanentes(estado, jugadorId);

        while (j.mano.length < j.condiciones.limiteMano && j.mazo.length > 0) {
            j.mano.push(j.mazo.pop());
        }
        if (j.mazo.length === 0 && j.mano.length < j.condiciones.limiteMano) {
            if (j.descarte.length > 0) {
                j.mazo = shuffle([...j.descarte]);
                j.descarte = [];
                log(estado, `Jugador ${estado.turnoJugador} recicló su pila de descarte.`);
                while (j.mano.length < j.condiciones.limiteMano && j.mazo.length > 0) j.mano.push(j.mazo.pop());
            }
        }
    }

    // ----------------------------------------------------------------------
    // DECLARAR ATAQUE
    // ----------------------------------------------------------------------
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
        if (estado.ataquesBloqueadosEsteTurno) return { ok: false, error: "No podés atacar este turno." };

        // Validación de combo requerido
        if (spec.comboCon && spec.comboCon.length > 0) {
            const todasJugadas = spec.comboCon.every(num => j.cartasJugadasEsteTurno.includes(num));
            if (!todasJugadas) {
                return { ok: false, error: `Para jugar "${spec.nombre}" debes haber jugado antes: ${spec.comboCon.map(n => specOf(n)?.nombre || '#'+n).join(', ')}.` };
            }
        }

                // Validación para TIRON DE OREJAS (322) - puede usarse en turno rival
        if (spec.numero === 322) {
            // Verificar si se ha jugado PARALIZADO (321) en este turno
            const tieneParalizado = j.cartasJugadasEsteTurno.includes(321);
            if (!tieneParalizado) {
                return { ok: false, error: "TIRON DE OREJAS requiere que hayas jugado PARALIZADO antes." };
            }
            // Permitir jugar aunque no sea tu turno (flag)
            estado._tironDeOrejasActivo = true;
        }

        // Validación REMATE_SAIYAN
        if (spec.numero === 105) {
            const hayOtroAtaque = j.campoAtaque.length > 0;
            if (!hayOtroAtaque) {
                return { ok: false, error: "REMATE SAIYAN solo puede usarse combinado con otro ataque." };
            }
        }

        const esferaReq = spec.esferaNecesaria || 0;
        let idxEsfera = -1;
        let exento = false;

                // Exención por GRITO DE BATALLA (400)
        if (estado._gritoDeBatallaActivo > 0 && spec.tipo === "Ataque" && !spec.modificadora) {
            exento = true;
            estado._gritoDeBatallaActivo--;
            log(estado, `GRITO DE BATALLA: ataque sin esfera (quedan ${estado._gritoDeBatallaActivo}).`);
        }

        // Exención por SAIBAMAN activo
        if (j._saibamanActivo && spec.nombre && spec.nombre.toUpperCase().includes('SAIBAMAN')) {
            exento = true;
            // No consumimos el flag para que pueda usarse para múltiples Saibaman
            log(estado, `SAIBAMAN activo: puedes bajar "${spec.nombre}" sin esfera.`);
        }

        // Combo de esfera compartida
        if (esferaReq > 0) {
            const yaHayCombo = j.campoAtaque.some(e => {
                const otroSpec = specOf(e.ataqueNum);
                if (!otroSpec) return false;
                if (spec.esAndroide && otroSpec.esAndroide) return true;
                if (Array.isArray(spec.comboCon) && spec.comboCon.includes(otroSpec.numero)) return true;
                if (Array.isArray(otroSpec.comboCon) && otroSpec.comboCon.includes(spec.numero)) return true;
                return false;
            });
            if (yaHayCombo) {
                exento = true;
                log(estado, `"${spec.nombre}" comparte esfera con su combo ya bajado este turno.`);
            }
        }

        // Exención por PIZZA
        if (j._pizzaActiva && spec.nombre && spec.nombre.toUpperCase().includes('SATAN')) {
            exento = true;
            log(estado, `PIZZA activa: puedes bajar "${spec.nombre}" sin esfera.`);
        }

        // Exención por COMPARTIR_ESFERA_GRATIS
        if (j._proximoAtaqueSinEsfera) {
            exento = true;
            j._proximoAtaqueSinEsfera = false;
            log(estado, `COMPARTIR ESFERA: ataque sin esfera.`);
        }

        if (esferaReq > 0 && !exento) {
            idxEsfera = tieneEsferaDisponibleEnMano(j, esferaReq, estado.poolPorNumero, [idxAtaqueEnMano]);
            if (idxEsfera < 0) return { ok: false, error: `Necesitás la Esfera N° ${esferaReq} para jugar "${spec.nombre}".` };
        }

        const indices = (esferaReq > 0 && !exento) ? [idxAtaqueEnMano, idxEsfera] : [idxAtaqueEnMano];
        indices.sort((a, b) => b - a);
        const sacados = {};
        indices.forEach(i => { sacados[i] = j.mano.splice(i, 1)[0]; });
        const numEsfera = (esferaReq > 0 && !exento) ? sacados[idxEsfera] : null;

        // DENDE
        if (spec.numero === 108) {
            const antes = j.energia;
            j.energia = Math.min(j.energiaMax, j.energia + 50);
            log(estado, `DENDE: recupera ${j.energia - antes} pts de energía.`);
        }

        // Flag para ATAQUE COMBINADO (220)
        if (spec.numero === 220) {
            j._ataqueCombinadoDefensas = true;
        }

        j.campoAtaque.push({ ataqueNum: numAtaque, esferaNum: numEsfera, modificadores: [] });

                // KAKASANYUDOKODAN (364): cada esfera extra bajada junto a esta carta multiplica x2 x2
        if (spec.numero === 364) {
            // Contar cuántas esferas extra se han bajado en este turno
            // (además de la esfera necesaria para la carta)
            // Simplificamos: contamos todas las esferas jugadas este turno que no sean la de esta carta
            const esferasUsadas = j.campoAtaque
                .filter(e => e.esferaNum !== null)
                .map(e => e.esferaNum);
            // Restamos la esfera de esta carta si es que tiene
            const esferaPropia = j.campoAtaque.find(e => e.ataqueNum === 364)?.esferaNum;
            const esferasExtra = esferasUsadas.filter(e => e !== esferaPropia).length;
            if (esferasExtra > 0) {
                const entrada = j.campoAtaque.find(e => e.ataqueNum === 364);
                if (entrada) {
                    const factor = Math.pow(2, esferasExtra);
                    entrada._multAtk = (entrada._multAtk || 1) * factor;
                    entrada._multDef = (entrada._multDef || 1) * factor;
                    log(estado, `KAKASANYUDOKODAN: ${esferasExtra} esferas extra, multiplicador x${factor} x${factor}.`);
                }
            }
        }
        j.cartasJugadasEsteTurno.push(numAtaque);

                // Ejecutar efecto CAPITAN_GINYU si corresponde
        if (spec.numero === 319) {
            const oponenteId = idRival(estado.turnoJugador);
            const ctxGinyu = {
                jugadorId: idJugador(estado, estado.turnoJugador),
                oponenteId: oponenteId,
                spec: spec,
                engine: { specOf, destruirPermanente },
                log: (m) => log(estado, m),
                curar: (n) => {
                    const antes = j.energia;
                    j.energia = Math.min(j.energiaMax, j.energia + n);
                    if (j.energia > antes) log(estado, `Jugador ${estado.turnoJugador} recupera ${j.energia - antes} pts.`);
                }
            };
            const efecto = EFFECTS.CAPITAN_GINYU || EFFECTS.POR_DEFECTO;
            efecto(estado, ctxGinyu);
        }
        estado.bajoCartaEsteTurno = true;
        log(estado, `Jugador ${estado.turnoJugador} bajó "${spec.nombre}" (ATK ${spec.ataque}) lista para atacar.`);

                // Aplicar efecto de FURIA OCULTA (330) si se cumple combo
        if (spec.numero === 330) {
            // Ya se validó que GOHAN (32) está en cartasJugadasEsteTurno por comboCon
            const entrada = j.campoAtaque[j.campoAtaque.length - 1];
            if (entrada) {
                entrada._multAtk = (entrada._multAtk || 1) * 1;
                entrada._multDef = (entrada._multDef || 1) * 2;
                log(estado, `FURIA OCULTA: x1/x2 aplicado.`);
            }
        }

        return { ok: true };
    }

    // ----------------------------------------------------------------------
    // MODIFICAR ATAQUE
    // ----------------------------------------------------------------------
    function modificarAtaque(estado, idxCampoAtaque, idxModificadoraEnMano) {
        const j = jugadorActivo(estado);
        const specOf = specOfFactory(estado);
        const entrada = j.campoAtaque[idxCampoAtaque];
        if (!entrada) return { ok: false, error: "No hay ataque en ese slot." };
        if (j.bonusTurno.caraACara || estado[idRival(estado.turnoJugador)].bonusTurno.caraACara) {
            return { ok: false, error: "CARA A CARA: no se pueden usar modificadoras este turno." };
        }

        const numMod = j.mano[idxModificadoraEnMano];
        const spec = specOf(numMod);
        if (!spec || spec.tipo !== TIPOS.MODIFICADORA) return { ok: false, error: "Esa carta no es modificadora." };
        if (!puedeJugarseEsteTurno(j, numMod, spec)) return { ok: false, error: "Ya jugaste esta carta este turno." };

        // Validaciones especiales
        if (spec.numero === 214) { // KRILLIN POTENCIADO
            const baseAtaque = specOf(entrada.ataqueNum);
            if (!baseAtaque || !baseAtaque.nombre.toUpperCase().includes('KRILLIN')) {
                return { ok: false, error: "KRILLIN POTENCIADO solo puede usarse en cartas de Krillin." };
            }
        }
        if (spec.numero === 249) { // TRIPLE KAIOKEN
            const baseAtaque = specOf(entrada.ataqueNum);
            if (baseAtaque && baseAtaque.nombre && baseAtaque.nombre.toUpperCase().includes('OHZARU')) {
                return { ok: false, error: "TRIPLE KAIOKEN no puede usarse en Ohzaru." };
            }
        }
        if (spec.numero === 253) { // CUADRUPLE KAIOKEN
            const baseAtaque = specOf(entrada.ataqueNum);
            if (!baseAtaque || !baseAtaque.nombre.toUpperCase().includes('GOKU')) {
                return { ok: false, error: "CUADRUPLE KAIOKEN solo puede usarse en cartas de Goku." };
            }
                // Validación para POTENCIACION (142) - solo Piccolo
        if (spec.numero === 142) {
            const baseAtaque = specOf(entrada.ataqueNum);
            if (!baseAtaque || !baseAtaque.nombre.toUpperCase().includes('PICCOLO')) {
                return { ok: false, error: "POTENCIACION solo puede usarse en cartas de Piccolo." };
            }
            // Aplicamos el multiplicador x1 x2 (es multiplicador, no suma)
            entrada._multAtk = (entrada._multAtk || 1) * 1;
            entrada._multDef = (entrada._multDef || 1) * 2;
            log(estado, `POTENCIACION: x1/x2 aplicado a ${baseAtaque.nombre}.`);
            // No añadimos la carta a modificadores para no duplicar el efecto,
            // pero la descartamos al final de la función. La dejamos como está.
        }
        
        }

        // Combo de esferas compartidas
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

        // Aplicar efectos condicionales (185, 188, 192)
        const baseAtaque = specOf(entrada.ataqueNum);
        if (spec.numero === 185) { // LEGADO SAIYAJIN
            if (baseAtaque && esSaiyajin(baseAtaque.nombre)) {
                entrada._multAtk = (entrada._multAtk || 1) * 1;
                entrada._multDef = (entrada._multDef || 1) * 2;
                log(estado, `LEGADO SAIYAJIN: x1/x2 aplicado a ${baseAtaque.nombre}.`);
            } else {
                log(estado, `LEGADO SAIYAJIN: la carta objetivo no es un saiyajin, no se aplica.`);
            }
        }
        if (spec.numero === 192) { // LUNA LLENA
            if (baseAtaque && esSaiyajin(baseAtaque.nombre) && !baseAtaque.nombre.toUpperCase().includes('OHZARU')) {
                entrada._bonusInstantAtk = (entrada._bonusInstantAtk || 0) + 20;
                entrada._bonusInstantDef = (entrada._bonusInstantDef || 0) + 40;
                log(estado, `LUNA LLENA: +20/+40 aplicado a ${baseAtaque.nombre}.`);
            } else {
                log(estado, `LUNA LLENA: la carta objetivo no es un saiyajin válido (o es Ohzaru), no se aplica.`);
            }
        }
        if (spec.numero === 188) { // MARTILLO_KAIO
            entrada._bonusInstantDef = (entrada._bonusInstantDef || 0) + 50;
            log(estado, `MARTILLO_KAIO: +0/+50 aplicado.`);
        }

        entrada.modificadores.push({ num: numMod, esferaNum: numEsfera });
        j.cartasJugadasEsteTurno.push(numMod);
        estado.bajoCartaEsteTurno = true;

        if (spec.multiplicador) {
            const factorAtk = spec.multAtk || 1;
            const factorDef = spec.multDef || 1;
            entrada._multAtk = (entrada._multAtk || 1) * factorAtk;
            entrada._multDef = (entrada._multDef || 1) * factorDef;
            log(estado, `Jugador ${estado.turnoJugador} aplicó multiplicador "${spec.nombre}" (x${factorAtk}/x${factorDef}).`);
        } else {
            log(estado, `Jugador ${estado.turnoJugador} aplicó modificadora "${spec.nombre}" (+${spec.ataque}/+${spec.defensa}).`);
        }

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

    // ----------------------------------------------------------------------
    // TOTAL DE ENTRADA
    // ----------------------------------------------------------------------
    function totalDeEntrada(estado, entrada) {
        const specOf = specOfFactory(estado);
        const base = specOf(entrada.ataqueNum) || specOf(entrada.defensaNum);
        let atk = base ? base.ataque : 0;
        let def = base ? base.defensa : 0;

        if (base) {
            const rivalId = estado.turnoJugador === 1 ? 'j2' : 'j1';
            const rival = estado[rivalId];
            const cartasRival = [...rival.campoAtaque, rival.campoDefensa].filter(Boolean);

            // DUDA (222)
            if (estado._dudaActiva && base.nombre && base.nombre.toUpperCase().includes('PICCOLO')) {
                atk = Math.floor(atk / 2);
                def = Math.floor(def / 2);
            }

            // 88: KAIOH SHIN
            if (base.numero === 88) {
                const tieneBuu = cartasRival.some(e => {
                    const s = specOf(e.ataqueNum || e.defensaNum);
                    return s && s.nombre && s.nombre.toUpperCase().includes('BUU');
                });
                if (tieneBuu) { atk *= 2; def *= 2; }
            }

            // 89: EL LADO OSCURO
            if (base.numero === 89) {
                const tieneGoku = cartasRival.some(e => {
                    const s = specOf(e.ataqueNum || e.defensaNum);
                    return s && s.nombre && s.nombre.toUpperCase().includes('GOKU');
                });
                if (tieneGoku) { atk *= 2; def *= 2; }
            }

            // 161: EL PODER DE GOHAN (malvados)
            if (base.numero === 161) {
                const nombresRival = cartasRival.map(e => {
                    const s = specOf(e.ataqueNum || e.defensaNum);
                    return s ? s.nombre.toUpperCase() : '';
                }).join(' ');
                const esMalvado = /FREEZER|CELL|BUU|MAJIN|VEGETA/.test(nombresRival);
                if (esMalvado) {
                    atk += 20;
                    def += 20;
                }
            }

            // 163: PICCOLO VS PICCOLO
            if (base.numero === 163) {
                const tienePiccolo = cartasRival.some(e => {
                    const s = specOf(e.ataqueNum || e.defensaNum);
                    return s && s.nombre && s.nombre.toUpperCase().includes('PICCOLO');
                });
                if (tienePiccolo) {
                    atk *= 2;
                    def *= 2;
                }
            }
        }

        // Aplicar modificadores y multiplicadores de la entrada
        (entrada.modificadores || []).forEach(m => {
            const s = specOf(m.num);
            if (s && !s.multiplicador) {
                atk += s.ataque || 0;
                def += s.defensa || 0;
            }
        });
        atk += entrada._bonusInstantAtk || 0;
        def += entrada._bonusInstantDef || 0;
        if (entrada._multAtk) atk = Math.round(atk * entrada._multAtk);
        if (entrada._multDef) def = Math.round(def * entrada._multDef);

        if (entrada._debilidadActiva) {
            def = Math.floor(def / 2);
            entrada._debilidadActiva = false;
        }

        return { atk: Math.max(0, atk), def: Math.max(0, def) };
    }

    // ----------------------------------------------------------------------
    // RESOLVER ATAQUES
    // ----------------------------------------------------------------------
    function resolverAtaques(estado) {
        const atacanteId = idJugador(estado, estado.turnoJugador);
        const defensorId = idRival(estado.turnoJugador);
        const atacante = estado[atacanteId];
        const defensor = estado[defensorId];
        const specOf = specOfFactory(estado);

        if (atacante.campoAtaque.length === 0) {
            return { ok: false, error: "No bajaste ningún ataque todavía." };
        }

        // MULTIPLICACION (#572)
        if (defensor._multiplicacionActiva && defensor.campoDefensa && atacante.campoAtaque.length >= 2) {
            defensor._multiplicacionActiva = false;
            const atkTotal = atacante.campoAtaque.reduce((sum, e) => sum + totalDeEntrada(estado, e).atk, 0);
            const { def } = totalDeEntrada(estado, { ...defensor.campoDefensa, ataqueNum: defensor.campoDefensa.defensaNum });
            const danio = Math.max(0, atkTotal - def);
            log(estado, `MULTIPLICACION: ATK total ${atkTotal} vs DEF ${def} → daño combinado ${danio}.`);
            if (danio > 0) defensor.energia = Math.max(0, defensor.energia - danio);
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
        if (defensor._multiplicacionActiva) defensor._multiplicacionActiva = false;

        // Procesar cada ataque
        for (let i = 0; i < atacante.campoAtaque.length; i++) {
            const entrada = atacante.campoAtaque[i];
            const { atk } = totalDeEntrada(estado, entrada);
            const specAtaque = specOf(entrada.ataqueNum);

            const ctx = {
                jugadorId: atacanteId, oponenteId: defensorId,
                spec: specAtaque, engine: { specOf, destruirPermanente },
                log: (m) => log(estado, m),
                anularDanioYRedirigir: false,
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

                        // RETENCION (389): reduce a la mitad ataques de Freezer
            if (estado._retencionActivo && specAtaque && specAtaque.nombre && specAtaque.nombre.toUpperCase().includes('FREEZER')) {
                danio = Math.floor(danio / 2);
                log(estado, `RETENCION: ataque de Freezer reducido a la mitad.`);
            }

            // VEGETA CONTRAATACA (394): anula ataque único sin modificadoras
            if (estado._vegetaContraatacaActivo) {
                if (entrada.modificadores && entrada.modificadores.length === 0) {
                    danio = 0;
                    estado._vegetaContraatacaActivo = false;
                    log(estado, `VEGETA CONTRAATACA: ataque anulado. Puedes bajar un ataque fuera de turno.`);
                    // Nota: la parte de "bajar ataque fuera de turno" requeriría una UI especial,
                    // por ahora dejamos el flag para futura implementación.
                } else {
                    estado._vegetaContraatacaActivo = false;
                    log(estado, `VEGETA CONTRAATACA: el ataque tiene modificadoras, no se anula.`);
                }
            }

                        // REFLEJAR ATAQUE (370): si ataque <= 100, se devuelve al rival
            if (estado._reflejarAtaqueActivo && atk <= 100) {
                danio = 0;
                const dañoDevuelto = atk;
                // El atacante recibe el daño
                atacante.energia = Math.max(0, atacante.energia - dañoDevuelto);
                estado._reflejarAtaqueActivo = false;
                log(estado, `REFLEJAR ATAQUE: ataque de ${atk} pts devuelto al atacante.`);
            } else if (estado._reflejarAtaqueActivo) {
                estado._reflejarAtaqueActivo = false;
                log(estado, `REFLEJAR ATAQUE: ataque de ${atk} pts supera el límite de 100, sin efecto.`);
            }

            // RETENER PERSONAJE V2 (372): anula y devuelve a mano (sin daño)
            if (estado._retenerPersonajeV2Activo) {
                // Devolver el ataque y sus modificadores a la mano del atacante
                atacante.mano.push(entrada.ataqueNum);
                if (entrada.esferaNum) atacante.mano.push(entrada.esferaNum);
                (entrada.modificadores || []).forEach(m => {
                    atacante.mano.push(m.num);
                    if (m.esferaNum) atacante.mano.push(m.esferaNum);
                });
                // No se añade a descarte
                danio = 0;
                estado._retenerPersonajeV2Activo = false;
                log(estado, `RETENER PERSONAJE V2: ataque devuelto a la mano del atacante.`);
                // Saltamos la defensa y demás para este ataque
                continue;
            }

            // PACIENCIA (384): anula ataque, devuelve ataque a mano y esfera a descarte
            if (estado._pacienciaActivo) {
                // Devolver el ataque a la mano
                atacante.mano.push(entrada.ataqueNum);
                // La esfera va al descarte
                if (entrada.esferaNum) atacante.descarte.push(entrada.esferaNum);
                // Modificadores: devolver a mano o descartar? Según texto, solo la carta de ataque vuelve, las modificadoras y esferas van a descarte
                (entrada.modificadores || []).forEach(m => {
                    atacante.descarte.push(m.num);
                    if (m.esferaNum) atacante.descarte.push(m.esferaNum);
                });
                danio = 0;
                estado._pacienciaActivo = false;
                log(estado, `PACIENCIA: ataque devuelto a la mano, esferas y modificadores al descarte.`);
                continue;
            }

            // CAMPO PROTECTOR (283)
            if (estado._campoProtectorActivo) {
                danio = Math.max(0, danio + estado._campoProtectorActivo);
                estado._campoProtectorActivo = 0;
                log(estado, `CAMPO PROTECTOR: daño reducido en 100 pts (${danio} pts restantes).`);
            }

            // DETENER ENERGIA (258)
            if (estado._detenerEnergiaActivo && specAtaque && specAtaque.nombre && specAtaque.nombre.toUpperCase().includes('ENERGIA')) {
                danio = Math.floor(danio / 2);
                estado._detenerEnergiaActivo = false;
                log(estado, `DETENER ENERGIA: daño reducido a la mitad.`);
            }

            // BURLA (260)
            if (estado._burlaActivo && specAtaque && specAtaque.nombre && specAtaque.nombre.toUpperCase().includes('ENERGIA')) {
                danio = 0;
                log(estado, `BURLA: ataque de energía anulado.`);
            }

            // CUIDADO (150)
            if (estado._cuidadoActivo) {
                danio = Math.floor(danio / 2);
            }

            // ESCUDO_DE_VAPOR (101)
            if (estado._escudoDeVaporActivo) {
                danio = Math.floor(danio / 2);
                estado._escudoDeVaporActivo = false;
                log(estado, `ESCUDO DE VAPOR: el ataque se reduce a la mitad (${danio} pts).`);
            }

            let fueBloqueado = false;

            // VENGANZA (102)
            if (estado._venganzaActiva) {
                log(estado, `VENGANZA: el ataque "${specAtaque?.nombre}" es descartado sin dañar.`);
                atacante.descarte.push(entrada.ataqueNum);
                if (entrada.esferaNum) atacante.descarte.push(entrada.esferaNum);
                (entrada.modificadores || []).forEach(m => {
                    atacante.descarte.push(m.num);
                    if (m.esferaNum) atacante.descarte.push(m.esferaNum);
                });
                estado._venganzaActiva = false;
                continue;
            }

            // Anulación por umbral
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

            if (estado.bloqueoAtaquePendiente && !estado._ataqueNoBloqueableActivo) {
                danio = 0;
                fueBloqueado = true;
                if (estado._devolverEsferaAlBloquear && entrada.esferaNum) {
                    atacante.mano.push(entrada.esferaNum);
                    entrada.esferaNum = null;
                    log(estado, `HORA DEL BAÑO: la esfera del ataque bloqueado vuelve a la mano del atacante.`);
                    estado._devolverEsferaAlBloquear = false;
                }
                estado.bloqueoAtaquePendiente = false;
                log(estado, `¡El ataque de "${specAtaque?.nombre}" fue bloqueado!`);
            } else if (estado.bloqueoAtaquePendiente && estado._ataqueNoBloqueableActivo) {
                log(estado, `¡${specAtaque?.nombre} tiene HUMILLANDO: el bloqueo no tiene efecto!`);
                estado.bloqueoAtaquePendiente = false;
            }

            if (ctx.anularDanioYRedirigir) {
                atacante.energia = Math.max(0, atacante.energia - atk);
                log(estado, `¡El ataque de ${specAtaque?.nombre} se redirige y daña a su propio jugador en ${atk} pts!`);
                danio = 0;
            }

            estado._ataqueNoBloqueableActivo = false;

            // ESO ES DEMASIADO
            if (estado._esoEsDemasiadoActivo && atk > 200) {
                const nDesc = Math.min(2, atacante.mano.length);
                for (let i = 0; i < nDesc; i++) atacante.descarte.push(atacante.mano.shift());
                log(estado, `ESO ES DEMASIADO: ataque de ${atk} pts, atacante descartó ${nDesc} cartas.`);
            }

            // ATAQUE COMBINADO (220)
            if (atacante._ataqueCombinadoDefensas) {
                atacante.bonusTurno.rivalDefensaMitad = true;
                atacante._ataqueCombinadoDefensas = false;
                log(estado, `ATAQUE COMBINADO: defensas del rival reducidas a la mitad.`);
            }

            // VOLAR (241)
            if (estado._volarActivo && defensor.campoDefensa) {
                let defDefensa = totalDeEntrada(estado, { ...defensor.campoDefensa, ataqueNum: defensor.campoDefensa.defensaNum }).def;
                if (defDefensa < 80) {
                    log(estado, `VOLAR: defensa de ${defDefensa} pts es menor a 80, se ignora.`);
                    defensor.descarte.push(defensor.campoDefensa.defensaNum);
                    if (defensor.campoDefensa.esferaNum) defensor.descarte.push(defensor.campoDefensa.esferaNum);
                    (defensor.campoDefensa.modificadores || []).forEach(m => {
                        defensor.descarte.push(m.num);
                        if (m.esferaNum) defensor.descarte.push(m.esferaNum);
                    });
                    defensor.campoDefensa = null;
                }
                estado._volarActivo = false;
            }

            // Defensa
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

            if (danio > 0) {
                defensor.energia = Math.max(0, defensor.energia - danio);
                defensor._recibioDanioTurnoAnterior = true;
                log(estado, `${specAtaque?.nombre || 'Ataque'} inflige ${danio} pts de daño.`);
            } else if (!ctx.anularDanioYRedirigir && !fueBloqueado) {
                log(estado, `${specAtaque?.nombre || 'Ataque'} fue absorbido por completo.`);
            }
        }

        // Limpiar flags
        estado._cuidadoActivo = false;
        estado._escudoDeVaporActivo = false;
        estado._venganzaActiva = false;
        estado.bloqueoAtaquePendiente = false;
        estado.anulacionPendiente = null;
        estado._detenerEnergiaActivo = false;
        estado._burlaActivo = false;

        atacante.bonusTurno = {
            rivalNoPuedeDefenderse: false,
            rivalDefensaMitad: false,
            defensaPerforadoraPropia: false,
            caraACara: false,
            rivalNoPuedeAtacarProximoTurno: false,
        };

        // Descartar todo
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

    // ----------------------------------------------------------------------
    // DECLARAR DEFENSA
    // ----------------------------------------------------------------------
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

        if (spec.efectoId && spec.efectoId !== "POR_DEFECTO") {
            const oponenteId = idRival(jugadorDefId === "j1" ? 1 : 2);
            const ctxDef = {
                jugadorId: jugadorDefId,
                oponenteId: oponenteId,
                spec: spec,
                engine: { specOf: specOf, destruirPermanente: destruirPermanente },
                log: (m) => log(estado, m),
                curar: (n) => {
                    const antes = j.energia;
                    j.energia = Math.min(j.energiaMax, j.energia + n);
                    if (j.energia > antes) log(estado, `Jugador ${jugadorDefId === 'j1' ? 1 : 2} recupera ${j.energia - antes} pts.`);
                }
            };
            const efecto = EFFECTS[spec.efectoId] || EFFECTS.POR_DEFECTO;
            efecto(estado, ctxDef);
        }

        j._seDefendioTurnoAnterior = true;
        log(estado, `Jugador defensor preparó "${spec.nombre}" (DEF ${spec.defensa}).`);
        return { ok: true };
    }

    // ----------------------------------------------------------------------
    // MODIFICAR DEFENSA
    // ----------------------------------------------------------------------
    function modificarDefensa(estado, jugadorDefId, idxModificadoraEnMano) {
        const j = estado[jugadorDefId];
        const specOf = specOfFactory(estado);
        if (!j.campoDefensa) return { ok: false, error: "No tenés una defensa preparada." };

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

    // ----------------------------------------------------------------------
    // ATAQUE DE LAS 7 ESFERAS
    // ----------------------------------------------------------------------
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

    // ----------------------------------------------------------------------
    // JUGAR INSTANTÁNEA
    // ----------------------------------------------------------------------
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

    // ----------------------------------------------------------------------
    // JUGAR ESPECIAL
    // ----------------------------------------------------------------------
    function jugarEspecial(estado, idxEnMano) {
        const j = jugadorActivo(estado);
        const jugadorId = idJugador(estado, estado.turnoJugador);
        const specOf = specOfFactory(estado);
        const num = j.mano[idxEnMano];
        const spec = specOf(num);
        if (!spec || spec.tipo !== TIPOS.ESPECIAL) return { ok: false, error: "Esa carta no es de tipo Especial." };
        if (!puedeJugarseEsteTurno(j, num, spec)) return { ok: false, error: "Ya jugaste esta carta este turno." };
        if (spec.permanente && j.condiciones.bloqueadoPermanentes) {
            return { ok: false, error: "INTIMIDACION: no puedes bajar permanentes este turno." };
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
            if (numEsfera) j.descarte.push(numEsfera);
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
            }
        };
        const efecto = EFFECTS[spec.efectoId] || EFFECTS.POR_DEFECTO;
        efecto(estado, ctx);
        log(estado, `Carta especial "${spec.nombre}" jugada.`);
        return { ok: true, ctx };
    }

    // ----------------------------------------------------------------------
    // PERMANENTES
    // ----------------------------------------------------------------------
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
        aRetirar.sort((a, b) => b - a).forEach(idx => {
            const [perm] = j.permanentes.splice(idx, 1);
            j.descarte.push(perm.num);
        });
    }

    function destruirPermanente(estado, jugadorId) {
        const j = estado[jugadorId];
        if (j.permanentes.length === 0) return null;
        const [perm] = j.permanentes.splice(0, 1);
        j.descarte.push(perm.num);
        return perm.num;
    }

    // ----------------------------------------------------------------------
    // PASAR TURNO
    // ----------------------------------------------------------------------
    function prepararPasarTurno(estado) {
        const jugadorId = idJugador(estado, estado.turnoJugador);
        const j = estado[jugadorId];

        if (!estado.bajoCartaEsteTurno && j.mano.length > 5) {
            const cantidad = j.mano.length - 5;
            estado._pendienteDescarte = { cantidad, jugadorId };
            return {
                ok: true,
                requiereDescarte: true,
                cantidad,
                mano: j.mano.slice()
            };
        }

        estado._pendienteDescarte = null;
        return { ok: true, requiereDescarte: false };
    }

    function ejecutarDescarte(estado, indices) {
        const pendiente = estado._pendienteDescarte;
        if (!pendiente) return { ok: false, error: "No hay descarte pendiente." };
        const j = estado[pendiente.jugadorId];
        const sorted = indices.slice().sort((a, b) => b - a);
        const descartadas = [];
        sorted.forEach(idx => {
            if (idx >= 0 && idx < j.mano.length) {
                descartadas.push(j.mano.splice(idx, 1)[0]);
            }
        });
        const faltantes = pendiente.cantidad - descartadas.length;
        if (faltantes > 0 && j.mano.length > 0) {
            const extra = j.mano.splice(0, faltantes);
            descartadas.push(...extra);
        }
        j.descarte.push(...descartadas);
        delete estado._pendienteDescarte;
        cambiarTurnoYRobar(estado);
        return { ok: true };
    }

    function cambiarTurnoYRobar(estado) {

                // Ejecutar efectos de permanentes al final del turno (como REPOSO)
        const permanentes = [...j.permanentes];
        permanentes.forEach(perm => {
            const spec = specOfFactory(estado)(perm.num);
            if (spec && spec.efectoTurnoId === "EL_REPOSO_DEL_GUERRERO_TURNO") {
                const ctxPerm = {
                    jugadorId: jugadorId,
                    spec: spec,
                    engine: { specOf: specOfFactory(estado), destruirPermanente },
                    log: (m) => log(estado, m),
                    curar: (n) => {
                        const antes = j.energia;
                        j.energia = Math.min(j.energiaMax, j.energia + n);
                        if (j.energia > antes) log(estado, `"${spec.nombre}" recupera ${j.energia - antes} pts.`);
                    },
                    retirarPermanente: () => {}
                };
                EFFECTS[spec.efectoTurnoId](estado, ctxPerm);
            }
        });
        const jugadorId = idJugador(estado, estado.turnoJugador);
        const j = estado[jugadorId];

        if (j._remedioSatan) {
            j._remedioSatan = false;
            if (!estado.bajoCartaEsteTurno || j.campoAtaque.length === 0) {
                const antes = j.energia;
                j.energia = Math.min(j.energiaMax, j.energia + 100);
                log(estado, `EL REMEDIO DE SATAN: recuperaste ${j.energia - antes} pts por no atacar.`);
            }
        }

        j._pizzaActiva = false;
        j._proximoAtaqueSinEsfera = false;
        j._multiplicacionActiva = false;
        j._ataqueCombinadoDefensas = false;
        j._saibamanActivo = false;

        estado.turnoJugador = estado.turnoJugador === 1 ? 2 : 1;
        estado.faseTurno = "robo";
        faseRobo(estado);
        revisarFinDePartida(estado);
    }

    function pasarTurno(estado, indicesDescarte = []) {
        if (indicesDescarte && indicesDescarte.length > 0) {
            const r = ejecutarDescarte(estado, indicesDescarte);
            if (!r.ok) return r;
            return { ok: true };
        }
        const prep = prepararPasarTurno(estado);
        if (prep.requiereDescarte) {
            const j = estado[estado._pendienteDescarte.jugadorId];
            const cantidad = estado._pendienteDescarte.cantidad;
            const indices = [];
            for (let i = 0; i < cantidad && i < j.mano.length; i++) {
                indices.push(i);
            }
            return ejecutarDescarte(estado, indices);
        } else {
            cambiarTurnoYRobar(estado);
            return { ok: true };
        }
    }

    function revisarFinDePartida(estado) {
        if (estado.j1.energia <= 0 && !estado.ganador) estado.ganador = 2;
        if (estado.j2.energia <= 0 && !estado.ganador) estado.ganador = 1;
    }

    // ----------------------------------------------------------------------
    // EXPORT
    // ----------------------------------------------------------------------
    return {
        TIPOS, EFFECTS,
        crearEstadoPartida, specOfFactory, faseRobo,
        declararAtaque, modificarAtaque, modificarDefensa, resolverAtaques, declararDefensa,
        ataqueEsferasDelDragon, jugarInstantanea, jugarEspecial,
        prepararPasarTurno, ejecutarDescarte, cambiarTurnoYRobar, pasarTurno,
        validarMazo,
        totalDeEntrada, esferaValor, idJugador, idRival,
        procesarPermanentes, destruirPermanente
    };
})();

if (typeof module !== "undefined") module.exports = DBZEngine;
