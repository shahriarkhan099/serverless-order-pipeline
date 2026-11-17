export function shouldDeadLetter(receiveCount: number, max = 5) {
  return Number.isInteger(receiveCount) && receiveCount > max;
}
