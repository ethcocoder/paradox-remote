const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let streamer = null;
let controller = null;

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (messageAsString) => {
    try {
      const message = JSON.parse(messageAsString);
      console.log('Received message type:', message.type);

      switch (message.type) {
        case 'register':
          if (message.role === 'streamer') {
            streamer = ws;
            console.log('Streamer registered.');
            ws.send(JSON.stringify({ type: 'registered', role: 'streamer' }));
            if (controller) {
              controller.send(JSON.stringify({ type: 'streamer-ready' }));
            }
          } else if (message.role === 'controller') {
            controller = ws;
            console.log('Controller registered.');
            ws.send(JSON.stringify({ type: 'registered', role: 'controller' }));
            if (streamer) {
              ws.send(JSON.stringify({ type: 'streamer-ready' }));
            }
          }
          break;

        case 'offer':
          // Controller sends offer to Streamer
          if (streamer) {
            console.log('Relaying offer to streamer');
            streamer.send(JSON.stringify({ type: 'offer', offer: message.offer }));
          }
          break;

        case 'answer':
          // Streamer sends answer to Controller
          if (controller) {
            console.log('Relaying answer to controller');
            controller.send(JSON.stringify({ type: 'answer', answer: message.answer }));
          }
          break;

        case 'ice-candidate':
          // Relay ICE candidates
          if (message.target === 'streamer' && streamer) {
            console.log('Relaying ice-candidate to streamer');
            streamer.send(JSON.stringify({ type: 'ice-candidate', candidate: message.candidate }));
          } else if (message.target === 'controller' && controller) {
            console.log('Relaying ice-candidate to controller');
            controller.send(JSON.stringify({ type: 'ice-candidate', candidate: message.candidate }));
          }
          break;

        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (err) {
      console.error('Error parsing message', err);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    if (ws === streamer) {
      streamer = null;
      console.log('Streamer disconnected');
      if (controller) controller.send(JSON.stringify({ type: 'streamer-disconnected' }));
    } else if (ws === controller) {
      controller = null;
      console.log('Controller disconnected');
    }
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});
