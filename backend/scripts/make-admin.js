/**
 * Give an existing account admin rights from the command line.
 * The person must have signed in to the website at least once.
 *
 * Usage:
 *   npm run make-admin -- owner@example.com              → admin
 *   npm run make-admin -- owner@example.com superadmin   → super admin
 *   npm run make-admin -- someone@example.com user       → back to customer
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const config = require('../src/config/env');
const { User } = require('../src/models');
const { ROLES } = require('../src/utils/roles');

async function main() {
  const [email, role = ROLES.ADMIN] = process.argv.slice(2);

  if (!email || !Object.values(ROLES).includes(role)) {
    console.error(`Usage: npm run make-admin -- <email> [${Object.values(ROLES).join('|')}]`);
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(config.mongo.uri);
  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      console.error(`No account found for ${email}. Sign in to the website once with this email, then run this again.`);
      process.exitCode = 1;
      return;
    }
    user.role = role;
    await user.save();
    console.log(`${user.email} is now: ${role}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
