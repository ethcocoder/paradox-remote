const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const streamers = new Map();   // Map<deviceId, { ws, info }>
const controllers = new Map(); // Map<socketId, ws>
let nextId = 0;

const broadcastDeviceList = () => {
  const deviceList = Array.from(streamers.entries()).map(([id, data]) => ({
    id,
    ...data.info
  }));
  controllers.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'device-list', devices: deviceList }));
    }
  });
};


// Dashboard Landing Page
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="background: #09090b; color: #fff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column;">
        <div style="background: #111; padding: 40px; border-radius: 20px; border: 1px solid #333; box-shadow: 0 10px 40px rgba(0,0,0,0.5); text-align: center;">
          <h1 style="background: linear-gradient(45deg, #00e5ff, #007acc); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 30px;">Paradox Engine Status</h1>
          <div style="display: flex; gap: 20px; justify-content: center;">
            <div style="padding: 20px; background: rgba(255,255,255,0.03); border-radius: 12px; border: 1px solid #444;">
              <div style="width: 12px; height: 12px; border-radius: 50%; background: ${streamers.size > 0 ? '#00ffcc' : '#ff3366'}; display: inline-block; box-shadow: 0 0 10px ${streamers.size > 0 ? '#00ffcc' : '#ff3366'};"></div>
              <p style="margin-top: 10px;">Mobile Streamers: ${streamers.size}</p>
            </div>
            <div style="padding: 20px; background: rgba(255,255,255,0.03); border-radius: 12px; border: 1px solid #444;">
              <div style="width: 12px; height: 12px; border-radius: 50%; background: ${controller ? '#00ffcc' : '#ff3366'}; display: inline-block; box-shadow: 0 0 10px ${controller ? '#00ffcc' : '#ff3366'};"></div>
              <p style="margin-top: 10px;">Desktop Controller</p>
            </div>
          </div>
          <p style="margin-top: 30px; color: #888;">System is active and listening for WebRTC handshakes.</p>
        </div>
      </body>
    </html>
  `);
});

wss.on('connection', (ws) => {
  const socketId = `node_${++nextId}`;
  console.log('New connection:', socketId);

  ws.on('message', (messageAsString) => {
    try {
      const message = JSON.parse(messageAsString);

      switch (message.type) {
        case 'register':
          if (message.role === 'streamer') {
            const deviceId = message.device.id;
            // Flush Zombie connection
            if (streamers.has(deviceId)) {
              console.log('Refreshing connection for:', deviceId);
              streamers.get(deviceId).ws.close();
            }
            streamers.set(deviceId, { ws, info: message.device });
            ws.deviceId = deviceId;
            ws.role = 'streamer';
            broadcastDeviceList();
          } else if (message.role === 'controller') {
            controllers.set(socketId, ws);
            ws.role = 'controller';
            broadcastDeviceList();
          }
          break;

        case 'offer':
          if (message.targetId && streamers.has(message.targetId)) {
            streamers.get(message.targetId).ws.send(JSON.stringify({ 
               type: 'offer', 
               offer: message.offer, 
               controllerId: socketId 
            }));
          }
          break;

        case 'answer':
          if (message.controllerId && controllers.has(message.controllerId)) {
            controllers.get(message.controllerId).send(JSON.stringify({ 
               type: 'answer', 
               answer: message.answer 
            }));
          }
          break;

        case 'ice-candidate':
          if (message.target === 'streamer' && message.targetId && streamers.has(message.targetId)) {
            streamers.get(message.targetId).ws.send(JSON.stringify({ type: 'ice-candidate', candidate: message.candidate }));
          } else if (message.target === 'controller' && message.controllerId && controllers.has(message.controllerId)) {
            controllers.get(message.controllerId).send(JSON.stringify({ type: 'ice-candidate', candidate: message.candidate }));
          }

          break;
      }
    } catch (err) { console.error(err); }
  });

  ws.on('close', () => {
    if (ws.role === 'streamer') streamers.delete(ws.deviceId);
    else controllers.delete(socketId);
    broadcastDeviceList();
  });
});


const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
  
  // Heartbeat to prevent Render from killing the connection
  setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    });
  }, 30000); 
});
