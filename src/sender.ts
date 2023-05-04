import UDP from 'dgram';
import { HOSTNAME, PACKET_SIZE, PORT } from './global';
import { createHash } from 'crypto';
import fs from 'fs';
//@ts-ignore
import chunks from 'buffer-chunks';

// Setting packet size
const packetSize = PACKET_SIZE.MEDIUM;

// Creating sender socket
const sender = UDP.createSocket({ type: 'udp4', sendBufferSize: packetSize });

// Setting sequince number to 0 (4 bytes)
const seqNo = Buffer.from([0, 0, 0, 0]);

// Reading file (1 MB)
const data = fs.readFileSync(require.resolve('../public/1mb.txt'));

// Creating hash from file (16 bytes)
const hash = createHash("md5").update(data).digest();

// Concatenating hash and data
const buffer = Buffer.concat([hash, data]);

// Splitting buffer into packets and prpending the sequence number 
const packets: Buffer[] = chunks(buffer, packetSize).map((packet: Buffer) => Buffer.concat([seqNo, packet]));

// Sending packets
packets.forEach((packet, i) => {
  setTimeout(() => {
    sender.send(packet, PORT, HOSTNAME, (err) => {
      if (err) {
        console.error('Error:', err);
      } else {
        // Writing status to stdout
        process.stdout.write("\r\x1b[K");
        process.stdout.write(`(${i + 1}/${packets.length}) Packet(s) sent successfully!`);
      }

      if (i === packets.length - 1) {
        // Closing sender socket
        console.log("\n");
        sender.send(Buffer.from("END"), PORT, HOSTNAME, (err) => {
          if(err) {
            console.error('Error:', err);
          } else {
            console.log("END OF TRANSMISSION\n");
            sender.close();
          }
        })
      }
    })
  }, i*2);
})


