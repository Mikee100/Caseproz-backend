const mongoose = require('mongoose');

const analyticsEventSchema = mongoose.Schema(
  {
    eventName: { type: String, required: true },
    page: { type: String, default: 'home' },
    section: { type: String },
    label: { type: String },
    sessionId: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed },
    userAgent: { type: String },
    referrer: { type: String },
    ip: { type: String },
  },
  {
    timestamps: true,
  }
);

analyticsEventSchema.index({ eventName: 1, createdAt: -1 });
analyticsEventSchema.index({ page: 1, section: 1, createdAt: -1 });

const AnalyticsEvent = mongoose.model('AnalyticsEvent', analyticsEventSchema);

module.exports = AnalyticsEvent;
