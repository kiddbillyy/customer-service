import axios from 'axios';
const API = 'https://api.mercadolibre.com';

export async function fetchOrderById(orderId, token) {
  const { data } = await axios.get(`${API}/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return data;
}

export async function fetchShipmentById(shipmentId, token) {
  const { data } = await axios.get(`${API}/shipments/${shipmentId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return data;
}

export function extractId(resource, expected) {
  const path = resource.startsWith('http') ? new URL(resource).pathname : resource;
  const parts = path.split('/').filter(Boolean);
  const i = parts.findIndex(p => p === expected);
  return i >= 0 ? parts[i + 1] : null;
}
