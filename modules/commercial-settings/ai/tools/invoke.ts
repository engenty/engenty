export async function invokeOrError(
  invoke: (name: string, input: unknown) => Promise<unknown>,
  operationId: string,
  input: unknown
): Promise<unknown> {
  try {
    return await invoke(operationId, input);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
