'use strict';
const { listOrdersRich, getItemsByOrderIds, getStatusHistoryByOrderId } = require('../models/OrdersModel');
const { formatDDMMYYYY_HHmmss_TZ } = require('../utils/dates');

const DEFAULT_SELLER = process.env.OMS_DEFAULT_SELLER_NAME || 'VTEX-WEB';

// Helpers
function mapDeliveryType(t) {
  if (!t) return null;
  const key = String(t).toLowerCase().trim();
  const mapa = {
    residential: 'A Domicilio',
    pickup: 'Retiro en tienda',
    store: 'Retiro en tienda',
  };
  return mapa[key] ?? t;
}

function buildNombre(firstName, lastName) {
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  return name || null;
}

function buildDireccion({ street, number, neighborhood, city, country, referenceAddress }) {
  const base = [
    [street, number].filter(Boolean).join(' ').trim(),
    neighborhood,
    city,
    country
  ].filter(Boolean).join(', ');
  if (!base) return null;
  return referenceAddress ? `${base} (Ref: ${referenceAddress})` : base;
}

function cleanDeliveryCompany(name) {
  if (!name) return name;
  return String(name).replace(/\s*\([^)]*\)\s*$/g, '').trim();
}

// Fake/placeholder mappers para cuando aún no haya datos reales
function buildPickingKpisPlaceholder() {
  return {
    sesiones: 0,              
    contenedores: 0,         
    productosPickeados: 0,    
    itemsPickeados: 0,      
    faltantes: 0,             
    tiempoPickingMin: null,   
    almacenOTienda: null,     
  };
}

function buildFacturacionPlaceholder() {
  return [
    // Estructura esperada; sin datos por ahora
    // { numero: 'F001-123', valor: 12345, fechaCreacion: '...', usuarioCreador: '...', fechaForms: '...', link: 'https://...' }
  ];
}

// clasifica items por categoría si existe un campo; si no, los manda a "Items sueltos"
function groupItemsByCategoria(items = []) {
  const groups = new Map();
  for (const it of items) {
    // si tuvieses categoría (ej: it.categoria), úsala; si no, va a "sin-categoria"
    const categoria = (it.categoria && String(it.categoria).trim()) ? it.categoria : 'Items sueltos';
    if (!groups.has(categoria)) groups.set(categoria, []);
    groups.get(categoria).push(it);
  }
  return Array.from(groups.entries()).map(([categoria, arr]) => ({ categoria, items: arr }));
}

async function getOrderIssueSummary(req, res) {
  try {
    const orderId = Number(req.params.orderId);
    if (!orderId || Number.isNaN(orderId)) {
      return res.status(400).json({ error: 'ORDER_ID_INVALID' });
    }

    // 1) Buscar la orden usando tu model existente con filtro por orderId
    const { rows } = await listOrdersRich({
      page: 1,
      pageSize: 1,
      orderId, // filtro exacto
      sortBy: 'orderID',
      sortDir: 'DESC',
    });

    const r = rows?.[0];
    if (!r) {
      return res.status(404).json({ error: 'ORDER_NOT_FOUND' });
    }

    // 2) Traer items
    const itemsMap = await getItemsByOrderIds([orderId]);
    const items = (itemsMap[orderId] || []).map(it => ({
      producto: it.producto || null,
      itemcode: it.item || null,
      cantidad: it.cantidad != null ? Number(it.cantidad) : null,
      // Si más adelante adicionas categoría al SELECT de Order_Items, mapea aquí:
      // categoria: it.categoria || null,
    }));

    // 3) KPIs de picking (por ahora placeholders)
    const picking = buildPickingKpisPlaceholder();

    // 4) Facturación (por ahora placeholders)
    const facturacion = buildFacturacionPlaceholder();

    // 5) Historial de estados (esto sí existe)
    const historyRaw = await getStatusHistoryByOrderId(orderId);
    const historial = historyRaw.map(h => ({
      status: h.status || null,
      fecha: h.changeDate ? formatDDMMYYYY_HHmmss_TZ(h.changeDate) : null,
      usuario: h.user || null,
    }));

    // 6) Derivados/resumen
    const nombreCliente = buildNombre(r.firstName, r.lastName);
    const createdAt = r.createDate ? formatDDMMYYYY_HHmmss_TZ(r.createDate) : null;

    // Totales simples
    const subtotalPickeado = null; // placeholder hasta que tengas precios unitarios
    const totalOrden = r.total != null ? Number(r.total) : null;

    // Secciones pedidas
    const response = {
      resumen: {
        cliente: {
          nombre: nombreCliente,
          tipoDocumento: null, // placeholder (cuando tengas tipo, mapea aquí)
          documento: r.document || r.customerCardCode || null,
          telefono: r.phone || null,
          email: r.email || null,
          customerType: null, // placeholder
          fechaCreacion: createdAt,
          clusters: [],       // placeholder: ej. ['VIP', 'Recurrente']
        },
        picking,
        totales: {
          subtotal: subtotalPickeado, // placeholder
          total: totalOrden,
        },
        originalsPostPicking: {
          // Placeholder: cuando tengas datos post-picking reales, reemplaza
          itemsPickeados: items.reduce((acc, it) => acc + (it.cantidad || 0), 0),
          subtotal: subtotalPickeado,
          total: totalOrden,
        },
      },

      items: {
        // Lista completa de items originales (si luego tienes origen "originales", cámbialo)
        // Clasificados en categoría; los sin categoría se agrupan como "Items sueltos"
        grupos: groupItemsByCategoria(items),
      },

      facturacion: facturacion.map(f => ({
        numero: f.numero || null,
        valor: f.valor != null ? Number(f.valor) : null,
        fechaCreacion: f.fechaCreacion || null,
        usuarioCreador: f.usuarioCreador || null,
        fechaForms: f.fechaForms || null,
        link: f.link || null,
      })),

      historial, // todos los estados
    };

    // Datos de entrega (opcional añadirlos a la respuesta top-level)
    response.datosEntrega = {
      tipoEntrega: mapDeliveryType(r.addressType) || null,
      direccion: buildDireccion({
        street: r.street, number: r.number, neighborhood: r.neighborhood,
        city: r.city, country: r.country, referenceAddress: r.referenceAddress
      }),
      fechaEntrega: r.deliveryDate ? formatDDMMYYYY_HHmmss_TZ(r.deliveryDate) : null,
      empresaDelivery: cleanDeliveryCompany(r.deliveryCompany) || null,
    };


    response.datosPedido = {
      orderId,
      seller: DEFAULT_SELLER,
      folioNum: r.folioNum != null ? Number(r.folioNum) : null,
      salesChannelReferenceId: r.salesChannelReferenceId || null,
      u_ref1: r.u_ref1 || null,
      customerCardCode: r.customerCardCode || null,
    };

    return res.json(response);
  } catch (e) {
    console.error('getOrderIssueSummary error:', e);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}

module.exports = { getOrderIssueSummary };
