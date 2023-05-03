import UDP from 'dgram';
import { HOSTNAME, PACKET_SIZE, PORT } from './global';
import { createHash } from 'crypto';
import chalk from 'chalk';

// Setting packet size
const packetSize = PACKET_SIZE.MEDIUM;

// Setting message offset (4 bytes for sequence number, 16 bytes for hash)
const messageOffset = 20;

// Creating buffer to store message
let buffer = Buffer.from([]);

// Creating hash to store hash from received message
let receivedHash = Buffer.from([]);

// Creating receiver socket
const receiver = UDP.createSocket({ type: 'udp4', recvBufferSize: packetSize });

receiver.on('listening', () => {

  // Address, the receiver is listening on
  const address = receiver.address();
  console.log(`Listening on ${chalk.white.bold(address.address + ":" + address.port)}\n`);
})

// Setting number of packets received to 0
let noOfPacketsReceived = 0;

receiver.on('message', (message, info) => {
  // Updating number of packets received
  noOfPacketsReceived += 1;

  if (message.toString() === "END") {
    console.log("\n\nEND OF TRANSMISSION");

    // Creating hash from received data
    const currentBufferHash = createHash("md5").update(buffer).digest();
    
    // Comparing received hash and current buffer hash
    console.log("\n");
    console.log(Buffer.compare(receivedHash, currentBufferHash) === 0 ? chalk.green.bold("No data loss detected!") : chalk.red.bold("Data loss detected!"));
    console.log("\n");
    
    // Closing receiver socket
    receiver.close();
  } else {
    if (noOfPacketsReceived === 1) {
      // Setting received hash
      receivedHash = message.subarray(4, 20);

      // Setting buffer to message (excluding sequence number and hash)
      buffer = Buffer.concat([buffer, message.subarray(messageOffset, message.length)]);
    } else {
      // Setting buffer to message
      buffer = Buffer.concat([buffer, message]);
    }

    // Writing status to stdout
    process.stdout.write("\r\x1b[K");
    process.stdout.write(`${noOfPacketsReceived} Packet(s) received successfully!`);
  }
})

receiver.bind({ port: PORT, address: HOSTNAME });
