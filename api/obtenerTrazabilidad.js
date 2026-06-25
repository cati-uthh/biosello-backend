import pool from '../src/config/db';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Método no permitido' });
    }

    const { id_lote } = req.query;

    if (!id_lote) {
        return res.status(400).json({ success: false, error: 'Falta el identificador del lote.' });
    }

    let connection;

    try {
        connection = await pool.getConnection();

        const query = `
            SELECT 
                l.codigo_lote, l.tipo_corte, l.peso_kg, l.fecha_ingreso, l.fecha_vencimiento, l.estado,
                n.nombre_negocio, n.municipio AS municipio_negocio,
                a.num_arete, a.especie, a.clasificacion,
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
        `;

        const [rows] = await connection.execute(query, [id_lote]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, error: 'El lote solicitado no existe.' });
        }

        const trazabilidad = rows[0];

        return res.status(200).json({
            success: true,
            lote_id: trazabilidad.codigo_lote,
            producto: trazabilidad.tipo_corte,
            peso_kg: trazabilidad.peso_kg,
            fecha_empaque: trazabilidad.fecha_ingreso,
            url_publica: `https://biosell.app/trazabilidad?id_lote=${id_lote}`,
            detalles_trazabilidad: {
                establecimiento: trazabilidad.nombre_negocio,
                arete_siniga: trazabilidad.num_arete,
                especie: trazabilidad.especie,
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