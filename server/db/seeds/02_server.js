/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async function (knex) {
  // Deletes ALL existing entries
  await knex.schema.raw('TRUNCATE server CASCADE');
  await knex('server').del();
  await knex('server').insert([{ id: 1, name: '533TRS' }]);
};
