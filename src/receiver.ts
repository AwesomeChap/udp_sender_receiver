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
  HASH_SIZE,
  WINDOW_SIZE,
  STANDBY_TIMEOUT
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

let windowBuffer: Buffer[] = [];
let windowBufferItemsReceived = 0;
let lastPacketTransmissionId = Buffer.from([0, 1]);
let lastPacketSequenceNo = Buffer.from([0, 0, 0, 0]);
let windowBufferTimeOut: null | ReturnType<typeof setTimeout> = null;

receiver.on('message', (message, info) => {
  // Updating number of packets received
  noOfPacketsReceived += 1;
  if (noOfPacketsReceived === 1) {
    // Updating start time
    startTime = Date.now();
  }

  // Updating window buffer items received
  windowBufferItemsReceived += 1;
  if (windowBufferItemsReceived > WINDOW_SIZE) {
    windowBufferItemsReceived = windowBufferItemsReceived - WINDOW_SIZE;
    windowBuffer = [];
  }

  // Appending message to the window buffer
  windowBuffer.push(message);

  // Clearing previous timeouts (if any)
  if (windowBufferTimeOut != null) {
    clearTimeout(windowBufferTimeOut);
    windowBufferTimeOut = null;
  }

  windowBufferTimeOut = setTimeout(() => {
    // Creating duplicate acknowledgement
    const cummAck = Buffer.concat([lastPacketTransmissionId, lastPacketSequenceNo]);
    noOfPacketsReceived -= windowBufferItemsReceived;
    windowBufferItemsReceived = 0;
    windowBuffer = [];

    // Sending duplicate acknowledgement
    receiver.send(cummAck, PORT.SENDER, HOSTNAME, (err) => {
      if (err) {
        console.error('Error:', err);
      }
    });
  }, STANDBY_TIMEOUT);

  if (windowBufferItemsReceived === WINDOW_SIZE || noOfPacketsReceived === packetsLength) {
    clearTimeout(windowBufferTimeOut);
    const lastPacketIndex = (noOfPacketsReceived === packetsLength && noOfPacketsReceived < WINDOW_SIZE) ? noOfPacketsReceived % WINDOW_SIZE - 1 : windowBufferItemsReceived - 1;

    // Sorting window buffer by sequence number
    windowBuffer.sort((a, b) => {
      const seqNoA = a.subarray(SEQUENCE_NUMBER_OFFSET, SEQUENCE_NUMBER_OFFSET + SEQUENCE_NUMBER_SIZE);
      const seqNoB = b.subarray(SEQUENCE_NUMBER_OFFSET, SEQUENCE_NUMBER_OFFSET + SEQUENCE_NUMBER_SIZE);

      return bufferToNumber(seqNoA, 4) - bufferToNumber(seqNoB, 4);
    })

    windowBuffer.forEach((packet) => {
      const sequenceNo = packet.subarray(SEQUENCE_NUMBER_OFFSET, SEQUENCE_NUMBER_OFFSET + SEQUENCE_NUMBER_SIZE);
      const seqNoInt = bufferToNumber(sequenceNo, 4);

      if (seqNoInt === 0) {
        // Updating packets length
        packetsLength = bufferToNumber(packet.subarray(MAX_SEQUENCE_NUMBER_OFFSET, MAX_SEQUENCE_NUMBER_OFFSET + SEQUENCE_NUMBER_SIZE), 4) + 1;
      } else if (seqNoInt === packetsLength - 1) {
        // Setting received hash
        receivedHash = packet.subarray(HASH_OFFSET, HASH_OFFSET + HASH_SIZE);
      } else {
        // Appending message to the buffer
        buffer = Buffer.concat([buffer, packet.subarray(MESSAGE_OFFSET, packet.length)]);
      }
    });

    lastPacketTransmissionId = windowBuffer[lastPacketIndex].subarray(0, TRANSMISSION_ID_SIZE);
    lastPacketSequenceNo = windowBuffer[lastPacketIndex].subarray(SEQUENCE_NUMBER_OFFSET, SEQUENCE_NUMBER_OFFSET + SEQUENCE_NUMBER_SIZE);

    // Creating cummulative acknowledgement
    const cummAck = Buffer.concat([lastPacketTransmissionId, lastPacketSequenceNo]);

    const timeElapsed = Math.max(Date.now() - startTime, 1);
    const receivingRate = (noOfPacketsReceived * packetSize) / (timeElapsed * 1000);

    if (noOfPacketsReceived > 1) {
      receivingRateSum += receivingRate;
    }

    // Writing status to stdout
    process.stdout.write("\r\x1b[K");
    process.stdout.write(`Packets received: ${chalk.yellow(noOfPacketsReceived)}      Receiving rate: ${chalk.green(receivingRate.toFixed(3))} MB/s      Time elapsed: ${chalk.yellow(timeElapsed)} ms`);


    // Sending acknowledgement
    receiver.send(cummAck, PORT.SENDER, HOSTNAME, (err) => {
      if (err) {
        console.error('Error:', err);
      }
      if (noOfPacketsReceived === packetsLength) {
        // Closing receiver socket
        receiver.close();
      }
    });
  }
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
