const AuditLog = require('../models/AuditLog');

const ALLOWED_AUDIT_ACTIONS = new Set([
  'order_marked_delivered',
  'order_status_updated',
  'orders_bulk_status_updated',
  'discount_created',
  'discount_updated',
  'discount_archived',
  'discount_restored',
  'discount_purged',
  'product_created',
  'product_updated',
  'product_archived',
  'product_restored',
  'product_purged',
  'products_bulk_availability_updated',
  'products_bulk_price_updated',
  'user_admin_access_changed',
  'user_archived',
  'user_restored',
  'user_purged',
  'site_config_updated',
  'delivery_routes_updated',
]);

const parseIp = (req) => {
  if (!req) return '';
  if (req.headers && req.headers['x-forwarded-for']) {
    const forwarded = String(req.headers['x-forwarded-for']).split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return req.ip || '';
};

const buildActorFromReq = (req) => ({
  id: req && req.user && req.user._id ? String(req.user._id) : undefined,
  name: req && req.user && req.user.name ? String(req.user.name) : undefined,
  email: req && req.user && req.user.email ? String(req.user.email) : undefined,
  isAdmin: Boolean(req && req.user && req.user.isAdmin),
});

const logAuditEvent = async ({ req, actor, action, entityType, entityId, details }) => {
  if (!action || !entityType) return;
  if (!ALLOWED_AUDIT_ACTIONS.has(action)) return;

  try {
    await AuditLog.create({
      action,
      entityType,
      entityId: entityId ? String(entityId) : undefined,
      actor: {
        id: actor && actor.id ? String(actor.id) : undefined,
        name: actor && actor.name ? String(actor.name) : undefined,
        email: actor && actor.email ? String(actor.email) : undefined,
        isAdmin: Boolean(actor && actor.isAdmin),
      },
      details: details || {},
      ip: parseIp(req),
      userAgent: req && req.get ? req.get('user-agent') || '' : '',
    });
  } catch (error) {
    console.error('Failed to write audit log:', error.message || error);
  }
};

module.exports = {
  ALLOWED_AUDIT_ACTIONS,
  buildActorFromReq,
  logAuditEvent,
};
