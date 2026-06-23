import pool from '../src/config/db' 
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
    // 1. Configuración de CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Método no permitido' });
    }

    const { email, contrasena } = req.body;

    if (!email || !contrasena) {
        return res.status(400).json({ success: false, error: 'Faltan credenciales.' });
    }

    let connection;

    try {
        connection = await pool.getConnection();

        // 2. Consulta a la base de datos uniendo usuario y negocio
        const query = `
            SELECT u.id_usuario, u.nombre, u.email, u.contrasena_hash, u.perfil, u.activo, n.estatus_verificacion
            FROM usuario u
            LEFT JOIN negocio n ON u.id_usuario = n.id_admin
            WHERE u.email = ?
        `;
        
        const [rows] = await connection.execute(query, [email]);

        if (rows.length === 0) {
            return res.status(401).json({ success: false, error: 'El usuario no está registrado.' });
        }

        const usuario = rows[0];

        // 3. Validar si la cuenta está dada de baja
        if (usuario.activo === 0) {
            return res.status(403).json({ success: false, error: 'Esta cuenta ha sido desactivada por el administrador.' });
        }

        // 4. Desencriptar y comparar la contraseña
        const contrasenaValida = await bcrypt.compare(contrasena, usuario.contrasena_hash);

        if (!contrasenaValida) {
            return res.status(401).json({ success: false, error: 'Contraseña incorrecta.' });
        }

        // --- REGLA DE NEGOCIO (OPCIONAL) ---
        // Si se requiere bloquear el acceso hasta que la organización apruebe que el negocio es legítimo, utilizamos esto:
        /*
        if (usuario.perfil === 'admin' && usuario.estatus_verificacion === 'pendiente') {
            return res.status(403).json({ 
                success: false, 
                error: 'Tu negocio aún está en revisión. Te notificaremos cuando sea aprobado.' 
            });
        }
        */

        // 5. Login exitoso
        return res.status(200).json({
            success: true,
            mensaje: 'Login exitoso',
            usuario: {
                id: usuario.id_usuario,
                nombre: usuario.nombre,
                email: usuario.email,
                perfil: usuario.perfil,
                estatus_negocio: usuario.estatus_verificacion // Retornamos si es pendiente/aprobado
            }
        });

    } catch (error) {
        console.error('Error en el login:', error);
        return res.status(500).json({ success: false, error: 'Error interno del servidor.' });
    } finally {
        if (connection) connection.release();
    }
}