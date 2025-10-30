/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('transmitter', table => {
    table.increments('id').primary();
    table.integer('server_id').notNullable();
    table.foreign('server_id').references('server.id');
    table.integer('team_id').notNullable();
    table.foreign('team_id').references('team.id');
    table.integer('antenna_id').notNullable();
    table.foreign('antenna_id').references('antenna.id');
    table.integer('unit').notNullable();
    table.integer('modem_number').notNullable();
    table.boolean('operational').defaultTo(false);
    table.double('frequency').notNullable();
    table.double('bandwidth').notNullable();
    table.double('power').notNullable();
    table.boolean('transmitting').defaultTo(false);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable('transmitter');
};
