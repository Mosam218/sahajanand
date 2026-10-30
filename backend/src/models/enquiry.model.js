const mongoose = require('mongoose');

const ENQUIRY_STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost'];

const enquirySchema = new mongoose.Schema(
  {
    reference: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // Set when the enquiry was sent by a signed-in customer
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    company: { type: String, trim: true, default: '', maxlength: 150 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    city: { type: String, trim: true, default: '', maxlength: 80 },
    // Free text: a model number or a description of what is needed
    product: { type: String, trim: true, default: '', maxlength: 200 },
    quantity: { type: Number, default: 1, min: 1 },
    message: { type: String, trim: true, default: '', maxlength: 2000 },
    status: {
      type: String,
      enum: ENQUIRY_STATUSES,
      default: 'new',
      index: true,
    },
    // Internal notes, never sent to the customer
    notes: { type: String, trim: true, default: '', maxlength: 2000 },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

enquirySchema.index({ createdAt: -1 });
enquirySchema.index({ email: 1 });

const Enquiry = mongoose.model('Enquiry', enquirySchema);

module.exports = Enquiry;
module.exports.ENQUIRY_STATUSES = ENQUIRY_STATUSES;
