import { WebSocketServer } from 'ws';

const server = new WebSocketServer({ 
    port: 8081 
});

const clients = new Set();

server.on('connection', (socket) => {
    clients.add(socket);
    
    console.log('Client connected');

    socket.on('message', (message) => {
        console.log(`Received: ${message}`);
        socket.send(`Server: ${message}`);

        clients.forEach((client) => {
            if (client !== socket && client.readyState === 1) {
                client.send(message);
            }
        });
    });

    socket.on('close', () => {
        console.log('Client disconnected');
        clients.delete(socket);
    });

    socket.on('error', (error) => {
        console.error(`Socket error: ${error.message}`);
    });
});

console.log('WebSocket server is running on ws://localhost:8081');