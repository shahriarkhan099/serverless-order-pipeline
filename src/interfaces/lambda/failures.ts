export function partialBatchFailure(ids: string[]) {
  return { batchItemFailures: ids.map((itemIdentifier) => ({ itemIdentifier })) };
}
