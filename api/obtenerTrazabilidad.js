import pool from '../src/config/db';

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

    const idLoteTexto = String(primerValor(req.query?.id_lote) ?? '').trim();
    const idLote = idLoteTexto ? Number(idLoteTexto) : null;
    const codigoLote = String(primerValor(req.query?.codigo_lote) ?? '').trim().toUpperCase();
    const idCorteTexto = String(primerValor(req.query?.id_corte) ?? '').trim();
    const codigoCorte = String(primerValor(req.query?.codigo_corte) ?? '').trim().toUpperCase();
    const idCorteDesdeCodigo = /^C\d{2,}$/.test(codigoCorte)
        ? Number(codigoCorte.slice(1))
        : null;
    const idCorte = idCorteTexto ? Number(idCorteTexto) : idCorteDesdeCodigo;
    const incluirTipCuidado = esVerdadero(req.query?.incluir_tip_cuidado);
    const incluirRecomendacion = esVerdadero(req.query?.incluir_recomendacion);

    if (!codigoLote && (!Number.isInteger(idLote) || idLote <= 0)) {
        return res.status(400).json({ success: false, error: 'Falta el código del lote.' });
    }
    if (codigoLote && !/^LOT-\d{4}-\d{2}-\d{3}$/.test(codigoLote)) {
        return res.status(400).json({ success: false, error: 'El código del lote no tiene un formato válido.' });
    }
    if (idCorteTexto && (!Number.isInteger(idCorte) || idCorte <= 0)) {
        return res.status(400).json({ success: false, error: 'El identificador del corte no es valido.' });
    }
    if (codigoCorte && (!/^C\d{2,}$/.test(codigoCorte) || !Number.isInteger(idCorte) || idCorte <= 0)) {
        return res.status(400).json({ success: false, error: 'El código del corte no tiene un formato válido.' });
    }

    let connection;

    try {
        connection = await pool.getConnection();

        const query = `
            SELECT 
                l.codigo_lote, l.tipo_corte, l.tip_recomendacion, l.peso_kg, l.fecha_ingreso, l.fecha_vencimiento, l.estado,
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
            WHERE ${codigoLote ? 'l.codigo_lote = ?' : 'l.id_lote = ?'}
            LIMIT 1
        `;

        const [rows] = await connection.execute(query, [codigoLote || idLote]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, error: 'El lote solicitado no existe.' });
        }

        const trazabilidad = rows[0];
        let tipoCorteFinal = trazabilidad.tipo_corte;
        let tipRecomendacionFinal = trazabilidad.tip_recomendacion || null;

        if (idCorte !== null) {
            const [cortes] = await connection.execute(
                `
                    SELECT id_corte, especie, nombre_corte, tip_cuidado, recomendacion
                    FROM catalogo_corte
                    WHERE id_corte = ?
                    LIMIT 1
                `,
                [idCorte]
            );

            if (cortes.length === 0) {
                return res.status(404).json({ success: false, error: 'El corte indicado en el QR no existe.' });
            }

            const corte = cortes[0];
            if (String(corte.especie || '').toUpperCase() !== String(trazabilidad.especie || '').toUpperCase()) {
                return res.status(400).json({
                    success: false,
                    error: 'El corte indicado en el QR no corresponde a la especie del lote.'
                });
            }

            tipoCorteFinal = String(corte.nombre_corte || '').trim() || trazabilidad.tipo_corte;
            const partesRecomendacion = [];
            const tipCuidado = String(corte.tip_cuidado || '').trim();
            const recomendacion = String(corte.recomendacion || '').trim();

            if (incluirTipCuidado && tipCuidado) {
                partesRecomendacion.push(`Tip: ${tipCuidado}`);
            }
            if (incluirRecomendacion && recomendacion) {
                partesRecomendacion.push(`Recomendación: ${recomendacion}`);
            }
            tipRecomendacionFinal = partesRecomendacion.length > 0
                ? partesRecomendacion.join(' | ')
                : null;
        }

        return res.status(200).json({
            success: true,
            codigo_trazabilidad: `${trazabilidad.codigo_lote}${idCorte !== null ? `-C${String(idCorte).padStart(2, '0')}` : ''}`,
            codigo_corte: idCorte !== null ? `C${String(idCorte).padStart(2, '0')}` : null,
            id_corte: idCorte,
            lote_id: trazabilidad.codigo_lote,
            producto: tipoCorteFinal,
            tipo_corte: tipoCorteFinal,
            tip_recomendacion: tipRecomendacionFinal,
            peso_kg: trazabilidad.peso_kg,
            fecha_empaque: trazabilidad.fecha_ingreso,
            fecha_vencimiento: trazabilidad.fecha_vencimiento,
            url_publica: null,
            detalles_trazabilidad: {
                establecimiento: trazabilidad.nombre_negocio,
                arete_siniga: trazabilidad.num_arete,
                especie: trazabilidad.especie,
                imagen_animal_url: trazabilidad.imagen_animal_url,
                tip_recomendacion: tipRecomendacionFinal,
                procedencia: `${trazabilidad.localidad_origen}, ${trazabilidad.municipio_origen}`,
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
