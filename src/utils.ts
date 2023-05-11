/*
* Function to convert number to buffer
* @param number - Number to be converted
* @param size - Size of the buffer
* @return Buffer;
*/
export const numberToBuffer = (number: number, size: number) => {
  const buffer = Buffer.alloc(size);
  buffer.writeUIntBE(number, 0, size);
  return buffer;
}

/*
* Function to convert buffer to number
* @param number - Number to be converted
* @param size - Size of the buffer
* @return Buffer;
*/
export const bufferToNumber = (buffer: Buffer, size: number) => {
  return buffer.readUIntBE(0, size);
}