const express = require('express');
const cors = require('cors');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const env = process.env.NODE_ENV || 'development';
const config = require('../knexfile')[env];
const knex = require('knex')(config);

app.use(cors());
app.use(express.json());

/**
 * This is used for managing all of the user's sockets
 */
const clientManager = {
  clients: [],
  /**
   * Adds a client to the list of clients
   * @typedef {import("socket.io").Socket} Socket
   * @param {Socket } client
   */
  addClient: client => {
    clientManager.clients.push(client);
  },
};

io.on('connection', socket => {
  clientManager.addClient(socket);
  console.log(`user ${socket.id} connected`);
  socket.on('disconnect', () => {
    console.log(`user ${socket.id} disconnected`);
  });

  socket.on('updateTeam', update => {
    const user = clientManager.clients.filter(client => client.id === socket.id);
    if (user.length > 0) {
      user[0].team = update.team;
      console.log(`user ${socket.id} updated team to ${update.team}`);
    } else {
      console.log(`user ${socket.id} not found`);
    }
  });

  socket.on('updateTx', update => {
    console.log(`sending updateTX and update Signals to clients`);
    clientManager.clients.forEach(client => {
      client.emit('updateSignals', update);
      client.emit('updateTxClient', update);
      //anytime in transmitter apply is pressed update the signals
      //anytime in antenna baseball or hpa is turned on update the signals
    });
  });

  socket.on('updateRx', update => {
    console.log(`sending updateRX to clients`);
    clientManager.clients.forEach(client => {
      client.emit('updateRxClient', update);
    });
  });

  socket.on('updateSpecA', update => {
    console.log(`sending updateSpecA to clients`);
    clientManager.clients.forEach(client => {
      if (client.id !== socket.id) {
        client.emit('updateSpecA', update);
      }
    });
  });

  socket.on('updateAntenna', update => {
    console.log(`sending updateAntenna to clients`);
    clientManager.clients.forEach(client => {
      client.emit('updateAntennaClient', update);
    });
  });
});

app.get('/', (request, response) => {
  response.status(200).send('App root route running');
});

app.get('/authors', (request, response) => {
  knex('app_authors').then(data => {
    if (data.length === 0) {
      response.status(404).send('No authors found');
    } else {
      response.status(200).send(data);
    }
  });
});

app.get('/data/:table_name', (request, response) => {
  const builder = knex(request.params.table_name);

  if (request.query.id) builder.where('id', request.query.id);
  if (request.query.server_id) builder.where('server_id', request.query.server_id);
  if (request.query.team_id) builder.where('team_id', request.query.team_id);

  builder
    .then(responseData => {
      response.status(200).send(responseData);
    })
    .catch(err => {
      response.status(500).send(err);
    });
});

app.post('/data/:table_name', (request, response) => {
  knex(request.params.table_name)
    .insert(request.body)
    .then(() => {
      response.status(200).send(`${request.params.table_name} created`);
    })
    .catch(error => {
      response.status(500).send(error);
    });
});

app.patch('/data/:table_name', (request, response) => {
  if (request.query.id !== undefined) {
    console.log(request.body);
    knex(request.params.table_name)
      .where('id', request.query.id)
      .update(request.body)
      .then(() => {
        response.status(200).send(`${request.params.table_name} updated`);
      })
      .catch(error => {
        response.status(500).send(error);
      });
  } else {
    response.status(500).send('No id specified');
  }
});

app.delete('/data/:table_name', (request, response) => {
  if (['signal', 'save'].includes(request.params.table_name) && request.query.id !== undefined) {
    knex(request.params.table_name)
      .where('id', request.query.id)
      .del()
      .then(() => {
        response.status(200).send(`${request.params.table_name} deleted`);
      })
      .catch(error => {
        response.status(500).send(error);
      });
  } else {
    response.status(500).send('No id specified, or table name is not valid');
  }
});

module.exports = server;
