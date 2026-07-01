import type {
  PluginPolicyDecision,
  PluginPolicyInput,
  PluginProfilePolicy,
} from "@engenty/plugin-sdk";

function hasProfile(input: PluginPolicyInput, profile: string): boolean {
  return input.auth.roleProfiles.includes(profile);
}

function isWriteOperation(input: PluginPolicyInput): boolean {
  if (
    input.requiredCapabilities.some((capability) =>
      capability.includes(".write")
    )
  ) {
    return true;
  }
  const lower = input.operationId.toLowerCase();
  return (
    lower.endsWith(".create") ||
    lower.endsWith(".update") ||
    lower.endsWith(".delete") ||
    lower.endsWith(".upsert") ||
    lower.includes(".write")
  );
}

function deny(reason: string): PluginPolicyDecision {
  return { action: "deny", reason };
}

export const contactsProfilePolicy: PluginProfilePolicy = (input) => {
  if (
    hasProfile(input, "invoices_crud_connect_contacts") &&
    input.moduleId === "contacts" &&
    isWriteOperation(input)
  ) {
    return deny(
      "profile invoices_crud_connect_contacts cannot modify contacts"
    );
  }

  if (
    hasProfile(input, "contacts_with_invoices_viewer") &&
    input.moduleId === "contacts" &&
    isWriteOperation(input)
  ) {
    return deny("profile contacts_with_invoices_viewer is read-only");
  }

  return null;
};
