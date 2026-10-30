const crypto = require('crypto');
const mongoose = require('mongoose');
const { Enquiry } = require('../../models');
const ApiError = require('../../utils/ApiError');
const escapeRegex = require('../../utils/escapeRegex');
const escapeHtml = require('../../utils/escapeHtml');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const { sendAdminAlert } = require('../../utils/email');

function generateReference() {
  return `ENQ-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

/**
 * Create a quote request. Open to guests; linked to the account when signed in.
 * @param {object} data - validated enquiry
 * @param {object} [user]
 */
async function createEnquiry(data, user) {
  let enquiry;
  for (let attempt = 0; attempt < 5 && !enquiry; attempt++) {
    try {
      enquiry = await Enquiry.create({
        ...data,
        reference: generateReference(),
        user: user ? user._id : null,
      });
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
  }
  if (!enquiry) throw ApiError.internal('Could not save the enquiry. Please try again.');

  sendAdminAlert(
    `New enquiry ${enquiry.reference}`,
    `${escapeHtml(enquiry.name)} (${escapeHtml(enquiry.phone)}, ${escapeHtml(enquiry.email)}) asked about ` +
      `${escapeHtml(enquiry.product || 'a general enquiry')}, quantity ${enquiry.quantity}.<br/>${escapeHtml(enquiry.message)}`
  ).catch(() => {}); // non-blocking

  return enquiry;
}

/**
 * Enquiries sent from this account.
 */
async function getMyEnquiries(user, query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { user: user._id };

  const [enquiries, total] = await Promise.all([
    Enquiry.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).select('-notes').lean(),
    Enquiry.countDocuments(filter),
  ]);

  return { enquiries, meta: buildMeta(total, page, limit) };
}

/**
 * Admin: list enquiries with search and status filter.
 */
async function listEnquiries(query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};

  if (query.status) filter.status = query.status;
  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ reference: rx }, { name: rx }, { company: rx }, { email: rx }, { phone: rx }, { product: rx }, { city: rx }];
  }

  const [enquiries, total] = await Promise.all([
    Enquiry.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Enquiry.countDocuments(filter),
  ]);

  return { enquiries, meta: buildMeta(total, page, limit) };
}

async function getEnquiryById(id) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid enquiry ID');
  const enquiry = await Enquiry.findById(id).populate('user', 'name email phone');
  if (!enquiry) throw ApiError.notFound('Enquiry not found');
  return enquiry;
}

async function updateEnquiry(id, data) {
  const enquiry = await getEnquiryById(id);
  if (data.status !== undefined) enquiry.status = data.status;
  if (data.notes !== undefined) enquiry.notes = data.notes;
  await enquiry.save();
  return enquiry;
}

async function deleteEnquiry(id) {
  const enquiry = await getEnquiryById(id);
  await Enquiry.findByIdAndDelete(enquiry._id);
}

module.exports = {
  createEnquiry,
  getMyEnquiries,
  listEnquiries,
  getEnquiryById,
  updateEnquiry,
  deleteEnquiry,
};
