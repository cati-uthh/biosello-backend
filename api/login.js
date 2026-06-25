import pool from '../src/config/db';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Método no permitido.' });
    }

    const email = String(req.body?.email || '').trim().toLowerCase();
    const contrasena = String(req.body?.contrasena || '');

    if (!email || !contrasena) {
        return res.status(400).json({ success: false, error: 'Ingresa correo electrónico y contraseña.' });
    }

    let connection;

    try {
        connection = await pool.getConnection();

        const query = `
            SELECT
                u.id_usuario,
                u.nombre,
                u.email,
                u.telefono,
                u.contrasena_hash,
                u.perfil,
                u.activo,
                n.id_negocio,
                n.nombre_negocio,
                n.estatus_verificacion
            FROM usuario u
            LEFT JOIN negocio n ON u.id_usuario = n.id_admin
            WHERE u.email = ?
            LIMIT 1
        `;

        const [rows] = await connection.execute(query, [email]);

        if (rows.length === 0) {
            return res.status(401).json({ success: false, error: 'No existe una cuenta registrada con ese correo.' });
        }

        const usuario = rows[0];

        if (usuario.activo === 0) {
            return res.status(403).json({ success: false, error: 'Esta cuenta fue desactivada por el administrador.' });
        }

        const contrasenaValida = await bcrypt.compare(contrasena, usuario.contrasena_hash);

        if (!contrasenaValida) {
            return res.status(401).json({ success: false, error: 'La contraseña no es correcta.' });
        }

        return res.status(200).json({
            success: true,
            mensaje: 'Inicio de sesión exitoso.',
            usuario: {
                id: usuario.id_usuario,
                id_usuario: usuario.id_usuario,
                nombre: usuario.nombre,
                email: usuario.email,
                telefono: usuario.telefono,
                perfil: usuario.perfil,
                id_negocio: usuario.id_negocio,
                nombre_negocio: usuario.nombre_negocio,
                estatus_negocio: usuario.estatus_verificacion
            }
        });
    } catch (error) {
        console.error('Error en el login:', error);
        return res.status(500).json({ success: false, error: 'Ocurrió un error interno en el servidor.' });
    } finally {
        if (connection) connection.release();
    }
}
