/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('receiver', table => {
    table.increments('id').primary();
    table.integer('server_id').notNullable();
    table.foreign('server_id').references('server.id');
    table.integer('team_id').notNullable();
    table.foreign('team_id').references('team.id');
    table.integer('unit').notNullable();
    table.boolean('operational').defaultTo(false);
    table.double('frequency').notNullable();
    table.double('bandwidth').notNullable();
    table.integer('number').notNullable();
    table.integer('antenna_id').notNullable();
    table.foreign('antenna_id').references('antenna.id');
    table.string('modulation').notNullable();
    table.string('fec').notNullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable('receiver');
};
