/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async function (knex) {
  // Deletes ALL existing entries
  await knex.schema.raw('TRUNCATE team CASCADE');
  await knex('team').del();
  await knex('team').insert([
    { id: 1, name: 'Persephone' },
    { id: 2, name: 'Sisyphus' },
    { id: 3, name: 'Tartarus' },
    { id: 4, name: 'Zagreus' },
  ]);
};
