export class IntegrationError extends Error {
  constructor(message, meta) { super(message); this.name = 'IntegrationError'; this.meta = meta; }
}
