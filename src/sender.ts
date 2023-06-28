import UDP from 'dgram';
import {
  HOSTNAME,
  PACKET_SIZE,
  PORT,
  WINDOW_SIZE
} from './global';
import { createHash } from 'crypto';
import fs from 'fs';
import { bufferToNumber, numberToBuffer } from './utils';
//@ts-ignore
import chunks from 'buffer-chunks';
import chalk from 'chalk';

// Setting packet size
const packetSize = PACKET_SIZE.SMALL;

// Creating sender socket
const sender = UDP.createSocket({ type: 'udp4', sendBufferSize: packetSize });

// Setting transmission ID (2 bytes)
const transmissionID = Buffer.from([0, 1]);

// Reading file (1 MB)
const data = fs.readFileSync(require.resolve('../public/1mb.txt'));

// Creating hash from file (16 bytes)
const hash = createHash("md5").update(data).digest();

// Concatenating hash and data
const buffer = Buffer.concat([data]);

// Setting number of packets sent initially to 0
let noOfPacketsSent = 0;

// Setting start time initially to 0 milliseconds
let startTime = 0;

// Setting end time initially to 0 milliseconds
let endTime = 0;

// Setting transmission rate sum initially to 0 - would be used to calculate average transmission rate
let transmissionRateSum = 0;

// Splitting buffer into packets and prpending the sequence number 
let packets: Buffer[] = chunks(buffer, packetSize).map((packet: Buffer, index: number) => {
  // Setting sequence number to 0 (4 bytes)
  const seqNo = numberToBuffer(index + 1, 4);

  return Buffer.concat([transmissionID, seqNo, packet]);
});

// Creating first packet
const firstPacket = Buffer.concat([transmissionID, numberToBuffer(0, 4), numberToBuffer(packets.length + 1, 4), Buffer.from('1mb.txt', 'utf-8')]);

// Creating last packet
const lastPacket = Buffer.concat([transmissionID, numberToBuffer(packets.length + 1, 4), hash]);

packets = [firstPacket, ...packets, lastPacket];

/*
* Function to send packets
* @param n - Number of packets to be sent
* @return void;
*/
const sendPackets = (n: number) => {
  for (let i = 0; i < n; i++) {
    const base = noOfPacketsSent < WINDOW_SIZE ? 0 : noOfPacketsSent;
    sendPacket(packets[base + i]);
  }
}

/*
* Function to send packet
* @param packet - Packet to be sent
* @return void;
*/
const sendPacket = (packet: Buffer) => {
  sender.send(packet, PORT.RECEIVER, HOSTNAME, (err) => {
    if (err) {
      console.error('Error:', err);
    } else {
      // incrementing number of packets sent by 1
      noOfPacketsSent += 1;

      const timeElapsed = Date.now() - startTime;
      const transmissionRate = (noOfPacketsSent * packetSize) / (timeElapsed * 1000);
      transmissionRateSum += transmissionRate;

      // Writing status to stdout
      process.stdout.write("\r\x1b[K");
      process.stdout.write(`Packets sent: ${chalk.yellow(noOfPacketsSent)}/${packets.length}      Transmission rate: ${chalk.green(transmissionRate.toFixed(3))} MB/s      Time elapsed: ${chalk.yellow(timeElapsed)} ms`);
    }
  })
}

sender.on('listening', () => {
  // Address, the receiver is listening on
  const address = sender.address();
  console.log(`Listening on ${chalk.white.bold(address.address + ":" + address.port)}\n`);
  console.log(chalk.bold("\nSTART OF TRANSMISSION\n"));

  // Setting start time
  startTime = Date.now();

  // Sending first packet
  sendPackets(WINDOW_SIZE);
})

// Listening for acknowledgement of packets and sending them
sender.on('message', (message, info) => {
  if (noOfPacketsSent > 0) {
    let seqNo = bufferToNumber(message.subarray(2, 6), 4);

    // Determining if transmission has reached its end
    if (seqNo === packets.length - 1) {
      sender.close();
    } else {
      const n = packets.length - noOfPacketsSent > WINDOW_SIZE ? WINDOW_SIZE : packets.length - noOfPacketsSent;
      if (seqNo === noOfPacketsSent - 1) {
        sendPackets(n);
      } else if (seqNo < noOfPacketsSent - 1) {
        // Resend packets
        noOfPacketsSent = seqNo + 1;
        sendPackets(n);
      }
    }
  }
})

sender.on('close', () => {
  // Setting end time
  endTime = Date.now();

  // Closing sender socket
  console.log("\n");
  console.log(chalk.bold("END OF TRANSMISSION\n"));

  const averageTransmissionRate = transmissionRateSum / noOfPacketsSent;
  console.log(`Average transmission rate: ${chalk.green(averageTransmissionRate.toFixed(3))} MB/s\n`);
})

sender.bind({ port: PORT.SENDER, address: HOSTNAME });
