/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('save_signal', table => {
    table.increments('id').primary();
    table.integer('save_id').notNullable();
    table.foreign('save_id').references('save.id');
    table.integer('signal_id').notNullable();
    table.foreign('signal_id').references('signal.id');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable('save_signal');
};
