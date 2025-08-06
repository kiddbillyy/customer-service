export default {
  orders:   { path: '/api/orders',    target: 'http://orders-service:5000' },
  picking:  { path: '/api/picking',   target: 'http://picking-service:5001' },
  users:    { path: '/api/users',     target: 'http://user-service:5002' },
  auth:     { path: '/api/auth',      target: 'http://user-service:5002' },
  bundles:  { path: '/api/bundles',   target: 'http://packaging-service:5003' },
  audit:    { path: '/api/audit',     target: 'http://packaging-service:5003' },
  sap:      { path: '/api/sap',       target: 'http://orders-service:5000' },
  scheduler:{ path: '/api/scheduler', target: 'http://sap-integration-service:5004' },
  vtex:     { path: '/api/vtex',      target: 'http://sap-integration-service:5004' },
  inventory:{ path: '/api/inventory', target: 'http://inventory-service:5005' },
  store:    { path: '/api/store',     target: 'http://inventory-service:5005' },
  pricing:  { path: '/api/pricing',   target: 'http://inventory-service:5005' },

  // Rutas Microservicio Catalog Service

  // catalog: { path: '/api/catalog', target: 'http://catalog-service:5006', requireAuth: true, prependBasePath: true },
  catalog:  { path: '/api/catalog',  target: 'http://catalog-service:5006', requireAuth: true,  requireRbac: true  },

  // Rutas Microservicio ID SERVICE
  idserviceLogin: {
    path: '/api/idservice/auth/login',
    target: 'http://id-service:5007',
    requireAuth: false,
    prependBasePath: true
  },

  idserviceBase: {
    path: '/api/idservice',
    target: 'http://id-service:5007',
    requireAuth: false,
    prependBasePath: true,
    requireRbac: true
  },
  

  idserviceRecuperar: {
    method: 'PATCH',
    path: '/api/idservice/auth/recuperar',
    target: 'http://id-service:5007',
    requireAuth: false,
    prependBasePath: true
  },

  idserviceCambiarContrasena: {
    method: 'PATCH',
    path: '/api/idservice/auth/cambiar-contrasena',
    target: 'http://id-service:5007',
    requireAuth: false,
    prependBasePath: true
  },
  email:  { path: '/api/email',  target: 'http://email-service:5008', requireAuth: false },
};

