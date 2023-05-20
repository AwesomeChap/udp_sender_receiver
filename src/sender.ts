import UDP from 'dgram';
import { HOSTNAME, MAX_RETRIES, PACKET_SIZE, PORT, SEQUENCE_NUMBER_OFFSET, SEQUENCE_NUMBER_SIZE, TRANSMISSION_END_MESSAGE, TRANSMISSION_ID_SIZE, TRANSMISSION_START_MESSAGE } from './global';
import { createHash } from 'crypto';
import fs from 'fs';
import { numberToBuffer } from './utils';
//@ts-ignore
import chunks from 'buffer-chunks';
import chalk from 'chalk';

// Setting packet size
const packetSize = PACKET_SIZE.MEDIUM;

// Creating sender socket
const sender = UDP.createSocket({ type: 'udp4', sendBufferSize: packetSize });

// Setting transmission ID (2 bytes)
const transmissionID = Buffer.from([0, 1]);

// Reading file (1 MB)
const data = fs.readFileSync(require.resolve('../public/1mb.txt'));

// Creating hash from file (16 bytes)
const hash = createHash("md5").update(data).digest();

// Concatenating hash and data
const buffer = Buffer.concat([hash, data]);

// Setting number of packets sent initially to 0
let noOfPacketsSent = 0;

// Setting start time initially to 0 milliseconds
let startTime = 0;

// Setting end time initially to 0 milliseconds
let endTime = 0;

// Setting number of retry attempts initially to 0
let retryAttempts = 0;

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

      // Writing status to stdout
      process.stdout.write("\r\x1b[K");
      process.stdout.write(`Packets sent: ${chalk.yellow(noOfPacketsSent)}/${packets.length}      Transmission rate: ${chalk.green(transmissionRate.toFixed(3))} kB/s      Time elapsed: ${chalk.yellow(timeElapsed)} ms`);
    }

    if (noOfPacketsSent === packets.length) {
       // Setting end time
       endTime = Date.now();

      // Closing sender socket
      console.log("\n");
      sender.send(Buffer.from(TRANSMISSION_END_MESSAGE), PORT.RECEIVER, HOSTNAME, (err) => {
        if (err) {
          console.error('Error:', err);
        } else {
          console.log(chalk.bold("END OF TRANSMISSION\n"));
          sender.close();
        }
      })
    }
  })
}

// Splitting buffer into packets and prpending the sequence number 
const packets: Buffer[] = chunks(buffer, packetSize).map((packet: Buffer, index: number) => {
  // Setting sequince number to 0 (4 bytes)
  const seqNo = numberToBuffer(index, 4);

  return Buffer.concat([transmissionID, seqNo, packet]);
});

sender.on('listening', () => {
  // Address, the receiver is listening on
  const address = sender.address();
  console.log(`Listening on ${chalk.white.bold(address.address + ":" + address.port)}\n`);
})

// Listening for acknowledgement of packets and sending them
sender.on('message', (message, info) => {
  const receiverReady = message.toString() === TRANSMISSION_START_MESSAGE;

  if (receiverReady) {
    console.log(chalk.bold("\nSTART OF TRANSMISSION\n"));

    // Setting start time
    startTime = Date.now();

    // Sending first packet
    sendPacket(packets[0]);
  }

  if(noOfPacketsSent > 0) {
    const prevPacketTransmissionID = packets[noOfPacketsSent - 1].subarray(0, TRANSMISSION_ID_SIZE);
    const prevPacketSeqNo = packets[noOfPacketsSent - 1].subarray(SEQUENCE_NUMBER_OFFSET, SEQUENCE_NUMBER_OFFSET + SEQUENCE_NUMBER_SIZE);
    
    const successfulTransmission = message.equals(Buffer.concat([prevPacketTransmissionID, prevPacketSeqNo]));

    if (successfulTransmission) {
      // Resetting retry attempts to 0
      retryAttempts = 0;

      // Sending next packet
      sendPacket(packets[noOfPacketsSent]);
    }
  
    // Resending previous packet if transmission was unsuccessful
    if(!successfulTransmission) {
      retryAttempts += 1;

      if(retryAttempts > MAX_RETRIES) {
        console.log("\n");
        console.log(`${chalk.red.bold("ERROR:")} Maximum number of retries reached. Ending transmisson...\n`);

        // Closing sender socket
        sender.close();
        process.exit(0);
      }

      noOfPacketsSent -= 1;
      sendPacket(packets[noOfPacketsSent]);
    }
  }

})

sender.bind({ port: PORT.SENDER, address: HOSTNAME });
