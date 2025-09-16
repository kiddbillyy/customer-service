const IVA_FACTOR = 1.19;

function isCorporate(order) {
  const p = order?.vtexSnapshot?.clientProfileData || order?.clientProfileData || {};
  const corp = p.corporateName && String(p.corporateName).trim();
  return !!corp;
}

// Convierte centavos (int) -> decimal (Number con 2 decimales)
function centsToDecimal(cents) {
  return Number((Number(cents || 0) / 100).toFixed(2));
}

// Flete: de bruto (con IVA, en centavos) -> UnitPrice neto (decimal)
function freightNetFromGrossCents(grossCents) {
  const gross = centsToDecimal(grossCents); // a pesos con decimales
  const net = gross / IVA_FACTOR;
  return Number(net.toFixed(2));
}

module.exports = {
  IVA_FACTOR,
  isCorporate,
  centsToDecimal,
  freightNetFromGrossCents
};
