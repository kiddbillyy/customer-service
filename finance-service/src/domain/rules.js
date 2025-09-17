// domain/rules.js
const IVA_FACTOR = 1.19;

function isCorporate(order) {
  if (typeof order?.fulfillment?.isCorporate === 'boolean') {
    return order.fulfillment.isCorporate;
  }
  return false;
}

function toDecimal(value) {
  return Number(Number(value || 0).toFixed(2));
}

function freightNetFromGross(gross) {
  const net = (Number(gross || 0) / IVA_FACTOR);
  return Number(net.toFixed(2));
}

module.exports = {
  IVA_FACTOR,
  isCorporate,
  toDecimal,
  freightNetFromGross
};
