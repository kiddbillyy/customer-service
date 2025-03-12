import http from 'k6/http';
import { check, sleep } from 'k6';

// 🔥 Configuración de la prueba
export let options = {
  stages: [
    { duration: '10s', target: 50 },  // 🚀 Subir a 10 usuarios en 10s
    { duration: '30s', target: 100 },  // 📈 Mantener 50 usuarios por 30s
    { duration: '20s', target: 1000 }, // 🔥 Subir a 100 usuarios en 20s
    { duration: '20s', target: 100 },   // 📉 Bajar carga
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% de las peticiones deben responder en menos de 500ms
    http_req_failed: ['rate<0.01'],   // Menos del 1% de errores
  },
};

export default function () {
  let orderID = 9747; // 🚀 ID de orden de prueba
  let pickerRUT = 20759841;

  let endpoints = [
    `/api/picking/products/${orderID}`, // Obtener productos de una orden
    `/api/picking/assigned/${pickerRUT}`, // Obtener productos asignados a un picker
    `/api/picking/statuses`, // Obtener un producto específico
  ];

  let randomIndex = Math.floor(Math.random() * endpoints.length);
  let url = `http://localhost:5001${endpoints[randomIndex]}`;

  let res = http.get(url);

  // ✅ Validaciones
  check(res, {
    '📌 Estado 200 OK': (r) => r.status === 200,
    '⚡ Tiempo de respuesta <500ms': (r) => r.timings.duration < 500,
  });

  sleep(1); // ⏳ Simula tiempo de espera entre peticiones
}
