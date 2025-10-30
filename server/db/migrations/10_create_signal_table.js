/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('signal', table => {
    table.increments('id').primary();
    table.integer('server_id').notNullable();
    table.foreign('server_id').references('server.id');
    table.integer('target_id').notNullable();
    table.foreign('target_id').references('target.id');
    table.double('frequency').notNullable();
    table.double('power').notNullable();
    table.double('bandwidth').notNullable();
    table.string('modulation').notNullable();
    table.string('fec').notNullable();
    table.string('feed').notNullable();
    table.boolean('operational').defaultTo(false);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable('signal');
};
