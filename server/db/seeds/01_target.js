/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async function (knex) {
  // Deletes ALL existing entries
  await knex.schema.raw('TRUNCATE target CASCADE');
  await knex('target').del();
  await knex('target').insert([
    { id: 1, name: 'ARKE 3G', offset: 400 },
    { id: 2, name: 'AURORA 2B', offset: 450 },
    { id: 3, name: 'AUXO STAR', offset: 420 },
    { id: 4, name: 'ENYO', offset: 300 },
    { id: 5, name: 'HASHCOMM 7', offset: 365 },
    { id: 6, name: 'HUF UHF FO', offset: 210 },
    { id: 7, name: 'MERCURY PAWN', offset: 150 },
    { id: 8, name: 'NYXSAT', offset: 250 },
    { id: 9, name: 'RASCAL', offset: 120 },
    { id: 10, name: 'WILL 1-AM', offset: 345 },
  ]);
};
