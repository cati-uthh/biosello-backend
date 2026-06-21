import mysql from 'mysql2/promise'
import dotenv from 'dotenv'
dotenv.config()

// Usar createConnection en lugar de createPool para serverless
const db = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 1,       // ← límite bajo para serverless
    queueLimit: 0
})

export default db