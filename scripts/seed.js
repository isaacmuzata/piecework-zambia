'use strict';
/**
 * Seed the database with demo users and sample jobs.
 * Idempotent-ish: if any users already exist, it does nothing.
 * Wipe first with `npm run wipe` if you want a clean re-seed.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { client, init } = require('../db');

async function main() {
  await init();

  const existing = (await client.execute('SELECT COUNT(*) AS c FROM users')).rows[0].c;
  if (existing > 0) {
    console.log(`Seed skipped: database already has ${existing} user(s). Run "npm run wipe" first to reseed.`);
    return;
  }

  const pw = bcrypt.hashSync('demo1234', 12);
  const insertUser = (name, phone, city, bio, skills) =>
    client.execute({
      sql: 'INSERT INTO users (name, phone, password_hash, city, bio, skills) VALUES (?, ?, ?, ?, ?, ?)',
      args: [name, phone, pw, city, bio, skills],
    });

  const chanda = Number((await insertUser(
    'Chanda Mwansa', '+260977123456', 'Lusaka',
    'Events organiser in Lusaka. I run kitchen parties, weddings and corporate events and always need reliable hands.',
    'Event setup, Ushering, Cooking'
  )).lastInsertRowid);

  const bwalya = Number((await insertUser(
    'Bwalya Kasonde', '+260966234567', 'Kitwe',
    'Hardworking general hand based in Kitwe. Available weekends and most weekdays with short notice.',
    'Moving, Cleaning, Gardening, Painting'
  )).lastInsertRowid);

  const inDays = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };

  // Small realistic offsets from the city centres so distance matching has
  // something to chew on (each entry: [latOffset, lngOffset] in degrees).
  const jobs = [
    {
      poster_id: chanda, title: 'Need 4 people to set up chairs & decor for a wedding',
      category: 'Events Setup',
      description: 'Kitchen party turned wedding setup at Mulungushi Conference Centre. Work involves arranging 300 chairs, tables, draping and helping the decorator. Starts 06:00 sharp, bring your own lunch. Transport refund of K50 on top of pay.',
      city: 'Lusaka', area: 'Showgrounds', date_needed: inDays(3),
      pay_amount: 250, pay_type: 'per_day', workers_needed: 4, whatsapp: '+260977123456',
      lat: -15.3923, lng: 28.3281,
    },
    {
      poster_id: bwalya, title: 'Help moving a 2-bedroom house — truck provided',
      category: 'Moving Help',
      description: 'Moving from Nkana East to Parklands this Saturday. Truck and driver provided; I need 3 strong people to load and offload furniture, boxes and appliances. Roughly 6 hours of work.',
      city: 'Kitwe', area: 'Nkana East', date_needed: inDays(2),
      pay_amount: 200, pay_type: 'per_day', workers_needed: 3, whatsapp: '+260966234567',
      lat: -12.8152, lng: 28.2063,
    },
    {
      poster_id: chanda, title: 'Cleaners needed after church conference (2 days)',
      category: 'Cleaning',
      description: 'Two-day cleaning job after a church conference at Bread of Life. Sweeping, mopping, bins and toilets for the main hall. Cleaning materials provided.',
      city: 'Lusaka', area: 'Emmasdale', date_needed: inDays(5),
      pay_amount: 180, pay_type: 'per_day', workers_needed: 5, whatsapp: '+260977123456',
      lat: -15.4219, lng: 28.2901,
    },
    {
      poster_id: bwalya, title: 'Offload 500 bags of cement from truck',
      category: 'Construction & Labor',
      description: 'Hardware shop in town centre needs 6 people to offload cement from a 30-tonne truck into the warehouse. Heavy work — only apply if you are fit. Expected to finish in one day.',
      city: 'Ndola', area: 'Town Centre', date_needed: inDays(1),
      pay_amount: 150, pay_type: 'per_day', workers_needed: 6, whatsapp: '+260966234567',
      lat: -12.9647, lng: 28.6392,
    },
    {
      poster_id: chanda, title: 'Boda-style delivery rider for lunch orders (1 week)',
      category: 'Delivery & Errands',
      description: 'Restaurant in Kabulonga needs a rider with own motorbike for lunch deliveries, Monday to Friday, 10:00–14:00. Fuel allowance K100/day on top. Must have a valid licence.',
      city: 'Lusaka', area: 'Kabulonga', date_needed: inDays(4),
      pay_amount: 120, pay_type: 'per_day', workers_needed: 2, whatsapp: '+260977123456',
      lat: -15.4081, lng: 28.3482,
    },
    {
      poster_id: bwalya, title: 'Cook needed for 100-guest traditional kitchen party',
      category: 'Cooking & Catering',
      description: 'Need an experienced cook for nshima, village chicken, beef stew and vegetables for about 100 guests. Ingredients provided; you come with your own knives. Cooking starts 05:00 at the venue.',
      city: 'Livingstone', area: 'Nottie Broadie', date_needed: inDays(7),
      pay_amount: 800, pay_type: 'per_job', workers_needed: 1, whatsapp: '+260966234567',
      lat: -17.8502, lng: 25.8621,
    },
    {
      poster_id: chanda, title: 'Garden clearing and hedge trimming',
      category: 'Gardening',
      description: 'Overgrown yard in Roma needs clearing, hedge trimming and rubbish burning. Tools provided (slashers, rakes). Two days of work for 2 people.',
      city: 'Lusaka', area: 'Roma', date_needed: inDays(6),
      pay_amount: 160, pay_type: 'per_day', workers_needed: 2, whatsapp: '+260977123456',
      lat: -15.3712, lng: 28.3015,
    },
    {
      poster_id: bwalya, title: 'Painter for 3-bedroom house interior',
      category: 'Painting',
      description: 'Interior repaint of a 3-bedroom house in Riverside: two coats, ceiling white and walls cream. Paint and brushes provided. Must have own roller tray. About 4 days of work.',
      city: 'Kitwe', area: 'Riverside', date_needed: inDays(8),
      pay_amount: 600, pay_type: 'per_job', workers_needed: 2, whatsapp: '+260966234567',
      lat: -12.7893, lng: 28.2241,
    },
    {
      poster_id: chanda, title: 'Ushers for graduation ceremony (10 people)',
      category: 'Security & Ushering',
      description: 'University graduation at the showgrounds needs 10 smart ushers to direct guests, manage queues and hand out programmes. Black trousers/skirt and white shirt required. 07:00–13:00.',
      city: 'Chipata', area: 'Showgrounds', date_needed: inDays(9),
      pay_amount: 150, pay_type: 'per_day', workers_needed: 10, whatsapp: '+260977123456',
      lat: -13.6281, lng: 32.6402,
    },
    {
      poster_id: bwalya, title: 'Night guard for building site (2 weeks)',
      category: 'Security & Ushering',
      description: 'Building site in Ndola needs a night guard, 18:00–06:00, for two weeks while roofing materials are on site. Must be alert and have traceable references.',
      city: 'Ndola', area: 'Kansenshi', date_needed: inDays(2),
      pay_amount: 90, pay_type: 'per_day', workers_needed: 1, whatsapp: '+260966234567',
      lat: -12.9512, lng: 28.6283,
    },
  ];

  await client.batch(jobs.map((j) => ({
    sql: `INSERT INTO jobs (poster_id, title, category, description, city, area, date_needed,
                             pay_amount, pay_type, workers_needed, whatsapp, lat, lng)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [j.poster_id, j.title, j.category, j.description, j.city, j.area,
      j.date_needed, j.pay_amount, j.pay_type, j.workers_needed, j.whatsapp, j.lat, j.lng],
  })));

  console.log('Seeded 2 demo users (password for both: demo1234) and 10 sample jobs.');
  console.log('  Chanda Mwansa  +260977123456  (poster, Lusaka)');
  console.log('  Bwalya Kasonde  +260966234567  (worker, Kitwe)');
}

main().catch((e) => {
  console.error('Seed failed:', e && e.message ? e.message : e);
  process.exit(1);
});
