export default {
  orders:   { path: '/api/orders',    target: 'http://orders-service:5000' , requireAuth: true,  requireRbac: false  },
  picking:  { path: '/api/picking',   target: 'http://picking-service:5001' , requireAuth: true,  requireRbac: false  },
  users:    { path: '/api/users',     target: 'http://user-service:5002' , requireAuth: true,  requireRbac: false  },
  auth:     { path: '/api/auth',      target: 'http://user-service:5002' , requireAuth: false,  requireRbac: false  },
  bundles:  { path: '/api/bundles',   target: 'http://packaging-service:5003' , requireAuth: true,  requireRbac: false  },
  audit:    { path: '/api/audit',     target: 'http://packaging-service:5003' , requireAuth: true,  requireRbac: false  },
  sap:      { path: '/api/sap',       target: 'http://orders-service:5000' , requireAuth: true,  requireRbac: false  },
  scheduler:{ path: '/api/scheduler', target: 'http://sap-integration-service:5004' , requireAuth: true,  requireRbac: false  },
  vtex:     { path: '/api/vtex',      target: 'http://sap-integration-service:5004' , requireAuth: true,  requireRbac: false  },
  inventory:{ path: '/api/inventory', target: 'http://inventory-service:5005' , requireAuth: true,  requireRbac: false  },
  store:    { path: '/api/store',     target: 'http://inventory-service:5005' , requireAuth: true,  requireRbac: false  },
  pricing:  { path: '/api/pricing',   target: 'http://inventory-service:5005' , requireAuth: true,  requireRbac: false  },

  // Rutas Microservicio Catalog Service

  catalog:  { path: '/api/catalog',  target: 'http://catalog-service:5006', requireAuth: true,  requireRbac: true  },
  // Rutas Microservicio ID SERVICE
  idserviceLogin: { path: '/api/idservice/auth/login', target: 'http://id-service:5007' , requireAuth: false, prependBasePath: true },
  idserviceBase: { path: '/api/idservice', target: 'http://id-service:5007', requireAuth: true, prependBasePath: true, requireRbac: false },
  idserviceRecuperar: { method: 'PATCH', path: '/api/idservice/auth/recuperar', target: 'http://id-service:5007', requireAuth: false, prependBasePath: true },
  idserviceCambiarContrasena: { method: 'PATCH', path: '/api/idservice/auth/cambiar-contrasena', target: 'http://id-service:5007', requireAuth: false, prependBasePath: true },
  
  // Rutas Microservicio Email Service
  email:  { path: '/api/email',  target: 'http://email-service:5008', requireAuth: false },
};

