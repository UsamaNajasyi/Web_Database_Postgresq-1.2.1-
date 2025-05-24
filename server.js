const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err.message);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
});

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = 3000;

app.use(express.static(path.join(__dirname, 'public')));

let pool;
let lastDbStatus = 'Connected';

function loadEnvConfig() {
  const envConfig = dotenv.parse(fs.readFileSync('.env'));
  return {
    user: envConfig.DB_USER,
    host: envConfig.DB_HOST,
    database: envConfig.DB_NAME,
    password: envConfig.DB_PASS,
    port: Number(envConfig.DB_PORT),
  };
}

// Inisialisasi pertama pool
let dbConfig = loadEnvConfig();
pool = new Pool(dbConfig);

// Reload pool setiap 10 detik
setInterval(() => {
  const newConfig = loadEnvConfig();
  const configChanged = JSON.stringify(newConfig) !== JSON.stringify(dbConfig);

  if (configChanged) {
    console.log('🔁 Deteksi perubahan .env, membuat ulang koneksi pool...');
    pool
      .end()
      .then(() => {
        pool = new Pool(newConfig);
        dbConfig = newConfig;
      })
      .catch((err) => {
        console.error('⚠️ Gagal menutup pool lama:', err.message);
      });
  }
}, 10000);

io.on('connection', async (socket) => {
  console.log('🔌 Client terhubung');
  socket.emit('db_status', 'Connected');

  try {
    const result = await pool.query('SELECT * FROM users ORDER BY id DESC LIMIT 10');
    const rows = result.rows;

    let payload;
    if (rows.length === 0) {
      payload = { type: 'time_info', value: new Date().toISOString() };
    } else if (rows.length === 1) {
      payload = { type: 'single', tables: rows[0] };
    } else {
      payload = { type: 'multiple', tables: rows.slice(0, 4) };
    }

    socket.emit('data_update', payload);
  } catch (err) {
    console.error('⚠️ Gagal mengambil data awal:', err.message);
    socket.emit('db_status', 'Disconnected');
  }
});

setInterval(async () => {
  try {
    const result = await pool.query('SELECT * FROM users ORDER BY id DESC LIMIT 10');
    const rows = result.rows;

    let payload;
    if (rows.length === 0) {
      payload = { type: 'time_info', value: new Date().toISOString() };
    } else if (rows.length === 1) {
      payload = { type: 'single', tables: rows[0] };
    } else {
      payload = { type: 'multiple', tables: rows.slice(0, 4) };
    }

    io.emit('data_update', payload);
    console.log('berhasil ambil data dari database');

    if (lastDbStatus !== 'Connected') {
      io.emit('db_status', 'Connected');
      lastDbStatus = 'Connected';
    }
  } catch (err) {
    console.error('⚠️ Gagal mengambil data dari database:', err.message);

    if (lastDbStatus !== 'Disconnected') {
      io.emit('db_status', 'Disconnected');
      lastDbStatus = 'Disconnected';
    }
  }
}, 2000);

server.listen(port, () => {
  console.log(` Server berjalan di http://localhost:${port}`);
});
