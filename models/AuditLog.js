const mongoose = require('mongoose');

const auditLogSchema = mongoose.Schema(
  {
    action: { type: String, required: true, index: true },
    entityType: { type: String, required: true, index: true },
    entityId: { type: String, index: true },
    actor: {
      id: { type: String, index: true },
      name: { type: String },
      email: { type: String, index: true },
      isAdmin: { type: Boolean, default: false },
    },
    details: { type: mongoose.Schema.Types.Mixed },
    ip: { type: String },
    userAgent: { type: String },
  },
  {
    timestamps: true,
  }
);

auditLogSchema.index({ createdAt: -1, action: 1 });
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
