/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('signals', table => {
    table.increments();
    table.integer('user_id').unsigned();
    table.decimal('amplitude');
    table.decimal('frequency');
    table.decimal('power');
    table.decimal('bandwidth');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('signals');
};
