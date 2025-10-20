import axios from 'axios';

const baseURL = process.env.OMS_BASE_URL;
const API_KEY = process.env.OMS_API_KEY || '';

export async function postToOms(payload) {
  const url = `${baseURL}/orders`; // ajusta a tu endpoint real
  const { data } = await axios.post(url, payload, {
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
    timeout: 15000
  });
  return data; // esperado: { orderId: 'UUID', ... }
}
