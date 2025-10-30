/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async function (knex) {
  await knex('app_authors').del();
  await knex('app_authors').insert([
    { first_name: 'Collin', last_name: 'Gilmore' },
    { first_name: 'Shane', last_name: 'Askins' },
    { first_name: 'Theodore', last_name: 'Kruczek' },
    { first_name: 'Brett', last_name: 'Peters' },
    { first_name: 'Brandon', last_name: 'Hufstetler' },
  ]);
};
