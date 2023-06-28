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
  MAX_SEQUENCE_NUMBER_OFFSET,
  HASH_SIZE
} from './global';
import { createHash } from 'crypto';
import chalk from 'chalk';
import { bufferToNumber } from './utils';


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
})

// Setting number of packets received initially to 0
let noOfPacketsReceived = 0;

// Setting start time initially to 0 milliseconds
let startTime = 0;

// Setting end time initially to 0 milliseconds
let endTime = 0;

// Setting receiving rate sum initially to 0 - would be used to calculate average receiving rate
let receivingRateSum = 0;

// Setting packets length initially to 0
let packetsLength = 0;

receiver.on('message', (message, info) => {
  // Updating number of packets received
  noOfPacketsReceived += 1;

  if (noOfPacketsReceived === 1) {
    // Updating start time
    startTime = Date.now();

    // Updating packets length
    packetsLength = bufferToNumber(message.subarray(MAX_SEQUENCE_NUMBER_OFFSET, MAX_SEQUENCE_NUMBER_OFFSET + SEQUENCE_NUMBER_SIZE), 4) + 1;
  } else if (noOfPacketsReceived === packetsLength) {
    // Setting received hash
    receivedHash = message.subarray(HASH_OFFSET, HASH_OFFSET + HASH_SIZE);
  } else {
    // Appending message to the buffer
    buffer = Buffer.concat([buffer, message.subarray(MESSAGE_OFFSET, message.length)]);
    // Closing receiver socket
  }

  let transmissionID, sequenceNo;

  transmissionID = message.subarray(0, TRANSMISSION_ID_SIZE);
  sequenceNo = message.subarray(SEQUENCE_NUMBER_OFFSET, SEQUENCE_NUMBER_OFFSET + SEQUENCE_NUMBER_SIZE);

  const acknowledgement = Buffer.concat([transmissionID, sequenceNo]);

  const timeElapsed = Math.max(Date.now() - startTime, 1);
  const receivingRate = (noOfPacketsReceived * packetSize) / (timeElapsed * 1000);
  
  if(noOfPacketsReceived > 1) {
    receivingRateSum += receivingRate;
  }

  // Writing status to stdout
  process.stdout.write("\r\x1b[K");
  process.stdout.write(`Packets received: ${chalk.yellow(noOfPacketsReceived)}      Receiving rate: ${chalk.green(receivingRate.toFixed(3))} MB/s      Time elapsed: ${chalk.yellow(timeElapsed)} ms`);


  // Sending acknowledgement
  receiver.send(acknowledgement, PORT.SENDER, HOSTNAME, (err) => {
    if (err) {
      console.error('Error:', err);
    }
    if (noOfPacketsReceived === packetsLength) {
      // Closing receiver socket
      receiver.close();
    }
  });
})

receiver.on('close', () => {
  // Setting end time
  endTime = Date.now();

  // Creating hash from received data
  const currentBufferHash = createHash("md5").update(buffer).digest();

  // Comparing received hash and current buffer hash
  console.log("\n");
  console.log(Buffer.compare(receivedHash, currentBufferHash) === 0 ? chalk.green.bold("No data loss detected!\n") : chalk.red.bold("Data loss detected!\n"));

  const averageReceivingRate = receivingRateSum / noOfPacketsReceived;
  console.log(`Average receiving rate: ${chalk.green(averageReceivingRate.toFixed(3))} MB/s\n`);
});

receiver.bind({ port: PORT.RECEIVER, address: HOSTNAME });
