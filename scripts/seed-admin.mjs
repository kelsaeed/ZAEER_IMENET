// Admin seeder for Zaeer Imenet.
//
// Usage (after filling .env.local):
//   npm run seed:admin
//
// Reads SEED_ADMIN_* from the environment, NEVER from a checked-in file.
// The password is sent over HTTPS to Supabase, which hashes it (bcrypt) and
// stores only the hash. The seeder script does not write the password to
// any local file or table.
//
// Idempotent: if the user already exists it just upgrades their profile to
// admin instead of failing.

import { createClient } from '@supabase/supabase-js';

const url            = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey     = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail     = process.env.SEED_ADMIN_EMAIL;
const adminPassword  = process.env.SEED_ADMIN_PASSWORD;
const adminUsername  = process.env.SEED_ADMIN_USERNAME ?? 'admin';
const adminName      = process.env.SEED_ADMIN_NAME ?? 'Admin';

function die(msg) {
  console.error('✖', msg);
  process.exit(1);
}

if (!url)            die('Missing NEXT_PUBLIC_SUPABASE_URL.');
if (!serviceKey)     die('Missing SUPABASE_SERVICE_ROLE_KEY (server-only key).');
if (!adminEmail)     die('Missing SEED_ADMIN_EMAIL.');
if (!adminPassword)  die('Missing SEED_ADMIN_PASSWORD.');
if (adminPassword.length < 10) die('SEED_ADMIN_PASSWORD must be at least 10 characters.');

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

async function findUserByEmail(email) {
  // listUsers paginates — first 1000 is enough for a brand-new project.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) die(`listUsers failed: ${error.message}`);
  return data.users.find(u => (u.email ?? '').toLowerCase() === email.toLowerCase()) ?? null;
}

console.log(`→ Seeding admin: ${adminEmail} (username: ${adminUsername})`);

let user = await findUserByEmail(adminEmail);

if (!user) {
  const { data, error } = await admin.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true, // skip the email-verify step for the bootstrap admin
    user_metadata: { username: adminUsername, display_name: adminName },
  });
  if (error) die(`createUser failed: ${error.message}`);
  user = data.user;
  console.log(`✔ Created auth user ${user.id}`);
} else {
  console.log(`• User already exists (${user.id}) — skipping create.`);
  // Reset the password to whatever the env says so the seeder is the source of truth.
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    password: adminPassword,
    email_confirm: true,
    user_metadata: { username: adminUsername, display_name: adminName },
  });
  if (error) die(`updateUserById failed: ${error.message}`);
  console.log('✔ Password & metadata refreshed.');
}

// Mark profile as admin (the trigger already inserted the row on create).
const { error: profErr } = await admin
  .from('profiles')
  .update({
    is_admin: true,
    username: adminUsername,
    display_name: adminName,
  })
  .eq('id', user.id);

if (profErr) die(`profile update failed: ${profErr.message}`);

console.log('✔ Profile flagged as admin.');
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  Admin ready: ${adminEmail}`);
console.log(`  Username:    ${adminUsername}`);
console.log(`  Display:     ${adminName}`);
console.log(`  ID:          ${user.id}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log('⚠  Sign in once, then change the password from the profile page.');
console.log('⚠  Remove SEED_ADMIN_* lines from .env.local after this runs.');
