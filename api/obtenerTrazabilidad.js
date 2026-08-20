import pool from '../src/config/db.js';

const primerValor = (valor) => Array.isArray(valor) ? valor[0] : valor;
const esVerdadero = (valor) => ['1', 'true'].includes(
    String(primerValor(valor) ?? '').trim().toLowerCase()
);

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Método no permitido' });
    }

    // Permite buscar por id_lote numérico o por código de lote alfanumérico
    const idLoteRaw = String(primerValor(req.query?.id_lote ?? req.query?.codigo_lote ?? req.query?.lote ?? req.query?.codigo) ?? '').trim();
    const idCorteTexto = String(primerValor(req.query?.id_corte) ?? '').trim();
    const idCorte = idCorteTexto ? Number(idCorteTexto) : null;
    const incluirTipCuidado = esVerdadero(req.query?.incluir_tip_cuidado);
    const incluirRecomendacion = esVerdadero(req.query?.incluir_recomendacion);

    if (!idLoteRaw) {
        return res.status(400).json({ success: false, error: 'Falta el identificador o código del lote.' });
    }
    if (idCorteTexto && (!Number.isInteger(idCorte) || idCorte <= 0)) {
        return res.status(400).json({ success: false, error: 'El identificador del corte no es válido.' });
    }

    let connection;

    try {
        connection = await pool.getConnection();

        const esNumeroEntero = /^\d+$/.test(idLoteRaw);
        const idLoteNumerico = esNumeroEntero ? Number(idLoteRaw) : null;

        // Manejo de formato para números continuos (ej. 202608001 -> LOT-2026-08-001)
        const soloDigitos = idLoteRaw.replace(/\D/g, '');
        let codigoFormateado = idLoteRaw;
        if (soloDigitos.length === 9) {
            codigoFormateado = LOT---;
        }

        const query = 
            SELECT 
                l.id_lote, l.codigo_lote, l.tipo_corte, l.tip_recomendacion, l.peso_kg, l.fecha_ingreso, l.fecha_vencimiento, l.estado,
                n.nombre_negocio, n.municipio AS municipio_negocio,
                a.num_arete, a.especie, a.clasificacion, a.imagen_animal_url,
                o.upp_origen, o.localidad_origen, o.municipio_origen,
                p.nombre_propietario,
                g.folio_guia, g.num_reemo,
                r.nombre_rastro, r.num_rastro
            FROM lote l
            LEFT JOIN negocio n ON l.id_negocio = n.id_negocio
            LEFT JOIN animal a ON l.id_animal = a.id_animal
            LEFT JOIN origen o ON a.id_origen = o.id_origen
            LEFT JOIN propietario p ON a.id_propietario = p.id_propietario
            LEFT JOIN guia_animal ga ON a.id_animal = ga.id_animal
            LEFT JOIN guia_transito g ON ga.id_guia = g.id_guia
            LEFT JOIN rastro r ON g.id_rastro = r.id_rastro
            WHERE l.id_lote = ? 
               OR UPPER(l.codigo_lote) = UPPER(?)
               OR UPPER(l.codigo_lote) = UPPER(?)
               OR UPPER(l.codigo_lote) = UPPER(?)
            ORDER BY (l.id_lote = ?) DESC, l.id_lote DESC
            LIMIT 1
        ;

        const paramsBusqueda = [
            idLoteNumerico || 0,
            idLoteRaw,
            codigoFormateado,
            LOT-,
            idLoteNumerico || 0
        ];

        const [rows] = await connection.execute(query, paramsBusqueda);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, error: 'El lote solicitado no existe.' });
        }

        const trazabilidad = rows[0];
        let tipoCorteFinal = trazabilidad.tipo_corte;
        let tipRecomendacionFinal = trazabilidad.tip_recomendacion ? String(trazabilidad.tip_recomendacion).trim() : null;

        // 1. Si se indicó un corte en el QR
        if (idCorte !== null) {
            try {
                const [cortes] = await connection.execute(
                    'SELECT id_corte, especie, nombre_corte, tip_cuidado, recomendacion FROM catalogo_corte WHERE id_corte = ? LIMIT 1',
                    [idCorte]
                );

                if (cortes && cortes.length > 0) {
                    const corte = cortes[0];
                    tipoCorteFinal = String(corte.nombre_corte || '').trim() || trazabilidad.tipo_corte;
                    const partesRecomendacion = [];
                    const tipCuidado = String(corte.tip_cuidado || '').trim();
                    const recomendacion = String(corte.recomendacion || '').trim();

                    if (incluirTipCuidado && tipCuidado) {
                        partesRecomendacion.push(Tip: );
                    }
                    if (incluirRecomendacion && recomendacion) {
                        partesRecomendacion.push(Recomendación: );
                    }
                    if (!incluirTipCuidado && !incluirRecomendacion) {
                        if (tipCuidado) partesRecomendacion.push(Tip: );
                        if (recomendacion) partesRecomendacion.push(Recomendación: );
                    }

                    if (partesRecomendacion.length > 0) {
                        tipRecomendacionFinal = partesRecomendacion.join(' | ');
                    }
                }
            } catch (eCorte) {
                // Silencioso
            }
        }

        // 2. Si no hay tip en el lote ni vino id_corte, obtener recomendaciones automáticamente de catalogo_corte
        if (!tipRecomendacionFinal) {
            try {
                const especieLote = trazabilidad.especie || 'BOVINO';
                const [cortesEspecie] = await connection.execute(
                    'SELECT id_corte, especie, nombre_corte, tip_cuidado, recomendacion FROM catalogo_corte WHERE UPPER(especie) = UPPER(?)',
                    [especieLote]
                );

                if (cortesEspecie && cortesEspecie.length > 0) {
                    const tipoNorm = String(trazabilidad.tipo_corte || '').trim().toUpperCase();
                    const corteAuto = cortesEspecie.find((c) => {
                        const nom = String(c.nombre_corte || '').toUpperCase();
                        return tipoNorm && (nom.includes(tipoNorm) || tipoNorm.includes(nom));
                    }) || cortesEspecie[0];

                    if (corteAuto) {
                        const partes = [];
                        if (corteAuto.tip_cuidado) partes.push(Tip: );
                        if (corteAuto.recomendacion) partes.push(Recomendación: );
                        if (partes.length > 0) {
                            tipRecomendacionFinal = partes.join(' | ');
                        }
                    }
                }
            } catch (eAuto) {
                // Silencioso
            }
        }

        return res.status(200).json({
            success: true,
            lote_id: trazabilidad.codigo_lote,
            producto: tipoCorteFinal,
            tipo_corte: tipoCorteFinal,
            tip_recomendacion: tipRecomendacionFinal,
            peso_kg: trazabilidad.peso_kg,
            fecha_empaque: trazabilidad.fecha_ingreso,
            url_publica: null,
            detalles_trazabilidad: {
                establecimiento: trazabilidad.nombre_negocio,
                arete_siniga: trazabilidad.num_arete,
                especie: trazabilidad.especie,
                imagen_animal_url: trazabilidad.imagen_animal_url,
                tip_recomendacion: tipRecomendacionFinal,
                procedencia: ${trazabilidad.localidad_origen}, ,
                upp_rancho: trazabilidad.upp_origen,
                productor: trazabilidad.nombre_propietario,
                guia_reemo: trazabilidad.num_reemo,
                sacrificio_rastro: trazabilidad.nombre_rastro
            }
        });

    } catch (error) {
        console.error('Error al extraer trazabilidad:', error);
        return res.status(500).json({ success: false, error: 'Ocurrió un error interno en el servidor.' });
    } finally {
        if (connection) connection.release();
    }
}
