import UDP from 'dgram';
import {
  HOSTNAME,
  PACKET_SIZE,
  PORT,
  TRANSMISSION_ID_SIZE,
  SEQUENCE_NUMBER_SIZE,
  SEQUENCE_NUMBER_OFFSET,
  HASH_OFFSET,
  MESSAGE_OFFSET,
  FITST_PACKET_MESSAGE_OFFSET,
  TRANSMISSION_START_MESSAGE,
  TRANSMISSION_END_MESSAGE
} from './global';
import { createHash } from 'crypto';
import chalk from 'chalk';


// Setting packet size
const packetSize = PACKET_SIZE.SMALL;

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

  receiver.send(Buffer.from(TRANSMISSION_START_MESSAGE), PORT.SENDER, HOSTNAME, (err) => {
    if (err) {
      console.error('Error:', err);
    } else {
      // Setting start time
      startTime = Date.now();
    }
  })
})

// Setting number of packets received initially to 0
let noOfPacketsReceived = 0;

// Setting start time initially to 0 milliseconds
let startTime = 0;

// Setting end time initially to 0 milliseconds
let endTime = 0;

receiver.on('message', (message, info) => {
  // Updating number of packets received
  noOfPacketsReceived += 1;

  let transmissionID, sequenceNo;

  if (message.toString() === TRANSMISSION_END_MESSAGE) {
    // Setting end time
    endTime = Date.now();

    // Creating hash from received data
    const currentBufferHash = createHash("md5").update(buffer).digest();

    // Comparing received hash and current buffer hash
    console.log("\n");
    console.log(Buffer.compare(receivedHash, currentBufferHash) === 0 ? chalk.green.bold("No data loss detected!\n") : chalk.red.bold("Data loss detected!\n"));

    // Closing receiver socket
    receiver.close();
  } else {
    if (noOfPacketsReceived === 1) {
      // Setting received hash
      receivedHash = message.subarray(HASH_OFFSET, FITST_PACKET_MESSAGE_OFFSET);

      // Setting buffer to message (excluding sequence number and hash)
      buffer = Buffer.concat([buffer, message.subarray(FITST_PACKET_MESSAGE_OFFSET, message.length)]);
    } else {
      // Appending message to the buffer
      buffer = Buffer.concat([buffer, message.subarray(MESSAGE_OFFSET, message.length)]);
    }

    transmissionID = message.subarray(0, TRANSMISSION_ID_SIZE);
    sequenceNo = message.subarray(SEQUENCE_NUMBER_OFFSET, SEQUENCE_NUMBER_OFFSET + SEQUENCE_NUMBER_SIZE);

    const acknowledgement = Buffer.concat([transmissionID, sequenceNo]);

    // Sending acknowledgement
    receiver.send(acknowledgement, PORT.SENDER, HOSTNAME, (err) => {
      if (err) {
        console.error('Error:', err);
      }
    });

    const timeElapsed = Date.now() - startTime;
    const receivingRate = (noOfPacketsReceived * packetSize) / (timeElapsed * 1000);

    // Writing status to stdout
    process.stdout.write("\r\x1b[K");
    process.stdout.write(`Packets received: ${chalk.yellow(noOfPacketsReceived)}      Receiving rate: ${chalk.green(receivingRate.toFixed(3))} kB/s      Time elapsed: ${chalk.yellow(timeElapsed)} ms`);
  }
})

receiver.bind({ port: PORT.RECEIVER, address: HOSTNAME });
