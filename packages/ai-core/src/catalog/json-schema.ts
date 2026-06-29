import Ajv from "ajv";

const ajv = new Ajv({
  allErrors: true,
  strict: false,
});

export function validateJsonSchemaObject(
  schema: Record<string, unknown>,
  input: Record<string, unknown>
): Record<string, unknown> {
  const validate = ajv.compile(schema);
  const valid = validate(input);
  if (valid) {
    return input;
  }
  const message =
    validate.errors
      ?.map((error) => error.message)
      .filter(Boolean)
      .join(", ") || "Input does not match schema";
  throw new Error(message);
}
