// src/config/db.js
const mysql = require('mysql2/promise');
const { db } = require('./index');

const pool = mysql.createPool(db);

module.exports = pool;
